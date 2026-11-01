'use strict';
/* Semaine de contrôle (lundi 2 → dimanche 8 novembre 2026) : mêmes familles et même équipe que la première simulation,
   mais chacun profite des 23 améliorations. Chaque amélioration est vérifiée par un contrôle (ok / échec).
   Résultat : sim-out2/report.json + captures. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3951, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync('/tmp/memb-sim2-');
const OUT = process.env.OUT || path.join(__dirname, '..', 'sim-out2');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const MAIL = path.join(DATA, 'mail.jsonl'), PUSH = path.join(DATA, 'push.jsonl');
const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BASE_URL: BASE, OWNER_EMAIL: 'hasan@sim.fr', OWNER_NAME: 'Hasan', OWNER_ID: 'u_owner', SMTP_HOST: '', ROUTE_STUB: '1', MAIL_STUB: MAIL, PUSH_STUB: PUSH, NO_SCHED: '1' };
Object.assign(process.env, { DATA_DIR: DATA, ROUTE_STUB: '1', MAIL_STUB: MAIL, PUSH_STUB: PUSH, BASE_URL: BASE });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { 'X-MEMB': '1', 'Content-Type': 'application/json' };
const LOG = []; const CHECKS = []; const DENIED = []; const PAGE_ERR = [];
const at = (d, hm) => new Date(`${d}T${hm}:00+01:00`).getTime();
const log = (when, who, what) => LOG.push({ when, who, what });
const check = (n, label, ok, detail) => { CHECKS.push({ n, label, ok: !!ok, detail: detail || '' }); if (!ok) console.log('ÉCHEC', n, label, detail || ''); };
const readJ = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];

const STAFF = [
  { id: 'c-alice', name: 'Alice Maalouf', email: 'alice@sim.fr', role: 'coordinatrice', domicile: '23 rue Louis Pouey, 92800 Puteaux' },
  { id: 'c-myriam', name: 'Myriam Kaci', email: 'myriam@sim.fr', role: 'coordinatrice', domicile: '8 avenue Foch, 92250 La Garenne-Colombes' },
  { id: 'i-samira', name: 'Samira Benali', email: 'samira@sim.fr', role: 'intervenante', domicile: '12 rue de la République, 92800 Puteaux' },
  { id: 'i-chloe', name: 'Chloé Petit', email: 'chloe@sim.fr', role: 'intervenante', domicile: '' },
  { id: 'i-fatou', name: 'Fatou Sow', email: 'fatou@sim.fr', role: 'intervenante', domicile: '5 boulevard de l’Oise, 95000 Cergy' },
  { id: 'i-emma', name: 'Emma Laurent', email: 'emma@sim.fr', role: 'intervenante', domicile: '40 rue de Paris, 92100 Boulogne-Billancourt' },
  { id: 'i-nadia', name: 'Nadia Rami', email: 'nadia@sim.fr', role: 'intervenante', domicile: '3 place du Marché, 92200 Neuilly-sur-Seine' },
];
const KIDS = [
  { id: 'ines', prenom: 'Inès', nom: 'Moreau', genre: 'f', adresse: '15 rue Voltaire, 92800 Puteaux', intervenante: 'i-samira', tarif: 50, parentRef: 'Sophie Moreau', slots: [['2026-11-02', '17:00', 1.5], ['2026-11-04', '10:00', 1.5], ['2026-11-06', '17:00', 1.5]] },
  { id: 'yanis', prenom: 'Yanis', nom: 'Haddad', genre: 'm', adresse: '7 allée des Acacias, 92800 Puteaux', intervenante: 'i-chloe', tarif: 50, parentRef: 'Karim Haddad', slots: [['2026-11-02', '17:30', 1], ['2026-11-05', '17:30', 1]] },
  { id: 'lea', prenom: 'Léa', nom: 'Martin', genre: 'f', adresse: '2 rue Parmentier, 92200 Neuilly-sur-Seine', intervenante: 'i-samira', tarif: 55, parentRef: 'Julie Martin', comportements: ['Crise'], slots: [['2026-11-03', '16:45', 1], ['2026-11-05', '16:45', 1], ['2026-11-07', '10:00', 1]] },
  { id: 'adam', prenom: 'Adam', nom: 'Diallo', genre: 'm', adresse: '19 avenue de Verdun, 92130 Issy-les-Moulineaux', intervenante: 'i-fatou', tarif: 50, parentRef: 'Aminata et Moussa Diallo', slots: [['2026-11-03', '18:00', 1], ['2026-11-06', '18:00', 1]] },
  { id: 'sarah', prenom: 'Sarah', nom: 'Nguyen', genre: 'f', adresse: '', intervenante: 'i-emma', tarif: 45, parentRef: 'Thi Nguyen', slots: [['2026-11-02', '16:30', 1], ['2026-11-04', '14:00', 1], ['2026-11-06', '16:30', 1]] },
];
const PARENTS = [
  { id: 'p-sophie', name: 'Sophie Moreau', email: 'sophie@sim.fr', children: ['ines'], prefs: { rappels: { veille: { on: true, heure: '19:00' }, jour: { on: true, avant: 60 }, perso: [{ avant: 2880 }], canal: 'auto' } }, push: true },
  { id: 'p-karim', name: 'Karim Haddad', email: 'karim@sim.fr', children: ['yanis'], prefs: { rappels: { canal: 'auto' } }, push: false },
  { id: 'p-julie', name: 'Julie Martin', email: 'julie@sim.fr', children: ['lea'], prefs: null, push: true },
  { id: 'p-aminata', name: 'Aminata Diallo', email: 'aminata@sim.fr', children: ['adam'], prefs: null, push: true },
  { id: 'p-moussa', name: 'Moussa Diallo', email: 'moussa@sim.fr', children: ['adam'], prefs: { rappels: { veille: { on: false, heure: '18:00' } } }, push: false },
  { id: 'p-thi', name: 'Thi Nguyen', email: 'thi@sim.fr', children: ['sarah'], prefs: { simple: true }, push: false },
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
    const r = await ctx.request.post(BASE + '/api/token/use', { headers: H, data: { token: new URL(link).searchParams.get('t'), password: 'MotDePasse2026' } });
    if (!r.ok()) throw new Error('mot de passe ' + id);
    ctxOf[id] = ctx; req[id] = ctx.request;
  }
  const db = async (who, body) => { const r = await req[who].post(BASE + '/api/db', { headers: H, data: body }); if (!r.ok()) { const j = await r.json().catch(() => ({})); DENIED.push({ who, op: body.op, path: body.path, status: r.status(), message: j.message }); } return r; };
  const dbj = async (who, body) => (await db(who, body)).json();
  const set = (who, p, data) => db(who, { op: 'set', path: p, data });
  const upd = (who, p, data) => db(who, { op: 'update', path: p, data });
  const get = async (who, p) => (await dbj(who, { op: 'get', path: p })).data;
  const list = async (who, p) => (await dbj(who, { op: 'list', path: p })).docs || [];
  async function page(id, t, view, w) {
    const p = await ctxOf[id].newPage(); if (w) await p.setViewportSize({ width: w, height: 900 }); p.on('pageerror', e => PAGE_ERR.push({ who: id, msg: e.message }));
    await p.clock.setFixedTime(new Date(t)); await p.goto(BASE + '/app'); await p.waitForFunction(() => typeof S !== 'undefined' && S.loaded && S.loaded.children, null, { timeout: 15000 }); await sleep(900);
    if (view) { await p.evaluate(v => { if (!document.getElementById('modal').hidden) closeModal(); go(v.name, v.extra || {}); }, view); await sleep(500); }
    return p;
  }
  const shot = async (p, name, full) => { await p.screenshot({ path: path.join(OUT, 'shots', name + '.png'), fullPage: !!full }); };
  const notify = require('../lib/notify'); const jobs = require('../lib/jobs');
  let CURSOR = 0; const JOBS = {};
  const tick = async (from, to) => { from = Math.max(from, CURSOR); if (to < from) return; CURSOR = to + 1; for (let t = from; t <= to; t += 15 * 60e3) { process.env.SIM_NOW = String(t); await notify.tickRappels(t); const r = await jobs.runAll(t); Object.entries(r).forEach(([k, v]) => JOBS[k] = (JOBS[k] || 0) + (v || 0)); } };
  const mails = () => readJ(MAIL), pushes = () => readJ(PUSH);
  const sent = (filter) => [...mails().map(m => ({ ch: 'mail', to: m.to, at: m.at, t: m.subject, body: m.text })), ...pushes().map(x => ({ ch: 'push', to: x.uid, at: x.at, t: x.title, body: x.body }))].filter(filter);
  const emailOf = Object.fromEntries([...STAFF, ...PARENTS].map(x => [x.email, x.id]));
  const toId = x => emailOf[x.to] || x.to;

  try {
    /* ======== Dimanche 1er : mise en place ======== */
    await login('u_owner', fs.readFileSync(path.join(DATA, 'premier-lien.txt'), 'utf8').trim(), 1280);
    const mkUser = async (by, body) => (await req[by].post(BASE + '/api/admin/users', { headers: H, data: body })).json();
    const links = {};
    for (const s of STAFF.filter(x => x.role === 'coordinatrice')) links[s.id] = (await mkUser('u_owner', { id: s.id, name: s.name, email: s.email, role: s.role })).link;
    await login('c-alice', links['c-alice'], 1280); await login('c-myriam', links['c-myriam'], 1280);
    for (const s of STAFF.filter(x => x.role === 'intervenante')) { links[s.id] = (await mkUser('c-alice', { id: s.id, name: s.name, email: s.email, role: s.role })).link; await login(s.id, links[s.id]); }
    await set('c-alice', 'settings/main', { tarif: 50, dureeDef: 1, kmTaux: 0.636, rappels: { veille: { on: true, heure: '18:00' }, jour: { on: true, avant: 120 } } });
    for (const s of STAFF) if (s.domicile) await upd(s.id, 'team/' + s.id, { domicile: s.domicile });
    for (const k of KIDS) { const { slots, ...c } = k; await set('c-alice', 'children/' + k.id, { ...c, objectifs: [], createdAt: Date.now() }); for (const [d, h, dur] of slots) await set('c-alice', `children/${k.id}/sessions/${k.id}-${d}`, { date: d, heure: h, duree: dur, statut: 'prevue', axes: [], createdAt: Date.now() }); }
    for (const p of PARENTS) { links[p.id] = (await mkUser('c-alice', { id: p.id, name: p.name, email: p.email, role: 'parent', children: p.children })).link; await login(p.id, links[p.id]); }
    for (const p of PARENTS) { if (p.prefs) await set(p.id, 'prefs/' + p.id, p.prefs); if (p.push) await req[p.id].post(BASE + '/api/push/subscribe', { headers: H, data: { sub: { endpoint: 'https://push.example/' + p.id, keys: { p256dh: 'x', auth: 'y' } } } }); }
    log('2026-11-01', 'Tous', 'comptes, dossiers, 13 rendez-vous ; chaque parent règle SES rappels (Moussa coupe la veille pour lui seul, Thi choisit l’affichage simplifié)');

    /* 8. adresse obligatoire */
    const pA0 = await page('c-alice', at('2026-11-01', '11:00'), { name: 'enfants' }, 1280);
    await pA0.evaluate(() => ACT['new-child']()); await sleep(200); await pA0.fill('#ncP', 'Test'); await pA0.click('[data-act="new-child-ok"]'); await sleep(300);
    const nbKids = await pA0.evaluate(() => Object.keys(S.children).length);
    const blockFiche = await pA0.evaluate(async () => await write('children/ines', { adresse: '' }, true));
    check(8, 'Adresse obligatoire : création refusée sans adresse, fiche non enregistrée si on l’efface', nbKids === 5 && blockFiche === false, `dossiers : ${nbKids}`);
    /* 13. À traiter : la fiche sans adresse et le domicile manquant apparaissent */
    await pA0.evaluate(() => go('atraiter')); await sleep(1500); await pA0.evaluate(() => render()); await sleep(300);
    const todo0 = await pA0.evaluate(() => Object.fromEntries(Object.entries(todoItems()).map(([k, v]) => [k, v.length])));
    check(13, 'À traiter liste les fiches sans adresse et les domiciles manquants', todo0.adresses === 1 && todo0.domiciles >= 1, JSON.stringify(todo0));
    await shot(pA0, '01-a-traiter-dimanche', true);
    await upd('c-alice', 'children/sarah', { adresse: '9 rue Anatole France, 92800 Puteaux' });
    log('2026-11-01 11:30', 'Alice', 'voit dans « À traiter » que la fiche de Sarah n’a pas d’adresse et la complète');
    await pA0.close();
    /* 8. domicile demandé à Chloé à sa première connexion */
    const pC = await page('i-chloe', at('2026-11-01', '20:00'));
    await sleep(1200); const askShown = await pC.evaluate(() => !!document.getElementById('domIn')); await shot(pC, '02-chloe-domicile-demande');
    if (askShown) { await pC.fill('#domIn', '21 rue des Pâquerettes, 92800 Puteaux'); await pC.click('[data-act="dom-ok"]'); await sleep(500); }
    const chloeDom = (await get('c-alice', 'team/i-chloe')).domicile;
    check(8, 'Domicile demandé à la première connexion et enregistré', askShown && !!chloeDom, chloeDom);
    await pC.close();
    /* 21-22. guide d'installation et affichage simplifié */
    const pT = await page('p-thi', at('2026-11-01', '20:00')); await sleep(1300);
    const guide = await pT.evaluate(() => !!document.querySelector('#modal:not([hidden]) .guide-step')); await shot(pT, '03-thi-guide');
    await pT.evaluate(() => ACT['guide-done']()); await sleep(400); await pT.evaluate(() => { go('p-home'); }); await sleep(400);
    const simple = await pT.evaluate(() => document.documentElement.dataset.simple === '1' && document.querySelectorAll('#navBottom button').length === 4);
    await shot(pT, '04-thi-affichage-simplifie'); await pT.close();
    check(21, 'Guide d’installation montré à la première connexion d’un parent', guide);
    check(22, 'Affichage simplifié : grands boutons, 3 onglets + Plus', simple);
    const pS0 = await page('p-sophie', at('2026-11-01', '20:00')); await pS0.evaluate(() => ACT['guide-done']()); await sleep(200); await pS0.evaluate(() => go('p-params')); await sleep(400); await shot(pS0, '05-sophie-reglages', true); await pS0.close();
    for (const p of PARENTS) await set(p.id, 'prefs/' + p.id, { ...(p.prefs || {}), guideVu: Date.now() });

    await tick(at('2026-11-01', '12:00'), at('2026-11-01', '23:45'));

    async function chrono(who, cid, d, h, o) {
      const t0 = at(d, h); await tick(at(d, '00:00'), t0);
      const pg = await page(who, t0 + 3600e3 * (o.dur || 1) + 5 * 60e3);
      await pg.evaluate(async () => { libLoad(); for (let i = 0; i < 20 && !S.libExtra; i++) await new Promise(r => setTimeout(r, 100)); });
      const res = await pg.evaluate(({ cid, sid, t0, o }) => {
        const m = 60000; const ev = []; let t = t0 + (o.wait || 3) * m; ev.push({ k: 'work', t });
        for (const [label, mins] of o.acts) { ev.push({ k: 'act', label, t }); t += mins * m; }
        (o.notes || []).forEach(([f, text], i) => ev.push({ k: 'note', f, text, t: t0 + (10 + i * 7) * m }));
        const ch = { start: t0, end: o.noEnd ? null : t, ev, axes: [], regulation: o.regul || null, compteurs: {}, rev: 1 };
        const s = (S.sessions[cid] || {})[sid]; if (!s) return { err: 'séance invisible' };
        return { patch: chFillPatch(S.children[cid], s, ch), ch, auto: [...autoAxes(ch)] };
      }, { cid, sid: cid + '-' + d, t0, o });
      if (res.err) { await pg.close(); return res; }
      const extra = o.noEnd ? { chrono: res.ch } : { chrono: res.ch, ...res.patch, statut: 'realisee', share: { on: true } };
      if (!o.noEnd) { if (o.message) extra.message = o.message; if (o.maison) extra.maison = o.maison; if (o.sign) extra.signature = { nom: o.sign, at: t0 + 65 * 60e3 }; }
      const r = await upd(who, `children/${cid}/sessions/${cid}-${d}`, extra); res.status = r.status();
      if (o.shot) { await pg.evaluate(({ cid, sid }) => go('chrono', { cid, sid }), { cid, sid: cid + '-' + d }); await sleep(500); await shot(pg, o.shot, true); }
      await pg.close(); return res;
    }

    /* ======== Lundi 2 ======== */
    await tick(at('2026-11-02', '00:00'), at('2026-11-02', '16:30'));
    await upd('i-emma', 'children/sarah/sessions/sarah-2026-11-02', { statut: 'realisee', activites: 'Lecture d’un album, comptage', message: 'Sarah a bien lu les couleurs !', comportement: 'Calme.', axes: [1, 3], maison: 'Relire l’album des couleurs.', share: { on: true } });
    const r1 = await chrono('i-samira', 'ines', '2026-11-02', '17:00', { dur: 1.5, acts: [['Écriture du prénom', 20], ['Lecture d’un album avec questions', 25], ['Memory à deux', 15]], notes: [['comportement', 'S’est levée deux fois, est revenue seule à table.'], ['message', 'Très belle séance !'], ['maison', 'Écrire son prénom sur une ardoise.']], sign: 'Sophie Moreau', shot: '06-minuteur-axes-activites' });
    check(18, 'Axes cochés d’après les axes rattachés à chaque activité', JSON.stringify(r1.auto.sort((a, b) => a - b)) === JSON.stringify([1, 2, 4, 7, 8, 12, 14]), 'axes : ' + r1.auto.join(','));
    /* Chloé ne remplit pas la séance de Yanis lundi : relance à 20 h */
    await tick(at('2026-11-02', '17:00'), at('2026-11-02', '21:00'));
    const relanceC = sent(x => toId(x) === 'i-chloe' && /Séance à remplir/.test(x.t));
    check(6, 'Relance du soir à l’intervenante pour une séance non remplie', relanceC.length === 1, relanceC.map(x => new Date(x.at).toISOString()).join());
    await set('p-sophie', 'fmsg/m1', { cid: 'ines', to: 'intervenante', text: 'Merci Samira pour cette séance !' });
    await tick(at('2026-11-02', '21:00'), at('2026-11-02', '23:45'));

    /* ======== Mardi 3 ======== */
    await tick(at('2026-11-03', '00:00'), at('2026-11-03', '08:45'));
    const relanceC2 = sent(x => toId(x) === 'i-chloe' && /Séance à remplir/.test(x.t));
    check(6, 'Deuxième relance le lendemain matin', relanceC2.length === 2);
    await upd('i-chloe', 'children/yanis/sessions/yanis-2026-11-02', { statut: 'realisee', activites: 'Numération, jeu de société', message: 'Séance correcte.', axes: [3], share: { on: true } });
    log('2026-11-03 08:45', 'Chloé', 'relancée deux fois, elle remplit la séance de lundi le lendemain matin (au lieu de mercredi)');
    /* 23. Julie demande à voir le déroulé en un geste */
    await upd('p-julie', 'children/lea', { demandeDeroule: Date.now() });
    const pA1 = await page('c-alice', at('2026-11-03', '09:00'), { name: 'atraiter' }, 1280); await sleep(800);
    const hasDr = await pA1.evaluate(() => (todoItems().deroule || []).length === 1);
    await pA1.click('[data-act="dr-ok"][data-c="lea"]'); await sleep(500); await pA1.close();
    const leaDoc = await get('c-alice', 'children/lea');
    check(23, 'La famille demande le déroulé en un geste, la coordination l’active depuis « À traiter »', hasDr && leaDoc.parentDeroule === true && !leaDoc.demandeDeroule);
    const r2 = await chrono('i-samira', 'lea', '2026-11-03', '16:45', { wait: 9, acts: [['Cartes des émotions', 15], ['Pictogrammes oui / non / pause', 15], ['Enfilage de grosses perles', 15]], notes: [['comportement', 'Une crise, retour au calme avec la carte pause.'], ['message', 'Léa a utilisé la carte pause seule !']], regul: 2, sign: 'Julie Martin' });
    /* 5. Fatou oublie de terminer le minuteur d'Adam */
    await chrono('i-fatou', 'adam', '2026-11-03', '18:00', { acts: [['Découpage sur les lignes', 20], ['Graphisme, dessin', 25]], notes: [['reactions', 'Tient mieux ses ciseaux.']], noEnd: true });
    await tick(at('2026-11-03', '17:00'), at('2026-11-03', '20:30'));
    const adam3 = await get('c-alice', 'children/adam/sessions/adam-2026-11-03');
    const autoMsg = sent(x => toId(x) === 'i-fatou' && /Minuteur arrêté/.test(x.t));
    check(5, 'Minuteur oublié arrêté automatiquement 1 h après la fin prévue, intervenante prévenue', adam3.chrono && adam3.chrono.end && adam3.chrono.autoEnd && adam3.statut === 'realisee' && autoMsg.length === 1, adam3.chrono && new Date(adam3.chrono.end).toISOString());
    /* 14. le message de Sophie à Samira n'a pas été lu */
    await tick(at('2026-11-03', '20:30'), at('2026-11-03', '21:00'));
    const unread = sent(x => /Message sans réponse depuis 24 h/.test(x.t));
    check(14, 'Message de famille non lu depuis 24 h : relance à l’intervenante et à la coordination', unread.length >= 3 && unread.some(x => toId(x) === 'i-samira'), unread.map(toId).join());
    /* 9. Thi prévient d'une absence pour mercredi, en un geste */
    await upd('p-thi', 'children/sarah/sessions/sarah-2026-11-04', { absence: { motif: 'fièvre' } }); await sleep(400);
    const absMsg = sent(x => /Absence signalée/.test(x.t));
    check(9, 'Absence signalée par la famille : intervenante et coordination prévenues tout de suite', absMsg.some(x => toId(x) === 'i-emma') && absMsg.some(x => toId(x) === 'c-alice'), absMsg.map(toId).join());
    await tick(at('2026-11-03', '21:00'), at('2026-11-03', '23:45'));

    /* ======== Mercredi 4 ======== */
    await tick(at('2026-11-04', '00:00'), at('2026-11-04', '08:30'));
    const pA2 = await page('c-alice', at('2026-11-04', '08:30'), { name: 'atraiter' }, 1280); await sleep(800);
    await shot(pA2, '07-a-traiter-mercredi', true);
    await pA2.click('[data-act="abs-ok"][data-s="sarah-2026-11-04"]'); await sleep(600); await pA2.close();
    const sarah4 = await get('c-alice', 'children/sarah/sessions/sarah-2026-11-04');
    check(9, 'La coordination confirme l’annulation depuis « À traiter »', sarah4.statut === 'annulee');
    await tick(at('2026-11-04', '08:30'), at('2026-11-04', '14:00'));
    const sarahRappel = sent(x => /Sarah/.test(x.t) && /^Rappel/.test(x.t) && x.at >= at('2026-11-03', '21:30') && x.at <= at('2026-11-04', '14:00'));
    check(9, 'Aucun rappel envoyé pour la séance d’un enfant absent', sarahRappel.length === 0, sarahRappel.map(x => x.t).join());
    await chrono('i-samira', 'ines', '2026-11-04', '10:00', { dur: 1.5, acts: [['Comptage avec gommettes', 20], ['Loto des animaux', 20], ['Parcours moteur dans le salon', 15]], notes: [['comportement', 'Très concentrée.'], ['maison', 'Compter les marches.']], sign: 'Sophie Moreau' });
    await tick(at('2026-11-04', '14:00'), at('2026-11-04', '23:45'));
    /* 19. relance devoir de Sarah (lundi) le mercredi à 18 h */
    const dvR = sent(x => toId(x) === 'p-thi' && /c’est fait/.test(x.t));
    check(19, 'Relance des devoirs sans réponse 2 jours après', dvR.length === 1, dvR.map(x => new Date(x.at).toISOString()).join());
    await upd('p-thi', 'children/sarah/sessions/sarah-2026-11-02', { maisonStatut: 'fait', maisonFait: true });

    /* ======== Jeudi 5 ======== */
    await tick(at('2026-11-05', '00:00'), at('2026-11-05', '07:45'));
    /* 15. Chloé déclare son indisponibilité */
    await set('i-chloe', 'indispos/x1', { uid: 'i-chloe', du: '2026-11-05', au: '2026-11-05', motif: 'malade', at: Date.now() });
    const pM = await page('c-myriam', at('2026-11-05', '08:00'), { name: 'atraiter' }, 1280); await sleep(800);
    const toRepl = await pM.evaluate(() => (todoItems().remplacer || []).map(x => x.s.id));
    check(15, 'Indisponibilité déclarée : la séance du jour apparaît « à remplacer »', toRepl.includes('yanis-2026-11-05'), toRepl.join());
    await pM.evaluate(() => evModal('yanis', 'yanis-2026-11-05')); await sleep(300); await pM.click('[data-act="rp-find"]'); await sleep(2500);
    await shot(pM, '08-trouver-remplacante');
    const rank = await pM.evaluate(() => [...document.querySelectorAll('#rplBox .rank')].map(r => r.innerText.split('\n')[0] + ' | ' + (r.querySelector('button').disabled ? 'non' : 'oui')));
    check(15, 'Proposition des remplaçantes disponibles, la plus proche en premier (sans l’intervenante absente)', rank.length >= 3 && /la plus proche/.test(rank[0]) && rank.some(x => /Chlo/.test(x)) === false, rank.join(' / '));
    await pM.click('[data-act="rp-set"][data-u="i-nadia"]'); await sleep(600); await pM.close();
    /* 1. Nadia voit l'enfant et seulement cette séance, et peut la remplir */
    const nadiaKids = (await list('i-nadia', 'children')).map(d => d.id);
    const nadiaSess = (await list('i-nadia', 'children/yanis/sessions')).map(d => d.id);
    const yanisDoc = await get('c-alice', 'children/yanis');
    const nMsg = sent(x => toId(x) === 'i-nadia' && /Remplacement/.test(x.t));
    check(1, 'Remplacement séance par séance : la remplaçante voit l’enfant et uniquement sa séance, l’enfant reste attribué à Chloé, Nadia est prévenue', nadiaKids.join() === 'yanis' && nadiaSess.join() === 'yanis-2026-11-05' && yanisDoc.intervenante === 'i-chloe' && nMsg.length === 1, `${nadiaKids} / ${nadiaSess}`);
    const tryOther = await upd('i-nadia', 'children/yanis/sessions/yanis-2026-11-02', { message: 'x' });
    const trySteal = await upd('i-nadia', 'children/yanis/sessions/yanis-2026-11-05', { intervenante: 'i-samira' });
    check(1, 'La remplaçante ne peut ni toucher aux autres séances ni se retirer elle-même', tryOther.status() === 403 && trySteal.status() === 403);
    await tick(at('2026-11-05', '08:00'), at('2026-11-05', '16:30'));
    await set('c-alice', 'activites/bataille', { t: 'Bataille des additions', d: 'Scolaire', m: 'Jeu de cartes', x: 'Additionner les deux cartes', axes: [3, 14], at: Date.now() });
    const rN = await chrono('i-nadia', 'yanis', '2026-11-05', '17:30', { acts: [['Bataille des additions', 25], ['Jeu de société', 15]], notes: [['comportement', 'A coupé la parole, mais a attendu son tour.'], ['message', 'Je remplaçais Chloé : beau travail sur les additions.'], ['maison', 'Jouer à la bataille des additions.']] });
    check(1, 'La remplaçante remplit la séance avec le minuteur', rN.status === 200, 'statut ' + rN.status);
    check(18, 'Une activité créée avec ses axes les coche dans le minuteur', rN.auto && rN.auto.includes(3) && rN.auto.includes(14), (rN.auto || []).join());
    await chrono('i-samira', 'lea', '2026-11-05', '16:45', { acts: [['Comptine à gestes', 15], ['Pâte à modeler : boudins et boules', 20]], notes: [['comportement', 'Aucune crise.'], ['message', 'Super séance !']], sign: 'Julie Martin' });
    /* 10. Julie demande un autre horaire pour samedi */
    await upd('p-julie', 'children/lea/sessions/lea-2026-11-07', { demandeHoraire: { date: '2026-11-07', heure: '10:30', msg: 'Plutôt 10h30 si possible' } }); await sleep(400);
    const dhMsg = sent(x => /Demande de changement d’horaire/.test(x.t));
    check(10, 'Demande de changement d’horaire : l’intervenante et la coordination sont prévenues', dhMsg.some(x => toId(x) === 'i-samira'), dhMsg.map(toId).join());
    await tick(at('2026-11-05', '16:30'), at('2026-11-05', '23:45'));

    /* ======== Vendredi 6 ======== */
    await tick(at('2026-11-06', '00:00'), at('2026-11-06', '09:00'));
    const pSam = await page('i-samira', at('2026-11-06', '09:00'), { name: 'atraiter' }); await sleep(600);
    await shot(pSam, '09-samira-a-traiter', true);
    await pSam.click('[data-act="dh-ok"][data-s="lea-2026-11-07"]'); await sleep(600); await pSam.close();
    const lea7 = await get('c-alice', 'children/lea/sessions/lea-2026-11-07');
    const moved = sent(x => toId(x) === 'p-julie' && /déplacée/.test(x.t));
    check(10, 'L’intervenante accepte en un geste : rendez-vous déplacé, famille prévenue', lea7.heure === '10:30' && lea7.demandeHoraire.statut === 'acceptee' && moved.length >= 1);
    await upd('i-fatou', 'children/adam/sessions/adam-2026-11-03', { activites: 'Découpage (20 min), graphisme (25 min)', message: 'Adam progresse au découpage.', share: { on: true } });
    const adamAfter = await get('c-alice', 'children/adam/sessions/adam-2026-11-03');
    check(5, 'Le déroulé de la séance au minuteur oublié est conservé', !!(adamAfter.chrono && adamAfter.chrono.ev && adamAfter.chrono.ev.length));
    await chrono('i-samira', 'ines', '2026-11-06', '17:00', { dur: 1.5, acts: [['Vignettes de couleurs à coller', 20], ['Consignes à deux étapes', 15]], notes: [['comportement', 'Fatiguée mais a tout fini.'], ['message', 'Fin de semaine fatigante.']], sign: 'Sophie Moreau' });
    await chrono('i-fatou', 'adam', '2026-11-06', '18:00', { acts: [['Écriture du prénom', 15], ['Motricité fine', 15]], notes: [['comportement', 'Concentré.']], sign: 'Moussa Diallo' });
    await upd('i-emma', 'children/sarah/sessions/sarah-2026-11-06', { statut: 'realisee', activites: 'Reprise douce', message: 'Contente de revenir.', share: { on: true } });
    /* 7. Thi confirme la présence à distance */
    const ss6 = await get('p-thi', 'children/sarah/sessions/sarah-2026-11-06');
    await upd('p-thi', 'children/sarah/sessions/sarah-2026-11-06', { signature: { nom: 'pirate', at: 1 } });
    await upd('p-thi', 'children/sarah/sessions/sarah-2026-11-02', { signature: {} });
    const sg = await get('c-alice', 'children/sarah/sessions/sarah-2026-11-06');
    check(7, 'Signature à distance : la famille confirme, nom et heure imposés par le serveur', !ss6.signature && sg.signature && sg.signature.distance && sg.signature.nom === 'Thi Nguyen' && sg.signature.at > 1000);
    /* 12. Alice désigne Aminata comme payeuse */
    await upd('c-alice', 'children/adam', { payeur: 'p-aminata' });
    /* 11 + 7. facturation : Myriam crée les factures ; la séance non signée de Yanis demande un motif */
    const pF = await page('c-myriam', at('2026-11-06', '20:30'), { name: 'equipe', extra: { tab: 'facturation' } }, 1280);
    for (const cid of ['ines', 'lea', 'adam', 'sarah', 'yanis']) {
      await pF.evaluate(() => { S.view.ftab = 'afacturer'; render(); }); await sleep(300);
      const b = await pF.$(`[data-act="f-create"][data-c="${cid}"]`); if (!b) continue; await b.click(); await sleep(600);
      if (await pF.$('#fmS')) { if (cid === 'yanis') await shot(pF, '10-facture-motif-non-signee'); await pF.selectOption('#fmS', 'Confirmée par téléphone'); await pF.click('[data-act="f-create-motif"]'); await sleep(900); }
    }
    await pF.close();
    const facts = (await list('c-myriam', 'factures')).map(d => ({ id: d.id, ...d.data }));
    const fy = facts.find(f => f.cid === 'yanis');
    check(7, 'Facturer une séance non signée demande un motif, gardé dans la facture', facts.length === 5 && fy && fy.motifNonSigne === 'Confirmée par téléphone', fy && fy.motifNonSigne);
    for (const f of facts) await upd('c-myriam', 'factures/' + f.id, { statut: 'transmise', transmiseAt: at('2026-11-06', '21:00') });
    const fMoussa = sent(x => toId(x) === 'p-moussa' && /paiement/.test(x.t));
    const fAminata = sent(x => toId(x) === 'p-aminata' && /paiement/.test(x.t));
    check(12, 'Payeur désigné : seule Aminata reçoit la demande de paiement d’Adam', fMoussa.length === 0 && fAminata.length >= 1);
    await tick(at('2026-11-06', '09:00'), at('2026-11-06', '23:45'));

    /* ======== Samedi 7 ======== */
    await chrono('i-samira', 'lea', '2026-11-07', '10:30', { acts: [['Memory à deux', 15], ['Cartes des émotions', 15]], notes: [['comportement', 'Bonne humeur.'], ['message', 'Belle fin de semaine.']], sign: 'Julie Martin' });
    for (const f of facts) { if (f.cid === 'ines') await upd('p-sophie', 'factures/' + f.id, { parentValide: true }); if (f.cid === 'adam') await upd('p-aminata', 'factures/' + f.id, { parentValide: true }); if (f.cid === 'lea') await upd('p-julie', 'factures/' + f.id, { parentValide: true }); }
    await tick(at('2026-11-07', '10:30'), at('2026-11-07', '22:00'));
    const u24 = sent(x => /Rappel : demande de paiement/.test(x.t));
    check(11, 'Relance URSSAF à 24 h : seulement les familles qui n’ont pas validé (Karim, Thi)', u24.length >= 2 && u24.every(x => ['p-karim', 'p-thi'].includes(toId(x))), [...new Set(u24.map(toId))].join());
    /* 16. validation mensuelle : Myriam valide novembre pour Fatou, la correction est ensuite refusée */
    await set('c-myriam', 'kmmois/i-fatou_2026-11', { uid: 'i-fatou', ym: '2026-11', valide: true, km: 128.4, at: Date.now(), byName: 'Myriam Kaci' });
    const lockTry = await set('i-fatou', 'kmjour/i-fatou_2026-11-06', { uid: 'i-fatou', date: '2026-11-06', km: 999 });
    const lockTryC = await set('c-myriam', 'deplacements/z', { uid: 'i-fatou', date: '2026-11-06', km: 5 });
    check(16, 'Mois de kilomètres validé : plus aucune correction possible, même par la coordination', lockTry.status() === 403 && lockTryC.status() === 403);
    const pK = await page('c-myriam', at('2026-11-07', '12:00'), { name: 'km', extra: { uid: 'i-fatou', kmode: 'mois', ref: '2026-11-07' } }, 1280); await sleep(1200); await shot(pK, '11-km-mois-valide', true); await pK.close();

    /* ======== Dimanche 8 : relances et récapitulatif ======== */
    await tick(at('2026-11-07', '22:00'), at('2026-11-08', '19:00'));
    const u40 = sent(x => /non validée/.test(x.t));
    check(11, 'Alerte à la coordination 40 h après transmission', u40.length >= 2 && u40.every(x => ['c-alice', 'c-myriam'].includes(toId(x))), u40.map(x => toId(x) + ':' + x.t).join(' / '));
    const recaps = sent(x => /^La semaine de/.test(x.t) && x.at >= at('2026-11-08', '00:00'));
    check(20, 'Récapitulatif hebdomadaire le dimanche à 18 h à chaque parent', recaps.length === 6 && recaps.every(x => x.ch === 'mail'), recaps.map(toId).join());

    /* ======== Rappels : contrôles de la semaine ======== */
    const rap = sent(x => /^Rappel : séance/.test(x.t));
    const by = id => rap.filter(x => toId(x) === id);
    check(3, 'Plus aucune famille injoignable : Karim (e-mail coupé, pas de téléphone) reçoit ses rappels par e-mail', by('p-karim').length >= 2 && by('p-karim').every(x => x.ch === 'mail'), by('p-karim').length + ' rappels');
    const dup = by('p-julie').length - new Set(by('p-julie').map(x => x.t + '@' + new Date(x.at).toISOString().slice(0, 10))).size;
    check(4, 'Un seul canal par rappel : Julie (téléphone activé) ne reçoit que des notifications, sans doublon', by('p-julie').length >= 4 && by('p-julie').every(x => x.ch === 'push') && dup === 0, by('p-julie').length + ' rappels');
    const amVeille = by('p-aminata').filter(x => /demain/.test(x.t)).length, mouVeille = by('p-moussa').filter(x => /demain/.test(x.t)).length;
    check(2, 'Rappels par parent : Moussa coupe la veille pour lui seul, Aminata la reçoit toujours', amVeille >= 1 && mouVeille === 0, `Aminata ${amVeille}, Moussa ${mouVeille}`);

    /* ======== Écrans de fin de semaine ======== */
    const pA3 = await page('c-alice', at('2026-11-07', '18:00'), { name: 'sres', extra: { cid: 'sarah', sid: 'sarah-2026-11-06' } }, 1280); await sleep(500);
    const cpl = await pA3.evaluate(() => !!document.querySelector('.cpl') && /Compte rendu \d\/5/.test(document.querySelector('#main').innerText));
    check(17, 'Compte rendu minimum : score sur 5 et ce qui manque, visibles dans la séance et dans « À traiter »', cpl);
    await shot(pA3, '12-completude-seance', true);
    await pA3.evaluate(() => go('atraiter')); await sleep(900); await pA3.evaluate(() => render()); await sleep(300); await shot(pA3, '13-a-traiter-samedi', true);
    const t3 = await pA3.evaluate(() => Object.fromEntries(Object.entries(todoItems()).map(([k, v]) => [k, v.length])));
    check(13, 'À traiter rassemble les points du jour en un seul écran', Object.keys(t3).length >= 2, JSON.stringify(t3));
    await pA3.evaluate(() => go('planning', { ref: '2026-11-05' })); await sleep(500); await shot(pA3, '14-planning-remplacement');
    await pA3.close();
    const pJ = await page('p-julie', at('2026-11-07', '12:00'), { name: 'p-agenda' }); await shot(pJ, '15-julie-agenda', true); await pJ.evaluate(() => go('p-seances')); await sleep(400); await shot(pJ, '16-julie-seances', true); await pJ.close();
    const pTh = await page('p-thi', at('2026-11-07', '12:00'), { name: 'p-seance', extra: { sid: 'sarah-2026-11-06' } }); await shot(pTh, '17-thi-seance-confirmee', true); await pTh.close();
    const pN = await page('i-nadia', at('2026-11-05', '08:30'), { name: 'home' }); await shot(pN, '18-nadia-ma-journee', true); await pN.close();
    const pAct = await page('c-alice', at('2026-11-07', '12:00'), { name: 'activites' }, 1280); await pAct.evaluate(() => { const a = libAll().find(x => x.t === 'Memory à deux'); actForm(a); }); await sleep(300); await shot(pAct, '19-activite-axes'); await pAct.close();

    const report = { checks: CHECKS, journal: LOG, refus: DENIED, erreursPage: PAGE_ERR, jobs: JOBS,
      envois: { mails: mails().map(m => ({ to: toId(m), t: m.subject, at: new Date(m.at).toISOString() })), push: pushes().map(x => ({ to: x.uid, t: x.title, at: new Date(x.at).toISOString() })) } };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    const ko = CHECKS.filter(c => !c.ok);
    console.log(`Contrôles : ${CHECKS.length - ko.length}/${CHECKS.length} réussis · erreurs d’écran : ${PAGE_ERR.length}`);
    if (PAGE_ERR.length) console.log(PAGE_ERR.slice(0, 5));
  } catch (e) { console.error('ERREUR SIMULATION', e); console.error(srvLog.slice(-3000)); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
