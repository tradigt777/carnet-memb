'use strict';
/* Comptes, mots de passe (scrypt), sessions par cookie sécurisé, jetons d'invitation et de réinitialisation. */
const crypto = require('crypto');
const { db, audit } = require('./store');

const SESSION_DAYS = 30;
const COOKIE = 'memb_s';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, h] = stored.split('$');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const exp = Buffer.from(h, 'hex');
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Le mot de passe doit faire au moins 10 caractères.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Le mot de passe doit contenir des lettres et au moins un chiffre.';
  return null;
}
const rid = (n = 24) => crypto.randomBytes(n).toString('base64url');
const newUid = () => 'm-' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').toLowerCase();

const getUser = id => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const getUserByEmail = e => db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(e || '').trim());

function createSession(uid, req) {
  const token = rid(32);
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token,uid,created,expires,ua,ip) VALUES (?,?,?,?,?,?)').run(token, uid, now, now + SESSION_DAYS * 864e5, String(req.headers['user-agent'] || '').slice(0, 200), req.ip);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, uid);
  return token;
}
function cookieHeader(token, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}
function clearCookie(secure) { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`; }
function readCookie(req) {
  const h = req.headers.cookie || '';
  const m = h.split(/;\s*/).find(x => x.startsWith(COOKIE + '='));
  return m ? m.slice(COOKIE.length + 1) : null;
}
function userFromReq(req) {
  const t = readCookie(req);
  if (!t) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(t);
  if (!s || s.expires < Date.now()) { if (s) db.prepare('DELETE FROM sessions WHERE token = ?').run(t); return null; }
  const u = getUser(s.uid);
  if (!u || !u.active) return null;
  return u;
}
function endSession(req) { const t = readCookie(req); if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t); }
function endAllSessions(uid) { db.prepare('DELETE FROM sessions WHERE uid = ?').run(uid); }

function makeToken(uid, kind, hours) {
  db.prepare('UPDATE tokens SET used = 1 WHERE uid = ? AND kind = ? AND used = 0').run(uid, kind);
  const token = rid(32);
  db.prepare('INSERT INTO tokens(token,uid,kind,expires) VALUES (?,?,?,?)').run(token, uid, kind, Date.now() + hours * 36e5);
  return token;
}
function readToken(token) {
  const t = db.prepare('SELECT * FROM tokens WHERE token = ?').get(String(token || ''));
  if (!t || t.used || t.expires < Date.now()) return null;
  return t;
}
function useToken(token) { db.prepare('UPDATE tokens SET used = 1 WHERE token = ?').run(token); }

/* Limitation des tentatives de connexion : 8 essais par 15 minutes par adresse IP et par e-mail. */
const tries = new Map();
function tooMany(key) {
  const now = Date.now();
  const l = (tries.get(key) || []).filter(t => now - t < 15 * 60e3);
  tries.set(key, l);
  return l.length >= 8;
}
function noteFail(key) { const l = tries.get(key) || []; l.push(Date.now()); tries.set(key, l); }
function clearFails(key) { tries.delete(key); }

function publicUser(u) {
  let children = []; try { children = JSON.parse(u.children || '[]'); } catch (e) {}
  return { id: u.id, email: u.email, name: u.name, role: u.role, children, active: !!u.active, isOwner: !!u.is_owner, created: u.created, lastLogin: u.last_login, hasPassword: !!u.pass };
}

module.exports = { hashPassword, checkPassword, passwordProblem, rid, newUid, getUser, getUserByEmail, createSession, cookieHeader, clearCookie, userFromReq, endSession, endAllSessions, makeToken, readToken, useToken, tooMany, noteFail, clearFails, publicUser, audit };
