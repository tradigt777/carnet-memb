'use strict';
require('./env');
/* Stockage : une base SQLite unique (fichier), documents JSON rangés par chemin
   (même modèle que l'application : collection/doc/collection/doc…). */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'blobs'), { recursive: true });
const db = new Database(path.join(DATA_DIR, 'memb.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  path TEXT PRIMARY KEY, col TEXT NOT NULL, id TEXT NOT NULL,
  data TEXT NOT NULL, updated INTEGER NOT NULL, by TEXT
);
CREATE INDEX IF NOT EXISTS docs_col ON docs(col);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','coordinatrice','intervenante','parent')),
  children TEXT NOT NULL DEFAULT '[]', pass TEXT, active INTEGER NOT NULL DEFAULT 1,
  is_owner INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL, expires INTEGER NOT NULL, ua TEXT, ip TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit (
  at INTEGER NOT NULL, uid TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL, by TEXT
);
`);

const q = {
  get: db.prepare('SELECT data FROM docs WHERE path = ?'),
  list: db.prepare('SELECT id, data FROM docs WHERE col = ?'),
  put: db.prepare('INSERT INTO docs(path,col,id,data,updated,by) VALUES (?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, updated=excluded.updated, by=excluded.by'),
  del: db.prepare('DELETE FROM docs WHERE path = ?'),
  count: db.prepare('SELECT COUNT(*) n FROM docs'),
};

const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function splitPath(p) {
  if (typeof p !== 'string') throw bad('chemin manquant');
  const parts = p.split('/');
  if (!parts.length || parts.some(s => !SEG.test(s) || s === '.' || s === '..')) throw bad('chemin invalide');
  return parts;
}
function bad(m) { const e = new Error(m); e.code = 'invalid_argument'; e.status = 400; return e; }
function isDocPath(p) { return splitPath(p).length % 2 === 0; }
function isColPath(p) { return splitPath(p).length % 2 === 1; }
function parentOf(p) { return p.split('/').slice(0, -1).join('/'); }
function lastOf(p) { return p.split('/').pop(); }

function getDoc(p) { const r = q.get.get(p); return r ? JSON.parse(r.data) : null; }
function listCol(col) { return q.list.all(col).map(r => ({ id: r.id, data: JSON.parse(r.data) })); }
function setDoc(p, data, by) {
  if (!isDocPath(p)) throw bad('chemin de document invalide');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('le document doit être un objet');
  const s = JSON.stringify(data);
  if (s.length > 1024 * 1024) throw bad('document trop gros');
  q.put.run(p, parentOf(p), lastOf(p), s, Date.now(), by || null);
}
function delDoc(p) { q.del.run(p); }

/* Fusion comme l'application l'attend : les objets se fusionnent, le reste (tableaux compris) remplace. */
function deepMerge(a, b) {
  const out = (a && typeof a === 'object' && !Array.isArray(a)) ? { ...a } : {};
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function audit(uid, action, detail, ip) {
  db.prepare('INSERT INTO audit(at,uid,action,detail,ip) VALUES (?,?,?,?,?)').run(Date.now(), uid || null, action, detail ? String(detail).slice(0, 500) : null, ip || null);
}

module.exports = { db, DATA_DIR, getDoc, listCol, setDoc, delDoc, deepMerge, splitPath, isDocPath, isColPath, parentOf, lastOf, bad, audit, count: () => q.count.get().n };
