'use strict';
/* Notifications sur le téléphone (Web Push). Sur iPhone, elles marchent quand le carnet est ajouté à l'écran d'accueil. */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { db, DATA_DIR } = require('./store');

db.exec(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, uid TEXT NOT NULL, sub TEXT NOT NULL, ua TEXT, created INTEGER NOT NULL);`);

function keys() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  const f = path.join(DATA_DIR, 'vapid.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const k = webpush.generateVAPIDKeys(); fs.writeFileSync(f, JSON.stringify(k), { mode: 0o600 }); return k;
}
const K = keys();
webpush.setVapidDetails('mailto:' + (process.env.SMTP_FROM || 'contact@mychildmybattle.com'), K.publicKey, K.privateKey);
const sent = []; /* journal en mémoire, utile aux tests */

function subscribe(uid, sub, ua) {
  if (!sub || !sub.endpoint || !/^https:\/\//.test(sub.endpoint)) throw new Error('abonnement invalide');
  db.prepare('INSERT OR REPLACE INTO push_subs(endpoint,uid,sub,ua,created) VALUES (?,?,?,?,?)').run(sub.endpoint, uid, JSON.stringify(sub), String(ua || '').slice(0, 200), Date.now());
}
function unsubscribe(uid, endpoint) { db.prepare('DELETE FROM push_subs WHERE uid = ? AND endpoint = ?').run(uid, endpoint); }
const count = uid => db.prepare('SELECT COUNT(*) n FROM push_subs WHERE uid = ?').get(uid).n;

async function toUser(uid, payload) {
  const subs = db.prepare('SELECT * FROM push_subs WHERE uid = ?').all(uid);
  let n = 0;
  for (const s of subs) {
    if (process.env.PUSH_STUB) { sent.push({ uid, ...payload }); if (process.env.PUSH_STUB.includes('/')) fs.appendFileSync(process.env.PUSH_STUB, JSON.stringify({ at: Number(process.env.SIM_NOW || Date.now()), uid, ...payload }) + '\n'); n++; continue; }
    try { await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify(payload), { TTL: 6 * 3600 }); n++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint); }
  }
  return n;
}
module.exports = { publicKey: K.publicKey, subscribe, unsubscribe, toUser, count, sent };
