'use strict';
/* Carnet de suivi MEMB — serveur en ligne.
   Sert l'application, gère les comptes et les droits, stocke les données et les photos, envoie les mises à jour en direct. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

require('./lib/env');
const store = require('./lib/store');
const acl = require('./lib/acl');
const auth = require('./lib/auth');
const mail = require('./lib/mail');
const backup = require('./lib/backup');
const notifyLib = require('./lib/notify');
const push = require('./lib/push');
const route = require('./lib/route');
const jobs = require('./lib/jobs');
const { db, getDoc, listCol, setDoc, delDoc, deepMerge, isDocPath, isColPath, audit, DATA_DIR } = store;

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE = BASE_URL.startsWith('https://');
const PUB = path.join(__dirname, 'public');
const log = (...a) => console.log(new Date().toISOString(), ...a);

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.disable('x-powered-by');

/* En-têtes de sécurité */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (SECURE) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

/* Contre les requêtes envoyées depuis un autre site : toute écriture doit porter l'en-tête X-MEMB. */
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-memb'] !== '1') return res.status(403).json({ code: 'invalid_argument', message: 'requête refusée' });
  next();
});
const json = express.json({ limit: '4mb' });

const needUser = (req, res, next) => { const u = auth.userFromReq(req); if (!u) return res.status(401).json({ code: 'unauthenticated', message: 'Connexion requise' }); req.u = u; next(); };
const needRole = (...roles) => (req, res, next) => roles.includes(req.u.role) ? next() : res.status(403).json({ code: 'invalid_argument', message: 'accès refusé' });
const fail = (res, e) => { const st = e.status || (e.code === 'invalid_argument' ? 400 : 500); if (st >= 500) log('ERREUR', e); res.status(st).json({ code: e.code || 'unavailable', message: e.message || 'erreur' }); };

/* ---------------- Pages ---------------- */
const page = f => (req, res) => res.sendFile(path.join(PUB, f));
app.get('/', (req, res) => { const u = auth.userFromReq(req); res.redirect(u ? '/app' : '/login'); });
app.get('/login', page('login.html'));
app.get('/mot-de-passe', page('login.html'));
app.get('/bienvenue', page('login.html'));
app.get('/confidentialite', page('confidentialite.html'));
app.get('/compte', (req, res) => auth.userFromReq(req) ? res.sendFile(path.join(PUB, 'login.html')) : res.redirect('/login'));
app.get('/app', (req, res) => { const u = auth.userFromReq(req); if (!u) return res.redirect('/login?next=/app'); res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(PUB, 'app.html')); });
app.get('/admin', (req, res) => { const u = auth.userFromReq(req); if (!u) return res.redirect('/login?next=/admin'); if (!acl.MANAGERS.includes(u.role)) return res.redirect('/app'); res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(PUB, 'admin.html')); });
app.get('/logout', (req, res) => { const u = auth.userFromReq(req); auth.endSession(req); if (u) audit(u.id, 'logout', null, req.ip); res.setHeader('Set-Cookie', auth.clearCookie(SECURE)); res.redirect('/login'); });
app.use('/static', express.static(path.join(PUB, 'static'), { maxAge: '7d' }));
app.get('/manifest.webmanifest', page('manifest.webmanifest'));

/* Images : celles de l'application (publiques) puis les photos envoyées (connexion requise). */
const BASE_BLOBS = path.join(PUB, 'blobs');
app.get('/_blob/:id', (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return res.status(404).end();
  for (const ext of ['jpg', 'png', 'webp']) { const f = path.join(BASE_BLOBS, id + '.' + ext); if (fs.existsSync(f)) { res.setHeader('Cache-Control', 'public, max-age=604800'); return res.sendFile(f); } }
  const u = auth.userFromReq(req); if (!u) return res.status(401).end();
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  const f = path.join(DATA_DIR, 'blobs', id);
  if (!a || !fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Content-Type', a.mime); res.setHeader('Cache-Control', 'private, max-age=604800');
  fs.createReadStream(f).pipe(res);
});

/* ---------------- Connexion ---------------- */
app.post('/api/login', json, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  const k1 = 'ip:' + req.ip, k2 = 'em:' + email;
  if (auth.tooMany(k1) || auth.tooMany(k2)) return res.status(429).json({ message: 'Trop d’essais. Réessayez dans 15 minutes, ou utilisez « Mot de passe oublié ».' });
  const u = auth.getUserByEmail(email);
  if (!u || !u.active || !auth.checkPassword(pw, u.pass)) { auth.noteFail(k1); auth.noteFail(k2); audit(u && u.id, 'login-fail', email, req.ip); return res.status(401).json({ message: 'E-mail ou mot de passe incorrect.' }); }
  auth.clearFails(k1); auth.clearFails(k2);
  const t = auth.createSession(u.id, req);
  audit(u.id, 'login', null, req.ip);
  res.setHeader('Set-Cookie', auth.cookieHeader(t, SECURE));
  res.json({ ok: true, role: u.role });
});
app.post('/api/logout', (req, res) => { auth.endSession(req); res.setHeader('Set-Cookie', auth.clearCookie(SECURE)); res.json({ ok: true }); });
app.get('/api/me', needUser, (req, res) => res.json(auth.publicUser(req.u)));
app.post('/api/forgot', json, async (req, res) => {
  const k = 'fg:' + req.ip; if (auth.tooMany(k)) return res.json({ ok: true }); auth.noteFail(k);
  const u = auth.getUserByEmail(req.body.email);
  if (u && u.active) { const link = BASE_URL + '/mot-de-passe?t=' + auth.makeToken(u.id, 'reset', 2); try { await mail.reset(u, link); } catch (e) { log('Envoi e-mail échoué', e.message); } audit(u.id, 'forgot', null, req.ip); }
  res.json({ ok: true, mail: mail.enabled() }); /* même réponse que le compte existe ou non */
});
app.post('/api/token', json, (req, res) => {
  const t = auth.readToken(req.body.token); if (!t) return res.status(400).json({ message: 'Ce lien n’est plus valable. Demandez-en un nouveau.' });
  const u = auth.getUser(t.uid); res.json({ name: u.name, email: u.email, kind: t.kind });
});
app.post('/api/token/use', json, (req, res) => {
  const t = auth.readToken(req.body.token); if (!t) return res.status(400).json({ message: 'Ce lien n’est plus valable. Demandez-en un nouveau.' });
  const pb = auth.passwordProblem(req.body.password); if (pb) return res.status(400).json({ message: pb });
  db.prepare('UPDATE users SET pass = ?, active = 1 WHERE id = ?').run(auth.hashPassword(req.body.password), t.uid);
  auth.useToken(t.token); auth.endAllSessions(t.uid);
  const tok = auth.createSession(t.uid, req); audit(t.uid, t.kind === 'invite' ? 'invite-accepted' : 'password-reset', null, req.ip);
  res.setHeader('Set-Cookie', auth.cookieHeader(tok, SECURE)); res.json({ ok: true });
});
app.post('/api/password', json, needUser, (req, res) => {
  if (!auth.checkPassword(String(req.body.current || ''), req.u.pass)) return res.status(400).json({ message: 'Le mot de passe actuel est incorrect.' });
  const pb = auth.passwordProblem(req.body.password); if (pb) return res.status(400).json({ message: pb });
  db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(auth.hashPassword(req.body.password), req.u.id);
  auth.endAllSessions(req.u.id); const tok = auth.createSession(req.u.id, req); audit(req.u.id, 'password-change', null, req.ip);
  res.setHeader('Set-Cookie', auth.cookieHeader(tok, SECURE)); res.json({ ok: true });
});

/* ---------------- Données ---------------- */
function readDoc(u, p) { if (!acl.canRead(u, p)) return null; const d = getDoc(p); return d ? acl.redact(u, p, d) : null; }
function readCol(u, p, o = {}) {
  if (!acl.canRead(u, p)) return [];
  let rows = listCol(p).filter(r => acl.canRead(u, p + '/' + r.id)).map(r => ({ id: r.id, data: acl.redact(u, p + '/' + r.id, r.data) })).filter(r => r.data);
  if (o.orderBy) { const f = o.orderBy, dir = o.dir === 'desc' ? -1 : 1; rows.sort((a, b) => { const x = a.data[f], y = b.data[f]; return (x === y ? 0 : x === undefined ? -1 : y === undefined ? 1 : x < y ? -1 : 1) * dir; }); }
  if (o.limit) rows = rows.slice(0, Math.min(1000, Number(o.limit)));
  return rows;
}
app.post('/api/db', json, needUser, (req, res) => {
  const u = req.u; const { op, path: p, data, orderBy, dir, limit } = req.body || {};
  try {
    if (op === 'get') { if (!isDocPath(p)) throw store.bad('chemin de document invalide'); const d = readDoc(u, p); return res.json({ exists: !!d, data: d || undefined }); }
    if (op === 'list') { if (!isColPath(p)) throw store.bad('chemin de collection invalide'); return res.json({ docs: readCol(u, p, { orderBy, dir, limit }) }); }
    if (!isDocPath(p)) throw store.bad('chemin de document invalide');
    if (!['set', 'update', 'delete'].includes(op)) throw store.bad('opération inconnue');
    let r = acl.checkWrite(u, p, op, data);
    let effOp = op, effData = r;
    if (r && r.__patch) { effOp = 'update'; effData = r.data; }
    const existing = getDoc(p);
    if (effOp === 'delete') { delDoc(p); if (p.split('/').length === 2 && p.startsWith('children/')) audit(u.id, 'delete-child', p, req.ip); }
    else if (effOp === 'update') { if (!existing) throw store.bad('document introuvable'); setDoc(p, deepMerge(existing, effData), u.id); }
    else setDoc(p, effData, u.id);
    notify(p);
    res.json({ ok: true });
    if (effOp !== 'delete') notifyLib.afterWrite(u, p, existing, getDoc(p), notify);
  } catch (e) { fail(res, e); }
});

/* Mises à jour en direct (Server-Sent Events) : on prévient chaque appareil des chemins modifiés qu'il a le droit de lire. */
const clients = new Set();
app.get('/api/stream', needUser, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const c = { res, uid: req.u.id };
  clients.add(c);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(c); });
});
function notify(p) {
  for (const c of clients) {
    const u = auth.getUser(c.uid); if (!u || !u.active) continue;
    const isChildDoc = p.startsWith('children/') && p.split('/').length === 2;
    if (acl.canRead(u, p) || (isChildDoc && u.role !== 'parent')) c.res.write(`data: ${JSON.stringify({ p })}\n\n`);
  }
}

/* Notifications sur le téléphone */
app.get('/sw.js', (req, res) => { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(PUB, 'sw.js')); });
app.get('/api/push/key', needUser, (req, res) => res.json({ key: push.publicKey, n: push.count(req.u.id) }));
app.post('/api/push/subscribe', json, needUser, (req, res) => { try { push.subscribe(req.u.id, req.body.sub, req.headers['user-agent']); res.json({ ok: true, n: push.count(req.u.id) }); } catch (e) { res.status(400).json({ message: e.message }); } });
app.post('/api/push/unsubscribe', json, needUser, (req, res) => { push.unsubscribe(req.u.id, String(req.body.endpoint || '')); res.json({ ok: true, n: push.count(req.u.id) }); });
app.post('/api/push/test', needUser, async (req, res) => res.json({ n: await push.toUser(req.u.id, { title: 'Carnet MEMB', body: 'Les notifications fonctionnent sur cet appareil.', url: '/app', tag: 'test' }) }));

/* Distance routière entre deux adresses (forfait kilométrique) */
app.post('/api/route', json, needUser, needRole('admin', 'coordinatrice', 'intervenante'), async (req, res) => {
  const pairs = Array.isArray(req.body.pairs) ? req.body.pairs.slice(0, 40) : [[req.body.from, req.body.to]];
  try { const out = []; for (const [a, b] of pairs) out.push(await route.distance(String(a || '').slice(0, 300), String(b || '').slice(0, 300))); res.json({ results: out }); }
  catch (e) { res.status(502).json({ message: 'Calcul de distance indisponible pour le moment.' }); }
});

/* Rappels : aperçu des prochains envois (équipe) */
app.get('/api/rappels/apercu', needUser, needRole('admin', 'coordinatrice'), (req, res) => {
  const now = Date.now(); const out = [];
  for (const r of db.prepare("SELECT path, data FROM docs WHERE col LIKE 'children/%/sessions'").all()) {
    const s = JSON.parse(r.data); const cid = r.path.split('/')[1]; if (s.statut === 'annulee' || !s.date) continue;
    const c = getDoc('children/' + cid); if (!c) continue;
    const start = notifyLib.parisMs(s.date, s.heure || '09:00'); if (start < now || start > now + 8 * 864e5 || s.absence) continue;
    const ps = notifyLib.parentsOf(cid);
    if (!ps.length) out.push({ cid, prenom: c.prenom, date: s.date, heure: s.heure || '', kind: 'aucun', at: start, parents: 0, joignables: 0 });
    for (const u of ps) { const { out: f, R } = notifyLib.firesFor(c, s, u); const ch = notifyLib.channelsFor(u, R); f.forEach(([k, at]) => { if (at > now) out.push({ cid, prenom: c.prenom, date: s.date, heure: s.heure || '', kind: k, at, parent: u.name, canal: ch.pushOn ? 'notification' : 'e-mail', parents: ps.length, joignables: ps.length }); }); }
  }
  res.json({ next: out.sort((a, b) => a.at - b.at).slice(0, 60) });
});

/* Familles : comptes parents de chaque enfant (pour le payeur et les familles injoignables) */
app.get('/api/familles', needUser, needRole('admin', 'coordinatrice'), (req, res) => {
  res.json({ familles: listCol('children').map(r => ({ cid: r.id, prenom: r.data.prenom || '', payeur: r.data.payeur || null, parents: notifyLib.reach(r.id) })) });
});

/* Profils (noms) */
app.post('/api/profiles', json, needUser, (req, res) => {
  const ids = (req.body.ids || []).slice(0, 64); const out = {};
  for (const id of ids) { const u = auth.getUser(id); out[id] = { id, name: u ? u.name : '' }; }
  res.json(out);
});

/* Photos et fichiers */
app.post('/api/assets', needUser, (req, res, next) => req.u.role === 'parent' ? res.status(403).json({ code: 'invalid_argument' }) : next(), express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
  const mime = String(req.headers['content-type'] || '').split(';')[0];
  if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mime)) return res.status(400).json({ code: 'invalid_argument', message: 'type de fichier non accepté' });
  if (!req.body || !req.body.length) return res.status(400).json({ code: 'invalid_argument', message: 'fichier vide' });
  const id = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(DATA_DIR, 'blobs', id), req.body);
  db.prepare('INSERT INTO assets(id,mime,size,created,by) VALUES (?,?,?,?,?)').run(id, mime, req.body.length, Date.now(), req.u.id);
  res.json({ id, url: '/_blob/' + id, sizeBytes: req.body.length, contentType: mime });
});
app.get('/api/assets', needUser, needRole('admin', 'coordinatrice'), (req, res) => res.json({ assets: db.prepare('SELECT id, mime contentType, size sizeBytes, created FROM assets ORDER BY created DESC LIMIT 1000').all().map(a => ({ ...a, url: '/_blob/' + a.id })) }));
app.delete('/api/assets/:id', needUser, (req, res) => {
  if (req.u.role === 'parent') return res.status(403).json({ code: 'invalid_argument' });
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (a) { db.prepare('DELETE FROM assets WHERE id = ?').run(a.id); fs.rmSync(path.join(DATA_DIR, 'blobs', a.id), { force: true }); }
  res.json({ ok: true });
});

/* Assistant IA (facultatif : actif seulement si une clé ANTHROPIC_API_KEY est configurée) */
app.get('/api/ai', needUser, (req, res) => res.json({ enabled: !!process.env.ANTHROPIC_API_KEY && req.u.role !== 'parent' }));
app.post('/api/ai', json, needUser, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY || req.u.role === 'parent') return res.status(403).json({ code: 'not_granted', message: 'IA non disponible' });
  const k = 'ai:' + req.u.id; if (auth.tooMany(k)) return res.status(429).json({ code: 'rate_limited', message: 'Trop de demandes, patientez un peu.' }); auth.noteFail(k);
  try {
    const input = req.body.input; const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 4000, messages }) });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ code: 'unavailable', message: (j.error && j.error.message) || 'IA indisponible' });
    res.json({ text: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('') });
  } catch (e) { fail(res, e); }
});

/* ---------------- Administration ---------------- */
const admin = express.Router();
admin.use(needUser, needRole('admin', 'coordinatrice'));
const canManage = (me, role) => me.role === 'admin' || ['intervenante', 'parent'].includes(role);
admin.get('/users', (req, res) => res.json({ users: db.prepare('SELECT * FROM users ORDER BY role, name').all().map(auth.publicUser), mail: mail.enabled() }));
admin.get('/team', (req, res) => res.json({ team: listCol('team').filter(r => !auth.getUser(r.id)).map(r => ({ id: r.id, nom: r.data.nom || '', role: r.data.role || '' })) }));
admin.get('/children', (req, res) => res.json({ children: listCol('children').map(r => ({ id: r.id, prenom: r.data.prenom || '', nom: r.data.nom || '', intervenante: r.data.intervenante || '' })) }));
function upsertTeam(u) {
  if (u.role === 'parent') return;
  const p = 'team/' + u.id; const ex = getDoc(p) || { addedAt: Date.now(), bio: '' };
  setDoc(p, { ...ex, nom: u.name, role: u.role, email: u.email }, 'admin'); notify(p);
}
async function sendInvite(u, by, req) {
  const link = BASE_URL + '/bienvenue?t=' + auth.makeToken(u.id, 'invite', 24 * 7);
  let sent = false; try { sent = (await mail.invite(u, link, by.name)).sent; } catch (e) { log('Invitation non envoyée', e.message); }
  audit(by.id, 'invite', u.email, req.ip);
  return { link, sent };
}
admin.post('/users', json, async (req, res) => {
  try {
    const { email, name, role, children } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw store.bad('Adresse e-mail invalide.');
    if (!name) throw store.bad('Indique le nom.');
    if (!['admin', 'coordinatrice', 'intervenante', 'parent'].includes(role)) throw store.bad('Rôle invalide.');
    if (!canManage(req.u, role)) throw acl.denied('Seul le super admin crée ce type de compte.');
    if (auth.getUserByEmail(email)) throw store.bad('Un compte existe déjà avec cet e-mail.');
    const id = req.body.id && /^[A-Za-z0-9_-]{3,60}$/.test(req.body.id) && !auth.getUser(req.body.id) ? req.body.id : auth.newUid();
    db.prepare('INSERT INTO users(id,email,name,role,children,active,created) VALUES (?,?,?,?,?,1,?)').run(id, email.trim().toLowerCase(), name.trim(), role, JSON.stringify(role === 'parent' ? (children || []) : []), Date.now());
    const u = auth.getUser(id); upsertTeam(u); audit(req.u.id, 'user-create', email, req.ip);
    res.json({ user: auth.publicUser(u), ...(await sendInvite(u, req.u, req)) });
  } catch (e) { fail(res, e); }
});
admin.patch('/users/:id', json, (req, res) => {
  try {
    const u = auth.getUser(req.params.id); if (!u) throw store.bad('Compte introuvable.');
    if (!canManage(req.u, u.role) || (req.body.role && !canManage(req.u, req.body.role))) throw acl.denied('Seul le super admin modifie ce compte.');
    if (u.is_owner && (req.body.active === false || (req.body.role && req.body.role !== 'admin'))) throw store.bad('Le compte du propriétaire ne peut pas être désactivé ni rétrogradé.');
    const n = { name: req.body.name ?? u.name, email: (req.body.email ?? u.email).trim().toLowerCase(), role: req.body.role ?? u.role, children: JSON.stringify(req.body.children ?? JSON.parse(u.children || '[]')), active: req.body.active === undefined ? u.active : (req.body.active ? 1 : 0) };
    db.prepare('UPDATE users SET name=?, email=?, role=?, children=?, active=? WHERE id=?').run(n.name, n.email, n.role, n.children, n.active, u.id);
    if (!n.active) auth.endAllSessions(u.id);
    const u2 = auth.getUser(u.id); upsertTeam(u2); audit(req.u.id, 'user-update', u.email, req.ip);
    res.json({ user: auth.publicUser(u2) });
  } catch (e) { fail(res, e); }
});
admin.post('/users/:id/invite', async (req, res) => {
  const u = auth.getUser(req.params.id); if (!u || !canManage(req.u, u.role)) return res.status(403).json({ message: 'accès refusé' });
  res.json(await sendInvite(u, req.u, req));
});
admin.get('/backups', (req, res) => res.json({ backups: backup.list(), docs: store.count() }));
admin.post('/backups', needRole('admin'), async (req, res) => { try { res.json(await backup.makeBackup(req.u.id)); } catch (e) { fail(res, e); } });
admin.get('/backups/:name', needRole('admin'), (req, res) => { const f = backup.filePath(req.params.name); if (!f) return res.status(404).end(); audit(req.u.id, 'backup-download', req.params.name, req.ip); res.download(f); });
admin.get('/audit', needRole('admin'), (req, res) => res.json({ audit: db.prepare('SELECT a.*, u.name FROM audit a LEFT JOIN users u ON u.id = a.uid ORDER BY at DESC LIMIT 300').all() }));
/* Import d'une sauvegarde de l'application (format « carnet-memb ») : documents + photos */
admin.post('/import', needRole('admin'), express.raw({ type: () => true, limit: '400mb' }), (req, res) => {
  try {
    const data = JSON.parse(req.body.toString('utf8'));
    if (data.app !== 'carnet-memb' || !data.docs) throw store.bad('Ce fichier n’est pas une sauvegarde du carnet.');
    let docs = 0, blobs = 0;
    const tx = db.transaction(() => {
      for (const [id, durl] of Object.entries(data.blobs || {})) {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(durl); if (!m || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) continue;
        const buf = Buffer.from(m[2], 'base64'); fs.writeFileSync(path.join(DATA_DIR, 'blobs', id), buf);
        db.prepare('INSERT OR REPLACE INTO assets(id,mime,size,created,by) VALUES (?,?,?,?,?)').run(id, m[1], buf.length, Date.now(), req.u.id); blobs++;
      }
      for (const [p, d0] of Object.entries(data.docs)) {
        if (!isDocPath(p)) continue;
        const d = { ...d0 };
        /* cadre « aide scolaire » : les informations de santé ne sont pas reprises en ligne */
        if (/^children\/[^/]+$/.test(p)) { delete d.suivisExterieurs; if (d.notes && typeof d.notes === 'object') { d.notes = { ...d.notes }; delete d.notes.pros; } }
        setDoc(p, d, 'import'); docs++;
      }
    });
    tx();
    audit(req.u.id, 'import', `${docs} documents, ${blobs} photos`, req.ip);
    for (const c of clients) c.res.write(`data: ${JSON.stringify({ p: '*' })}\n\n`);
    res.json({ docs, blobs });
  } catch (e) { fail(res, e); }
});
app.use('/api/admin', admin);

app.use((req, res) => res.status(404).send('Page introuvable'));

/* ---------------- Démarrage ---------------- */
function bootstrapOwner() {
  const n = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (n || !process.env.OWNER_EMAIL) return;
  const id = process.env.OWNER_ID || 'owner';
  db.prepare('INSERT INTO users(id,email,name,role,children,active,is_owner,created) VALUES (?,?,?,?,?,1,1,?)').run(id, process.env.OWNER_EMAIL.toLowerCase(), process.env.OWNER_NAME || 'Super admin', 'admin', '[]', Date.now());
  upsertTeam(auth.getUser(id));
  const link = BASE_URL + '/bienvenue?t=' + auth.makeToken(id, 'invite', 24 * 7);
  log('Compte super admin créé. Lien pour choisir le mot de passe (valable 7 jours) :', link);
  fs.writeFileSync(path.join(DATA_DIR, 'premier-lien.txt'), link + '\n', { mode: 0o600 });
}
if (require.main === module) {
  bootstrapOwner();
  backup.schedule(log);
  if (!process.env.NO_SCHED) { notifyLib.schedule(); jobs.schedule(notify); }
  app.listen(PORT, process.env.HOST || '127.0.0.1', () => log(`Carnet MEMB en ligne sur ${BASE_URL} (port ${PORT})`));
}
module.exports = { app, bootstrapOwner };
