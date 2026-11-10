'use strict';
// ---------------------------------------------------------------------------
// Mode « FPS » (première version) : chaque élève joue dans SA propre arène 3D contre
// des vagues de robots (le jeu tourne dans son navigateur, public/game.js).
// Le serveur gère les questions, les munitions, le classement et le rapport :
//   - vague de questions → munitions (balles + roquettes)
//   - étourdi par les robots → 1 question pour revenir
//   - plus de munitions → 2 questions pour recharger
// Pas encore de PvP ni de coop : prochaine étape (voir docs/ROADMAP.md).
// ---------------------------------------------------------------------------
const { Session } = require('../../lib/session');

// munitions gagnées par réponse : [balles, roquettes]
const GAIN = { correct: [12, 2], wrongAcc: [5, 0], wrong: [2, 0] };
const MAX_AMMO = [60, 10];
const MAX_KILLS_PER_SEC = 6;     // garde-fou : un navigateur ne peut pas annoncer n'importe quoi

const FREQ = {
  low: { burst: 2, every: 90000 },
  med: { burst: 3, every: 70000 },
  high: { burst: 4, every: 50000 },
};

class FpsSession extends Session {
  static id = 'fps';
  static meta = {
    name: 'FPS (vagues de robots)',
    icon: 'bolt',
    description: 'Tir à la première personne : les bonnes réponses donnent les munitions, chacun affronte des vagues de robots. Sur PC, souris conseillée.',
  };
  static accommodationsHint = 'les mauvaises réponses donnent aussi quelques balles';
  static settings = [
    { key: 'frequency', label: 'Fréquence des questions', type: 'select', default: 'med',
      options: [
        { value: 'low', label: 'Basse — 2 questions / 90 s' },
        { value: 'med', label: 'Moyenne — 3 questions / 70 s' },
        { value: 'high', label: 'Haute — 4 questions / 50 s' },
      ] },
  ];
  static help = {
    text: 'Réponds aux questions pour gagner des munitions, puis étourdis un maximum de robots. '
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
    { key: 'kills', label: 'Robots' },
    { key: 'downs', label: 'Étourdi' },
  ];

  get freq() { return FREQ[this.settings.frequency]; }

  initPlayer(p) {
    Object.assign(p, { ammo: [0, 0], kills: 0, downs: 0, killTimes: [] });
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
  onRejoin(p) { this.startQuiz(p, 1, 'burst'); }

  onAnswer(p, { correct }) {
    const g = correct ? GAIN.correct : (this.settings.accommodations ? GAIN.wrongAcc : GAIN.wrong);
    const before = p.ammo.slice();
    p.ammo = p.ammo.map((a, i) => Math.min(MAX_AMMO[i], a + g[i]));
    const gained = p.ammo.map((a, i) => a - before[i]);
    const reward = [gained[0] ? `+${gained[0]} balles` : '', gained[1] ? `+${gained[1]} roquettes` : ''].filter(Boolean).join(', ');
    // étourdi sans aménagements : il faut une bonne réponse pour revenir (3 essais max)
    let retry = false;
    if (p.quiz.reason === 'revive' && !correct && !this.settings.accommodations && p.quiz.misses < 2) {
      p.quiz.misses++;
      retry = true;
    }
    return { reward, retry, extra: { ammo: p.ammo.slice() } };
  }

  onQuizDone(p) {
    p.state = 'play';
    const revive = p.pendingRevive;
    p.pendingRevive = false;
    return { ammo: p.ammo.slice(), revive };
  }

  startQuiz(p, n, reason) {
    if (reason === 'revive') p.pendingRevive = true;
    super.startQuiz(p, n, reason);
  }

  onAction(p, type, data) {
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
    } else if (type === 'ammo') {
      // le navigateur signale les munitions restantes (seulement à la baisse)
      if (Array.isArray(data.ammo)) p.ammo = p.ammo.map((a, i) => Math.max(0, Math.min(a, Number(data.ammo[i]) || 0)));
    } else if ((type === 'empty' || type === 'reload') && p.state === 'play') {
      this.startQuiz(p, 2, 'reload');
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
  }
}

module.exports = FpsSession;
