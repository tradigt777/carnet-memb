/* Pont entre l'application et le serveur : reproduit l'interface window.claude.use(...) que l'application utilise
   (db, user, assets, downloads, sample), mais en parlant au serveur MEMB. */
(function () {
  'use strict';
  const H = { 'Content-Type': 'application/json', 'X-MEMB': '1' };
  const err = (code, message) => { const e = new Error(message || code); e.code = code; return e; };
  async function api(url, body, method) {
    let r;
    try { r = await fetch(url, { method: method || 'POST', headers: H, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw err('unavailable', 'Pas de connexion au serveur'); }
    if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw err('revoked', 'Connexion requise'); }
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw err((j && j.code) || (r.status === 403 ? 'invalid_argument' : r.status === 429 ? 'resource_exhausted' : 'unavailable'), j && j.message);
    return j;
  }
  const rid = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; const b = crypto.getRandomValues(new Uint8Array(20)); for (const x of b) s += a[x % a.length]; return s; };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const parentOf = p => p.split('/').slice(0, -1).join('/');

  /* ---- abonnements en direct ---- */
  const docSubs = new Map(); /* chemin -> Set(fn) */
  const colSubs = new Set(); /* {path, o, fn} */
  const pend = new Map();
  function schedule(key, fn) { clearTimeout(pend.get(key)); pend.set(key, setTimeout(fn, 120)); }
  async function refreshDoc(p) { const set = docSubs.get(p); if (!set || !set.size) return; try { const s = await snapDoc(p); set.forEach(f => f.next(s)); } catch (e) {} }
  async function refreshCol(sub) { try { const s = await snapCol(sub.path, sub.o); if (colSubs.has(sub)) sub.next(s); } catch (e) {} }
  function onChange(p) {
    if (p === '*') { docSubs.forEach((_, k) => schedule('d:' + k, () => refreshDoc(k))); colSubs.forEach(s => schedule(s, () => refreshCol(s))); return; }
    if (docSubs.has(p)) schedule('d:' + p, () => refreshDoc(p));
    const col = parentOf(p);
    colSubs.forEach(s => { if (s.path === col) schedule(s, () => refreshCol(s)); });
  }
  let es = null, lastBeat = 0;
  function connect() {
    try { es && es.close(); } catch (e) {}
    es = new EventSource('/api/stream');
    es.onmessage = ev => { lastBeat = Date.now(); try { onChange(JSON.parse(ev.data).p); } catch (e) {} };
    es.onopen = () => { if (lastBeat) onChange('*'); lastBeat = Date.now(); };
  }
  connect();
  /* filet de sécurité : rafraîchit tout au retour dans l'appli et toutes les 2 minutes */
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!es || es.readyState === 2) connect(); onChange('*'); } });
  setInterval(() => onChange('*'), 120000);

  async function snapDoc(p) { const r = await api('/api/db', { op: 'get', path: p }); return { id: p.split('/').pop(), exists: !!r.exists, data: () => clone(r.data), metadata: {} }; }
  async function snapCol(p, o) {
    const r = await api('/api/db', { op: 'list', path: p, orderBy: o && o.orderBy, dir: o && o.dir, limit: o && o.limit });
    const docs = r.docs.map(d => ({ id: d.id, exists: true, data: () => clone(d.data), ref: docRef(p + '/' + d.id) }));
    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
  }
  function docRef(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: () => snapDoc(p),
      set: d => api('/api/db', { op: 'set', path: p, data: d }).then(() => onChange(p)),
      update: d => api('/api/db', { op: 'update', path: p, data: d }).then(() => onChange(p)),
      delete: () => api('/api/db', { op: 'delete', path: p }).then(() => onChange(p)),
      collection: c => colRef(p + '/' + c),
      onSnapshot(next, error) {
        const f = { next: typeof next === 'function' ? next : next.next, error: typeof next === 'function' ? error : next.error };
        if (!docSubs.has(p)) docSubs.set(p, new Set());
        docSubs.get(p).add(f);
        snapDoc(p).then(s => f.next(s)).catch(e => f.error && f.error(e));
        return () => { const s = docSubs.get(p); s && s.delete(f); };
      },
    };
  }
  function colRef(p, o) {
    o = o || {};
    return {
      id: p.split('/').pop(), path: p,
      doc: id => docRef(p + '/' + (id || rid())),
      orderBy: (f, dir) => colRef(p, { ...o, orderBy: f, dir: dir || 'asc' }),
      limit: n => colRef(p, { ...o, limit: n }),
      get: () => snapCol(p, o),
      onSnapshot(next, error) {
        const sub = { path: p, o, next: typeof next === 'function' ? next : next.next, error: typeof next === 'function' ? error : next.error };
        colSubs.add(sub);
        snapCol(p, o).then(s => colSubs.has(sub) && sub.next(s)).catch(e => sub.error && sub.error(e));
        return () => colSubs.delete(sub);
      },
    };
  }
  const dbNs = Object.freeze({ doc: docRef, collection: p => colRef(p) });

  /* ---- utilisateur ---- */
  let ME = null;
  const meP = api('/api/me', undefined, 'GET').then(m => (ME = m));
  const userNs = Object.freeze({
    me: async () => { const m = ME || await meP; return { id: m.id, name: m.name, isOwner: m.role === 'admin', role: m.role, children: m.children, email: m.email }; },
    id: async () => (ME || await meP).id,
    isOwner: () => !!(ME && ME.role === 'admin'),
    canEdit: () => !!(ME && ME.role === 'admin'),
    can: () => true,
    profiles: async ids => api('/api/profiles', { ids: [].concat(ids || []) }),
    search: async () => [],
  });

  /* ---- photos ---- */
  const assetsNs = Object.freeze({
    upload: async (blob, opts) => {
      let r; try { r = await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': (opts && opts.type) || blob.type || 'image/jpeg', 'X-MEMB': '1' }, body: blob, credentials: 'same-origin' }); }
      catch (e) { throw err('unavailable', 'Pas de connexion'); }
      const j = await r.json().catch(() => ({})); if (!r.ok) throw err(j.code || 'unavailable', j.message); return j;
    },
    list: async () => { const j = await api('/api/assets', undefined, 'GET'); return { assets: j.assets, usage: {} }; },
    delete: id => api('/api/assets/' + encodeURIComponent(id), undefined, 'DELETE'),
  });

  /* ---- téléchargements ---- */
  const downloadsNs = Object.freeze({
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = filename || 'fichier'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000); return { status: 'saved' };
    },
  });

  /* ---- assistant IA (si activé sur le serveur) ---- */
  let aiOn = null;
  async function aiEnabled() { if (aiOn === null) { try { aiOn = (await api('/api/ai', undefined, 'GET')).enabled; } catch (e) { aiOn = false; } } return aiOn; }
  const sample = async (input, opts) => { const r = await api('/api/ai', { input }); if (opts && opts.onText) opts.onText({ text: r.text, delta: r.text }); return { text: r.text, truncated: false }; };
  sample.json = async (input, opts) => { const r = await sample(typeof input === 'string' ? input + '\n\nRéponds uniquement avec du JSON valide, sans texte autour.' : input, opts); const t = r.text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim(); const i = t.search(/[[{]/); return JSON.parse(i > 0 ? t.slice(i) : t); };
  sample.limits = async () => ({ images: false });

  window.claude = Object.freeze({
    use: async name => {
      if (name === 'db') { await meP.catch(() => null); return ME ? dbNs : null; }
      if (name === 'user') { await meP.catch(() => null); return ME ? userNs : null; }
      if (name === 'assets') { await meP.catch(() => null); return ME ? assetsNs : null; }
      if (name === 'downloads') return downloadsNs;
      if (name === 'sample') return (await aiEnabled()) ? sample : null;
      return null;
    },
  });
  window.MEMB_ONLINE = { me: () => ME, meP };
})();
