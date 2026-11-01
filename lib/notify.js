'use strict';
/* Rappels de séance et alertes aux familles et à l'équipe : par e-mail et sur le téléphone. */
const { db, getDoc, listCol, setDoc } = require('./store');
const mail = require('./mail');
const push = require('./push');

db.exec(`CREATE TABLE IF NOT EXISTS sent_notifs (k TEXT PRIMARY KEY, at INTEGER NOT NULL);`);
const BASE = () => (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const once = k => { try { db.prepare('INSERT INTO sent_notifs(k,at) VALUES (?,?)').run(k, Date.now()); return true; } catch (e) { return false; } };
const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dLong = d => { const t = new Date(d + 'T12:00:00Z'); return `${JOURS[t.getUTCDay()]} ${t.getUTCDate()} ${MOIS[t.getUTCMonth()]}`; };
const hh = h => (h || '').replace(':', 'h');

/* ---------- heure de Paris ---------- */
function parisOffsetMin(ms) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUtc - ms) / 60000);
}
function parisMs(date, hm) { const [y, m, d] = date.split('-').map(Number); const [h, mi] = (hm || '09:00').split(':').map(Number); const guess = Date.UTC(y, m - 1, d, h, mi); return guess - parisOffsetMin(guess) * 60000; }
function parisDate(ms) { const o = parisOffsetMin(ms); return new Date(ms + o * 60000).toISOString().slice(0, 10); }
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/* ---------- destinataires ---------- */
const parentsOf = cid => db.prepare("SELECT * FROM users WHERE role = 'parent' AND active = 1").all().filter(u => { try { return JSON.parse(u.children || '[]').includes(cid); } catch (e) { return false; } });
const userById = id => db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(id);
/* le parent payeur (désigné dans le dossier) reçoit seul ce qui concerne l'URSSAF */
const payersOf = cid => { const c = getDoc('children/' + cid) || {}; const all = parentsOf(cid); const p = c.payeur && all.find(u => u.id === c.payeur); return p ? [p] : all; };
const coordos = () => { const m = db.prepare("SELECT * FROM users WHERE role IN ('coordinatrice','admin') AND active = 1").all(); const c = m.filter(x => x.role === 'coordinatrice'); return c.length ? c : m; };
const managers = () => db.prepare("SELECT * FROM users WHERE role IN ('coordinatrice','admin') AND active = 1").all();

function layout(title, body, btn, link) {
  return `<!doctype html><html><body style="margin:0;background:#F2F3F7;font-family:Helvetica,Arial,sans-serif;color:#0E2A5C"><div style="max-width:520px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:18px;padding:26px">
<div style="font-size:13px;color:#5E5E63;margin-bottom:6px">Mon enfant, Ma bataille</div><h1 style="font-size:21px;margin:0 0 14px">${esc(title)}</h1><div style="font-size:15px;line-height:1.55;color:#1c1c1e">${body}</div>
${link ? `<p style="margin:22px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#0E2A5C;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:bold">${esc(btn)}</a></p>` : ''}
<p style="font-size:12px;color:#8E8E93;margin-top:18px">Vous recevez ce message car vous avez un compte sur le carnet de suivi. Les rappels se règlent dans le carnet, onglet Réglages.</p></div></div></body></html>`;
}
async function deliver(u, { title, text, html, url, tag, email, pushOn }) {
  if (email === undefined && pushOn === undefined) ({ email, pushOn } = channelsFor(u, rappelsOf(null, u)));
  if (email === undefined) email = true; if (pushOn === undefined) pushOn = true;
  let e = false, p = 0;
  if (email && u.email && mail.enabled()) { try { await mail.send(u.email, title, html || layout(title, `<p>${esc(text)}</p>`, 'Ouvrir le carnet', url), text + (url ? '\n' + url : '')); e = true; } catch (er) { log('E-mail non envoyé', u.email, er.message); } }
  if (pushOn) { try { p = await push.toUser(u.id, { title, body: text, url: url || '/', tag }); } catch (er) { } }
  return { email: e, push: p };
}

/* ---------- rappels de séance ---------- */
const DEF = { veille: { on: true, heure: '18:00' }, jour: { on: true, avant: 120 }, perso: [], canal: 'auto' };
/* réglage général < réglage de l'enfant (ancien) < réglage personnel du parent */
function rappelsOf(c, u) {
  const g = (getDoc('settings/main') || {}).rappels || {}; const r = (c && c.rappels) || {}; const m = u ? ((getDoc('prefs/' + u.id) || {}).rappels || {}) : {};
  const R = { ...DEF, ...g, ...r, ...m, veille: { ...DEF.veille, ...(g.veille || {}), ...(r.veille || {}), ...(m.veille || {}) }, jour: { ...DEF.jour, ...(g.jour || {}), ...(r.jour || {}), ...(m.jour || {}) }, perso: Array.isArray(m.perso) ? m.perso : Array.isArray(r.perso) ? r.perso : (g.perso || []) };
  if (!['auto', 'email', 'both'].includes(R.canal)) R.canal = R.email === false ? 'auto' : R.push === false ? 'email' : 'auto';
  return R;
}
/* un seul canal : la notification si le téléphone est activé, sinon l'e-mail. Personne ne peut se retrouver sans rien. */
function channelsFor(u, R) { const n = push.count(u.id); if (R.canal === 'both') return { email: true, pushOn: n > 0 }; if (R.canal === 'email') return { email: true, pushOn: false }; return n > 0 ? { email: false, pushOn: true } : { email: true, pushOn: false }; }
function firesFor(c, s, u) {
  const R = rappelsOf(c, u); const start = parisMs(s.date, s.heure || '09:00'); const out = [];
  if (R.veille.on) out.push(['veille', parisMs(addDays(s.date, -1), R.veille.heure || '18:00')]);
  if (R.jour.on) out.push(['jour', s.heure ? start - (Number(R.jour.avant) || 120) * 60000 : parisMs(s.date, '08:00')]);
  (R.perso || []).forEach((p, i) => { const m = Number(p.avant); if (m > 0) out.push(['perso' + i + '-' + m, start - m * 60000]); });
  return { R, start, out };
}
function upcomingSessions(now) {
  const d0 = parisDate(now), d1 = addDays(d0, 2);
  return db.prepare("SELECT path, data FROM docs WHERE col LIKE 'children/%/sessions' AND json_extract(data,'$.date') BETWEEN ? AND ?").all(d0, d1)
    .map(r => ({ cid: r.path.split('/')[1], sid: r.path.split('/')[3], s: JSON.parse(r.data) }))
    .filter(x => x.s.statut !== 'annulee' && x.s.statut !== 'realisee' && x.s.date);
}
async function tickRappels(now = Date.now()) {
  let n = 0;
  for (const { cid, sid, s } of upcomingSessions(now)) {
    const c = getDoc('children/' + cid); if (!c || s.absence) continue;
    for (const u of parentsOf(cid)) {
    const { R, start, out } = firesFor(c, s, u);
    if (now >= start) continue;
    for (const [kind, at] of out) {
      if (now < at || now - at > 3 * 3600e3) continue;
      if (!once(`rappel:${cid}:${sid}:${s.date}:${s.heure || ''}:${kind}:${u.id}`)) continue;
      const inter = c.intervenante ? (getDoc('team/' + c.intervenante) || {}).nom || '' : '';
      const dToday = parisDate(now), dTom = addDays(dToday, 1);
      const rel = s.date === dToday ? 'aujourd’hui' : s.date === dTom ? 'demain' : dLong(s.date);
      const when = s.date === dTom ? `demain, ${dLong(s.date)}` : rel;
      const title = `Rappel : séance de ${c.prenom} ${rel}${s.heure ? ' à ' + hh(s.heure) : ''}`;
      const text = `Séance de ${c.prenom} ${when}${s.heure ? ' à ' + hh(s.heure) : ''}${inter ? ' avec ' + inter : ''}${c.adresse ? ', ' + c.adresse : ''}.`;
      const html = layout(title, `<p>Bonjour,</p><p>Nous vous rappelons la séance de <b>${esc(c.prenom)}</b> ${esc(when)}${s.heure ? ' à <b>' + esc(hh(s.heure)) + '</b>' : ''}${inter ? ' avec ' + esc(inter) : ''}.</p>${c.adresse ? `<p>Lieu : ${esc(c.adresse)}</p>` : ''}<p>Un empêchement ? Touchez « Prévenir d’une absence » dans l’agenda de l’espace famille.</p>`, 'Ouvrir l’espace famille', BASE() + '/app');
      await deliver(u, { title, text, html, url: '/app', tag: 'rappel-' + sid, ...channelsFor(u, R) }); n++;
    }
    }
  }
  return n;
}

/* ---------- après une écriture : messages, factures, devoirs ---------- */
async function afterWrite(u, p, before, after, onChange) {
  try {
    const [top, id] = p.split('/');
    if (top === 'fmsg' && !before && after) {
      const c = getDoc('children/' + after.cid) || {};
      if (after.fromRole === 'parent') {
        const to = after.to === 'intervenante' && c.intervenante ? [userById(c.intervenante)].filter(Boolean) : managers().filter(m => m.role === 'coordinatrice').concat(managers().filter(m => m.role === 'admin' && !managers().some(x => x.role === 'coordinatrice')));
        const title = `Message de la famille de ${c.prenom || ''}`;
        for (const r of to) await deliver(r, { title, text: `${after.fromName} : ${after.text.slice(0, 280)}`, url: '/app', tag: 'fmsg-' + after.cid });
        setDoc('events/' + id, { type: 'message', text: `${after.fromName} (famille de ${c.prenom || ''}) : ${after.text.slice(0, 140)}`, at: Date.now(), by: u.id, byName: after.fromName, cid: after.cid, to: to.length === 1 ? to[0].id : null, fromParent: true }, u.id);
        if (onChange) onChange('events/' + id);
      } else {
        for (const r of parentsOf(after.cid)) await deliver(r, { title: `Nouveau message de ${after.fromName}`, text: after.text.slice(0, 280), url: '/app', tag: 'fmsg-' + after.cid });
      }
    }
    const sp = p.split('/');
    if (sp[0] === 'children' && sp[2] === 'sessions' && sp.length === 4 && before && after && after.date) {
      const c = getDoc('children/' + sp[1]) || {};
      const future = parisMs(after.date, after.heure || '23:59') > Date.now() || parisMs(before.date || after.date, before.heure || '23:59') > Date.now();
      const cancelled = after.statut === 'annulee' && before.statut !== 'annulee';
      const restored = before.statut === 'annulee' && after.statut !== 'annulee';
      const moved = !cancelled && after.statut !== 'annulee' && (before.date !== after.date || (before.heure || '') !== (after.heure || ''));
      const staffTo = async (title, text) => { const ids = new Set([after.intervenante || c.intervenante, ...coordos().map(x => x.id)].filter(Boolean)); for (const id of ids) { if (id === u.id) continue; const r = userById(id); if (r) await deliver(r, { title, text, url: '/app', tag: 'sess-' + sp[3] }); } if (onChange) { const ep = 'events/s_' + sp[3] + '_' + Date.now(); setDoc(ep, { type: 'rdv', text, at: Date.now(), by: u.id, byName: u.name, cid: sp[1], sid: sp[3], to: null, fromParent: u.role === 'parent' }, u.id); onChange(ep); } };
      if (after.absence && !before.absence && once('absence:' + p + ':' + after.absence.at)) await staffTo(`Absence signalée : ${c.prenom}`, `${after.absence.byName} prévient que ${c.prenom} sera absent${c.genre === 'f' ? 'e' : ''} le ${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''}${after.absence.motif ? ' (' + after.absence.motif + ')' : ''}. À confirmer dans « À traiter ».`);
      const dh = after.demandeHoraire, dh0 = before.demandeHoraire;
      if (dh && dh.statut === 'en_attente' && (!dh0 || dh0.at !== dh.at)) await staffTo(`Demande de changement d’horaire : ${c.prenom}`, `${dh.byName} demande de déplacer la séance du ${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''} au ${dLong(dh.date)}${dh.heure ? ' à ' + hh(dh.heure) : ''}.${dh.msg ? ' « ' + dh.msg + ' »' : ''}`);
      if (dh && dh0 && dh0.statut === 'en_attente' && dh.statut === 'refusee') for (const r of parentsOf(sp[1])) await deliver(r, { title: dh.statut === 'acceptee' ? `Changement d’horaire accepté` : `Changement d’horaire impossible`, text: dh.statut === 'acceptee' ? `La séance de ${c.prenom} est déplacée au ${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''}.` : `Nous ne pouvons pas déplacer la séance de ${c.prenom}${dh.reponse ? ' : ' + dh.reponse : '.'} Elle reste prévue le ${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''}.`, url: '/app', tag: 'rdv-' + sp[3] });
      if (after.intervenante && after.intervenante !== (before.intervenante || null) && after.intervenante !== c.intervenante) { const r = userById(after.intervenante); if (r && once('rempl:' + p + ':' + r.id)) await deliver(r, { title: `Remplacement : séance de ${c.prenom}`, text: `${u.name} te confie la séance de ${c.prenom} le ${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''}${c.adresse ? ', ' + c.adresse : ''}. Elle apparaît dans ton planning.`, url: '/app', tag: 'rempl-' + sp[3] }); }
      if (dh && dh0 && dh0.statut === 'en_attente' && dh.statut === 'acceptee') { /* le déplacement lui-même prévient déjà la famille */ }
      if (future && (cancelled || moved || restored)) {
        const quand = `${dLong(after.date)}${after.heure ? ' à ' + hh(after.heure) : ''}`;
        const avant = `${dLong(before.date)}${before.heure ? ' à ' + hh(before.heure) : ''}`;
        const title = cancelled ? `Séance de ${c.prenom} annulée` : restored ? `Séance de ${c.prenom} rétablie` : `Séance de ${c.prenom} déplacée`;
        const text = cancelled ? `La séance de ${c.prenom} du ${avant} est annulée.` : restored ? `La séance de ${c.prenom} du ${quand} est maintenue.` : `La séance de ${c.prenom} est déplacée : ${avant} → ${quand}.`;
        const key = `rdvchg:${p}:${after.statut}:${after.date}:${after.heure || ''}`;
        if (once(key)) {
          for (const r of parentsOf(sp[1])) if (r.id !== u.id) await deliver(r, { title, text, url: '/app', tag: 'rdv-' + sp[3] });
          const who = after.intervenante || c.intervenante; const iu = who && who !== u.id ? userById(who) : null;
          if (iu) await deliver(iu, { title, text: text + (u.name ? ` (par ${u.name})` : ''), url: '/app', tag: 'rdv-' + sp[3] });
          if (onChange) { const ep = 'events/rdv_' + sp[3] + '_' + Date.now(); setDoc(ep, { type: 'rdv', text, at: Date.now(), by: u.id, byName: u.name, cid: sp[1], sid: sp[3], to: who || null }, u.id); onChange(ep); }
        }
      }
    }
    if (top === 'factures' && after && after.statut === 'transmise' && (!before || before.statut !== 'transmise')) {
      const c = getDoc('children/' + after.cid) || {};
      const title = `Demande de paiement à valider sur votre espace URSSAF`;
      const text = `Une demande de paiement pour ${c.prenom || 'votre enfant'} (${after.libelle || 'séances'}, ${Number(after.montant || 0).toFixed(2).replace('.', ',')} €) est à valider sur votre espace particulier URSSAF, sous 48 heures.`;
      const html = layout(title, `<p>Bonjour,</p><p>${esc(text)}</p><p>Grâce à l’avance immédiate du crédit d’impôt, vous ne réglez que la moitié du montant.</p><p><a href="https://www.particulier.urssaf.fr/">Se connecter à mon espace URSSAF</a></p>`, 'Voir la facture dans le carnet', BASE() + '/app');
      if (once('facture:' + id + ':transmise')) for (const r of payersOf(after.cid)) await deliver(r, { title, text, html, url: '/app', tag: 'facture-' + id, ...channelsFor(r, { canal: 'both' }) });
    }
    if (sp[0] === 'children' && sp.length === 2 && after && after.demandeDeroule && (!before || before.demandeDeroule !== after.demandeDeroule)) {
      for (const r of coordos()) await deliver(r, { title: `Demande de déroulé : ${after.prenom || ''}`, text: `La famille de ${after.prenom || ''} demande à voir le déroulé minute par minute des séances. Activez-le dans le dossier de l’enfant.`, url: '/app', tag: 'deroule-' + sp[1] });
    }
    if (top === 'devoirs' && !before && after) {
      const c = getDoc('children/' + after.cid) || {};
      for (const r of parentsOf(after.cid)) await deliver(r, { title: `Nouveau devoir pour ${c.prenom || ''}`, text: after.texte.slice(0, 200), url: '/app', tag: 'devoir-' + id, email: false });
    }
  } catch (e) { log('notification', e.message); }
}

function schedule() { const t = () => tickRappels().catch(e => log('rappels', e.message)); setInterval(t, 60e3); setTimeout(t, 20e3); }

/* qui peut être joint pour cet enfant : e-mail actif et/ou téléphone abonné */
function reach(cid) { return parentsOf(cid).map(u => ({ id: u.id, name: u.name, email: !!u.email, push: push.count(u.id) > 0, actif: !!u.pass })); }
module.exports = { channelsFor, payersOf, coordos, deliver, layout, once, parisDate, addDays, dLong, hh, userById, BASE, reach, tickRappels, afterWrite, schedule, firesFor, rappelsOf, parisMs, parentsOf, DEF };
