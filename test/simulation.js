'use strict';
/* Simulation d'une semaine complète (lundi 2 → samedi 7 novembre 2026) sur un serveur de test isolé :
   5 familles, 5 intervenantes, 2 coordinatrices, avec leurs habitudes. Toutes les actions passent par
   l'API réelle (avec les droits de chaque compte) ou par l'application elle-même dans un navigateur.
   Résultat : sim-out/report.json (données) + captures d'écran. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3950, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync('/tmp/memb-sim-');
const OUT = process.env.OUT || path.join(__dirname, '..', 'sim-out');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const MAIL = path.join(DATA, 'mail.jsonl'), PUSH = path.join(DATA, 'push.jsonl');
const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BASE_URL: BASE, OWNER_EMAIL: 'hasan@sim.fr', OWNER_NAME: 'Hasan', OWNER_ID: 'u_owner', SMTP_HOST: '', ROUTE_STUB: '1', MAIL_STUB: MAIL, PUSH_STUB: PUSH };
Object.assign(process.env, { DATA_DIR: DATA, ROUTE_STUB: '1', MAIL_STUB: MAIL, PUSH_STUB: PUSH, BASE_URL: BASE });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { 'X-MEMB': '1', 'Content-Type': 'application/json' };
const LOG = []; const ISSUES = []; const DENIED = []; const PAGE_ERR = [];
const at = (d, hm) => new Date(`${d}T${hm}:00+01:00`).getTime();
const log = (when, who, what, extra) => LOG.push({ when, who, what, ...(extra || {}) });
const issue = (k, detail) => ISSUES.push({ k, detail });
const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];

/* ---------------- personnages ---------------- */
const STAFF = [
  { id: 'c-alice', name: 'Alice Maalouf', email: 'alice@sim.fr', role: 'coordinatrice', domicile: '23 rue Louis Pouey, 92800 Puteaux', profil: 'Présidente et coordinatrice : planning, familles, qualité. Très réactive le matin, peu disponible l’après-midi.' },
  { id: 'c-myriam', name: 'Myriam Kaci', email: 'myriam@sim.fr', role: 'coordinatrice', domicile: '8 avenue Foch, 92250 La Garenne-Colombes', profil: 'Coordinatrice administrative : facturation URSSAF, kilomètres, absences. Travaille le jeudi et le vendredi.' },
  { id: 'i-samira', name: 'Samira Benali', email: 'samira@sim.fr', role: 'intervenante', domicile: '12 rue de la République, 92800 Puteaux', profil: 'Expérimentée, utilise le minuteur à chaque séance, remplit tout sur place.' },
  { id: 'i-chloe', name: 'Chloé Petit', email: 'chloe@sim.fr', role: 'intervenante', domicile: '', profil: 'Débutante, n’a pas renseigné son domicile, remplit ses séances en retard, absente jeudi.' },
  { id: 'i-fatou', name: 'Fatou Sow', email: 'fatou@sim.fr', role: 'intervenante', domicile: '5 boulevard de l’Oise, 95000 Cergy', profil: 'Habite loin (Cergy), longs trajets, utilise le minuteur mais oublie parfois de le terminer.' },
  { id: 'i-emma', name: 'Emma Laurent', email: 'emma@sim.fr', role: 'intervenante', domicile: '40 rue de Paris, 92100 Boulogne-Billancourt', profil: 'Temps partiel, n’utilise pas le minuteur, remplit à la main le soir, donne des devoirs détaillés.' },
  { id: 'i-nadia', name: 'Nadia Rami', email: 'nadia@sim.fr', role: 'intervenante', domicile: '3 place du Marché, 92200 Neuilly-sur-Seine', profil: 'Remplaçante : n’a aucun enfant attitré, doit remplacer Chloé jeudi.' },
];
const KIDS = [
  { id: 'ines', prenom: 'Inès', nom: 'Moreau', genre: 'f', classe: 'CP', etablissement: 'École Marius Jacotot', adresse: '15 rue Voltaire, 92800 Puteaux', intervenante: 'i-samira', tarif: 50, parentRef: 'Sophie Moreau', telephone: '06 11 22 33 44', email: 'sophie@sim.fr', comportements: ['Se lève de table'],
    slots: [['2026-11-02', '17:00', 1.5], ['2026-11-04', '10:00', 1.5], ['2026-11-06', '17:00', 1.5]] },
  { id: 'yanis', prenom: 'Yanis', nom: 'Haddad', genre: 'm', classe: 'CE2', etablissement: 'École Les Bergères', adresse: '7 allée des Acacias, 92800 Puteaux', intervenante: 'i-chloe', tarif: 50, parentRef: 'Karim Haddad', telephone: '06 55 66 77 88', email: 'karim@sim.fr', comportements: ['Coupe la parole'],
    slots: [['2026-11-02', '17:30', 1], ['2026-11-05', '17:30', 1]] },
  { id: 'lea', prenom: 'Léa', nom: 'Martin', genre: 'f', classe: 'GS', etablissement: 'École maternelle Parmentier', adresse: '2 rue Parmentier, 92200 Neuilly-sur-Seine', intervenante: 'i-samira', tarif: 55, parentRef: 'Julie Martin', telephone: '07 12 34 56 78', email: 'julie@sim.fr', comportements: ['Crise', 'Évitement du regard'],
    slots: [['2026-11-03', '16:45', 1], ['2026-11-05', '16:45', 1], ['2026-11-07', '10:00', 1]] },
  { id: 'adam', prenom: 'Adam', nom: 'Diallo', genre: 'm', classe: 'CM2', etablissement: 'École Jean Jaurès', adresse: '19 avenue de Verdun, 92130 Issy-les-Moulineaux', intervenante: 'i-fatou', tarif: 50, parentRef: 'Aminata Diallo (et Moussa Diallo)', telephone: '06 98 76 54 32', email: 'aminata@sim.fr', comportements: [],
    slots: [['2026-11-03', '18:00', 1], ['2026-11-06', '18:00', 1]] },
  { id: 'sarah', prenom: 'Sarah', nom: 'Nguyen', genre: 'f', classe: 'CE1', etablissement: 'École Anatole France', adresse: '', intervenante: 'i-emma', tarif: 45, parentRef: 'Thi Nguyen (grand-mère)', telephone: '01 47 00 00 00', email: 'thi@sim.fr', comportements: [],
    slots: [['2026-11-02', '16:30', 1], ['2026-11-04', '14:00', 1], ['2026-11-06', '16:30', 1]] },
];
const PARENTS = [
  { id: 'p-sophie', name: 'Sophie Moreau', email: 'sophie@sim.fr', children: ['ines'], profil: 'Très connectée : active les notifications, lit tout le soir même, fait les devoirs, valide l’URSSAF tout de suite.', rappels: { veille: { on: true, heure: '19:00' }, jour: { on: true, avant: 60 }, perso: [{ avant: 2880 }], email: false, push: true }, push: true },
  { id: 'p-karim', name: 'Karim Haddad', email: 'karim@sim.fr', children: ['yanis'], profil: 'Père très occupé : coupe les e-mails « pour ne pas être spammé », n’active pas les notifications, ne lit pas les messages, oublie les devoirs.', rappels: { email: false, push: true }, push: false },
  { id: 'p-julie', name: 'Julie Martin', email: 'julie@sim.fr', children: ['lea'], profil: 'Mère inquiète : écrit souvent à la direction, veut voir le déroulé minuté, demande des précisions.', rappels: null, push: true },
  { id: 'p-aminata', name: 'Aminata Diallo', email: 'aminata@sim.fr', children: ['adam'], profil: 'Parents séparés : Aminata gère l’URSSAF et les devoirs, active les notifications.', rappels: null, push: true },
  { id: 'p-moussa', name: 'Moussa Diallo', email: 'moussa@sim.fr', children: ['adam'], profil: 'Deuxième parent d’Adam : consulte surtout le planning, ne veut que les rappels du jour même.', rappels: null, push: false },
  { id: 'p-thi', name: 'Thi Nguyen', email: 'thi@sim.fr', children: ['sarah'], profil: 'Grand-mère tutrice, peu à l’aise avec le numérique, texte en grand, prévient d’une absence par message.', rappels: null, push: false },
];

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = ''; srv.stdout.on('data', d => srvLog += d); srv.stderr.on('data', d => srvLog += d);
  for (let i = 0; i < 60 && !fs.existsSync(path.join(DATA, 'premier-lien.txt')); i++) await sleep(100);
  const browser = await chromium.launch();
  const ctxOf = {}; const req = {};
  async function login(id, link, w = 390) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 860 } });
    await ctx.route('**/fonts.googleapis.com/**', r => r.abort()); await ctx.route('**/cdnjs.cloudflare.com/**', r => r.abort());
    const token = new URL(link).searchParams.get('t');
    const r = await ctx.request.post(BASE + '/api/token/use', { headers: H, data: { token, password: 'MotDePasse2026' } });
    if (!r.ok()) throw new Error('mot de passe ' + id + ' ' + r.status());
    ctxOf[id] = ctx; req[id] = ctx.request; return ctx;
  }
  const db = async (who, body) => { const r = await req[who].post(BASE + '/api/db', { headers: H, data: body }); if (!r.ok()) { const j = await r.json().catch(() => ({})); DENIED.push({ who, op: body.op, path: body.path, status: r.status(), message: j.message }); } return r; };
  const dbj = async (who, body) => (await db(who, body)).json();
  const set = (who, p, data) => db(who, { op: 'set', path: p, data });
  const upd = (who, p, data) => db(who, { op: 'update', path: p, data });
  const get = async (who, p) => (await dbj(who, { op: 'get', path: p })).data;
  const list = async (who, p) => (await dbj(who, { op: 'list', path: p })).docs || [];
  async function page(id, t, view) {
    const ctx = ctxOf[id]; const p = await ctx.newPage(); p.on('pageerror', e => PAGE_ERR.push({ who: id, msg: e.message }));
    await p.clock.setFixedTime(new Date(t)); await p.goto(BASE + '/app'); await p.waitForFunction(() => typeof S !== 'undefined' && S.loaded && S.loaded.children, null, { timeout: 15000 }); await sleep(700);
    if (view) { await p.evaluate(v => go(v.name, v.extra || {}), view); await sleep(500); }
    return p;
  }
  const shot = async (p, name, full) => { await p.screenshot({ path: path.join(OUT, 'shots', name + '.png'), fullPage: !!full }); };
  let CURSOR = 0;
  const tick = async (from, to) => { const notify = require('../lib/notify'); let n = 0; from = Math.max(from, CURSOR); if (to < from) return 0; CURSOR = to + 1; for (let t = from; t <= to; t += 15 * 60e3) { process.env.SIM_NOW = String(t); n += await notify.tickRappels(t); } return n; };

  try {
    /* ======== Dimanche 1er novembre : mise en place ======== */
    const ownerLink = fs.readFileSync(path.join(DATA, 'premier-lien.txt'), 'utf8').trim();
    await login('u_owner', ownerLink, 1280);
    const mkUser = async (by, body) => (await req[by].post(BASE + '/api/admin/users', { headers: H, data: body })).json();
    const links = {};
    for (const s of STAFF.filter(x => x.role === 'coordinatrice')) links[s.id] = (await mkUser('u_owner', { id: s.id, name: s.name, email: s.email, role: s.role })).link;
    await login('c-alice', links['c-alice'], 1280); await login('c-myriam', links['c-myriam'], 1280);
    for (const s of STAFF.filter(x => x.role === 'intervenante')) { links[s.id] = (await mkUser('c-alice', { id: s.id, name: s.name, email: s.email, role: s.role })).link; await login(s.id, links[s.id]); }
    log('2026-11-01 10:00', 'Hasan', 'crée les comptes des 2 coordinatrices ; Alice crée les 5 intervenantes');
    /* réglages généraux */
    await set('c-alice', 'settings/main', { tarif: 50, dureeDef: 1, kmTaux: 0.636, rappels: { veille: { on: true, heure: '18:00' }, jour: { on: true, avant: 120 } } });
    /* domiciles : chacune remplit le sien (Chloé oublie) */
    for (const s of STAFF) if (s.domicile) await upd(s.id, 'team/' + s.id, { domicile: s.domicile, tel: '06 00 00 00 ' + String(STAFF.indexOf(s)).padStart(2, '0') });
    /* dossiers enfants et planning */
    for (const k of KIDS) {
      const { slots, ...c } = k;
      await set('c-alice', 'children/' + k.id, { ...c, rythme: slots.length + ' séances par semaine', debut: '2026-09-15', objectifs: [{ axe: 1, objectif: 'Lire des syllabes simples' }], createdAt: Date.now() });
      for (const [i, [d, h, dur]] of slots.entries()) await set('c-alice', `children/${k.id}/sessions/${k.id}-${d}`, { date: d, heure: h, duree: dur, statut: 'prevue', axes: [], createdAt: Date.now(), createdBy: 'c-alice', historique: [{ at: Date.now(), action: 'a créé le rendez-vous', byName: 'Alice Maalouf' }] });
    }
    log('2026-11-01 11:00', 'Alice', 'crée 5 dossiers et 13 rendez-vous pour la semaine');
    for (const p of PARENTS) { links[p.id] = (await mkUser('c-alice', { id: p.id, name: p.name, email: p.email, role: 'parent', children: p.children })).link; await login(p.id, links[p.id]); }
    log('2026-11-01 11:30', 'Alice', 'invite 6 parents (2 pour Adam) ; tous choisissent leur mot de passe le soir');
    for (const p of PARENTS) {
      if (p.rappels) { const c = p.children[0]; await upd(p.id, 'children/' + c, { rappels: { veille: { on: true, heure: '18:00' }, jour: { on: true, avant: 120 }, perso: [], ...p.rappels } }); }
      if (p.push) await req[p.id].post(BASE + '/api/push/subscribe', { headers: H, data: { sub: { endpoint: 'https://push.example/' + p.id, keys: { p256dh: 'x', auth: 'y' } } } });
    }
    /* Moussa règle « seulement le jour même » : il écrase le réglage d'Aminata (même enfant) */
    await upd('p-moussa', 'children/adam', { rappels: { veille: { on: false, heure: '18:00' }, jour: { on: true, avant: 120 }, perso: [], email: true, push: true } });
    log('2026-11-01 21:00', 'Moussa', 'coupe le rappel de la veille pour Adam… ce qui le coupe aussi pour Aminata (réglage par enfant, pas par parent)');
    issue('rappels-par-enfant', 'Les réglages de rappel sont enregistrés sur la fiche enfant : quand Moussa coupe le rappel de la veille, Aminata ne le reçoit plus non plus.');

    /* captures de mise en place */
    let p = await page('p-sophie', at('2026-11-01', '20:00'), { name: 'p-params' }); await shot(p, '01-parent-reglages-rappels', true); await p.close();
    p = await page('c-alice', at('2026-11-01', '20:00'), { name: 'parametres' }); await shot(p, '02-coord-parametres', true); await p.close();

    const sentBefore = await tick(at('2026-11-01', '12:00'), at('2026-11-01', '23:45'));
    log('2026-11-01 18:00', 'système', `rappels de la veille envoyés pour lundi : ${sentBefore}`);

    /* ======== fonctions de séance ======== */
    async function chronoSession(who, cid, d, h, o) {
      /* l'intervenante utilise le minuteur dans l'application (heure simulée), puis complète et partage la séance */
      const t0 = at(d, h); await tick(at(d, '00:00'), t0);
      const pg = await page(who, t0 + 3600e3 * (o.dur || 1) + 5 * 60e3);
      const res = await pg.evaluate(({ cid, sid, t0, o }) => {
        const m = 60000; const ev = []; let t = t0 + (o.wait || 3) * m;
        ev.push({ k: 'work', t });
        for (const [label, mins, stops] of o.acts) { ev.push({ k: 'act', label, t }); for (let i = 0; i < (stops || 0); i++) { ev.push({ k: 'int', cause: o.cause || 'agitation', t: t + 4 * m }); ev.push({ k: 'back', t: t + 6 * m }); } t += mins * m; }
        (o.notes || []).forEach(([f, text], i) => ev.push({ k: 'note', f, text, t: t0 + (10 + i * 7) * m }));
        const ch = { start: t0, end: o.noEnd ? null : t, ev, axes: o.axes || [], regulation: o.regul || null, compteurs: o.cpt || {}, by: actingId() };
        const s = (S.sessions[cid] || {})[sid];
        const patch = chFillPatch(S.children[cid], s, ch);
        return { patch, ch, auto: [...autoAxes(ch)], eff: effAxes(ch) };
      }, { cid, sid: cid + '-' + d, t0, o });
      const extra = { chrono: res.ch, ...res.patch, statut: o.noEnd ? 'prevue' : 'realisee' };
      if (o.message) extra.message = o.message; if (o.reussite) extra.reussite = o.reussite; if (o.maison) extra.maison = o.maison;
      if (o.vigilance) extra.vigilance = o.vigilance;
      if (o.sign) extra.signature = { nom: o.sign, at: t0 + 65 * 60e3 };
      extra.share = { on: true, fields: { reactions: !!o.shareReactions } };
      await upd(who, `children/${cid}/sessions/${cid}-${d}`, extra);
      if (o.shot) { await pg.evaluate(({ cid, sid }) => go('chrono', { cid, sid }), { cid, sid: cid + '-' + d }); await sleep(600); await shot(pg, o.shot, true); }
      await pg.close();
      return res;
    }
    async function manualSession(who, cid, d, fields) { const sl = KIDS.find(k => k.id === cid).slots.find(x => x[0] === d); if (sl) await tick(at(d, '00:00'), at(d, sl[1])); await upd(who, `children/${cid}/sessions/${cid}-${d}`, { statut: 'realisee', share: { on: true }, ...fields }); }
    const parentRead = async (who, cid, t) => { const pg = await page(who, t, { name: 'p-home' }); const shown = await pg.evaluate(() => document.querySelector('#main').innerText.length); await pg.close(); return shown; };

    const AXES_LOG = [];
    /* ======== LUNDI 2 ======== */
    await tick(at('2026-11-02', '00:00'), at('2026-11-02', '16:00'));
    let r;
    /* Emma n'utilise pas le minuteur : elle remplit à la main le soir */
    await manualSession('i-emma', 'sarah', '2026-11-02', { chrono: null, activites: 'Lecture d’un album (Le loup qui voulait changer de couleur), comptage jusqu’à 10', reactions: 'Sarah a nommé 6 couleurs sur 8.', comportement: 'Calme, fatiguée en fin de séance.', axes: [1, 3], message: 'Sarah a bien lu les couleurs aujourd’hui !', maison: 'Relire l’album en montrant les couleurs (10 min).' });
    log('2026-11-02 21:30', 'Emma', 'remplit la séance de Sarah à la main le soir, sans minuteur ni signature ; adresse de Sarah absente de la fiche');
    r = await chronoSession('i-samira', 'ines', '2026-11-02', '17:00', { dur: 1.5, wait: 4, acts: [['Écriture du prénom', 20, 1], ['Lecture d’un album avec questions', 25], ['Memory à deux', 15]], notes: [['reactions', 'Inès a reconnu les lettres de son prénom toute seule.'], ['comportement', 'S’est levée deux fois, est revenue seule à table après un rappel.'], ['reussite', 'A écrit son prénom sans modèle'], ['message', 'Très belle séance, Inès était fière !'], ['maison', 'Écrire son prénom sur une ardoise, 5 minutes par jour.']], cpt: { 'Se lève de table': 2 }, regul: 4, sign: 'Sophie Moreau', shot: '03-minuteur-samira-ines' });
    AXES_LOG.push({ who: 'Samira', cid: 'ines', d: '2026-11-02', auto: r.auto, eff: r.eff });
    log('2026-11-02 18:35', 'Samira', `minuteur complet pour Inès ; axes cochés automatiquement : ${r.auto.join(', ')}`);
    log('2026-11-02 18:30', 'Chloé', 'séance de Yanis réalisée mais pas remplie (elle la remplira mercredi)');
    await tick(at('2026-11-02', '16:00'), at('2026-11-02', '23:45'));
    /* Sophie lit le soir, coche le devoir, remercie */
    await parentRead('p-sophie', 'ines', at('2026-11-02', '20:30'));
    p = await page('p-sophie', at('2026-11-02', '20:35'), { name: 'p-devoirs' }); await shot(p, '04-parent-devoirs', true); await p.close();
    await upd('p-sophie', 'children/ines/sessions/ines-2026-11-02', { maisonStatut: 'en_cours', maisonCom: 'On a commencé ce soir, elle adore l’ardoise !', maisonAt: at('2026-11-02', '20:40') });
    await set('p-sophie', 'fmsg/m1', { cid: 'ines', to: 'intervenante', text: 'Merci Samira pour cette séance, Inès n’arrête pas d’en parler !' });
    log('2026-11-02 20:40', 'Sophie', 'lit le compte rendu, met le devoir « en cours », écrit un mot à Samira');
    /* Julie (Léa) pose déjà une question à la direction */
    await set('p-julie', 'fmsg/m2', { cid: 'lea', to: 'direction', text: 'Bonjour, est-ce que je pourrai voir exactement ce que Léa fait pendant la séance, minute par minute ? Je suis un peu inquiète pour demain.' });
    log('2026-11-02 22:10', 'Julie', 'écrit à la direction : veut voir le déroulé minute par minute');

    /* ======== MARDI 3 ======== */
    await tick(at('2026-11-03', '00:00'), at('2026-11-03', '09:00'));
    await set('c-alice', 'fmsg/m3', { cid: 'lea', to: 'direction', text: 'Bonjour Julie, bien sûr. J’active l’affichage du déroulé pour Léa : vous le verrez après chaque séance.' });
    await upd('c-alice', 'children/lea', { parentDeroule: true });
    const tryChloe = await upd('i-samira', 'children/lea', { parentDeroule: false });
    if (tryChloe.status() === 403) log('2026-11-03 09:10', 'Samira', 'ne peut pas changer le réglage du déroulé (réservé à la coordination) : droit vérifié');
    log('2026-11-03 09:05', 'Alice', 'répond à Julie et active le déroulé pour Léa seulement');
    await tick(at('2026-11-03', '09:00'), at('2026-11-03', '16:30'));
    r = await chronoSession('i-samira', 'lea', '2026-11-03', '16:45', { wait: 9, acts: [['Cartes des émotions', 15, 2], ['Pictogrammes oui / non / pause', 15], ['Enfilage de grosses perles', 15]], cause: 'crise', notes: [['comportement', 'Une crise à 17h05 quand on a rangé les cartes, retour au calme avec la carte pause en 3 minutes.'], ['reactions', 'Léa a montré la carte pause seule une fois et a regardé brièvement.'], ['message', 'Léa a utilisé la carte pause toute seule, bravo !'], ['vigilance', 'Fatigue importante en fin de journée, préférer le mercredi matin ?']], cpt: { Crise: 1, 'Évitement du regard': 6 }, regul: 2, sign: 'Julie Martin', shot: '05-minuteur-samira-lea' });
    AXES_LOG.push({ who: 'Samira', cid: 'lea', d: '2026-11-03', auto: r.auto, eff: r.eff });
    r = await chronoSession('i-fatou', 'adam', '2026-11-03', '18:00', { wait: 2, acts: [['Découpage sur les lignes', 20], ['Graphisme, dessin', 25]], notes: [['reactions', 'Adam tient mieux ses ciseaux, découpe des courbes.']], noEnd: true });
    AXES_LOG.push({ who: 'Fatou', cid: 'adam', d: '2026-11-03', auto: r.auto, eff: r.eff });
    log('2026-11-03 19:00', 'Fatou', 'oublie de terminer le minuteur d’Adam : la séance reste « prévue » et non partagée');
    await tick(at('2026-11-03', '16:30'), at('2026-11-03', '23:45'));
    /* Julie consulte la séance avec déroulé */
    p = await page('p-julie', at('2026-11-03', '20:00'), { name: 'p-seance', extra: { sid: 'lea-2026-11-03' } }); await shot(p, '06-parent-julie-seance-deroule', true);
    const julieSeesDeroule = await p.evaluate(() => /Déroulé minuté/.test(document.querySelector('#main').innerText)); await p.close();
    const sophieSees = await get('p-sophie', 'children/ines/sessions/ines-2026-11-02');
    log('2026-11-03 20:00', 'Julie', `voit le déroulé de Léa : ${julieSeesDeroule ? 'oui' : 'non'} ; Sophie (sans activation) reçoit le déroulé : ${sophieSees.chrono ? 'oui' : 'non'}`);
    if (sophieSees.chrono) issue('deroule-fuite', 'Le déroulé est envoyé à une famille non autorisée');
    /* Thi prévient d'une absence mercredi */
    await set('p-thi', 'fmsg/m4', { cid: 'sarah', to: 'direction', text: 'Bonjour, Sarah a de la fièvre, elle ne pourra pas venir mercredi. Merci.' });
    log('2026-11-03 21:15', 'Thi', 'prévient la direction de l’absence de Sarah mercredi');

    /* ======== MERCREDI 4 ======== */
    await tick(at('2026-11-04', '00:00'), at('2026-11-04', '08:30'));
    /* Alice lit à 8h30, annule la séance et répond ; mais les rappels du jour même ont-ils été envoyés ? */
    await upd('c-alice', 'children/sarah/sessions/sarah-2026-11-04', { statut: 'annulee', annulation: { motif: 'Enfant malade', par: 'famille', at: at('2026-11-04', '08:35') } });
    await set('c-alice', 'fmsg/m5', { cid: 'sarah', to: 'direction', text: 'Bien reçu, prompt rétablissement à Sarah. La séance de mercredi est annulée.' });
    log('2026-11-04 08:35', 'Alice', 'annule la séance de Sarah et répond à Thi (Emma n’est pas prévenue automatiquement)');
    issue('annulation-intervenante', 'Quand la coordination annule une séance, l’intervenante n’est pas prévenue directement (aucun message ni notification ciblée).');
    r = await chronoSession('i-samira', 'ines', '2026-11-04', '10:00', { dur: 1.5, wait: 2, acts: [['Comptage avec gommettes', 20], ['Loto des animaux', 20], ['Parcours moteur dans le salon', 15], ['Tri de formes avec sablier', 15]], notes: [['comportement', 'Très concentrée, aucun lever de table.'], ['reussite', 'A compté jusqu’à 15 seule'], ['message', 'Bravo Inès, 15 gommettes comptées toute seule !'], ['maison', 'Compter les marches de l’escalier ensemble.']], cpt: { 'Se lève de table': 0 }, regul: 5, sign: 'Sophie Moreau' });
    AXES_LOG.push({ who: 'Samira', cid: 'ines', d: '2026-11-04', auto: r.auto, eff: r.eff });
    /* Chloé remplit enfin la séance de lundi */
    await manualSession('i-chloe', 'yanis', '2026-11-02', { activites: 'Fiche de numération, jeu de société', message: 'Séance correcte.', axes: [3] });
    log('2026-11-04 21:00', 'Chloé', 'remplit la séance de Yanis de lundi avec 2 jours de retard, sans signature ni devoir');
    await tick(at('2026-11-04', '08:30'), at('2026-11-04', '23:45'));
    await upd('p-sophie', 'children/ines/sessions/ines-2026-11-02', { maisonStatut: 'fait', maisonFait: true, maisonAt: at('2026-11-04', '19:00') });
    await upd('p-sophie', 'children/ines/sessions/ines-2026-11-04', { maisonStatut: 'fait', maisonFait: true, maisonCom: '42 marches !', maisonAt: at('2026-11-04', '19:05') });
    /* Emma donne un devoir détaillé à Sarah malgré l'annulation (via l'onglet Devoirs) */
    await set('i-emma', 'devoirs/d1', { cid: 'sarah', texte: 'Pendant la convalescence : relire l’album des couleurs et colorier la page 3 du cahier.', pour: '2026-11-06', date: '2026-11-04', par: 'i-emma', parNom: 'Emma Laurent', statut: null, createdAt: at('2026-11-04', '11:00') });
    log('2026-11-04 11:00', 'Emma', 'envoie un devoir à Sarah depuis l’onglet Devoirs');

    /* ======== JEUDI 5 ======== */
    await tick(at('2026-11-05', '00:00'), at('2026-11-05', '08:00'));
    /* Chloé est malade : Nadia doit la remplacer pour Yanis */
    await set('i-chloe', 'messages/x1', { chan: 'equipe', text: 'Je suis malade aujourd’hui, désolée.', at: at('2026-11-05', '07:45'), from: 'i-chloe', fromName: 'Chloé Petit', urgent: false, ackBy: ['i-chloe'] });
    const nadiaTry = await upd('i-nadia', 'children/yanis/sessions/yanis-2026-11-05', { intervenante: 'i-nadia' });
    log('2026-11-05 08:00', 'Nadia', `tente d’ouvrir la séance de Yanis pour remplacer Chloé : ${nadiaTry.status() === 403 ? 'accès refusé (elle ne voit que ses propres enfants)' : 'ok'}`);
    if (nadiaTry.status() === 403) issue('remplacement', 'Une remplaçante ne peut ni voir ni remplir la séance d’un enfant qui ne lui est pas attribué. Il faut changer l’intervenante de l’enfant entier, ce qui fausse l’historique et les kilomètres de Chloé.');
    /* Myriam (qui travaille jeudi) bascule temporairement Yanis vers Nadia */
    await upd('c-myriam', 'children/yanis', { intervenante: 'i-nadia' });
    await upd('c-myriam', 'children/yanis/sessions/yanis-2026-11-05', { intervenante: 'i-nadia' });
    await tick(at('2026-11-05', '08:00'), at('2026-11-05', '16:30'));
    r = await chronoSession('i-nadia', 'yanis', '2026-11-05', '17:30', { wait: 7, acts: [['Numération', 20, 2], ['Jeu de société', 20]], cause: 'distraction', notes: [['comportement', 'A coupé la parole souvent, mais a attendu son tour au jeu.'], ['message', 'Je remplaçais Chloé aujourd’hui. Yanis a bien travaillé les additions.'], ['maison', 'Jouer à la bataille avec des additions.']], cpt: { 'Coupe la parole': 9 }, sign: '' });
    AXES_LOG.push({ who: 'Nadia', cid: 'yanis', d: '2026-11-05', auto: r.auto, eff: r.eff });
    await upd('c-myriam', 'children/yanis', { intervenante: 'i-chloe' });
    log('2026-11-05 19:00', 'Myriam', 'remet Yanis à Chloé après le remplacement (manipulation manuelle, deux fois)');
    r = await chronoSession('i-samira', 'lea', '2026-11-05', '16:45', { wait: 4, acts: [['Comptine à gestes', 15], ['Pâte à modeler : boudins et boules', 20], ['Punching ball et retour au calme', 10]], notes: [['comportement', 'Aucune crise, a tapé le punching ball au lieu de crier.'], ['reussite', 'A regardé Samira 3 fois en souriant'], ['message', 'Super séance, aucune crise !']], cpt: { Crise: 0, 'Évitement du regard': 3 }, regul: 4, sign: 'Julie Martin' });
    AXES_LOG.push({ who: 'Samira', cid: 'lea', d: '2026-11-05', auto: r.auto, eff: r.eff });
    await tick(at('2026-11-05', '16:30'), at('2026-11-05', '23:45'));
    /* Myriam saisit des déplacements, constate les trous */
    await set('c-myriam', 'deplacements/k1', { uid: 'c-myriam', date: '2026-11-05', km: 18.4, motif: 'Rendez-vous école de Léa (équipe éducative)', de: '8 avenue Foch, 92250 La Garenne-Colombes', vers: '2 rue Parmentier, 92200 Neuilly-sur-Seine' });
    await set('p-julie', 'fmsg/m6', { cid: 'lea', to: 'intervenante', text: 'Merci Samira ! Pour samedi, on peut commencer à 10h30 au lieu de 10h ?' });
    log('2026-11-05 21:00', 'Julie', 'demande à Samira de décaler samedi à 10h30 (pas de demande de changement structurée)');

    /* ======== VENDREDI 6 ======== */
    await tick(at('2026-11-06', '00:00'), at('2026-11-06', '09:00'));
    await set('i-samira', 'fmsg/m7', { cid: 'lea', to: 'intervenante', text: 'Oui pas de souci, je préviens la coordination.' });
    await upd('c-myriam', 'children/lea/sessions/lea-2026-11-07', { heure: '10:30' });
    log('2026-11-06 09:30', 'Myriam', 'décale le rdv de Léa à 10h30 ; les rappels déjà programmés suivent la nouvelle heure');
    /* Fatou termine enfin la séance de mardi */
    await upd('i-fatou', 'children/adam/sessions/adam-2026-11-03', { statut: 'realisee', 'chrono': null, activites: 'Découpage sur les lignes (20 min), graphisme (25 min)', message: 'Adam progresse au découpage.', share: { on: true } });
    log('2026-11-06 10:00', 'Fatou', 'termine la séance d’Adam de mardi à la main (3 jours après) : déroulé perdu');
    r = await chronoSession('i-samira', 'ines', '2026-11-06', '17:00', { dur: 1.5, wait: 3, acts: [['Vignettes de couleurs à coller', 20], ['Lecture d’un album avec questions', 25], ['Consignes à deux étapes', 15]], notes: [['comportement', 'Fatiguée (fin de semaine), mais a fini les 3 activités.'], ['message', 'Fin de semaine fatigante mais Inès a tout fini.']], regul: 3, sign: 'Sophie Moreau' });
    AXES_LOG.push({ who: 'Samira', cid: 'ines', d: '2026-11-06', auto: r.auto, eff: r.eff });
    r = await chronoSession('i-fatou', 'adam', '2026-11-06', '18:00', { wait: 1, acts: [['Écriture du prénom', 15], ['Repérage sur quadrillage', 20], ['Motricité fine', 15]], notes: [['comportement', 'Concentré, a demandé de l’aide pour le quadrillage.'], ['maison', 'Faire un labyrinthe du cahier de vacances.']], sign: 'Moussa Diallo' });
    AXES_LOG.push({ who: 'Fatou', cid: 'adam', d: '2026-11-06', auto: r.auto, eff: r.eff });
    await manualSession('i-emma', 'sarah', '2026-11-06', { activites: 'Reprise douce : album des couleurs, coloriage', message: 'Sarah était contente de revenir.', axes: [1, 2] });
    /* Facturation (Myriam, vendredi après-midi) : dans l'application */
    const pM = await page('c-myriam', at('2026-11-06', '20:30'), { name: 'equipe', extra: { tab: 'facturation' } });
    await shot(pM, '07-coord-facturation-a-facturer', true);
    const created = [];
    for (const cid of ['ines', 'lea', 'adam', 'yanis', 'sarah']) {
      const btn = await pM.$(`[data-act="f-create"][data-c="${cid}"]`);
      if (btn && !(await btn.isDisabled())) { await btn.click(); await sleep(700); await pM.evaluate(() => { S.view.ftab = 'afacturer'; render(); }); await sleep(300); created.push(cid); }
    }
    await pM.evaluate(() => { S.view.ftab = 'factures'; render(); }); await sleep(400); await shot(pM, '08-coord-factures', true);
    const facts = await list('c-myriam', 'factures');
    for (const f of facts) await upd('c-myriam', 'factures/' + f.id, { statut: 'transmise', transmiseAt: at('2026-11-06', '21:00') });
    await pM.close();
    log('2026-11-06 21:00', 'Myriam', `crée ${facts.length} factures en regroupant les séances de la semaine et les marque « transmises » à l’URSSAF`);
    await tick(at('2026-11-06', '09:00'), at('2026-11-06', '23:45'));

    /* ======== SAMEDI 7 ======== */
    await tick(at('2026-11-07', '00:00'), at('2026-11-07', '10:00'));
    r = await chronoSession('i-samira', 'lea', '2026-11-07', '10:30', { wait: 3, acts: [['Memory à deux', 15], ['Cartes des émotions', 15], ['Parcours moteur dans le salon', 15]], notes: [['comportement', 'Bonne humeur, a attendu son tour au memory.'], ['message', 'Belle fin de semaine pour Léa.']], regul: 4, sign: 'Julie Martin' });
    AXES_LOG.push({ who: 'Samira', cid: 'lea', d: '2026-11-07', auto: r.auto, eff: r.eff });
    /* les familles et les factures */
    for (const f of facts) {
      const c = f.data.cid;
      if (c === 'ines') await upd('p-sophie', 'factures/' + f.id, { parentValide: true, parentValideAt: at('2026-11-06', '21:20') });
      if (c === 'adam') await upd('p-aminata', 'factures/' + f.id, { parentValide: true, parentValideAt: at('2026-11-07', '09:00') });
      if (c === 'lea') await upd('p-julie', 'factures/' + f.id, { parentValide: true, parentValideAt: at('2026-11-07', '11:30') });
    }
    p = await page('p-thi', at('2026-11-07', '12:00'), { name: 'p-factures' }); await shot(p, '09-parent-thi-factures', true); await p.close();
    p = await page('p-aminata', at('2026-11-07', '12:00'), { name: 'p-home' }); await shot(p, '10-parent-aminata-accueil', true); await p.close();
    p = await page('p-julie', at('2026-11-07', '12:10'), { name: 'p-messages', extra: { fto: 'direction' } }); await shot(p, '11-parent-julie-messages'); await p.close();
    /* Thi essaie d'écrire en très grand : elle répond au devoir */
    await upd('p-thi', 'devoirs/d1', { statut: 'fait', commentaire: 'fait', faitAt: at('2026-11-07', '15:00') });
    /* Myriam marque payées les factures validées */
    for (const f of facts) { const g = await get('c-myriam', 'factures/' + f.id); if (g.parentValide) await upd('c-myriam', 'factures/' + f.id, { statut: 'payee', payeeAt: at('2026-11-07', '17:00') }); }
    await tick(at('2026-11-07', '10:00'), at('2026-11-07', '23:45'));

    /* ======== Bilan : écrans de l'équipe ======== */
    const pA = await page('c-alice', at('2026-11-07', '18:00'), { name: 'km' });
    const kmAll = {};
    for (const s of STAFF) {
      await pA.evaluate(uid => { S.view.uid = uid; S.view.kmode = 'semaine'; S.view.ref = '2026-11-02'; render(); }, s.id);
      for (let i = 0; i < 30; i++) { await sleep(250); const busy = await pA.evaluate(() => RT_PEND.size > 0 || RT_BUSY || !!document.querySelector('#main').innerText.includes('calcul…')); if (!busy) break; }
      kmAll[s.id] = await pA.evaluate(uid => { const out = []; for (let d = '2026-11-02'; d <= '2026-11-08'; d = addDays(d, 1)) { const k = dayKm(uid, d); const n = dayStops(uid, d).length; if (n || k.extra) out.push({ d, n, km: Math.round(k.total * 10) / 10, missing: k.missing, legs: k.legs.map(l => ({ from: l.a.lbl, to: l.b.lbl, km: l.r && l.r.km, miss: l.miss })) }); } return out; }, s.id);
      if (s.id === 'i-fatou' || s.id === 'i-chloe') await shot(pA, '12-km-' + s.id, true);
    }
    await pA.evaluate(() => { S.view.kmode = 'mois'; S.view.uid = 'i-samira'; S.view.ref = '2026-11-02'; render(); }); await sleep(800); await shot(pA, '13-km-mois-samira', true);
    await pA.evaluate(() => go('messages')); await sleep(500); await shot(pA, '14-coord-messages', true);
    await pA.evaluate(() => go('enfant', { id: 'sarah', tab: 'devoirs' })); await sleep(500); await shot(pA, '15-coord-devoirs-sarah', true);
    await pA.evaluate(() => go('home')); await sleep(500); await shot(pA, '16-coord-accueil', true);
    await pA.close();
    const pS = await page('i-samira', at('2026-11-07', '08:30'), { name: 'home' }); await shot(pS, '17-samira-ma-journee', true);
    await pS.evaluate(() => evModal('lea', 'lea-2026-11-07')); await sleep(300); await shot(pS, '18-samira-rdv-gps'); await pS.close();
    const pC = await page('i-chloe', at('2026-11-07', '08:30'), { name: 'home' }); await shot(pC, '19-chloe-accueil', true); await pC.close();
    const pK = await page('p-karim', at('2026-11-07', '12:00'), { name: 'p-home' }); await shot(pK, '20-parent-karim-accueil', true); await pK.close();

    /* ======== Collecte des données ======== */
    const mails = fs.existsSync(MAIL) ? fs.readFileSync(MAIL, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const pushes = fs.existsSync(PUSH) ? fs.readFileSync(PUSH, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const sessions = []; for (const k of KIDS) for (const d of (await list('c-alice', `children/${k.id}/sessions`))) sessions.push({ cid: k.id, id: d.id, ...d.data });
    const fmsg = (await list('c-alice', 'fmsg')).map(d => ({ id: d.id, ...d.data }));
    const factures = (await list('c-alice', 'factures')).map(d => ({ id: d.id, ...d.data }));
    const devoirs = (await list('c-alice', 'devoirs')).map(d => ({ id: d.id, ...d.data }));
    const parentEmailOf = Object.fromEntries(PARENTS.map(p => [p.email, p.id]));
    const report = {
      semaine: '2026-11-02 → 2026-11-07', personnages: { staff: STAFF.map(({ id, name, role, profil, domicile }) => ({ id, name, role, profil, domicile: !!domicile })), familles: KIDS.map(k => ({ id: k.id, prenom: k.prenom, classe: k.classe, intervenante: k.intervenante, adresse: !!k.adresse, seancesPrevues: k.slots.length })), parents: PARENTS.map(({ id, name, children, profil }) => ({ id, name, children, profil })) },
      journal: LOG, constats: ISSUES, refus: DENIED, erreursPage: PAGE_ERR,
      rappels: { emails: mails.filter(m => /^Rappel/.test(m.subject)).map(m => ({ to: parentEmailOf[m.to] || m.to, when: new Date(m.at).toISOString(), subject: m.subject })), push: pushes.filter(x => /^Rappel/.test(x.title)).map(x => ({ to: x.uid, when: new Date(x.at).toISOString(), title: x.title })) },
      autresEnvois: { emails: mails.filter(m => !/^Rappel/.test(m.subject)).map(m => ({ to: m.to, subject: m.subject })), push: pushes.filter(x => !/^Rappel/.test(x.title)).map(x => ({ to: x.uid, title: x.title })) },
      seances: sessions.map(s => ({ cid: s.cid, date: s.date, heure: s.heure, statut: s.statut, rempli: !!(s.activites || s.message), minuteur: !!(s.chrono && s.chrono.start), signee: !!s.signature, partagee: !s.share || s.share.on !== false, axes: s.axes || [], comportement: s.comportement || '', maison: s.maison || '', maisonStatut: s.maisonStatut || null, intervenante: s.intervenante || null })),
      axesAuto: AXES_LOG, messages: fmsg.map(m => ({ cid: m.cid, to: m.to, fromRole: m.fromRole, from: m.fromName, at: m.at, lu: (m.readBy || []).length > 1, text: m.text })),
      factures: factures.map(f => ({ cid: f.cid, numero: f.numero, montant: f.montant, n: (f.sessions || []).length, statut: f.statut, parentValide: !!f.parentValide })), devoirs, km: kmAll,
    };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('Simulation terminée.', { erreursPage: PAGE_ERR.length, refus: DENIED.length, rappelsMail: report.rappels.emails.length, rappelsPush: report.rappels.push.length, factures: factures.length, messages: fmsg.length });
  } catch (e) { console.error('ERREUR SIMULATION', e); console.error(srvLog.slice(-3000)); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
