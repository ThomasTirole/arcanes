'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Server } = require('socket.io');
const { QuizStore } = require('./lib/quizzes');
const { AccountStore, AuthError } = require('./lib/accounts');
const modes = require('./modes');

const PORT = process.env.PORT || 3000;
// sert seulement de « code de mise en route » pour créer le tout premier compte (administrateur)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'arcanes';
const DATA_DIR = process.env.ARCANES_DATA_DIR || path.join(__dirname, 'data');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[attention] ADMIN_PASSWORD non défini : code de mise en route par défaut "arcanes". Change-le en production !');
}

const quizzes = new QuizStore(DATA_DIR);
const accounts = new AccountStore(DATA_DIR);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
for (const { Mode, publicDir } of modes.entries()) {
  app.use(`/modes/${Mode.id}`, express.static(publicDir));
}

app.set('trust proxy', 1);   // derrière le proxy d'Infomaniak : vraie adresse IP pour le frein anti-essais

// ---- comptes ---------------------------------------------------------------
const bearer = req => (req.get('authorization') || '').replace(/^Bearer\s+/i, '');

function auth(req, res, next) {
  const u = accounts.userFromToken(bearer(req));
  if (!u) return res.status(401).json({ error: 'Connexion expirée : reconnecte-toi.' });
  req.user = u;
  next();
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  next();
}
// tant qu'il doit changer son mot de passe provisoire, le prof ne peut rien faire d'autre
function ready(req, res, next) {
  if (req.user.mustChange) return res.status(403).json({ error: 'Change d\'abord ton mot de passe provisoire.', mustChange: true });
  next();
}
const P = [auth, ready];

// frein contre les essais de mots de passe : 10 échecs / 10 min par adresse IP
const attempts = new Map();
function limited(req) {
  const a = attempts.get(req.ip);
  return a && a.count >= 10 && Date.now() < a.until;
}
function failed(req) {
  const a = attempts.get(req.ip);
  if (!a || Date.now() > a.until) attempts.set(req.ip, { count: 1, until: Date.now() + 10 * 60000 });
  else a.count++;
}

function sendAuth(res, u) { res.json({ token: accounts.sign(u), user: accounts.publicUser(u) }); }
function authRoute(fn) {
  return (req, res) => {
    if (limited(req)) return res.status(429).json({ error: 'Trop d\'essais : réessaie dans quelques minutes.' });
    try { fn(req, res); } catch (e) {
      if (e instanceof AuthError) { failed(req); return res.status(400).json({ error: e.message }); }
      console.error(e); res.status(500).json({ error: 'Erreur serveur.' });
    }
  };
}

app.get('/api/auth/state', (req, res) => res.json({ setup: !accounts.hasUsers() }));

app.post('/api/auth/setup', authRoute((req, res) => {
  const b = req.body || {};
  const u = accounts.setupAdmin(b, b.setupCode, ADMIN_PASSWORD);
  const n = quizzes.adoptOrphans(u.id);
  if (!n) quizzes.giveSample(u.id);
  console.log(`[comptes] Administrateur créé (${u.email}), ${n} quiz existant(s) rattaché(s).`);
  sendAuth(res, u);
}));

app.post('/api/auth/register', authRoute((req, res) => {
  const u = accounts.register(req.body || {});
  quizzes.giveSample(u.id);
  sendAuth(res, u);
}));

app.post('/api/auth/login', authRoute((req, res) => {
  const b = req.body || {};
  sendAuth(res, accounts.login(b.email, b.password));
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: accounts.publicUser(req.user) }));

app.post('/api/auth/password', auth, authRoute((req, res) => {
  const b = req.body || {};
  sendAuth(res, accounts.changePassword(req.user, b.oldPassword, b.newPassword));
}));

// ---- administration des comptes -------------------------------------------
const A = [auth, ready, adminOnly];
const adminRoute = fn => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(e instanceof AuthError ? 400 : 500).json({ error: e.message }); }
};
app.get('/api/admin/users', ...A, (req, res) => {
  const counts = quizzes.countByOwner();
  res.json({ users: accounts.listUsers().map(u => ({ ...u, quizzes: counts[u.id] || 0 })), invites: accounts.listInvites() });
});
app.post('/api/admin/invites', ...A, adminRoute((req, res) => res.json(accounts.createInvite(req.user, (req.body || {}).note))));
app.delete('/api/admin/invites/:code', ...A, adminRoute((req, res) => { accounts.deleteInvite(req.params.code); res.json({ ok: true }); }));
app.post('/api/admin/users/:id/reset', ...A, adminRoute((req, res) => res.json({ password: accounts.resetPassword(req.params.id) })));
app.post('/api/admin/users/:id/disabled', ...A, adminRoute((req, res) => { accounts.setDisabled(req.user, req.params.id, (req.body || {}).disabled); res.json({ ok: true }); }));
app.post('/api/admin/users/:id/role', ...A, adminRoute((req, res) => { accounts.setRole(req.user, req.params.id, (req.body || {}).role); res.json({ ok: true }); }));

// ---- quiz du prof connecté ---------------------------------------------------
app.get('/api/modes', ...P, (req, res) => res.json(modes.list()));

app.get('/api/quizzes', ...P, (req, res) => res.json(quizzes.list(req.user.id)));

app.get('/api/quizzes/:id', ...P, (req, res) => {
  const q = quizzes.get(req.params.id, req.user.id);
  if (!q) return res.status(404).json({ error: 'Quiz introuvable.' });
  res.json(q);
});

app.post('/api/quizzes', ...P, (req, res) => {
  try { res.json(quizzes.create(req.body, req.user.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/quizzes/:id', ...P, (req, res) => {
  try {
    const q = quizzes.update(req.params.id, req.body, req.user.id);
    if (!q) return res.status(404).json({ error: 'Quiz introuvable.' });
    res.json(q);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/quizzes/:id', ...P, (req, res) => {
  if (!quizzes.remove(req.params.id, req.user.id)) return res.status(404).json({ error: 'Quiz introuvable.' });
  res.json({ ok: true });
});

app.get('/prof', (req, res) => res.sendFile(path.join(__dirname, 'public', 'prof.html')));

// le prototype FPS solo reste accessible ici (mêmes fichiers que le mode « fps »)
app.use('/proto/fps', express.static(path.join(__dirname, 'modes', 'fps', 'public')));

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
  const hostUser = msg => {
    const u = accounts.userFromToken(msg.token);
    return u && !u.mustChange ? u : null;
  };

  socket.on('host:create', (msg = {}, cb) => {
    const user = hostUser(msg);
    if (!user) return reply(cb, { error: 'Connexion expirée : reconnecte-toi.' });
    const Mode = modes.get(msg.mode || 'arena');
    if (!Mode) return reply(cb, { error: 'Mode de jeu inconnu.' });
    const quiz = quizzes.snapshot(msg.quizId, user.id);
    if (!quiz || !quiz.questions.length) return reply(cb, { error: 'Quiz introuvable ou vide.' });
    const code = newCode();
    const room = new Mode(io, code, quiz, msg.settings);
    room.ownerId = user.id;
    rooms.set(code, room);
    joinAsHost(socket, room);
    reply(cb, { ok: true, code, lobby: room.lobbyInfo(), info: room.clientInfo() });
  });

  socket.on('host:rejoin', (msg = {}, cb) => {
    const user = hostUser(msg);
    if (!user) return reply(cb, { error: 'Connexion expirée : reconnecte-toi.' });
    const room = rooms.get(String(msg.code));
    // seul le prof qui a lancé la partie peut la reprendre
    if (!room || room.ownerId !== user.id) return reply(cb, { error: 'Partie introuvable.' });
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
