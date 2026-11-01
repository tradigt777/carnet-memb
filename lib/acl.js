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

/* ---------- Lecture ---------- */
function canRead(u, p) {
  const top = p.split('/')[0];
  if (MANAGERS.includes(u.role)) return true;
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
const SHARE_DEF = { activites: true, reactions: false, comportement: false, axes: true, reperes: false, compteurs: false, reussite: true, message: true, maison: true, deroule: true, interruptions: false };
const SHARE_FIELDS = { activites: ['activites'], reactions: ['reactions'], comportement: ['comportement'], axes: ['axes'], reperes: ['attention', 'entree', 'regulation'], compteurs: ['compteurs'], reussite: ['reussite'], message: ['message'], maison: ['maison'], deroule: ['chrono'] };
const ALWAYS_INTERNAL_SESSION = ['vigilance', 'pistes', 'dictee', 'historique', 'auteur', 'createdBy'];
const INTERNAL_CHILD = ['notes', 'suivisExterieurs', 'obsInitiales', 'grille', 'evalObs', 'tarif', 'comportements', 'axePrioritaire'];
const TEAM_PUBLIC = ['nom', 'prenom', 'role', 'photoId', 'photoUrl', 'bio', 'tel', 'email'];

function redactSession(s) {
  const settings = getDoc('settings/main') || {};
  const def = { ...SHARE_DEF, ...(settings.shareDefaults || {}) };
  const sh = s.share || {};
  const on = sh.on !== false;
  const f = { ...def, ...(sh.fields || {}) };
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
  if (u.role !== 'parent' || !data) return data;
  const s = p.split('/');
  if (s[0] === 'team') { const o = {}; TEAM_PUBLIC.forEach(k => { if (data[k] !== undefined) o[k] = data[k]; }); return o; }
  if (s[0] === 'settings') { const o = { ...data }; Object.keys(o).forEach(k => { if (/tarif|backup|iban|siret|rib|cle|key/i.test(k)) delete o[k]; }); return o; }
  if (s[0] === 'children' && s.length === 2) { const o = { ...data }; INTERNAL_CHILD.forEach(k => delete o[k]); return o; }
  if (s[0] === 'children' && s[2] === 'sessions' && s.length === 4) return redactSession(data);
  if (s[0] === 'children' && s[2] === 'photos' && s.length === 4) return data.visibleParent === false ? null : data;
  return data;
}

/* ---------- Écriture ---------- */
const PARENT_SESSION_KEYS = ['parentNote', 'comments', 'maisonFait', 'historique'];
const PARENT_PHOTO_KEYS = ['likes', 'comments'];

/* Renvoie les données à réellement enregistrer (ou lève une erreur). op : set | update | delete */
function checkWrite(u, p, op, data) {
  const s = p.split('/');
  const top = s[0];
  const existing = getDoc(p);
  if (u.role === 'admin') return data;

  if (u.role === 'parent') {
    const cid = childIdOf(p);
    if (top === 'events' && s.length === 2 && op === 'set' && !existing) return { ...data, by: u.id, fromParent: true };
    if (!cid || !parentChildren(u).includes(cid) || op === 'delete') throw denied();
    if (s.length === 4 && s[2] === 'sessions' && existing) return parentPatch(existing, data, PARENT_SESSION_KEYS, op);
    if (s.length === 4 && s[2] === 'photos' && existing) return parentPatch(existing, data, PARENT_PHOTO_KEYS, op);
    if (s.length === 2 && existing) return parentPatch(existing, data, ['avisParents'], op);
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
      return data;
    }
    if (!assigned(u, cid)) throw denied();
    return data;
  }
  return data;
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

module.exports = { canRead, redact, checkWrite, STAFF, MANAGERS, parentChildren, denied };
