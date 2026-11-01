'use strict';
/* Tâches automatiques, vérifiées toutes les 5 minutes :
   minuteur oublié, séances non remplies, factures URSSAF non validées, devoirs sans réponse,
   messages des familles restés sans lecture, récapitulatif du dimanche. Chaque envoi n'a lieu qu'une fois. */
const { db, getDoc, setDoc } = require('./store');
const N = require('./notify');
const log = (...a) => console.log(new Date().toISOString(), ...a);
const H = 3600e3;

const allSessions = (from, to) => db.prepare("SELECT path, data FROM docs WHERE col LIKE 'children/%/sessions' AND json_extract(data,'$.date') BETWEEN ? AND ?").all(from, to)
  .map(r => ({ p: r.path, cid: r.path.split('/')[1], sid: r.path.split('/')[3], s: JSON.parse(r.data) }));
const filled = s => !!(s.activites || s.message || s.reussite);
const endOf = s => N.parisMs(s.date, s.heure || '09:00') + (Number(s.duree) || 1) * H;
const who = (c, s) => s.intervenante || c.intervenante;

/* 5. minuteur resté ouvert : arrêté 1 h après la fin prévue */
async function autoEnd(now, onChange) {
  let n = 0;
  for (const x of allSessions(N.addDays(N.parisDate(now), -3), N.parisDate(now))) {
    const ch = x.s.chrono; if (!ch || !ch.start || ch.end) continue;
    const planned = Math.max(endOf(x.s), ch.start + (Number(x.s.duree) || 1) * H);
    if (now < planned + H) continue;
    const c = getDoc('children/' + x.cid) || {};
    const end = Math.min(planned, now);
    const s2 = { ...x.s, chrono: { ...ch, end, autoEnd: true, rev: (ch.rev || 0) + 1000, upd: now }, statut: x.s.statut === 'annulee' ? 'annulee' : 'realisee' };
    setDoc(x.p, s2, 'systeme'); if (onChange) onChange(x.p); n++;
    const u = N.userById(who(c, x.s));
    if (u && N.once('autoend:' + x.p)) await N.deliver(u, { title: `Minuteur arrêté : ${c.prenom}`, text: `Le minuteur de la séance de ${c.prenom} (${N.dLong(x.s.date)}) était resté ouvert. Il a été arrêté à l’heure de fin prévue. Pense à compléter et partager la séance.`, url: '/app', tag: 'autoend-' + x.sid });
  }
  return n;
}

/* 6. séances non remplies : rappel le soir à 20 h, puis le lendemain à 8 h 30 */
async function unfilled(now) {
  let n = 0; const today = N.parisDate(now);
  for (const x of allSessions(N.addDays(today, -2), today)) {
    const s = x.s; if (s.statut === 'annulee' || s.absence || filled(s)) continue;
    if (now < endOf(s) + 0.5 * H) continue;
    const c = getDoc('children/' + x.cid) || {}; const u = N.userById(who(c, s)); if (!u) continue;
    const soir = N.parisMs(s.date, '20:00'), matin = N.parisMs(N.addDays(s.date, 1), '08:30');
    for (const [k, at] of [['soir', soir], ['matin', matin]]) {
      if (now < at || now - at > 6 * H) continue;
      if (!N.once(`unfilled:${x.p}:${k}`)) continue;
      await N.deliver(u, { title: `Séance à remplir : ${c.prenom}`, text: `La séance de ${c.prenom} du ${N.dLong(s.date)}${s.heure ? ' à ' + N.hh(s.heure) : ''} n’est pas encore remplie. Quelques mots suffisent : la famille les attend.`, url: '/app', tag: 'unfilled-' + x.sid }); n++;
    }
  }
  return n;
}

/* 11. factures transmises : rappel à la famille après 24 h, alerte à la coordination après 40 h (délai URSSAF : 48 h) */
async function urssaf(now) {
  let n = 0;
  for (const r of db.prepare("SELECT path, data FROM docs WHERE col = 'factures'").all()) {
    const f = JSON.parse(r.data); if (f.statut !== 'transmise' || f.parentValide || !f.transmiseAt) continue;
    const c = getDoc('children/' + f.cid) || {}; const id = r.path.split('/')[1];
    if (now >= f.transmiseAt + 24 * H && N.once('urssaf24:' + id)) {
      for (const u of N.payersOf(f.cid)) await N.deliver(u, { title: 'Rappel : demande de paiement à valider', text: `La demande de paiement pour ${c.prenom} (${Number(f.montant || 0).toFixed(2).replace('.', ',')} €) attend votre validation sur votre espace URSSAF. Sans réponse sous 48 heures, elle est considérée comme acceptée par l’URSSAF.`, url: '/app', tag: 'facture-' + id, email: true, pushOn: true });
      n++;
    }
    if (now >= f.transmiseAt + 40 * H && N.once('urssaf40:' + id)) {
      for (const u of N.coordos()) await N.deliver(u, { title: `Facture ${f.numero || ''} non validée`, text: `La famille de ${c.prenom} n’a pas signalé la validation de la facture ${f.numero || ''} (${Number(f.montant || 0).toFixed(2).replace('.', ',')} €), transmise il y a plus de 40 heures. Un appel peut éviter un refus.`, url: '/app', tag: 'facture40-' + id });
      n++;
    }
  }
  return n;
}

/* 19. devoirs sans réponse : relance 2 jours après, à 18 h */
async function devoirs(now) {
  let n = 0; const today = N.parisDate(now);
  const items = [];
  for (const x of allSessions(N.addDays(today, -10), today)) if (x.s.maison && x.s.statut !== 'annulee' && !x.s.maisonStatut && !x.s.maisonFait && !(x.s.share && x.s.share.on === false)) items.push({ k: x.p, cid: x.cid, date: x.s.date, texte: x.s.maison });
  for (const r of db.prepare("SELECT path, data FROM docs WHERE col = 'devoirs'").all()) { const d = JSON.parse(r.data); if (!d.deleted && !d.statut && d.date) items.push({ k: r.path, cid: d.cid, date: d.date, texte: d.texte }); }
  for (const it of items) {
    const at = N.parisMs(N.addDays(it.date, 2), '18:00'); if (now < at || now - at > 24 * H) continue;
    if (!N.once('devoir2j:' + it.k)) continue;
    const c = getDoc('children/' + it.cid) || {};
    for (const u of N.parentsOf(it.cid)) await N.deliver(u, { title: `Devoir de ${c.prenom} : c’est fait ?`, text: `« ${String(it.texte).slice(0, 140)} » — dites-nous en un geste si c’est fait (onglet Devoirs).`, url: '/app', tag: 'devoir-' + it.k });
    n++;
  }
  return n;
}

/* 14. message d'une famille non lu depuis 24 h */
async function messages(now) {
  let n = 0;
  for (const r of db.prepare("SELECT path, data FROM docs WHERE col = 'fmsg'").all()) {
    const m = JSON.parse(r.data); if (m.fromRole !== 'parent' || now < m.at + 24 * H || now - m.at > 7 * 24 * H) continue;
    if ((m.readBy || []).some(id => id !== m.from)) continue;
    const id = r.path.split('/')[1]; if (!N.once('fmsg24:' + id)) continue;
    const c = getDoc('children/' + m.cid) || {};
    const to = m.to === 'intervenante' ? [N.userById(c.intervenante), ...N.coordos()].filter(Boolean) : N.coordos();
    for (const u of to) await N.deliver(u, { title: `Message sans réponse depuis 24 h : famille de ${c.prenom}`, text: `${m.fromName} : « ${String(m.text).slice(0, 200)} »`, url: '/app', tag: 'fmsg24-' + id });
    n++;
  }
  return n;
}

/* 20. récapitulatif de la semaine, le dimanche à 18 h (e-mail) */
async function recap(now) {
  const d = N.parisDate(now); const dow = new Date(d + 'T12:00:00Z').getUTCDay();
  const at = N.parisMs(d, '18:00'); if (dow !== 0 || now < at || now - at > 6 * H) return 0;
  let n = 0; const from = N.addDays(d, -6), next = N.addDays(d, 7);
  for (const r of db.prepare("SELECT path, data FROM docs WHERE col = 'children'").all()) {
    const cid = r.path.split('/')[1]; const c = JSON.parse(r.data); const ps = N.parentsOf(cid); if (!ps.length) continue;
    const ss = allSessions(from, next).filter(x => x.cid === cid && x.s.statut !== 'annulee');
    const done = ss.filter(x => x.s.date <= d && x.s.date >= from && (x.s.statut === 'realisee' || filled(x.s)));
    const soon = ss.filter(x => x.s.date > d).sort((a, b) => (a.s.date + (a.s.heure || '')).localeCompare(b.s.date + (b.s.heure || '')));
    const shared = x => !(x.s.share && x.s.share.on === false);
    const wins = done.filter(x => shared(x) && x.s.reussite).map(x => x.s.reussite);
    const dv = [...done.filter(x => shared(x) && x.s.maison && !x.s.maisonStatut).map(x => x.s.maison), ...db.prepare("SELECT data FROM docs WHERE col = 'devoirs'").all().map(y => JSON.parse(y.data)).filter(y => y.cid === cid && !y.deleted && !y.statut).map(y => y.texte)];
    const fa = db.prepare("SELECT data FROM docs WHERE col = 'factures'").all().map(y => JSON.parse(y.data)).filter(y => y.cid === cid && y.statut === 'transmise' && !y.parentValide);
    if (!done.length && !soon.length) continue;
    const li = a => a.length ? '<ul>' + a.map(x => `<li>${x}</li>`).join('') + '</ul>' : '';
    const esc = t => String(t || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const body = `<p>Bonjour,</p><p>Voici la semaine de <b>${esc(c.prenom)}</b>.</p>
<p><b>${done.length} séance${done.length > 1 ? 's' : ''} réalisée${done.length > 1 ? 's' : ''}</b>${done.length ? ' : ' + done.map(x => N.dLong(x.s.date)).join(', ') : ''}.</p>
${wins.length ? '<p><b>Ses réussites</b></p>' + li(wins.map(esc)) : ''}${dv.length ? '<p><b>À faire à la maison</b></p>' + li(dv.map(esc)) : ''}
${fa.length ? `<p><b>${fa.length} demande${fa.length > 1 ? 's' : ''} de paiement à valider</b> sur votre espace URSSAF.</p>` : ''}
${soon.length ? '<p><b>La semaine prochaine</b></p>' + li(soon.map(x => `${N.dLong(x.s.date)}${x.s.heure ? ' à ' + N.hh(x.s.heure) : ''}`)) : ''}`;
    for (const u of ps) {
      if (((getDoc('prefs/' + u.id) || {}).recap) === false) continue;
      if (!N.once(`recap:${d}:${cid}:${u.id}`)) continue;
      await N.deliver(u, { title: `La semaine de ${c.prenom}`, text: `${done.length} séance(s) cette semaine, ${soon.length} la semaine prochaine.`, html: N.layout(`La semaine de ${c.prenom}`, body, 'Ouvrir l’espace famille', N.BASE() + '/app'), url: '/app', tag: 'recap', email: true, pushOn: false }); n++;
    }
  }
  return n;
}

async function runAll(now = Date.now(), onChange) {
  const r = {};
  for (const [k, f] of Object.entries({ autoEnd, unfilled, urssaf, devoirs, messages, recap })) { try { r[k] = await f(now, onChange); } catch (e) { log('tâche', k, e.message); } }
  return r;
}
function schedule(onChange) { const t = () => runAll(Date.now(), onChange).catch(e => log('tâches', e.message)); setInterval(t, 5 * 60e3); setTimeout(t, 60e3); }
module.exports = { runAll, schedule, autoEnd, unfilled, urssaf, devoirs, messages, recap };
