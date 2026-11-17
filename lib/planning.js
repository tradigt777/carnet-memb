/* Modifier le planning régulier d'un enfant en une fois :
   déplacer un créneau (ex. mardi 17h → mercredi 14h), le supprimer, ou en ajouter un,
   à partir d'une date. Seules les séances futures, ni réalisées, ni remplies, ni annulées, bougent.
   La famille, l'intervenante et la coordination reçoivent UNE seule notification. */
const crypto = require('crypto');
const { getDoc, listCol, setDoc, bad } = require('./store');
const N = require('./notify');
const acl = require('./acl');

const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const isHeure = h => h === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h));
const dow = d => { const g = new Date(d + 'T12:00:00Z').getUTCDay(); return g === 0 ? 7 : g; }; // 1 = lundi … 7 = dimanche
const lundi = d => N.addDays(d, 1 - dow(d));
const filled = s => !!(s.activites || s.message || s.reussite || (s.chrono && s.chrono.start));
const modifiable = (s, depuis) => s && isDate(s.date) && s.date >= depuis && s.statut !== 'annulee' && s.statut !== 'realisee' && !filled(s);
const cle = (j, h) => j + '|' + (h || '');
const fmtH = h => h ? N.hh(h) : 'sans heure';
const dureeTxt = x => String(Number(x) || 1).replace('.', ',') + ' h';

function droit(u, cid) {
  const c = getDoc('children/' + cid);
  if (!c) throw bad('Enfant introuvable.');
  if (acl.MANAGERS.includes(u.role)) return c;
  if (u.role === 'intervenante' && c.intervenante === u.id) return c;
  const e = new Error('Seule la coordination ou l’intervenante de l’enfant peut modifier son planning.'); e.status = 403; throw e;
}

/* créneaux réguliers actuels (à partir de la date choisie) */
function creneaux(cid, depuis) {
  const g = new Map();
  for (const r of listCol('children/' + cid + '/sessions')) {
    const s = r.data; if (!modifiable(s, depuis)) continue;
    const k = cle(dow(s.date), s.heure); const x = g.get(k) || { cle: k, jour: dow(s.date), heure: s.heure || '', durees: {}, n: 0, premiere: s.date, derniere: s.date };
    x.n++; const du = String(Number(s.duree) || 1); x.durees[du] = (x.durees[du] || 0) + 1;
    if (s.date < x.premiere) x.premiere = s.date; if (s.date > x.derniere) x.derniere = s.date;
    g.set(k, x);
  }
  return [...g.values()].map(x => ({ cle: x.cle, jour: x.jour, heure: x.heure, duree: Number(Object.entries(x.durees).sort((a, b) => b[1] - a[1])[0][0]), n: x.n, premiere: x.premiere, derniere: x.derniere }))
    .sort((a, b) => a.jour - b.jour || a.heure.localeCompare(b.heure));
}

/* calcule les changements sans rien écrire */
function calcule(cid, body) {
  const depuis = body.depuis; if (!isDate(depuis)) throw bad('Date de départ invalide.');
  const changes = body.changes || {}; const ajouts = Array.isArray(body.ajouts) ? body.ajouts.slice(0, 7) : [];
  const ops = []; const occupe = new Set(); const all = listCol('children/' + cid + '/sessions');
  for (const r of all) { const s = r.data; if (s.statut !== 'annulee' && isDate(s.date)) occupe.add(s.date + '|' + (s.heure || '')); }
  for (const r of all) {
    const s = r.data; if (!modifiable(s, depuis)) continue;
    const ch = changes[cle(dow(s.date), s.heure)]; if (!ch || ch.action === 'garder') continue;
    if (ch.action === 'supprimer') { ops.push({ type: 'annuler', sid: r.id, avant: { date: s.date, heure: s.heure || '', duree: Number(s.duree) || 1 } }); occupe.delete(s.date + '|' + (s.heure || '')); continue; }
    if (ch.action !== 'deplacer') continue;
    const j = Number(ch.jour); if (!(j >= 1 && j <= 7)) throw bad('Jour invalide.');
    const h = ch.heure == null ? (s.heure || '') : String(ch.heure); if (!isHeure(h)) throw bad('Heure invalide.');
    const du = ch.duree == null || ch.duree === '' ? (Number(s.duree) || 1) : Number(ch.duree); if (!(du > 0 && du <= 8)) throw bad('Durée invalide.');
    let d = N.addDays(lundi(s.date), j - 1); if (d < depuis) d = N.addDays(d, 7);
    if (d === s.date && h === (s.heure || '') && du === (Number(s.duree) || 1)) continue;
    ops.push({ type: 'deplacer', sid: r.id, avant: { date: s.date, heure: s.heure || '', duree: Number(s.duree) || 1 }, apres: { date: d, heure: h, duree: du } });
    occupe.delete(s.date + '|' + (s.heure || '')); occupe.add(d + '|' + h);
  }
  for (const a of ajouts) {
    const j = Number(a.jour); const h = String(a.heure || ''); const du = Number(a.duree) || 1; const fin = a.jusquau;
    if (!(j >= 1 && j <= 7) || !isHeure(h) || !(du > 0 && du <= 8) || !isDate(fin) || fin < depuis) throw bad('Créneau à ajouter incomplet (jour, heure, durée, date de fin).');
    if (fin > N.addDays(depuis, 366)) throw bad('Un ajout ne peut pas dépasser un an.');
    let d = N.addDays(lundi(depuis), j - 1); if (d < depuis) d = N.addDays(d, 7);
    for (let i = 0; d <= fin && i < 60; i++, d = N.addDays(d, 7)) {
      if (occupe.has(d + '|' + h)) continue; occupe.add(d + '|' + h);
      ops.push({ type: 'creer', apres: { date: d, heure: h, duree: du } });
    }
  }
  if (ops.length > 400) throw bad('Trop de changements d’un coup.');
  return { depuis, ops, resume: resume(changes, ajouts, cid, depuis) };
}

function resume(changes, ajouts, cid, depuis) {
  const lignes = [];
  for (const x of creneaux(cid, depuis)) {
    const ch = changes[x.cle]; if (!ch || ch.action === 'garder') continue;
    const av = `${JOURS[x.jour]} ${fmtH(x.heure)}`;
    if (ch.action === 'supprimer') lignes.push(`${av} : supprimé`);
    else if (ch.action === 'deplacer') { const h = ch.heure == null ? x.heure : ch.heure; const du = ch.duree || x.duree; lignes.push(`${av} → ${JOURS[Number(ch.jour)]} ${fmtH(h)} (${dureeTxt(du)})`); }
  }
  for (const a of ajouts) lignes.push(`nouveau créneau : ${JOURS[Number(a.jour)]} ${fmtH(a.heure)} (${dureeTxt(a.duree)}) jusqu’au ${N.dLong(a.jusquau)}`);
  return lignes;
}

function sid() { return crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20); }

async function applique(u, cid, body, onChange) {
  const c = droit(u, cid); const r = calcule(cid, body); if (!r.ops.length) return { ...r, n: 0 };
  const hist = (action, changes) => ({ at: Date.now(), by: u.id, byName: u.name, action, changes });
  const quand = x => `${N.dLong(x.date)}${x.heure ? ' à ' + N.hh(x.heure) : ''}`;
  const lot = 'plan_' + Date.now();
  for (const op of r.ops) {
    if (op.type === 'creer') {
      const p = 'children/' + cid + '/sessions/' + sid();
      setDoc(p, { date: op.apres.date, heure: op.apres.heure, duree: op.apres.duree, statut: 'prevue', axes: [], createdAt: Date.now(), createdBy: u.id, lotPlanning: lot, historique: [hist('a créé le rendez-vous (modification du planning)', [{ f: 'Date', v: quand(op.apres) }])] }, u.id);
      if (onChange) onChange(p); continue;
    }
    const p = 'children/' + cid + '/sessions/' + op.sid; const s = getDoc(p); if (!s) continue;
    const h = Array.isArray(s.historique) ? s.historique.slice(-40) : [];
    if (op.type === 'annuler') setDoc(p, { ...s, statut: 'annulee', lotPlanning: lot, historique: [...h, hist('a annulé le rendez-vous (modification du planning)', [{ f: 'Date', v: quand(op.avant) }])] }, u.id);
    else setDoc(p, { ...s, date: op.apres.date, heure: op.apres.heure, duree: op.apres.duree, lotPlanning: lot, historique: [...h, hist('a déplacé le rendez-vous (modification du planning)', [{ f: 'Avant', v: quand(op.avant) }, { f: 'Après', v: quand(op.apres) }])] }, u.id);
    if (onChange) onChange(p);
  }
  /* une seule notification pour tout le monde */
  const title = `Nouveau planning pour ${c.prenom}`;
  const text = `À partir du ${N.dLong(r.depuis)}, le planning de ${c.prenom} change : ${r.resume.join(' ; ')}.`;
  const dest = new Map();
  for (const p of N.parentsOf(cid)) dest.set(p.id, p);
  const iv = c.intervenante && N.userById(c.intervenante); if (iv) dest.set(iv.id, iv);
  for (const x of N.coordos()) dest.set(x.id, x);
  dest.delete(u.id);
  for (const d of dest.values()) { try { await N.deliver(d, { title, text: d.role === 'parent' ? text : `${text} (par ${u.name})`, url: '/app', tag: 'plan-' + cid }); } catch (e) { } }
  const ep = 'events/' + lot + '_' + cid; setDoc(ep, { type: 'rdv', text: `${u.name} a modifié le planning de ${c.prenom} à partir du ${N.dLong(r.depuis)} : ${r.resume.join(' ; ')}`, at: Date.now(), by: u.id, byName: u.name, cid, to: null }, u.id); if (onChange) onChange(ep);
  return { ...r, n: r.ops.length };
}

module.exports = { creneaux, calcule, applique, droit, dow };
