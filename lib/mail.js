'use strict';
/* E-mails (invitation, mot de passe oublié) via la boîte Hostinger configurée dans .env.
   Sans configuration, le panneau d'administration affiche le lien à transmettre à la main. */
const nodemailer = require('nodemailer');

const cfg = () => ({
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
});
const enabled = () => { const c = cfg(); return !!(c.host && c.user && c.pass); };
let tx = null;
function transport() {
  if (!tx) { const c = cfg(); tx = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } }); }
  return tx;
}
const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

function layout(title, body, btnLabel, link) {
  return `<!doctype html><html><body style="margin:0;background:#F2F3F7;font-family:Helvetica,Arial,sans-serif;color:#0E2A5C">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
<div style="background:#fff;border-radius:18px;padding:26px">
<div style="font-size:13px;color:#5E5E63;margin-bottom:6px">Mon enfant, Ma bataille</div>
<h1 style="font-size:22px;margin:0 0 14px">${esc(title)}</h1>
<div style="font-size:15px;line-height:1.55;color:#1c1c1e">${body}</div>
<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#0E2A5C;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:bold">${esc(btnLabel)}</a></p>
<p style="font-size:12px;color:#8E8E93;line-height:1.5">Si le bouton ne marche pas, copiez ce lien dans votre navigateur :<br>${esc(link)}</p>
</div></div></body></html>`;
}

async function send(to, subject, html, text) {
  if (!enabled()) return { sent: false };
  await transport().sendMail({ from: `"Mon enfant, Ma bataille" <${cfg().from}>`, to, subject, html, text });
  return { sent: true };
}

function invite(u, link, byName) {
  const parent = u.role === 'parent';
  const body = parent
    ? `<p>Bonjour ${esc(u.name)},</p><p>Vous avez maintenant accès à l’espace famille du carnet de suivi de Mon enfant, Ma bataille. Vous y retrouverez les séances de votre enfant, les photos partagées, le planning et ses progrès.</p><p>Pour commencer, choisissez votre mot de passe. Ce lien est valable 7 jours.</p>`
    : `<p>Bonjour ${esc(u.name)},</p><p>${esc(byName || 'L’équipe')} vous a ouvert un accès au carnet de suivi de Mon enfant, Ma bataille.</p><p>Pour commencer, choisissez votre mot de passe. Ce lien est valable 7 jours.</p>`;
  return send(u.email, parent ? 'Votre espace famille Mon enfant, Ma bataille' : 'Votre accès au carnet de suivi MEMB', layout('Bienvenue', body, 'Choisir mon mot de passe', link), `Bonjour ${u.name}, choisissez votre mot de passe ici (lien valable 7 jours) : ${link}`);
}
function reset(u, link) {
  const body = `<p>Bonjour ${esc(u.name)},</p><p>Vous avez demandé à changer votre mot de passe. Ce lien est valable 2 heures. Si ce n’est pas vous, ignorez simplement ce message : votre mot de passe actuel reste valable.</p>`;
  return send(u.email, 'Nouveau mot de passe – carnet MEMB', layout('Changer de mot de passe', body, 'Choisir un nouveau mot de passe', link), `Choisissez un nouveau mot de passe ici (valable 2 heures) : ${link}`);
}

module.exports = { enabled, invite, reset, send };
