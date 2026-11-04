'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Server } = require('socket.io');
const { QuizStore } = require('./lib/quizzes');
const modes = require('./modes');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'arcanes';
const DATA_DIR = process.env.ARCANES_DATA_DIR || path.join(__dirname, 'data');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[attention] ADMIN_PASSWORD non défini : mot de passe prof par défaut "arcanes". Change-le en production !');
}

const quizzes = new QuizStore(DATA_DIR);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
for (const { Mode, publicDir } of modes.entries()) {
  app.use(`/modes/${Mode.id}`, express.static(publicDir));
}

function auth(req, res, next) {
  if (req.get('x-admin-password') === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Mot de passe incorrect.' });
}

app.post('/api/login', (req, res) => {
  if (req.body && req.body.password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Mot de passe incorrect.' });
});

app.get('/api/modes', auth, (req, res) => res.json(modes.list()));

app.get('/api/quizzes', auth, (req, res) => res.json(quizzes.list()));

app.get('/api/quizzes/:id', auth, (req, res) => {
  const q = quizzes.get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz introuvable.' });
  res.json(q);
});

app.post('/api/quizzes', auth, (req, res) => {
  try { res.json(quizzes.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/quizzes/:id', auth, (req, res) => {
  try {
    const q = quizzes.update(req.params.id, req.body);
    if (!q) return res.status(404).json({ error: 'Quiz introuvable.' });
    res.json(q);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/quizzes/:id', auth, (req, res) => {
  if (!quizzes.remove(req.params.id)) return res.status(404).json({ error: 'Quiz introuvable.' });
  res.json({ ok: true });
});

app.get('/prof', (req, res) => res.sendFile(path.join(__dirname, 'public', 'prof.html')));

// État public minimal : utilisé par le déploiement automatique pour attendre la fin des parties.
const VERSION = require('./package.json').version;
const STARTED_AT = new Date().toISOString();
app.get('/api/status', (req, res) => res.json({ version: VERSION, startedAt: STARTED_AT, busy: busyRooms() }));

// ---------------------------------------------------------------------------
// Temps réel
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

function newCode() {
  let c;
  do { c = String(crypto.randomInt(100000, 1000000)); } while (rooms.has(c));
  return c;
}

function hostRoom(socket) {
  if (!socket.data.isHost) return null;
  return rooms.get(socket.data.code) || null;
}

function joinAsHost(socket, room) {
  socket.data.isHost = true;
  socket.data.code = room.code;
  socket.join(room.code);
  socket.join(room.code + ':host');
}

io.on('connection', socket => {
  const reply = (cb, data) => { if (typeof cb === 'function') cb(data); };

  // ----- prof --------------------------------------------------------------
  socket.on('host:create', (msg = {}, cb) => {
    if (msg.password !== ADMIN_PASSWORD) return reply(cb, { error: 'Mot de passe incorrect.' });
    const Mode = modes.get(msg.mode || 'arena');
    if (!Mode) return reply(cb, { error: 'Mode de jeu inconnu.' });
    const quiz = quizzes.snapshot(msg.quizId);
    if (!quiz || !quiz.questions.length) return reply(cb, { error: 'Quiz introuvable ou vide.' });
    const code = newCode();
    const room = new Mode(io, code, quiz, msg.settings);
    rooms.set(code, room);
    joinAsHost(socket, room);
    reply(cb, { ok: true, code, lobby: room.lobbyInfo(), info: room.clientInfo() });
  });

  socket.on('host:rejoin', (msg = {}, cb) => {
    if (msg.password !== ADMIN_PASSWORD) return reply(cb, { error: 'Mot de passe incorrect.' });
    const room = rooms.get(String(msg.code));
    if (!room) return reply(cb, { error: 'Partie introuvable.' });
    joinAsHost(socket, room);
    reply(cb, { ok: true, code: room.code, lobby: room.lobbyInfo(), info: room.clientInfo(), results: room.results });
  });

  socket.on('host:start', (_m, cb) => {
    const room = hostRoom(socket);
    if (!room) return reply(cb, { error: 'Partie introuvable.' });
    if (room.players.size === 0) return reply(cb, { error: 'Aucun élève connecté.' });
    reply(cb, { ok: room.start() });
  });

  socket.on('host:addMinute', () => { const r = hostRoom(socket); if (r) r.addMinute(); });
  socket.on('host:end', () => { const r = hostRoom(socket); if (r) r.end(); });
  socket.on('host:replay', () => { const r = hostRoom(socket); if (r) r.reset(); });
  socket.on('host:kick', (msg = {}) => { const r = hostRoom(socket); if (r) r.kick(Number(msg.id)); });
  socket.on('host:close', () => {
    const r = hostRoom(socket);
    if (!r) return;
    r.destroy();
    rooms.delete(r.code);
    socket.data.code = null;
  });

  // ----- élèves ------------------------------------------------------------
  socket.on('player:join', (msg = {}, cb) => {
    const room = rooms.get(String(msg.code || '').trim());
    if (!room) return reply(cb, { error: 'Code de partie inconnu.' });
    if (socket.data.code && socket.data.code !== room.code) {
      const old = rooms.get(socket.data.code);
      if (old) old.removeSocket(socket.id);
      socket.leave(socket.data.code);
    }
    const res = room.addPlayer(socket, msg.name, msg.token);
    if (res.error) return reply(cb, res);
    socket.data.code = room.code;
    let results = null;
    if (room.results) { const { questions, ...pub } = room.results; results = pub; }
    reply(cb, { ...res, lobby: room.lobbyInfo(), info: room.clientInfo(), results });
  });

  const withPlayer = fn => msg => {
    const room = rooms.get(socket.data.code);
    if (!room || socket.data.isHost) return;
    const p = room.playerBySocket(socket.id);
    if (p) fn(room, p, msg || {});
  };

  socket.on('player:answer', withPlayer((room, p, msg) => room.answer(p, Array.isArray(msg.choices) ? msg.choices : [])));
  socket.on('player:continue', withPlayer((room, p) => room.skipFeedback(p)));
  // actions propres au mode : { type: 'input' | 'cast' | …, …données }
  socket.on('player:action', withPlayer((room, p, msg) => room.handleAction(p, msg.type, msg)));

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (room && !socket.data.isHost) room.removeSocket(socket.id);
  });
});

// Nettoyage des parties abandonnées
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.state === 'playing') continue;
    if (now - room.lastActivity > 45 * 60000) { room.destroy(); rooms.delete(code); }
  }
}, 60000);

// ---------------------------------------------------------------------------
// Redémarrage après un déploiement automatique (GitHub Actions)
// Le déploiement touche le fichier .restart ; on quitte le processus dès qu'aucune
// partie n'est en cours, et Infomaniak le relance avec la nouvelle version.
// ---------------------------------------------------------------------------
const RESTART_FILE = path.join(__dirname, '.restart');
let restartWanted = false;

function busyRooms() {
  return [...rooms.values()].filter(r => r.state === 'playing'
    || (r.state === 'lobby' && [...r.players.values()].some(p => p.connected))).length;
}

fs.watchFile(RESTART_FILE, { interval: 5000 }, (cur, prev) => {
  if (cur.mtimeMs && cur.mtimeMs !== prev.mtimeMs) {
    restartWanted = true;
    console.log('[mise à jour] Nouvelle version déployée : redémarrage dès qu\'aucune partie n\'est en cours.');
  }
});

setInterval(() => {
  if (!restartWanted) return;
  const busy = busyRooms();
  if (busy) { console.log(`[mise à jour] Redémarrage en attente (${busy} partie(s) en cours).`); return; }
  console.log('[mise à jour] Redémarrage pour appliquer la mise à jour.');
  process.exit(3);
}, 15000);

server.listen(PORT, () => {
  const list = modes.list().map(m => m.name).join(', ');
  console.log(`Arcanes en ligne sur http://localhost:${PORT}  (élèves : /  —  prof : /prof)  — modes : ${list}`);
});
