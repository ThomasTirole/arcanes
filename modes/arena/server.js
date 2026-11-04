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

const MAP = {
  w: 1600,
  h: 1000,
  obstacles: [
    { x: 380, y: 220, w: 140, h: 60 },
    { x: 1080, y: 220, w: 140, h: 60 },
    { x: 380, y: 720, w: 140, h: 60 },
    { x: 1080, y: 720, w: 140, h: 60 },
    { x: 740, y: 440, w: 120, h: 120 },
    { x: 190, y: 460, w: 60, h: 80 },
    { x: 1350, y: 460, w: 60, h: 80 },
    { x: 760, y: 110, w: 80, h: 50 },
    { x: 760, y: 840, w: 80, h: 50 },
  ],
};

// perCorrect = munitions par bonne réponse ; perWrongAcc / perWrong = par mauvaise réponse avec / sans aménagements
const SPELLS = [
  { key: 'eclair', name: 'Éclair', icon: '⚡', max: 20, perCorrect: 6, perWrongAcc: 3, perWrong: 1,
    kind: 'proj', speed: 720, r: 7, dmg: 20, cd: 280, color: '#facc15' },
  { key: 'gel', name: 'Gel', icon: '❄️', max: 5, perCorrect: 2, perWrongAcc: 1, perWrong: 0,
    kind: 'nova', r: 170, dmg: 10, freeze: 1800, cd: 900, color: '#67e8f9' },
  { key: 'feu', name: 'Boule de feu', icon: '🔥', max: 5, perCorrect: 1, perWrongAcc: 0, perWrong: 0,
    kind: 'proj', speed: 430, r: 13, dmg: 30, splash: 75, splashDmg: 15, cd: 650, color: '#f97316' },
];

// burst = questions par vague, every = intervalle entre deux vagues
const FREQ = {
  low: { burst: 2, every: 75000 },
  med: { burst: 3, every: 60000 },
  high: { burst: 4, every: 45000 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function circleHitsRect(x, y, r, o) {
  const cx = clamp(x, o.x, o.x + o.w);
  const cy = clamp(y, o.y, o.y + o.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

function resolveCircleRect(p, r, o) {
  const cx = clamp(p.x, o.x, o.x + o.w);
  const cy = clamp(p.y, o.y, o.y + o.h);
  const dx = p.x - cx, dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 === 0) {
    const left = p.x - o.x, right = o.x + o.w - p.x, top = p.y - o.y, bottom = o.y + o.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = o.x - r;
    else if (m === right) p.x = o.x + o.w + r;
    else if (m === top) p.y = o.y - r;
    else p.y = o.y + o.h + r;
    return;
  }
  const d = Math.sqrt(d2);
  p.x += (dx / d) * (r - d);
  p.y += (dy / d) * (r - d);
}

const NO_INPUT = () => ({ u: false, d: false, l: false, r: false });

class ArenaSession extends Session {
  static id = 'arena';
  static meta = {
    name: 'Arène',
    icon: '⚔️',
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
      spells: SPELLS.map(s => ({ key: s.key, name: s.name, icon: s.icon, max: s.max, color: s.color, kind: s.kind, r: s.r })),
    };
  }

  initPlayer(p) {
    Object.assign(p, {
      x: 0, y: 0, dirX: 1, dirY: 0, hp: MAX_HP,
      input: NO_INPUT(), ammo: [0, 0, 0], lastCast: 0,
      frozenUntil: 0, stunUntil: 0, invulnUntil: 0, emptySince: 0,
      stuns: 0, gotStunned: 0,
    });
  }

  playerScore(p) { return { stuns: p.stuns, gotStunned: p.gotStunned }; }

  compareRows(a, b) { return b.stuns - a.stuns || b.accuracy - a.accuracy || a.gotStunned - b.gotStunned; }

  stateIcon(p) { return { quiz: '❓', arena: '⚔️', stunned: '💫', away: '⏸' }[p.state] || ''; }

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
    const reward = gained.map((g, i) => (g > 0 ? `+${g} ${SPELLS[i].icon}` : null)).filter(Boolean).join('  ');
    return { reward, retry, extra: { ammo: p.ammo.slice() } };
  }

  onQuizDone(p) {
    this.spawn(p);
    p.hp = MAX_HP;
    p.state = 'arena';
    p.frozenUntil = 0;
    p.invulnUntil = Date.now() + INVULN_MS;
    p.emptySince = 0;
    return { ammo: p.ammo.slice() };
  }

  // ----- actions du client --------------------------------------------------
  onAction(p, type, data) {
    if (type === 'input') this.setInput(p, data.keys);
    else if (type === 'cast') this.cast(p, data.slot, data.aim);
    else if (type === 'reload' && p.state === 'arena') this.startQuiz(p, 1, 'reload');
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
      if (MAP.obstacles.some(o => circleHitsRect(x, y, PLAYER_R + 10, o))) continue;
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

  cast(p, slot, aim) {
    const now = Date.now();
    if (p.state !== 'arena' || now < p.frozenUntil) return;
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= SPELLS.length) return;
    const s = SPELLS[slot];
    if (p.ammo[slot] <= 0 || now - p.lastCast < s.cd) return;

    let dx = p.dirX, dy = p.dirY;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) {
      const ax = aim.x - p.x, ay = aim.y - p.y;
      const d = Math.hypot(ax, ay);
      if (d > 1) { dx = ax / d; dy = ay / d; p.dirX = dx; p.dirY = dy; }
    }

    p.ammo[slot]--;
    p.lastCast = now;
    p.invulnUntil = 0; // attaquer annule la protection d'apparition

    if (s.kind === 'proj') {
      this.projectiles.push({
        owner: p.token, spell: slot,
        x: p.x + dx * (PLAYER_R + s.r + 2), y: p.y + dy * (PLAYER_R + s.r + 2),
        vx: dx * s.speed, vy: dy * s.speed, born: now,
      });
    } else if (s.kind === 'nova') {
      this.emitAll('fx', { t: 'nova', x: Math.round(p.x), y: Math.round(p.y), r: s.r, c: s.color });
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
        if (now >= p.frozenUntil) {
          let vx = (p.input.r ? 1 : 0) - (p.input.l ? 1 : 0);
          let vy = (p.input.d ? 1 : 0) - (p.input.u ? 1 : 0);
          if (vx || vy) {
            const d = Math.hypot(vx, vy);
            vx /= d; vy /= d;
            p.dirX = vx; p.dirY = vy;
            p.x += vx * SPEED * dt;
            p.y += vy * SPEED * dt;
            for (const o of MAP.obstacles) resolveCircleRect(p, PLAYER_R, o);
            p.x = clamp(p.x, PLAYER_R, MAP.w - PLAYER_R);
            p.y = clamp(p.y, PLAYER_R, MAP.h - PLAYER_R);
          }
        }
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
      let dead = now - pr.born > PROJ_LIFE_MS || pr.x < 0 || pr.y < 0 || pr.x > MAP.w || pr.y > MAP.h;
      if (!dead && MAP.obstacles.some(o => circleHitsRect(pr.x, pr.y, s.r, o))) dead = true;
      let hit = null;
      if (!dead) {
        for (const o of this.players.values()) {
          if (o.state !== 'arena' || o.token === pr.owner) continue;
          if (Math.hypot(o.x - pr.x, o.y - pr.y) <= PLAYER_R + s.r) { hit = o; break; }
        }
        if (hit) {
          dead = true;
          if (now >= hit.invulnUntil) {
            this.damage(hit, s.dmg, owner);
            if (!s.splash) this.emitAll('fx', { t: 'hit', x: Math.round(pr.x), y: Math.round(pr.y), c: s.color });
          }
        }
      }
      if (dead) { if (s.splash) this.explode(pr, s, owner, hit); } else alive.push(pr);
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
        am: p.ammo,
      });
    }
    this.emitAll('state', {
      tl: Math.max(0, this.endAt - now),
      nq: Math.max(0, this.nextBurstAt - now),
      ps,
      pr: this.projectiles.map(pr => [Math.round(pr.x), Math.round(pr.y), pr.spell]),
    });
  }
}

module.exports = ArenaSession;
