'use strict';
// ---------------------------------------------------------------------------
// Mode « FPS ». Le jeu 3D tourne dans le navigateur de chaque élève (public/game.js).
// Deux variantes, choisies au lancement :
//   - « robots » : chacun dans SA propre arène contre des vagues de robots ;
//   - « pvp »    : tous dans la même arène, on s'étourdit entre élèves.
// Le serveur gère les questions, les munitions, le classement et le rapport ;
// en PvP il est aussi seul juge des points de vie (les navigateurs annoncent leurs
// touches, le serveur vérifie munitions, distances et cadence avant d'appliquer).
//   - vague de questions → munitions (balles + roquettes)
//   - étourdi → 1 question pour revenir ; plus de munitions → 2 questions
// ---------------------------------------------------------------------------
const { Session } = require('../../lib/session');

// munitions gagnées par réponse : [balles, roquettes]
const GAIN = { correct: [12, 2], wrongAcc: [5, 0], wrong: [2, 0] };
const MAX_AMMO = [60, 10];
const MAX_KILLS_PER_SEC = 6;     // mode robots : garde-fou sur les robots annoncés

// PvP
const HP = 100;
const DMG = { body: 34, head: 68, punch: 40, rocketMax: 90 };
const RATE = { revolver: 280, rocket: 800, punch: 400 };   // ms minimum entre deux actions (≈ cadence du jeu)
const ARENA = 30;                // demi-taille de l'arène (m), identique à game.js
const INVULN_MS = 1500;
// points d'apparition dégagés (pas collés aux passerelles des coins (-22,-22) et (22,22))
const SPAWNS = [[26, -26], [-26, 26], [0, -26], [0, 26], [-26, 0], [26, 0],
  [-12, -27], [12, 27], [-27, -10], [27, 10], [-24, 18], [24, -18]];

const FREQ = {
  low: { burst: 2, every: 90000 },
  med: { burst: 3, every: 70000 },
  high: { burst: 4, every: 50000 },
};

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

class FpsSession extends Session {
  static id = 'fps';
  static meta = {
    name: 'FPS',
    icon: 'bolt',
    description: 'Tir à la première personne : les bonnes réponses donnent les munitions. Contre des robots, ou chacun pour soi entre élèves. Sur PC, souris conseillée.',
  };
  static accommodationsHint = 'les mauvaises réponses donnent aussi quelques balles';
  static settings = [
    { key: 'variant', label: 'Mode de jeu', type: 'select', default: 'robots',
      options: [
        { value: 'robots', label: 'Contre les robots (chacun dans son arène)' },
        { value: 'pvp', label: 'Chacun pour soi (les élèves s\'affrontent)' },
      ] },
    { key: 'frequency', label: 'Fréquence des questions', type: 'select', default: 'med',
      options: [
        { value: 'low', label: 'Basse — 2 questions / 90 s' },
        { value: 'med', label: 'Moyenne — 3 questions / 70 s' },
        { value: 'high', label: 'Haute — 4 questions / 50 s' },
      ] },
  ];
  static help = {
    text: 'Réponds aux questions pour gagner des munitions, puis étourdis un maximum d\'adversaires. '
      + 'Étourdi ou à court de munitions ? Retour aux questions. Clique dans le jeu pour viser à la souris.',
    controls: [
      ['WASD', 'bouger'],
      ['Souris / Flèches', 'viser'],
      ['Clic / Entrée', 'tirer'],
      ['Espace', 'sauter'],
      ['Maj', 'dash'],
      ['C', 'glisser'],
      ['Clic droit / F', 'poing'],
    ],
  };
  static columns = [
    { key: 'kills', label: 'Étourdis' },
    { key: 'downs', label: 'Subis' },
  ];

  get freq() { return FREQ[this.settings.frequency]; }
  get pvp() { return this.settings.variant === 'pvp'; }

  clientInfo() { return { variant: this.settings.variant }; }

  initPlayer(p) {
    Object.assign(p, {
      ammo: [0, 0], kills: 0, downs: 0, killTimes: [],
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, sl: 0, hp: HP, invulnUntil: 0,
      last: { shoot: 0, rocket: 0, punch: 0 }, pendingRevive: false, spawned: false,
    });
  }

  playerScore(p) { return { kills: p.kills, downs: p.downs }; }
  compareRows(a, b) { return b.kills - a.kills || b.accuracy - a.accuracy || a.downs - b.downs; }
  stateIcon(p) { return { quiz: 'quiz', play: 'arena', away: 'away' }[p.state] || p.state; }
  nextQuizIn(now) { return this.nextBurstAt - now; }

  sendAmmo(p) { this.emitTo(p, 'fps:ammo', p.ammo.slice()); }

  onStart(now) {
    this.nextBurstAt = now + this.freq.every;
    for (const p of this.players.values()) {
      if (p.connected) this.startQuiz(p, this.freq.burst, 'burst');
      else p.state = 'away';
    }
  }
  onLateJoin(p) { this.startQuiz(p, this.freq.burst, 'burst'); }
  onRejoin(p) { p.spawned = false; this.startQuiz(p, 1, 'burst'); }

  onAnswer(p, { correct }) {
    const g = correct ? GAIN.correct : (this.settings.accommodations ? GAIN.wrongAcc : GAIN.wrong);
    const before = p.ammo.slice();
    p.ammo = p.ammo.map((a, i) => Math.min(MAX_AMMO[i], a + g[i]));
    const gained = p.ammo.map((a, i) => a - before[i]);
    const reward = [gained[0] ? `+${gained[0]} balles` : '', gained[1] ? `+${gained[1]} roquettes` : ''].filter(Boolean).join(', ');
    let retry = false;
    if (p.quiz.reason === 'revive' && !correct && !this.settings.accommodations && p.quiz.misses < 2) {
      p.quiz.misses++;
      retry = true;
    }
    return { reward, retry, extra: { ammo: p.ammo.slice() } };
  }

  // choisit le point d'apparition le plus éloigné des joueurs en jeu
  spawnPoint(p) {
    let best = SPAWNS[0], bestD = -1;
    for (const [x, z] of SPAWNS) {
      let d = Infinity;
      for (const o of this.players.values()) {
        if (o === p || o.state !== 'play') continue;
        d = Math.min(d, Math.hypot(o.x - x, o.z - z));
      }
      d += Math.random() * 4;
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    return best;
  }

  onQuizDone(p) {
    p.state = 'play';
    const out = { ammo: p.ammo.slice() };
    if (this.pvp) {
      // en PvP : réapparition après un étourdissement (ou à la première entrée)
      if (p.pendingRevive || !p.spawned) {
        const [x, z] = this.spawnPoint(p);
        Object.assign(p, { x, y: 0, z, yaw: Math.atan2(x, z), hp: HP, spawned: true, invulnUntil: Date.now() + INVULN_MS });
        out.spawn = { x, y: 0, z, yaw: p.yaw };
        out.revive = true;
      }
      out.hp = p.hp;
    } else {
      out.revive = p.pendingRevive;
    }
    p.pendingRevive = false;
    return out;
  }

  startQuiz(p, n, reason) {
    if (reason === 'revive') p.pendingRevive = true;
    super.startQuiz(p, n, reason);
  }

  // ------------------------------------------------------------------ PvP
  findTarget(id) {
    for (const o of this.players.values()) if (o.id === Number(id)) return o;
    return null;
  }

  canHit(attacker, target) {
    return target && target !== attacker && target.state === 'play' && Date.now() >= target.invulnUntil;
  }

  damage(target, amount, attacker, push) {
    if (!this.canHit(attacker, target) || amount <= 0) return;
    target.hp = Math.max(0, target.hp - Math.round(amount));
    target.lastHurt = Date.now();
    this.emitTo(target, 'fps:hit', { by: attacker ? attacker.name : '', dmg: Math.round(amount), hp: target.hp, push: push || null });
    this.emitTo(attacker, 'fps:hitconfirm', { id: target.id, dmg: Math.round(amount), stun: target.hp <= 0 });
    if (target.hp > 0) return;
    target.downs++;
    attacker.kills++;
    this.emitAll('feed', { a: attacker.name, ac: attacker.color, v: target.name, vc: target.color });
    this.emitTo(attacker, 'you:scored', { stuns: attacker.kills, victim: target.name });
    this.startQuiz(target, 1, 'revive');
  }

  pvpAction(p, type, data) {
    const now = Date.now();
    if (type === 'pos') {
      const x = Math.max(-ARENA, Math.min(ARENA, num(data.x, p.x)));
      const z = Math.max(-ARENA, Math.min(ARENA, num(data.z, p.z)));
      const y = Math.max(-1, Math.min(14, num(data.y, p.y)));
      // pas de téléportation : au plus 6 m par message (≈ 120 m/s à 20 envois par seconde)
      const d = Math.hypot(x - p.x, y - p.y, z - p.z);
      const k = d > 6 ? 6 / d : 1;
      p.x += (x - p.x) * k; p.y += (y - p.y) * k; p.z += (z - p.z) * k;
      p.yaw = num(data.yaw, p.yaw); p.pitch = num(data.pitch, p.pitch); p.sl = data.sl ? 1 : 0;
      return;
    }
    if (type === 'shoot') {
      if (p.ammo[0] <= 0 || now - p.last.shoot < RATE.revolver - 60) return;
      p.last.shoot = now;
      p.ammo[0]--;
      const t = data.hit ? this.findTarget(data.hit) : null;
      if (t && this.canHit(p, t) && dist3(p, t) < 90) this.damage(t, data.head ? DMG.head : DMG.body, p);
      const e = Array.isArray(data.e) ? data.e.slice(0, 3).map(v => num(v)) : null;
      this.emitAll('fps:shot', { id: p.id, e });
      return;
    }
    if (type === 'rocket') {
      if (p.ammo[1] <= 0 || now - p.last.rocket < RATE.rocket - 80) return;
      p.last.rocket = now;
      p.ammo[1]--;
      p.rocketsInFlight = (p.rocketsInFlight || 0) + 1;
      const o = Array.isArray(data.o) ? data.o.map(v => num(v)) : [p.x, p.y + 1.5, p.z];
      const dir = Array.isArray(data.d) ? data.d.map(v => num(v)) : [0, 0, -1];
      this.emitAll('fps:rocket', { id: p.id, k: num(data.k), o, d: dir });
      return;
    }
    if (type === 'boom') {
      // explosion d'une roquette tirée : le navigateur du tireur calcule qui est dans le souffle
      if (!p.rocketsInFlight) return;
      p.rocketsInFlight--;
      const at = Array.isArray(data.p) ? { x: num(data.p[0]), y: num(data.p[1]), z: num(data.p[2]) } : null;
      if (!at) return;
      this.emitAll('fps:boom', { id: p.id, k: num(data.k), p: [at.x, at.y, at.z] });
      for (const h of Array.isArray(data.hits) ? data.hits.slice(0, 12) : []) {
        const t = this.findTarget(h.id);
        if (!t || !this.canHit(p, t)) continue;
        const d = dist3(at, { x: t.x, y: t.y + 0.9, z: t.z });
        if (d > 5.5) continue;                                   // trop loin de l'explosion selon le serveur
        const dmg = Math.min(DMG.rocketMax, Math.max(0, num(h.dmg)));
        const push = [at.x, at.y, at.z].map((c, i) => [t.x, t.y + 0.9, t.z][i] - c);
        const pl = Math.hypot(...push) || 1;
        this.damage(t, dmg, p, push.map(c => (c / pl) * 12));
      }
      return;
    }
    if (type === 'punch') {
      if (now - p.last.punch < RATE.punch - 60) return;
      p.last.punch = now;
      const t = this.findTarget(data.id);
      if (t && this.canHit(p, t) && dist3(p, t) < 3.6) {
        const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1;
        this.damage(t, DMG.punch, p, [(dx / l) * 14, 4, (dz / l) * 14]);
      }
    }
  }

  onAction(p, type, data) {
    if (type === 'ammo') {
      // le navigateur signale les munitions restantes (seulement à la baisse)
      if (Array.isArray(data.ammo)) p.ammo = p.ammo.map((a, i) => Math.max(0, Math.min(a, Number(data.ammo[i]) || 0)));
      return;
    }
    if ((type === 'empty' || type === 'reload') && p.state === 'play') { this.startQuiz(p, 2, 'reload'); return; }
    if (this.pvp) { if (p.state === 'play') this.pvpAction(p, type, data); return; }

    // mode robots
    if (type === 'kill' && p.state === 'play') {
      const now = Date.now();
      p.killTimes = p.killTimes.filter(t => now - t < 1000);
      if (p.killTimes.length >= MAX_KILLS_PER_SEC) return;
      p.killTimes.push(now);
      p.kills++;
      this.emitAll('feed', { a: p.name, ac: p.color, v: data.head ? 'un robot (tête)' : 'un robot', vc: '#9ca3af' });
    } else if (type === 'down' && p.state === 'play') {
      p.downs++;
      this.startQuiz(p, 1, 'revive');
    }
  }

  update(now) {
    if (now >= this.nextBurstAt) {
      this.nextBurstAt = now + this.freq.every;
      if (this.endAt - now > 20000) {
        for (const p of this.players.values()) {
          if (p.connected && p.state === 'play') this.startQuiz(p, this.freq.burst, 'burst');
        }
      }
    }
    if (this.pvp) {
      // régénération identique à celle du jeu : +10 PV/s après 3 s sans être touché
      for (const p of this.players.values()) {
        if (p.state === 'play' && p.hp > 0 && p.hp < HP && now - (p.lastHurt || 0) > 3000) p.hp = Math.min(HP, p.hp + 10 / 30);
      }
    }
    // PvP : position de tout le monde, ~15 fois par seconde
    if (this.pvp && this.tickCount % 2 === 0) {
      const ps = [];
      for (const p of this.players.values()) {
        if (p.state !== 'play') continue;
        ps.push({
          i: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
          w: +p.yaw.toFixed(3), t: +p.pitch.toFixed(2), sl: p.sl, h: Math.round(p.hp), v: now < p.invulnUntil ? 1 : 0,
        });
      }
      this.emitAll('fps:state', ps);
    }
  }
}

module.exports = FpsSession;
