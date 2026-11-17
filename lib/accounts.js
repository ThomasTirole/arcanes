'use strict';
// Comptes profs (multi-tenant) : chaque prof a ses propres quiz et ses parties.
// - inscription seulement avec un code d'invitation créé par un administrateur ;
// - mot de passe oublié : un administrateur génère un mot de passe provisoire (pas d'e-mail) ;
// - le tout premier compte (administrateur) se crée avec l'ancien mot de passe prof (ADMIN_PASSWORD).
// Stockage : data/accounts.json. Jetons de connexion signés (HMAC) avec data/secret.key :
// ils survivent aux redémarrages du serveur, et changer de mot de passe les invalide.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_DAYS = 30;
const INVITE_DAYS = 14;
const MIN_PASSWORD = 8;
// pas de 0/O, 1/I/L : codes faciles à recopier depuis un tableau ou un message
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

class AuthError extends Error {}

function randomCode(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s;
}
const normEmail = e => String(e || '').trim().toLowerCase();
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

function validate({ name, email, password }) {
  name = String(name || '').trim().slice(0, 60);
  email = normEmail(email);
  if (!name) throw new AuthError('Indique ton nom.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new AuthError('Adresse e-mail invalide.');
  if (String(password || '').length < MIN_PASSWORD) throw new AuthError(`Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
  return { name, email, password: String(password) };
}

class AccountStore {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'accounts.json');
    fs.mkdirSync(dataDir, { recursive: true });
    const keyFile = path.join(dataDir, 'secret.key');
    if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    this.secret = fs.readFileSync(keyFile, 'utf8').trim();
    this.data = this.load() || { users: [], invites: [] };
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (d && Array.isArray(d.users)) return { users: d.users, invites: d.invites || [] };
    } catch (e) { /* pas encore de comptes */ }
    return null;
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get users() { return this.data.users; }
  hasUsers() { return this.users.length > 0; }
  byId(id) { return this.users.find(u => u.id === id) || null; }
  byEmail(email) { return this.users.find(u => u.email === normEmail(email)) || null; }

  publicUser(u) {
    return { id: u.id, name: u.name, email: u.email, role: u.role, mustChange: !!u.mustChange };
  }

  // ------------------------------------------------------------ jetons
  sign(u) {
    const payload = `${u.id}.${u.tv || 0}.${Date.now() + TOKEN_DAYS * 86400000}`;
    const sig = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    return Buffer.from(payload).toString('base64url') + '.' + sig;
  }

  userFromToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;
    const [p64, sig] = token.split('.');
    let payload;
    try { payload = Buffer.from(p64, 'base64url').toString(); } catch (e) { return null; }
    const expect = crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const [id, tv, exp] = payload.split('.');
    const u = this.byId(id);
    if (!u || u.disabled || String(u.tv || 0) !== tv || Number(exp) < Date.now()) return null;
    return u;
  }

  // ------------------------------------------------------------ comptes
  newUser({ name, email, password }, role) {
    if (this.byEmail(email)) throw new AuthError('Un compte existe déjà avec cette adresse.');
    const u = { id: crypto.randomUUID(), name, email, role, pw: hashPassword(password), tv: 0, createdAt: Date.now(), lastLogin: Date.now() };
    this.users.push(u);
    return u;
  }

  /** Premier compte : administrateur, autorisé avec le code de mise en route (ancien mot de passe prof). */
  setupAdmin(body, setupCode, expectedCode) {
    if (this.hasUsers()) throw new AuthError('Le compte administrateur existe déjà.');
    if (String(setupCode || '') !== String(expectedCode)) throw new AuthError('Code de mise en route incorrect.');
    const u = this.newUser(validate(body), 'admin');
    this.save();
    return u;
  }

  register(body) {
    const code = normCode(body.code);
    const inv = this.data.invites.find(i => i.code === code);
    if (!inv || inv.usedBy) throw new AuthError('Code d\'invitation inconnu ou déjà utilisé.');
    if (inv.expires < Date.now()) throw new AuthError('Ce code d\'invitation a expiré : demande-en un nouveau.');
    const u = this.newUser(validate(body), 'prof');
    inv.usedBy = u.id;
    inv.usedAt = Date.now();
    this.save();
    return u;
  }

  login(email, password) {
    const u = this.byEmail(email);
    if (!u || !checkPassword(password, u.pw)) throw new AuthError('Adresse ou mot de passe incorrect.');
    if (u.disabled) throw new AuthError('Ce compte est désactivé.');
    u.lastLogin = Date.now();
    this.save();
    return u;
  }

  changePassword(u, oldPw, newPw) {
    if (!u.mustChange && !checkPassword(oldPw, u.pw)) throw new AuthError('Mot de passe actuel incorrect.');
    if (String(newPw || '').length < MIN_PASSWORD) throw new AuthError(`Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
    u.pw = hashPassword(newPw);
    u.mustChange = false;
    u.tv = (u.tv || 0) + 1;          // déconnecte les autres appareils
    this.save();
    return u;
  }

  // ------------------------------------------------------------ administration
  createInvite(admin, note) {
    let code;
    do { code = randomCode(8); } while (this.data.invites.some(i => i.code === code));
    const inv = { code, note: String(note || '').trim().slice(0, 80), by: admin.id, createdAt: Date.now(), expires: Date.now() + INVITE_DAYS * 86400000 };
    this.data.invites.push(inv);
    this.save();
    return inv;
  }

  deleteInvite(code) {
    const before = this.data.invites.length;
    this.data.invites = this.data.invites.filter(i => i.code !== normCode(code) || i.usedBy);
    if (before !== this.data.invites.length) this.save();
  }

  listInvites() {
    return this.data.invites.filter(i => !i.usedBy && i.expires > Date.now())
      .map(i => ({ code: i.code, note: i.note, expires: i.expires, createdAt: i.createdAt }));
  }

  /** Mot de passe provisoire : à changer à la prochaine connexion. */
  resetPassword(id) {
    const u = this.byId(id);
    if (!u) throw new AuthError('Compte introuvable.');
    const temp = randomCode(4) + '-' + randomCode(4);
    u.pw = hashPassword(temp);
    u.mustChange = true;
    u.tv = (u.tv || 0) + 1;
    this.save();
    return temp;
  }

  setDisabled(admin, id, disabled) {
    const u = this.byId(id);
    if (!u) throw new AuthError('Compte introuvable.');
    if (u.id === admin.id) throw new AuthError('Tu ne peux pas désactiver ton propre compte.');
    u.disabled = !!disabled;
    u.tv = (u.tv || 0) + 1;
    this.save();
  }

  setRole(admin, id, role) {
    const u = this.byId(id);
    if (!u) throw new AuthError('Compte introuvable.');
    if (u.id === admin.id) throw new AuthError('Tu ne peux pas changer ton propre rôle.');
    if (!['admin', 'prof'].includes(role)) throw new AuthError('Rôle inconnu.');
    u.role = role;
    this.save();
  }

  listUsers() {
    return this.users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role, disabled: !!u.disabled,
      mustChange: !!u.mustChange, createdAt: u.createdAt, lastLogin: u.lastLogin,
    }));
  }
}

module.exports = { AccountStore, AuthError, hashPassword, checkPassword, normCode };
