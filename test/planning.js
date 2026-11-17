'use strict';
/* « Modifier le planning » : mardi 17h → mercredi 14h, jeudi supprimé, samedi ajouté ;
   séances réalisées/remplies intactes ; une seule notification ; droits d'accès. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const PORT = 3961, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync('/tmp/memb-pl-');
const OUT = path.join(__dirname, '..', 'sim-out4'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const H = { 'X-MEMB': '1', 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, l, d) => { if (c) pass++; else { fail++; console.log('ÉCHEC', l, d || ''); } };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dow = d => { const g = new Date(d + 'T12:00:00Z').getUTCDay(); return g === 0 ? 7 : g; };

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BASE_URL: BASE, OWNER_EMAIL: 'hasan@t.fr', OWNER_NAME: 'Hasan', OWNER_ID: 'u_owner', SMTP_HOST: '', NO_SCHED: '1', MAIL_STUB: path.join(DATA, 'mail.jsonl'), PUSH_STUB: '1', ROUTE_STUB: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !fs.existsSync(path.join(DATA, 'premier-lien.txt')); i++) await sleep(100);
  const browser = await chromium.launch(); const errs = [];
  const ctx = async (w = 390) => { const c = await browser.newContext({ viewport: { width: w, height: 900 } }); await c.route('**/fonts.googleapis.com/**', r => r.abort()); await c.route('**/cdnjs.cloudflare.com/**', r => r.abort()); return c; };
  const open = async (c, url) => { const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + url); return p; };
  const ready = p => p.waitForFunction(() => typeof S !== 'undefined' && S.loaded && S.loaded.children, null, { timeout: 15000 });
  const post = (c, url, data) => c.request.post(BASE + url, { headers: H, data });
  try {
    const A = await ctx(1280); const tok = new URL(fs.readFileSync(path.join(DATA, 'premier-lien.txt'), 'utf8').trim()).searchParams.get('t');
    await post(A, '/api/token/use', { token: tok, password: 'MotDePasse2026' });
    const mk = async b => (await post(A, '/api/admin/users', b)).json();
    const login = async (r, w) => { const c = await ctx(w); await post(c, '/api/token/use', { token: new URL(r.link).searchParams.get('t'), password: 'MotDePasse2026' }); return c; };
    const C = await login(await mk({ id: 'c-alice', name: 'Alice Maalouf', email: 'alice@t.fr', role: 'coordinatrice' }), 1280);
    const I = await login(await mk({ id: 'i-samira', name: 'Samira B.', email: 'samira@t.fr', role: 'intervenante' }));
    const I2 = await login(await mk({ id: 'i-fatou', name: 'Fatou D.', email: 'fatou@t.fr', role: 'intervenante' }));
    const P = await login(await mk({ id: 'p-julie', name: 'Julie Martin', email: 'julie@t.fr', role: 'parent', children: ['lea'] }));
    for (const [c, id] of [[C, 'c-alice'], [I, 'i-samira']]) await post(c, '/api/db', { op: 'update', path: 'team/' + id, data: { domicile: '10 rue de Paris, 92800 Puteaux' } });
    await post(C, '/api/db', { op: 'set', path: 'children/lea', data: { prenom: 'Léa', nom: 'Martin', intervenante: 'i-samira', adresse: '3 rue Voltaire, 92800 Puteaux', genre: 'f' } });
    /* planning : mardi 17h et jeudi 17h pendant 8 semaines à partir du prochain mardi */
    let mar = addDays('2026-11-17', 7); const today = new Date().toISOString().slice(0, 10); while (mar <= today || dow(mar) !== 2) mar = addDays(mar, 1);
    const ses = {};
    for (let w = 0; w < 8; w++) { ses['ma' + w] = { date: addDays(mar, 7 * w), heure: '17:00', duree: 1, statut: 'prevue' }; ses['je' + w] = { date: addDays(mar, 7 * w + 2), heure: '17:00', duree: 1.5, statut: 'prevue' }; }
    ses.ma2.activites = 'Déjà remplie'; // remplie : ne doit pas bouger
    ses.passe = { date: addDays(mar, -7), heure: '17:00', duree: 1, statut: 'realisee' };
    for (const [id, s] of Object.entries(ses)) await post(C, '/api/db', { op: 'set', path: 'children/lea/sessions/' + id, data: s });
    const get = async id => (await (await post(C, '/api/db', { op: 'get', path: 'children/lea/sessions/' + id })).json()).data;

    /* droits */
    ok((await post(P, '/api/planning/creneaux', { cid: 'lea', depuis: mar })).status() === 403, 'parent : pas d’accès');
    ok((await post(I2, '/api/planning/modifier', { cid: 'lea', depuis: mar, apercu: true, changes: {} })).status() === 403, 'autre intervenante : refusé');
    const cr = (await (await post(I, '/api/planning/creneaux', { cid: 'lea', depuis: mar })).json()).creneaux;
    ok(cr && cr.length === 2 && cr[0].cle === '2|17:00' && cr[0].n === 7 && cr[1].cle === '4|17:00' && cr[1].n === 8 && cr[1].duree === 1.5, 'créneaux détectés (mardi 7 hors séance remplie, jeudi 8, durée 1,5 h)', JSON.stringify(cr));

    /* parcours dans l'application (coordination, téléphone) */
    const pC = await open(C, '/app'); await ready(pC); await pC.evaluate(() => { closeModal(); go('enfant', { id: 'lea', tab: 'journal' }); }); await sleep(500);
    ok(!!(await pC.$('[data-act="pl17-open"]')), 'bouton « Modifier le planning » sur la fiche de l’enfant');
    await pC.screenshot({ path: OUT + '/01-fiche-bouton.png' });
    await pC.click('[data-act="pl17-open"]'); await sleep(200);
    await pC.fill('#plDep', mar); await pC.dispatchEvent('#plDep', 'change'); await sleep(800);
    ok(await pC.evaluate(() => S.pl17 && S.pl17.creneaux.length === 2), 'créneaux affichés dans la fenêtre');
    await pC.selectOption('#plA0', 'deplacer'); await sleep(200);
    await pC.selectOption('#plJ0', '3'); await pC.fill('#plH0', '14:00');
    await pC.selectOption('#plA1', 'supprimer'); await sleep(200);
    await pC.click('[data-act="pl17-add"]'); await sleep(200);
    await pC.selectOption('#paJ0', '6'); await pC.fill('#paH0', '10:00'); await pC.fill('#paD0', '1'); await pC.fill('#paF0', addDays(mar, 7 * 3 + 4));
    await pC.screenshot({ path: OUT + '/02-formulaire.png', fullPage: true });
    await pC.click('[data-act="pl17-prev"]'); await sleep(700);
    const ap = await pC.evaluate(() => S.pl17.apercu);
    ok(ap && ap.n === 7 + 8 + 4, 'aperçu : 7 déplacées + 8 annulées + 4 créées', ap && ap.n);
    await pC.screenshot({ path: OUT + '/03-apercu.png', fullPage: true });
    const before = fs.existsSync(path.join(DATA, 'mail.jsonl')) ? fs.readFileSync(path.join(DATA, 'mail.jsonl'), 'utf8').split('\n').filter(Boolean).length : 0;
    await pC.click('[data-act="pl17-go"]'); await sleep(1500);
    ok(await pC.evaluate(() => !S.pl17 && $('#modal').hidden), 'fenêtre fermée après confirmation');

    const m0 = await get('ma0'), m2 = await get('ma2'), j0 = await get('je0'), pa = await get('passe');
    ok(m0.date === addDays(mar, 1) && m0.heure === '14:00' && m0.duree === 1 && m0.statut === 'prevue', 'mardi 17h → mercredi 14h', JSON.stringify(m0));
    ok(m0.historique && /modification du planning/.test(m0.historique[m0.historique.length - 1].action), 'historique de la séance tracé');
    ok(m2.date === addDays(mar, 14) && m2.heure === '17:00', 'séance déjà remplie : intacte');
    ok(j0.statut === 'annulee' && j0.date === addDays(mar, 2), 'jeudi annulé');
    ok(pa.statut === 'realisee' && pa.date === addDays(mar, -7), 'séance passée : intacte');
    const all = (await (await post(C, '/api/db', { op: 'list', path: 'children/lea/sessions' })).json()).docs.map(d => d.data);
    const sam = all.filter(s => dow(s.date) === 6 && s.heure === '10:00' && s.statut === 'prevue');
    ok(sam.length === 4 && sam[0].lotPlanning, 'samedi 10h créé 4 fois', sam.length);
    const mails = fs.readFileSync(path.join(DATA, 'mail.jsonl'), 'utf8').split('\n').filter(Boolean).slice(before).map(l => JSON.parse(l));
    const toJulie = mails.filter(m => /julie/.test(JSON.stringify(m)));
    ok(toJulie.length === 1 && /Nouveau planning pour Léa/.test(JSON.stringify(toJulie[0])), 'famille : une seule notification', mails.length + ' mails : ' + mails.map(m => m.to + ' ' + m.subject).join(' | '));
    ok(mails.some(m => /samira/.test(JSON.stringify(m))), 'intervenante prévenue');
    /* la fenêtre d'un rendez-vous propose aussi le changement global */
    await pC.evaluate(() => { go('planning'); }); await sleep(300); await pC.evaluate(() => evModal('lea', 'ma0')); await sleep(200);
    ok(!!(await pC.$('#modal [data-act="pl17-open"]')), 'lien « Changer tout le planning » dans la fenêtre du rendez-vous');
    await pC.screenshot({ path: OUT + '/04-rendez-vous.png' });
    /* l'intervenante de l'enfant peut aussi le faire ; rien à changer = 0 */
    const r0 = await (await post(I, '/api/planning/modifier', { cid: 'lea', depuis: mar, changes: {} })).json();
    ok(r0.ok && r0.n === 0, 'aucun changement demandé : rien ne bouge');
    /* le parent ne voit pas le bouton */
    const pP = await open(P, '/app'); await ready(pP); await sleep(500); ok(!(await pP.$('[data-act="pl17-open"]')), 'parent : pas de bouton');
    console.log(`Planning : ${pass}/${pass + fail} contrôles réussis · erreurs d’écran : ${errs.length}`); if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) { console.error('ERREUR', e); console.error(log.slice(-2000)); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
