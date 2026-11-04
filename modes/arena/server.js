'use strict';
// ---------------------------------------------------------------------------
// Mode « Arène » : les bonnes réponses chargent des sorts, on s'étourdit dans
// une arène vue de dessus. Plus de sorts ou étourdi → retour aux questions.
// Toute la partie « questions » est gérée par lib/session.js.
// ---------------------------------------------------------------------------
const { Session } = require('../../lib/session');

// Réglages (tout est modifiable ici)
const PLAYER_R = 18;
const SPEED = 230;                  // px/s
const MAX_HP = 100;
const STUN_MS = 1500;               // durée d'étourdissement avant le quiz de retour
const INVULN_MS = 1500;             // protection à l'apparition
const PROJ_LIFE_MS = 1600;
const EMPTY_RELOAD_DELAY = 800;     // plus de munitions → retour au quiz après ce délai

// carte : village médiéval (voir maps.js — images du pack Kenney « Medieval RTS »)
const MAP = require('./maps').medievalVillage();

// perCorrect = munitions par bonne réponse ; perWrongAcc / perWrong = par mauvaise réponse avec / sans aménagements
const SPELLS = [
  { key: 'eclair', name: 'Éclair', icon: 'bolt', max: 20, perCorrect: 6, perWrongAcc: 3, perWrong: 1,
    kind: 'proj', speed: 720, r: 7, dmg: 20, cd: 280, color: '#facc15' },
  { key: 'gel', name: 'Gel', icon: 'snowflake', max: 5, perCorrect: 2, perWrongAcc: 1, perWrong: 0,
    kind: 'nova', r: 170, dmg: 10, freeze: 1800, cd: 900, color: '#67e8f9' },
  { key: 'feu', name: 'Boule de feu', icon: 'flame', max: 5, perCorrect: 1, perWrongAcc: 0, perWrong: 0,
    kind: 'proj', speed: 430, r: 13, dmg: 30, splash: 75, splashDmg: 15, cd: 650, color: '#f97316' },
];

// burst = questions par vague, every = intervalle entre deux vagues
const FREQ = {
  low: { burst: 2, every: 75000 },
  med: { burst: 3, every: 60000 },
  high: { burst: 4, every: 45000 },
};

const Phys = require('./public/physics');

const NO_INPUT = () => ({ u: false, d: false, l: false, r: false });

class ArenaSession extends Session {
  static id = 'arena';
  static meta = {
    name: 'Arène',
    icon: 'swords',
    description: 'Les bonnes réponses chargent des sorts. Combat en temps réel, celui qui étourdit le plus gagne.',
  };
  static accommodationsHint = 'les mauvaises réponses donnent aussi quelques sorts';
  static settings = [
    { key: 'frequency', label: 'Fréquence des questions', type: 'select', default: 'med',
      options: [
        { value: 'low', label: 'Basse — 2 questions / 75 s' },
        { value: 'med', label: 'Moyenne — 3 questions / 60 s' },
        { value: 'high', label: 'Haute — 4 questions / 45 s' },
      ] },
  ];
  static help = {
    text: 'Réponds aux questions pour gagner des sorts. Dans l\'arène, étourdis les autres joueurs. '
      + 'Plus de sorts ou étourdi ? Retour aux questions pour recharger. Celui qui fait le plus de stuns gagne !',
    controls: [
      ['↑↓←→ / WASD', 'bouger'],
      ['Espace / clic', 'lancer'],
      ['1-2-3', 'changer de sort'],
      ['R', 'recharger'],
    ],
  };
  static columns = [
    { key: 'stuns', label: 'Stuns' },
    { key: 'gotStunned', label: 'Subis' },
  ];

  clientInfo() {
    return {
      map: MAP,
      playerR: PLAYER_R,
      maxHp: MAX_HP,
      speed: SPEED,
      projLife: PROJ_LIFE_MS,
      spells: SPELLS.map(s => ({
        key: s.key, name: s.name, icon: s.icon, max: s.max, color: s.color, kind: s.kind, r: s.r, cd: s.cd,
        speed: s.speed || 0,
        splash: s.splash || 0,
      })),
    };
  }

  initPlayer(p) {
    Object.assign(p, {
      x: 0, y: 0, dirX: 1, dirY: 0, hp: MAX_HP, tp: 0, lastPosAt: 0,
      input: NO_INPUT(), ammo: [0, 0, 0], lastCast: [0, 0, 0],
      frozenUntil: 0, stunUntil: 0, invulnUntil: 0, emptySince: 0,
      stuns: 0, gotStunned: 0,
    });
  }

  playerScore(p) { return { stuns: p.stuns, gotStunned: p.gotStunned }; }

  compareRows(a, b) { return b.stuns - a.stuns || b.accuracy - a.accuracy || a.gotStunned - b.gotStunned; }

  stateIcon(p) { return p.state; }

  get freq() { return FREQ[this.settings.frequency]; }

  nextQuizIn(now) { return this.nextBurstAt - now; }

  // ----- cycle ---------------------------------------------------------------
  onStart(now) {
    this.projectiles = [];
    this.nextBurstAt = now + this.freq.every;
    for (const p of this.players.values()) {
      if (p.connected) this.startQuiz(p, this.freq.burst, 'burst');
      else p.state = 'away';
    }
  }

  onEnd() { this.projectiles = []; }

  sendAmmo(p) { this.emitTo(p, 'ammo', p.ammo.slice()); }

  onLateJoin(p) { this.startQuiz(p, this.freq.burst, 'burst'); }
  onRejoin(p) { this.startQuiz(p, 1, 'revive'); }

  startQuiz(p, n, reason) {
    p.input = NO_INPUT();
    super.startQuiz(p, n, reason);
  }

  // ----- questions → sorts --------------------------------------------------
  onAnswer(p, { correct }) {
    const acc = this.settings.accommodations;
    const gained = SPELLS.map((s, i) => {
      const add = correct ? s.perCorrect : (acc ? s.perWrongAcc : s.perWrong);
      const before = p.ammo[i];
      p.ammo[i] = Math.min(s.max, p.ammo[i] + add);
      return p.ammo[i] - before;
    });
    // sans aménagements, il faut une bonne réponse pour revenir (3 essais max)
    let retry = false;
    if (p.quiz.reason === 'revive' && !correct && !acc && p.quiz.misses < 2) {
      p.quiz.misses++;
      retry = true;
    }
    const reward = gained.map((g, i) => (g > 0 ? `+${g} ${SPELLS[i].name}` : null)).filter(Boolean).join(', ');
    this.sendAmmo(p);
    return { reward, retry, extra: { ammo: p.ammo.slice(), gained } };
  }

  onQuizDone(p) {
    this.spawn(p);
    p.tp++;                 // « téléportation » : le navigateur reprend la position du serveur
    p.lastPosAt = Date.now();
    p.moveBudget = SPEED * 0.6 + 20;
    p.hp = MAX_HP;
    p.state = 'arena';
    p.frozenUntil = 0;
    p.invulnUntil = Date.now() + INVULN_MS;
    p.emptySince = 0;
    return { ammo: p.ammo.slice() };
  }

  // ----- actions du client --------------------------------------------------
  onAction(p, type, data) {
    if (type === 'pos') this.setPos(p, data);
    else if (type === 'input') this.setInput(p, data.keys);
    else if (type === 'cast') this.cast(p, data.slot, data.aim, data.shot);
    else if (type === 'reload' && p.state === 'arena') this.startQuiz(p, 1, 'reload');
  }

  /**
   * Le navigateur calcule lui-même le déplacement de son joueur (réactivité immédiate)
   * et envoie sa position ; le serveur la vérifie : vitesse max, obstacles, bords.
   */
  setPos(p, d) {
    const now = Date.now();
    if (p.state !== 'arena' || now < p.frozenUntil) return;
    if (Number(d.tp) !== p.tp || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
    // « budget » de déplacement : tolère les paquets réseau groupés sans permettre d'aller plus vite
    const elapsed = Math.min(1, (now - (p.lastPosAt || now)) / 1000);
    p.lastPosAt = now;
    p.moveBudget = Math.min(SPEED * 0.6 + 20, (p.moveBudget || 0) + SPEED * elapsed * 1.25);
    let dx = d.x - p.x, dy = d.y - p.y;
    const dist = Math.hypot(dx, dy);
    const max = Math.min(dist, p.moveBudget);
    if (dist > max) { dx *= max / dist; dy *= max / dist; }
    p.moveBudget -= max;
    p.x += dx;
    p.y += dy;
    Phys.settle(p, PLAYER_R, MAP);
    if (Number.isFinite(d.dx) && Number.isFinite(d.dy) && (d.dx || d.dy)) {
      const l = Math.hypot(d.dx, d.dy);
      p.dirX = d.dx / l; p.dirY = d.dy / l;
    }
    p.input = NO_INPUT();
  }

  setInput(p, keys) {
    if (!keys || typeof keys !== 'object') return;
    p.input = { u: !!keys.u, d: !!keys.d, l: !!keys.l, r: !!keys.r };
  }

  spawn(p) {
    let best = null, bestScore = -1;
    for (let tries = 0; tries < 25; tries++) {
      const x = 60 + Math.random() * (MAP.w - 120);
      const y = 60 + Math.random() * (MAP.h - 120);
      if (MAP.obstacles.some(o => Phys.circleHitsRect(x, y, PLAYER_R + 10, o))) continue;
      let minD = Infinity;
      for (const o of this.players.values()) {
        if (o === p || o.state !== 'arena') continue;
        minD = Math.min(minD, Math.hypot(o.x - x, o.y - y));
      }
      if (minD > bestScore) { bestScore = minD; best = { x, y }; }
      if (minD > 400) break;
    }
    if (!best) best = { x: MAP.w / 2, y: 60 };
    p.x = best.x;
    p.y = best.y;
  }

  cast(p, slot, aim, shot) {
    const now = Date.now();
    const fail = () => { if (shot) this.emitTo(p, 'castfail', { shot }); };
    if (p.state !== 'arena' || now < p.frozenUntil) return fail();
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= SPELLS.length) return fail();
    const s = SPELLS[slot];
    // petite tolérance sur le temps de recharge (gigue réseau)
    if (p.ammo[slot] <= 0 || now - p.lastCast[slot] < s.cd - 60) { fail(); this.sendAmmo(p); return; }

    let dx = p.dirX, dy = p.dirY;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) {
      const ax = aim.x - p.x, ay = aim.y - p.y;
      const d = Math.hypot(ax, ay);
      if (d > 1) { dx = ax / d; dy = ay / d; p.dirX = dx; p.dirY = dy; }
    }

    p.ammo[slot]--;
    p.lastCast[slot] = now;
    this.sendAmmo(p);
    p.invulnUntil = 0; // attaquer annule la protection d'apparition

    if (s.kind === 'proj') {
      const pr = {
        id: this.nextProjId = (this.nextProjId || 0) + 1,
        owner: p.token, ownerId: p.id, spell: slot,
        x: p.x + dx * (PLAYER_R + s.r + 2), y: p.y + dy * (PLAYER_R + s.r + 2),
        vx: dx * s.speed, vy: dy * s.speed, born: now,
      };
      this.projectiles.push(pr);
      // le navigateur anime lui-même le projectile à 60 images/s à partir de ce départ
      this.emitAll('proj', {
        id: pr.id, o: p.id, s: slot, sh: shot || 0,
        x: Math.round(pr.x), y: Math.round(pr.y), vx: Math.round(pr.vx), vy: Math.round(pr.vy),
      });
    } else if (s.kind === 'nova') {
      this.emitAll('fx', { t: 'nova', x: Math.round(p.x), y: Math.round(p.y), r: s.r, c: s.color, o: p.id });
      for (const o of this.players.values()) {
        if (o === p || o.state !== 'arena') continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) <= s.r + PLAYER_R) {
          if (now < o.invulnUntil) continue;
          o.frozenUntil = Math.max(o.frozenUntil, now + s.freeze);
          this.damage(o, s.dmg, p);
        }
      }
    }
  }

  damage(target, amount, attacker) {
    const now = Date.now();
    if (target.state !== 'arena' || now < target.invulnUntil) return;
    target.hp -= amount;
    this.emitAll('dmg', { v: target.id, a: attacker ? attacker.id : 0, n: amount, x: Math.round(target.x), y: Math.round(target.y) });
    if (target.hp > 0) return;
    target.hp = 0;
    target.state = 'stunned';
    target.stunUntil = now + STUN_MS;
    target.input = NO_INPUT();
    target.gotStunned++;
    if (attacker && attacker !== target) {
      attacker.stuns++;
      this.emitTo(attacker, 'you:scored', { stuns: attacker.stuns, victim: target.name });
    }
    this.emitAll('fx', { t: 'stun', x: Math.round(target.x), y: Math.round(target.y) });
    this.emitAll('feed', { a: attacker ? attacker.name : null, ac: attacker ? attacker.color : null, v: target.name, vc: target.color });
    this.emitTo(target, 'you:stunned', { by: attacker ? attacker.name : null });
  }

  explode(pr, s, owner, directHit) {
    this.emitAll('fx', { t: 'boom', x: Math.round(pr.x), y: Math.round(pr.y), r: s.splash, c: s.color });
    for (const o of this.players.values()) {
      if (o.state !== 'arena' || o === directHit || o.token === pr.owner) continue;
      if (Math.hypot(o.x - pr.x, o.y - pr.y) <= s.splash + PLAYER_R) this.damage(o, s.splashDmg, owner);
    }
  }

  removeProj(pr, hit) {
    this.emitAll('projx', { id: pr.id, x: Math.round(pr.x), y: Math.round(pr.y), h: hit ? 1 : 0 });
  }

  // ----- boucle --------------------------------------------------------------
  update(now, dt) {
    // vague de questions pour tout le monde
    if (now >= this.nextBurstAt) {
      this.nextBurstAt = now + this.freq.every;
      if (this.endAt - now > 20000) {
        for (const p of this.players.values()) {
          if (p.connected && p.state === 'arena') this.startQuiz(p, this.freq.burst, 'burst');
        }
      }
    }

    for (const p of this.players.values()) {
      if (p.state === 'stunned') {
        if (now >= p.stunUntil) this.startQuiz(p, 1, 'revive');
      } else if (p.state === 'arena') {
        // déplacement aux touches (utilisé par les robots de test ; les navigateurs envoient leur position)
        if (now >= p.frozenUntil) Phys.step(p, p.input, SPEED, dt, PLAYER_R, MAP);
        // plus de munitions → retour aux questions
        if (p.ammo.every(a => a <= 0)) {
          if (!p.emptySince) p.emptySince = now;
          else if (now - p.emptySince >= EMPTY_RELOAD_DELAY) this.startQuiz(p, 2, 'reload');
        } else p.emptySince = 0;
      }
    }

    // projectiles
    const alive = [];
    for (const pr of this.projectiles) {
      const s = SPELLS[pr.spell];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      const owner = this.players.get(pr.owner) || null;
      let dead = now - pr.born > PROJ_LIFE_MS || Phys.projBlocked(pr.x, pr.y, s.r, MAP);
      let hit = null;
      if (!dead) {
        for (const o of this.players.values()) {
          if (o.state !== 'arena' || o.token === pr.owner) continue;
          if (Math.hypot(o.x - pr.x, o.y - pr.y) <= PLAYER_R + s.r) { hit = o; break; }
        }
        if (hit) {
          dead = true;
          if (now >= hit.invulnUntil) this.damage(hit, s.dmg, owner);
        }
      }
      if (dead) {
        this.removeProj(pr, !!hit);
        if (s.splash) this.explode(pr, s, owner, hit);
      } else alive.push(pr);
    }
    this.projectiles = alive;

    if (this.tickCount % 2 === 0) this.sendSnapshot(now);
  }

  sendSnapshot(now) {
    const ps = [];
    for (const p of this.players.values()) {
      ps.push({
        i: p.id,
        x: Math.round(p.x), y: Math.round(p.y),
        d: Math.round(Math.atan2(p.dirY, p.dirX) * 100),
        h: p.hp,
        s: { quiz: 'q', arena: 'a', stunned: 's', away: 'w', lobby: 'l' }[p.state],
        f: now < p.frozenUntil ? 1 : 0,
        v: now < p.invulnUntil ? 1 : 0,
        t: p.tp,
      });
    }
    this.emitAll('state', { ps });
  }
}

module.exports = ArenaSession;
