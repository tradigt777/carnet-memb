'use strict';
/* Contrôle d'accès, appliqué par le serveur (le navigateur ne voit jamais ce qu'il n'a pas le droit de voir).
   Rôles : admin (super admin), coordinatrice, intervenante, parent. */
const { getDoc, bad } = require('./store');

const STAFF = ['admin', 'coordinatrice', 'intervenante'];
const MANAGERS = ['admin', 'coordinatrice'];

function denied(m) { const e = new Error(m || 'accès refusé'); e.code = 'invalid_argument'; e.status = 403; return e; }

const childIdOf = p => { const s = p.split('/'); return s[0] === 'children' && s.length >= 2 ? s[1] : null; };
const parentChildren = u => { try { return JSON.parse(u.children || '[]'); } catch (e) { return []; } };

function assigned(u, cid) {
  const c = getDoc('children/' + cid);
  return !!c && c.intervenante === u.id;
}

/* Collections rattachées à un enfant par le champ « cid » : factures, devoirs, messages des familles */
const CID_COLS = ['factures', 'devoirs', 'fmsg'];
/* Collections rattachées à un membre de l'équipe par le champ « uid » : déplacements, kilomètres */
const UID_COLS = ['deplacements', 'kmjour'];

function canReadCidDoc(u, top, d) {
  if (!d) return false;
  if (u.role === 'parent') return parentChildren(u).includes(d.cid);
  if (u.role === 'intervenante') {
    if (top === 'factures') return false;
    if (!assigned(u, d.cid)) return false;
    if (top === 'fmsg') return d.to !== 'direction';
    return true;
  }
  return false;
}

/* ---------- Lecture ---------- */
function canRead(u, p) {
  const s = p.split('/');
  const top = s[0];
  if (MANAGERS.includes(u.role)) return true;
  if (CID_COLS.includes(top)) {
    if (s.length === 1) return u.role === 'parent' || (u.role === 'intervenante' && top !== 'factures');
    return canReadCidDoc(u, top, getDoc(p));
  }
  if (UID_COLS.includes(top)) {
    if (u.role === 'parent') return false;
    if (s.length === 1) return true;
    const d = getDoc(p); return !!d && d.uid === u.id;
  }
  if (u.role === 'intervenante') {
    if (top === 'children') { const cid = childIdOf(p); return cid ? assigned(u, cid) : true; }
    if (top === 'billing') return false;
    return true;
  }
  if (u.role === 'parent') {
    if (top === 'children') { const cid = childIdOf(p); return cid ? parentChildren(u).includes(cid) : true; }
    return ['team', 'settings', 'activites'].includes(top);
  }
  return false;
}

/* Ce que le parent peut voir d'une séance : uniquement ce que l'intervenante a choisi de partager. */
const SHARE_DEF = { activites: true, reactions: false, comportement: false, axes: true, reperes: false, compteurs: false, reussite: true, message: true, maison: true, deroule: false, interruptions: false };
const SHARE_FIELDS = { activites: ['activites'], reactions: ['reactions'], comportement: ['comportement'], axes: ['axes'], reperes: ['attention', 'entree', 'regulation'], compteurs: ['compteurs'], reussite: ['reussite'], message: ['message'], maison: ['maison'], deroule: ['chrono'] };
const ALWAYS_INTERNAL_SESSION = ['vigilance', 'pistes', 'dictee', 'historique', 'auteur', 'createdBy'];
const INTERNAL_CHILD = ['notes', 'suivisExterieurs', 'obsInitiales', 'grille', 'evalObs', 'tarif', 'comportements', 'axePrioritaire'];
const TEAM_PUBLIC = ['nom', 'prenom', 'role', 'photoId', 'photoUrl', 'bio', 'tel', 'email'];

/* Le déroulé minuté n'est montré aux familles que si la coordination l'a activé (pour tous, ou pour cet enfant). */
function derouleOn(cid) {
  const settings = getDoc('settings/main') || {};
  const c = cid ? getDoc('children/' + cid) || {} : {};
  if (c.parentDeroule === true) return true;
  if (c.parentDeroule === false) return false;
  return settings.parentDeroule === true;
}
function redactSession(s, cid) {
  const settings = getDoc('settings/main') || {};
  const def = { ...SHARE_DEF, ...(settings.shareDefaults || {}) };
  const sh = s.share || {};
  const on = sh.on !== false;
  const f = { ...def, ...(sh.fields || {}) };
  f.deroule = derouleOn(cid);
  const out = { ...s };
  ALWAYS_INTERNAL_SESSION.forEach(k => delete out[k]);
  for (const [k, fields] of Object.entries(SHARE_FIELDS)) if (!on || !f[k]) fields.forEach(x => delete out[x]);
  if (out.chrono && out.chrono.ev) {
    out.chrono = { ...out.chrono, ev: out.chrono.ev.filter(e => {
      if (e.k === 'note') return f.reactions && (!e.f || !['vigilance', 'pistes'].includes(e.f));
      if (e.k === 'pause' || e.k === 'resume') return false;
      if (e.k === 'int' && !f.interruptions) return false;
      return true;
    }) };
    if (!f.interruptions) { /* sans les arrêts, le travail continue simplement */ out.chrono.ev = out.chrono.ev.filter(e => e.k !== 'back'); }
    delete out.chrono.compteurs; delete out.chrono.by;
  }
  return out;
}

function redact(u, p, data) {
  if (!data) return data;
  const s = p.split('/');
  if (u.role === 'intervenante' && s[0] === 'team' && s[1] !== u.id) { const o = { ...data }; delete o.domicile; delete o.kmTaux; delete o.cv; return o; }
  if (u.role !== 'parent') return data;
  if (s[0] === 'team') { const o = {}; TEAM_PUBLIC.forEach(k => { if (data[k] !== undefined) o[k] = data[k]; }); return o; }
  if (s[0] === 'settings') { const o = { ...data }; Object.keys(o).forEach(k => { if (/tarif|backup|iban|siret|rib|cle|key/i.test(k)) delete o[k]; }); return o; }
  if (s[0] === 'children' && s.length === 2) { const o = { ...data }; INTERNAL_CHILD.forEach(k => delete o[k]); return o; }
  if (s[0] === 'children' && s[2] === 'sessions' && s.length === 4) return redactSession(data, s[1]);
  if (s[0] === 'children' && s[2] === 'photos' && s.length === 4) return data.visibleParent === false ? null : data;
  return data;
}

/* ---------- Écriture ---------- */
const PARENT_SESSION_KEYS = ['parentNote', 'comments', 'maisonFait', 'maisonStatut', 'maisonCom', 'maisonAt', 'historique'];
const PARENT_CHILD_KEYS = ['avisParents', 'rappels'];
const PARENT_FACTURE_KEYS = ['parentValide', 'parentValideAt', 'parentVuAt'];
const PARENT_DEVOIR_KEYS = ['statut', 'commentaire', 'faitAt'];
const PARENT_PHOTO_KEYS = ['likes', 'comments'];

/* Renvoie les données à réellement enregistrer (ou lève une erreur). op : set | update | delete */
function checkWrite(u, p, op, data) {
  const s = p.split('/');
  const top = s[0];
  const existing = getDoc(p);
  if (top === 'fmsg' && s.length === 2) return checkFmsg(u, op, existing, data);
  if (u.role === 'admin') return data;
  if (UID_COLS.includes(top)) {
    if (u.role === 'parent' || s.length !== 2) throw denied();
    if (u.role === 'coordinatrice') return data;
    if (existing && existing.uid !== u.id) throw denied();
    if (op === 'delete') return data;
    return { ...data, uid: u.id };
  }
  if (CID_COLS.includes(top)) {
    if (s.length !== 2) throw denied();
    const cid = (existing && existing.cid) || (data && data.cid);
    if (u.role === 'parent') {
      if (!existing || !parentChildren(u).includes(existing.cid) || op === 'delete') throw denied();
      return parentPatch(existing, data, top === 'factures' ? PARENT_FACTURE_KEYS : PARENT_DEVOIR_KEYS, op);
    }
    if (u.role === 'coordinatrice') return data;
    if (top === 'factures' || !assigned(u, cid)) throw denied();
    if (data && data.cid && data.cid !== cid) throw denied();
    return data;
  }

  if (u.role === 'parent') {
    const cid = childIdOf(p);
    if (top === 'events' && s.length === 2 && op === 'set' && !existing) return { ...data, by: u.id, fromParent: true };
    if (!cid || !parentChildren(u).includes(cid) || op === 'delete') throw denied();
    if (s.length === 4 && s[2] === 'sessions' && existing) return parentPatch(existing, data, PARENT_SESSION_KEYS, op);
    if (s.length === 4 && s[2] === 'photos' && existing) return parentPatch(existing, data, PARENT_PHOTO_KEYS, op);
    if (s.length === 2 && existing) return parentPatch(existing, data, PARENT_CHILD_KEYS, op);
    throw denied();
  }

  /* équipe */
  if (top === 'team') {
    if (s[1] !== u.id || s.length !== 2) { if (u.role === 'coordinatrice' && s.length === 2) return keepRole(existing, data); throw denied('Seul le super admin modifie l’équipe.'); }
    return keepRole(existing, data);
  }
  if (top === 'settings' && u.role !== 'coordinatrice') throw denied('Seul le super admin modifie les paramètres.');
  if (u.role === 'coordinatrice') { if (top === 'children' && s.length === 2 && op === 'delete') throw denied('Seul le super admin supprime un dossier.'); return data; }

  /* intervenante */
  if (top === 'billing') throw denied();
  if (top === 'children') {
    const cid = childIdOf(p);
    if (s.length === 2) {
      if (op === 'delete') throw denied('Seul le super admin supprime un dossier.');
      if (!existing) { if (data && data.intervenante === u.id) return data; throw denied(); }
      if (!assigned(u, cid)) throw denied();
      const merged = op === 'update' ? { ...existing, ...data } : data;
      if (merged.intervenante !== existing.intervenante) throw denied('Seule la coordination change l’intervenante d’un enfant.');
      if ((merged.parentDeroule ?? null) !== (existing.parentDeroule ?? null)) throw denied('Seule la coordination choisit si la famille voit le déroulé.');
      return data;
    }
    if (!assigned(u, cid)) throw denied();
    return data;
  }
  return data;
}
/* Messages entre les familles et l'équipe : on ne peut ni usurper l'expéditeur, ni modifier un message, seulement le marquer comme lu. */
function checkFmsg(u, op, existing, data) {
  if (op === 'delete') { if (MANAGERS.includes(u.role)) return data; throw denied(); }
  if (existing) {
    if (!canReadCidDoc(u, 'fmsg', existing) && !MANAGERS.includes(u.role)) throw denied();
    const keys = Object.keys(data || {}).filter(k => !(op === 'set' && existing[k] !== undefined && JSON.stringify(existing[k]) === JSON.stringify(data[k])));
    if (keys.some(k => k !== 'readBy')) throw denied();
    return { __patch: true, data: { readBy: [...new Set([...(existing.readBy || []), u.id])] } };
  }
  const d = data || {};
  const text = String(d.text || '').trim().slice(0, 4000);
  if (!text) throw bad('message vide');
  if (!['intervenante', 'direction'].includes(d.to)) throw bad('destinataire invalide');
  const c = getDoc('children/' + d.cid); if (!c) throw bad('enfant introuvable');
  if (u.role === 'parent' && !parentChildren(u).includes(d.cid)) throw denied();
  if (u.role === 'intervenante' && (!assigned(u, d.cid) || d.to !== 'intervenante')) throw denied();
  return { cid: d.cid, to: d.to, text, from: u.id, fromName: u.name, fromRole: u.role, at: Date.now(), readBy: [u.id] };
}
function keepRole(existing, data) { if (existing && data && data.role !== undefined && data.role !== existing.role) { const d = { ...data }; d.role = existing.role; return d; } return data; }

function parentPatch(existing, data, allowed, op) {
  if (op === 'set') {
    /* l'application peut renvoyer le document entier : on ne garde que les champs autorisés */
    const d = {}; allowed.forEach(k => { if (data[k] !== undefined) d[k] = data[k]; }); data = d;
  }
  const keys = Object.keys(data || {});
  if (keys.some(k => !allowed.includes(k))) throw denied();
  const out = { ...data };
  if (out.historique) {
    /* le parent ne voit pas l'historique : on ajoute seulement sa dernière entrée */
    const last = Array.isArray(out.historique) ? out.historique[out.historique.length - 1] : null;
    out.historique = [...(existing.historique || []), ...(last ? [last] : [])].slice(-80);
  }
  return { __patch: true, data: out };
}

module.exports = { canRead, redact, checkWrite, STAFF, MANAGERS, parentChildren, denied, derouleOn, CID_COLS, UID_COLS };
