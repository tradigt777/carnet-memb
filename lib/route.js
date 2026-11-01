'use strict';
/* Distances routières entre deux adresses, pour le forfait kilométrique.
   Adresse → coordonnées : OpenStreetMap (Nominatim). Itinéraire voiture : OSRM.
   Tout est gardé en cache : une même adresse ou un même trajet n'est demandé qu'une fois. */
const { db } = require('./store');

db.exec(`
CREATE TABLE IF NOT EXISTS geo (addr TEXT PRIMARY KEY, lat REAL, lon REAL, label TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS routes (k TEXT PRIMARY KEY, km REAL NOT NULL, min REAL, src TEXT, at INTEGER NOT NULL);
`);

const UA = 'CarnetMEMB/1.0 (contact@mychildmybattle.com)';
const norm = a => String(a || '').toLowerCase().replace(/\s+/g, ' ').replace(/[,;]+/g, ',').trim();
let lastCall = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function polite() { const d = Date.now() - lastCall; if (d < 1100) await wait(1100 - d); lastCall = Date.now(); }

/* Mode test : coordonnées déterministes (aucun accès réseau) */
function stubGeo(a) {
  let h = 0; for (const ch of norm(a)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const m = /\b(\d{5})\b/.exec(a); const cp = m ? Number(m[1]) : 92800;
  return { lat: 48.85 + ((cp % 97) / 97 - 0.5) * 0.5 + (h % 100) / 4000, lon: 2.25 + ((cp % 89) / 89 - 0.5) * 0.7 + ((h >> 7) % 100) / 4000, label: a };
}

async function geocode(addr) {
  const k = norm(addr); if (!k) return null;
  const c = db.prepare('SELECT * FROM geo WHERE addr = ?').get(k);
  if (c) return c.lat == null ? null : c;
  let g = null;
  if (process.env.ROUTE_STUB) g = stubGeo(addr);
  else {
    await polite();
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q=' + encodeURIComponent(addr);
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('géocodage indisponible');
    const j = await r.json();
    if (j[0]) g = { lat: Number(j[0].lat), lon: Number(j[0].lon), label: j[0].display_name };
  }
  db.prepare('INSERT OR REPLACE INTO geo(addr,lat,lon,label,at) VALUES (?,?,?,?,?)').run(k, g ? g.lat : null, g ? g.lon : null, g ? g.label : null, Date.now());
  return g;
}

function crow(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Renvoie { km, min, src } ; src = osrm (itinéraire réel), estimation (vol d'oiseau × 1,3) ou null si adresse introuvable */
async function distance(from, to) {
  const a = norm(from), b = norm(to);
  if (!a || !b) return { km: null, src: null, problem: 'adresse manquante' };
  if (a === b) return { km: 0, min: 0, src: 'identique' };
  const key = a < b ? a + '|' + b : b + '|' + a;
  const c = db.prepare('SELECT * FROM routes WHERE k = ?').get(key);
  if (c) return { km: c.km, min: c.min, src: c.src };
  const [ga, gb] = [await geocode(from), await geocode(to)];
  if (!ga || !gb) return { km: null, src: null, problem: !ga ? 'adresse introuvable : ' + from : 'adresse introuvable : ' + to };
  let out = null;
  if (!process.env.ROUTE_STUB) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${ga.lon},${ga.lat};${gb.lon},${gb.lat}?overview=false`;
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.routes && j.routes[0]) out = { km: Math.round(j.routes[0].distance / 100) / 10, min: Math.round(j.routes[0].duration / 60), src: 'osrm' };
    } catch (e) { /* on se rabat sur l'estimation */ }
  }
  if (!out) { const km = crow(ga, gb) * 1.3; out = { km: Math.round(km * 10) / 10, min: Math.round(km / 40 * 60), src: 'estimation' }; }
  /* une estimation n'est pas gardée : on retentera l'itinéraire réel la prochaine fois */
  if (out.src === 'osrm' || process.env.ROUTE_STUB) db.prepare('INSERT OR REPLACE INTO routes(k,km,min,src,at) VALUES (?,?,?,?,?)').run(key, out.km, out.min, out.src, Date.now());
  return out;
}

module.exports = { distance, geocode };
