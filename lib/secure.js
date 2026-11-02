'use strict';
/* Chiffrement des données bancaires (IBAN) : AES-256-GCM, clé conservée sur le serveur (DATA_DIR/secret.key),
   jamais dans la base. Une copie de la base seule ne permet pas de lire les IBAN. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./store');
const KF = path.join(DATA_DIR, 'secret.key');
function key() {
  if (process.env.DATA_KEY) return Buffer.from(process.env.DATA_KEY, 'base64');
  if (!fs.existsSync(KF)) fs.writeFileSync(KF, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(KF, 'utf8').trim(), 'base64');
}
const K = key();
function enc(txt) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', K, iv); const out = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]); return 'v1:' + Buffer.concat([iv, c.getAuthTag(), out]).toString('base64'); }
function dec(s) { try { const b = Buffer.from(String(s).slice(3), 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', K, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch (e) { return null; } }
const cleanIban = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function ibanValid(s) { const x = cleanIban(s); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(x)) return false; const r = (x.slice(4) + x.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55)); let m = 0; for (const d of r) m = (m * 10 + Number(d)) % 97; return m === 1; }
const mask = x => { const c = cleanIban(x); return c ? c.slice(0, 4) + ' •••• •••• •••• ' + c.slice(-4) : ''; };
const fmtIban = x => cleanIban(x).replace(/(.{4})/g, '$1 ').trim();
/* dans un objet, remplace « iban » (en clair) par « iban_enc » (chiffré) + « iban_fin » (4 derniers caractères) */
function sealIban(o) { if (!o || typeof o !== 'object' || o.iban === undefined) return o; const v = cleanIban(o.iban); const out = { ...o }; delete out.iban; if (v) { if (!ibanValid(v)) { const e = new Error('IBAN invalide : vérifiez les chiffres.'); e.code = 'invalid_argument'; e.status = 400; throw e; } out.iban_enc = enc(v); out.iban_fin = v.slice(-4); } else { out.iban_enc = null; out.iban_fin = null; } return out; }
function openIban(o, full) { if (!o || typeof o !== 'object' || !o.iban_enc) return o; const v = dec(o.iban_enc); const out = { ...o }; delete out.iban_enc; out.iban = full ? fmtIban(v) : mask(v); return out; }
module.exports = { enc, dec, sealIban, openIban, ibanValid, mask, cleanIban };
