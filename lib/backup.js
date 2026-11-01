'use strict';
/* Sauvegardes : chaque nuit à 3 h (heure de Paris), copie complète de la base et des photos,
   gardée 30 jours. Une sauvegarde peut aussi être lancée et téléchargée depuis le panneau d'administration. */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { db, DATA_DIR, audit } = require('./store');

const BK_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);
fs.mkdirSync(BK_DIR, { recursive: true });

const stamp = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
};

async function makeBackup(by) {
  const name = 'carnet-memb-' + stamp();
  const tmp = path.join(BK_DIR, name + '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  await db.backup(path.join(tmp, 'memb.sqlite'));
  const file = path.join(BK_DIR, name + '.tar.gz');
  await new Promise((res, rej) => execFile('tar', ['-czf', file, '-C', tmp, 'memb.sqlite', '-C', DATA_DIR, 'blobs'], e => e ? rej(e) : res()));
  fs.rmSync(tmp, { recursive: true, force: true });
  prune();
  audit(by || null, 'backup', name);
  return { name: name + '.tar.gz', size: fs.statSync(file).size };
}
function prune() {
  const limit = Date.now() - KEEP_DAYS * 864e5;
  for (const f of fs.readdirSync(BK_DIR)) {
    const p = path.join(BK_DIR, f);
    if (f.endsWith('.tar.gz') && fs.statSync(p).mtimeMs < limit) fs.rmSync(p);
  }
}
function list() {
  return fs.readdirSync(BK_DIR).filter(f => f.endsWith('.tar.gz')).map(f => { const s = fs.statSync(path.join(BK_DIR, f)); return { name: f, size: s.size, at: s.mtimeMs }; }).sort((a, b) => b.at - a.at);
}
function filePath(name) {
  if (!/^carnet-memb-[0-9_\-h]+\.tar\.gz$/.test(name)) return null;
  const p = path.join(BK_DIR, name);
  return fs.existsSync(p) ? p : null;
}

/* Planification : vérifie chaque minute, sauvegarde une fois par jour après 3 h (Paris). */
let lastDay = null;
function schedule(log) {
  const tick = async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const day = now.toDateString();
    const done = list().some(b => Date.now() - b.at < 20 * 36e5);
    if (now.getHours() >= 3 && lastDay !== day && !done) {
      lastDay = day;
      try { const r = await makeBackup('auto'); log('Sauvegarde automatique : ' + r.name); } catch (e) { log('Sauvegarde automatique échouée : ' + e.message); }
    } else if (done) lastDay = day;
  };
  setInterval(tick, 60e3); setTimeout(tick, 15e3);
}

module.exports = { makeBackup, list, filePath, schedule, BK_DIR };
