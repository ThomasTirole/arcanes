'use strict';
// ---------------------------------------------------------------------------
// Session : tout ce qui est commun à tous les modes de jeu.
//   - salle d'attente, joueurs, reconnexion, exclusion
//   - moteur de questions (tirage sans répétition, mélange des réponses,
//     correction, minuteur, statistiques par élève et par question)
//   - cycle de partie (démarrage, boucle, +1 min, fin, rejouer) et résultats
//
// Un mode de jeu hérite de Session et ne s'occupe que de son gameplay.
// Voir modes/arena/server.js pour un exemple complet, et le README.
// ---------------------------------------------------------------------------
const crypto = require('crypto');

const Q_TIME_MS = 25000;       // temps max par question
const FEEDBACK_MS = 1300;      // affichage juste/faux avant la suite
const MAX_PLAYERS = 60;

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899', '#14b8a6', '#f97316',
  '#84cc16', '#6366f1', '#06b6d4', '#f43f5e', '#8b5cf6', '#10b981', '#f59e0b', '#0ea5e9'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Réglages communs à tous les modes ; chaque mode ajoute les siens (static settings).
const BASE_SETTINGS = [
  { key: 'duration', label: 'Durée de la partie', type: 'select', default: 5,
    options: [3, 5, 7, 10].map(v => ({ value: v, label: `${v} minutes` })) },
  { key: 'showAnswer', label: 'Après chaque réponse', type: 'select', default: 'validate',
    options: [
      { value: 'validate', label: 'Juste / faux seulement' },
      { value: 'on', label: 'Montrer la bonne réponse' },
      { value: 'off', label: 'Ne rien montrer' },
    ] },
  { key: 'accommodations', label: 'Aménagements', type: 'checkbox', default: true },
];

function normalizeSettings(schema, raw = {}) {
  const out = {};
  for (const s of schema) {
    const v = raw[s.key];
    if (s.type === 'checkbox') out[s.key] = typeof v === 'boolean' ? v : s.default;
    else {
      const match = s.options.find(o => String(o.value) === String(v));
      out[s.key] = match ? match.value : s.default;
    }
  }
  return out;
}

class Session {
  // ----- à redéfinir dans chaque mode ---------------------------------------
  static id = 'base';
  static meta = { name: 'Mode', icon: '🎮', description: '' };
  static settings = [];         // réglages propres au mode (même format que BASE_SETTINGS)
  static help = { text: '', controls: [] };   // affiché aux élèves dans la salle d'attente
  // colonnes de score affichées dans les tableaux ; la 1re sert au podium
  static columns = [{ key: 'score', label: 'Points' }];

  static allSettings() {
    // le mode peut préciser le texte de l'option « aménagements »
    const base = BASE_SETTINGS.map(s => (s.key === 'accommodations' && this.accommodationsHint
      ? { ...s, label: `Aménagements — ${this.accommodationsHint}` } : s));
    return [...base, ...this.settings];
  }

  static describe() {
    return { id: this.id, ...this.meta, settings: this.allSettings(), help: this.help, columns: this.columns };
  }

  /** Données envoyées au client du mode quand il se connecte (carte, sorts…). */
  clientInfo() { return {}; }
  /** Champs propres au mode sur un joueur (appelé à la création et à chaque nouvelle manche). */
  initPlayer(p) {}
  /** Début de partie. */
  onStart(now) {}
  /** Appelé ~30 fois par seconde pendant la partie. */
  update(now, dt) {}
  /**
   * Une réponse vient d'être corrigée.
   * Retourne { reward: 'texte affiché', extra: {...données pour le client}, retry: bool }
   * retry = true ajoute une question supplémentaire à la série en cours.
   */
  onAnswer(p, { correct, timeout }) { return {}; }
  /** La série de questions du joueur est terminée. Peut retourner des données pour le client. */
  onQuizDone(p) { return {}; }
  /** Un élève arrive en cours de partie / revient après une coupure. */
  onLateJoin(p) { this.startQuiz(p, 1, 'burst'); }
  onRejoin(p) { this.startQuiz(p, 1, 'burst'); }
  /** Action envoyée par le client du mode (déplacement, tir…). */
  onAction(p, type, data) {}
  /** Scores du joueur, clés = static columns. */
  playerScore(p) { return { score: 0 }; }
  /** Tri du podium. */
  compareRows(a, b) {
    const k = this.constructor.columns[0].key;
    return b[k] - a[k] || b.accuracy - a.accuracy;
  }
  /** Millisecondes avant la prochaine vague de questions (null si le mode n'en a pas). */
  nextQuizIn(now) { return null; }
  /** Libellé court de l'état du joueur pour le prof (icône). */
  stateIcon(p) { return { quiz: '❓', away: '⏸' }[p.state] || ''; }
  /** Nettoyage de fin de partie. */
  onEnd() {}

  // ----- moteur commun ------------------------------------------------------
  constructor(io, code, quiz, settings) {
    this.io = io;
    this.code = code;
    this.quiz = quiz;
    this.settings = normalizeSettings(this.constructor.allSettings(), settings);
    this.players = new Map();   // token -> joueur
    this.bySocket = new Map();  // socket.id -> token
    this.nextId = 1;
    this.state = 'lobby';       // lobby | playing | ended
    this.qstats = {};
    this.results = null;
    this.timer = null;
    this.tickCount = 0;
    this.tickMs = 1000 / 30;
    this.lastActivity = Date.now();
  }

  emitAll(ev, data) { this.io.to(this.code).emit(ev, data); }
  emitHost(ev, data) { this.io.to(this.code + ':host').emit(ev, data); }
  emitTo(p, ev, data) { if (p.socketId) this.io.to(p.socketId).emit(ev, data); }

  modeInfo() {
    const C = this.constructor;
    return { id: C.id, name: C.meta.name, icon: C.meta.icon, help: C.help, columns: C.columns };
  }

  lobbyInfo() {
    return {
      code: this.code,
      state: this.state,
      mode: this.modeInfo(),
      quizTitle: this.quiz.title,
      questionCount: this.quiz.questions.length,
      settings: this.settings,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected,
      })),
    };
  }

  broadcastLobby() { this.emitAll('room:lobby', this.lobbyInfo()); }

  // ----- joueurs -------------------------------------------------------------
  addPlayer(socket, rawName, token) {
    this.lastActivity = Date.now();

    if (token && this.players.has(token)) {
      const p = this.players.get(token);
      if (p.socketId && p.socketId !== socket.id) this.bySocket.delete(p.socketId);
      p.socketId = socket.id;
      p.connected = true;
      this.bySocket.set(socket.id, token);
      socket.join(this.code);
      // différé : la réponse au "join" doit arriver avant la première question
      setTimeout(() => {
        if (this.state !== 'playing' || !p.connected) return;
        if (p.state === 'away') this.onRejoin(p);
        else if (p.state === 'quiz' && p.quiz && p.quiz.current) this.resendQuestion(p);
      }, 50);
      this.broadcastLobby();
      return { ok: true, token, id: p.id, rejoined: true, score: this.playerScore(p) };
    }

    if (this.state === 'ended') return { error: 'La partie est terminée.' };
    const name = String(rawName || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!name) return { error: 'Choisis un pseudo.' };
    for (const other of this.players.values()) {
      if (other.name.toLowerCase() === name.toLowerCase()) return { error: 'Ce pseudo est déjà pris.' };
    }
    if (this.players.size >= MAX_PLAYERS) return { error: 'La partie est pleine.' };

    const newToken = crypto.randomBytes(12).toString('hex');
    const id = this.nextId++;
    const p = {
      token: newToken, id, name,
      color: COLORS[(id - 1) % COLORS.length],
      socketId: socket.id, connected: true,
      state: 'lobby',
      quiz: null, deck: [], deckPos: 0,
      stats: { answered: 0, correct: 0 },
    };
    this.initPlayer(p);
    this.players.set(newToken, p);
    this.bySocket.set(socket.id, newToken);
    socket.join(this.code);
    if (this.state === 'playing') {
      p.state = 'away';
      setTimeout(() => {
        if (this.state === 'playing' && p.connected && p.state === 'away') this.onLateJoin(p);
      }, 50);
    }
    this.broadcastLobby();
    return { ok: true, token: newToken, id };
  }

  playerBySocket(socketId) {
    const t = this.bySocket.get(socketId);
    return t ? this.players.get(t) : null;
  }

  removeSocket(socketId) {
    const p = this.playerBySocket(socketId);
    this.bySocket.delete(socketId);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.socketId = null;
    if (this.state === 'lobby') this.players.delete(p.token);
    else if (this.state === 'playing') { p.state = 'away'; p.quiz = null; }
    this.broadcastLobby();
  }

  kick(id) {
    for (const p of this.players.values()) {
      if (p.id !== id) continue;
      this.emitTo(p, 'kicked', {});
      if (p.socketId) {
        const s = this.io.sockets.sockets.get(p.socketId);
        if (s) { s.leave(this.code); s.data.code = null; }
        this.bySocket.delete(p.socketId);
      }
      this.players.delete(p.token);
      this.broadcastLobby();
      return true;
    }
    return false;
  }

  handleAction(p, type, data) {
    if (this.state !== 'playing' || typeof type !== 'string') return;
    this.onAction(p, type, data || {});
  }

  // ----- déroulement ---------------------------------------------------------
  start() {
    if (this.state !== 'lobby') return false;
    const now = Date.now();
    this.state = 'playing';
    this.startAt = now;
    this.endAt = now + this.settings.duration * 60000;
    this.qstats = {};
    this.lastTick = now;
    this.onStart(now);
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.emitAll('game:started', { endAt: this.endAt });
    this.emitClock(now);
    this.broadcastLobby();
    return true;
  }

  addMinute() { if (this.state === 'playing') this.endAt += 60000; }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (now >= this.endAt) { this.end(); return; }

    // questions : minuteur et passage à la suivante
    for (const p of this.players.values()) {
      if (p.state !== 'quiz' || !p.quiz) continue;
      if (p.quiz.pendingUntil && now >= p.quiz.pendingUntil) {
        p.quiz.pendingUntil = 0;
        if (p.quiz.remaining > 0) this.sendNextQuestion(p);
        else {
          p.quiz = null;
          const extra = this.onQuizDone(p) || {};
          this.emitTo(p, 'quiz:done', extra);
        }
      } else if (p.quiz.current && now >= p.quiz.current.deadline) {
        this.answer(p, null);
      }
    }

    this.update(now, dt);
    if (this.state !== 'playing') return;

    this.tickCount++;
    if (this.tickCount % 15 === 0) this.emitClock(now);
    if (this.tickCount % 60 === 0) this.sendHostStats();
  }

  emitClock(now) {
    const nq = this.nextQuizIn(now);
    this.emitAll('clock', { tl: Math.max(0, this.endAt - now), nq: nq == null ? null : Math.max(0, nq) });
  }

  end() {
    if (this.state !== 'playing') return;
    clearInterval(this.timer);
    this.timer = null;
    this.state = 'ended';
    this.lastActivity = Date.now();
    this.onEnd();
    this.results = this.computeResults();
    const { questions, ...publicResults } = this.results;
    this.emitAll('game:ended', publicResults);
    this.emitHost('game:report', this.results);
    this.broadcastLobby();
  }

  reset() {
    if (this.state === 'playing') return;
    this.state = 'lobby';
    this.qstats = {};
    this.results = null;
    for (const p of [...this.players.values()]) {
      if (!p.connected) { this.players.delete(p.token); continue; }
      p.state = 'lobby';
      p.quiz = null;
      p.stats = { answered: 0, correct: 0 };
      this.initPlayer(p);
    }
    this.lastActivity = Date.now();
    this.emitAll('game:lobby', {});
    this.broadcastLobby();
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emitAll('room:closed', {});
  }

  rowFor(p) {
    return {
      id: p.id, name: p.name, color: p.color,
      answered: p.stats.answered, correct: p.stats.correct,
      accuracy: p.stats.answered ? Math.round((p.stats.correct / p.stats.answered) * 100) : 0,
      ...this.playerScore(p),
    };
  }

  computeResults() {
    const rows = [...this.players.values()].map(p => this.rowFor(p));
    const podium = [...rows].sort((a, b) => this.compareRows(a, b)).slice(0, 3);
    const totalA = rows.reduce((s, r) => s + r.answered, 0);
    const totalC = rows.reduce((s, r) => s + r.correct, 0);
    const best = rows.filter(r => r.answered > 0)
      .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)[0] || null;
    return {
      mode: this.modeInfo(),
      rows, podium,
      classAccuracy: totalA ? Math.round((totalC / totalA) * 100) : 0,
      bestAccuracy: best ? { id: best.id, name: best.name, accuracy: best.accuracy } : null,
      quizTitle: this.quiz.title,
      questions: this.quiz.questions.map((q, i) => ({
        index: i, text: q.text,
        asked: (this.qstats[i] || {}).asked || 0,
        correct: (this.qstats[i] || {}).correct || 0,
      })),
    };
  }

  sendHostStats() {
    this.emitHost('host:stats', [...this.players.values()].map(p => ({
      ...this.rowFor(p), state: this.stateIcon(p),
    })));
  }

  // ----- moteur de questions -----------------------------------------------
  /** Lance une série de n questions pour le joueur. reason : 'burst' | 'revive' | 'reload' | autre. */
  startQuiz(p, n, reason) {
    p.state = 'quiz';
    p.quiz = { remaining: n, total: n, done: 0, reason, current: null, pendingUntil: 0, misses: 0 };
    this.sendNextQuestion(p);
  }

  drawQuestion(p) {
    const n = this.quiz.questions.length;
    if (p.deckPos >= p.deck.length || p.deck.length !== n) {
      const last = p.deck[p.deck.length - 1];
      p.deck = shuffle([...Array(n).keys()]);
      if (n > 1 && p.deck[0] === last) [p.deck[0], p.deck[1]] = [p.deck[1], p.deck[0]];
      p.deckPos = 0;
    }
    return p.deck[p.deckPos++];
  }

  sendNextQuestion(p) {
    const idx = this.drawQuestion(p);
    const now = Date.now();
    // l'ordre des réponses est mélangé pour chaque élève
    const order = shuffle([...this.quiz.questions[idx].choices.keys()]);
    p.quiz.current = { idx, order, deadline: now + Q_TIME_MS };
    this.resendQuestion(p);
  }

  resendQuestion(p) {
    const { idx, order, deadline } = p.quiz.current;
    const q = this.quiz.questions[idx];
    this.emitTo(p, 'quiz:question', {
      text: q.text,
      choices: order.map(i => q.choices[i]),
      multi: q.correct.length > 1,
      progress: { index: p.quiz.done + 1, total: p.quiz.total },
      reason: p.quiz.reason,
      timeLeft: Math.max(0, deadline - Date.now()),
      timeMs: Q_TIME_MS,
    });
  }

  /** picked = indices choisis (dans l'ordre affiché à l'élève), null = temps écoulé. */
  answer(p, picked) {
    if (this.state !== 'playing' || p.state !== 'quiz' || !p.quiz || !p.quiz.current || p.quiz.pendingUntil) return;
    const { idx, order } = p.quiz.current;
    const q = this.quiz.questions[idx];
    const timeout = picked === null;
    const chosen = new Set();
    if (Array.isArray(picked)) {
      for (const v of picked) {
        const i = Number(v);
        if (Number.isInteger(i) && i >= 0 && i < order.length) chosen.add(order[i]);
      }
    }
    const correctSet = new Set(q.correct);
    const correct = !timeout && chosen.size === correctSet.size && [...chosen].every(i => correctSet.has(i));

    p.stats.answered++;
    if (correct) p.stats.correct++;
    const qs = this.qstats[idx] || (this.qstats[idx] = { asked: 0, correct: 0 });
    qs.asked++;
    if (correct) qs.correct++;

    const out = this.onAnswer(p, { correct, timeout, questionIndex: idx }) || {};
    if (out.retry) p.quiz.total++;
    else p.quiz.remaining--;
    p.quiz.done++;
    p.quiz.current = null;
    p.quiz.pendingUntil = Date.now() + FEEDBACK_MS;

    const res = { correct, timeout, reward: out.reward || '', ...(out.extra || {}) };
    if (this.settings.showAnswer === 'on') {
      res.correctChoices = order.map((orig, i) => (correctSet.has(orig) ? i : -1)).filter(i => i >= 0);
    }
    this.emitTo(p, 'quiz:result', res);
  }
}

module.exports = { Session, shuffle };
