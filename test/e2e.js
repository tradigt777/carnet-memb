'use strict';
/* Test complet : démarre un serveur neuf, importe des données fictives, crée un compte par rôle
   et vérifie dans un vrai navigateur ce que chacun voit et peut faire. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const fixture = require('./fixture');

const PORT = 3902, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync('/tmp/memb-e2e-');
const OUT = process.env.OUT || path.join(DATA, 'shots');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, failN = 0; const fails = [];
const ok = (cond, label) => { if (cond) pass++; else { failN++; fails.push(label); console.log('ÉCHEC :', label); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = { 'X-MEMB': '1', 'Content-Type': 'application/json' };

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BASE_URL: BASE, OWNER_EMAIL: 'hasan@test.fr', OWNER_NAME: 'Hasan', OWNER_ID: 'u_owner', SMTP_HOST: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = ''; srv.stdout.on('data', d => srvLog += d); srv.stderr.on('data', d => srvLog += d);
  for (let i = 0; i < 50 && !fs.existsSync(path.join(DATA, 'premier-lien.txt')); i++) await sleep(100);
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (w = 390) => { const ctx = await browser.newContext({ viewport: { width: w, height: 844 } }); await ctx.route('**/fonts.googleapis.com/**', r => r.abort()); await ctx.route('**/cdnjs.cloudflare.com/**', r => r.abort()); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return { ctx, p, req: ctx.request }; };
  const setPw = async (p, link) => { await p.goto(link); await p.fill('#pw', 'MotDePasse2026'); await p.fill('#pw2', 'MotDePasse2026'); await p.click('#go'); await p.waitForURL('**/app', { timeout: 8000 }); await p.waitForFunction(() => typeof S !== 'undefined' && S.loaded && S.loaded.children, null, { timeout: 8000 }); await sleep(600); };
  const db = (req, body) => req.post(BASE + '/api/db', { headers: H, data: body });
  const dbj = async (req, body) => (await db(req, body)).json();

  try {
    /* ---- non connecté ---- */
    const anon = await mk();
    ok((await anon.req.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'children' } })).status() === 401, 'API refusée sans connexion');
    ok((await anon.req.get(BASE + '/_blob/22222222222222222222222222222222')).status() === 401, 'photo refusée sans connexion');
    await anon.p.goto(BASE + '/app'); ok(anon.p.url().includes('/login'), 'redirection vers la connexion');
    await anon.p.screenshot({ path: OUT + '/01-login.png' });

    /* ---- super admin ---- */
    const A = await mk(1280);
    await setPw(A.p, fs.readFileSync(path.join(DATA, 'premier-lien.txt'), 'utf8').trim());
    ok((await A.req.post(BASE + '/api/db', { headers: { 'Content-Type': 'application/json' }, data: { op: 'list', path: 'children' } })).status() === 403, 'écriture sans en-tête X-MEMB refusée');
    const imp = await (await A.req.post(BASE + '/api/admin/import', { headers: { 'X-MEMB': '1', 'Content-Type': 'application/octet-stream' }, data: Buffer.from(JSON.stringify(fixture())) })).json();
    ok(imp.docs === 15 && imp.blobs === 3, 'import des données : ' + JSON.stringify(imp));
    const lina = await dbj(A.req, { op: 'get', path: 'children/lina' });
    ok(lina.exists && lina.data.suivisExterieurs === undefined && lina.data.notes.pros === undefined && lina.data.notes.autres === 'contrat', 'champs santé retirés à l’import');
    const team = await (await A.req.get(BASE + '/api/admin/team')).json();
    ok(team.team.some(t => t.id === 'm-alice'), 'fiches équipe sans compte listées');
    const mkUser = async body => (await A.req.post(BASE + '/api/admin/users', { headers: H, data: body })).json();
    const rC = await mkUser({ id: 'm-alice', name: 'Alice M.', email: 'alice@test.fr', role: 'coordinatrice' });
    const rI = await mkUser({ id: 'm-samira', name: 'Samira B.', email: 'samira@test.fr', role: 'intervenante' });
    const rP = await mkUser({ name: 'Maman de Lina', email: 'parent@test.fr', role: 'parent', children: ['lina'] });
    ok(rC.link && rI.link && rP.link && rC.user.id === 'm-alice', 'création des comptes et liens d’invitation');
    ok((await mkUser({ name: 'X', email: 'parent@test.fr', role: 'parent' })).message, 'e-mail en double refusé');
    await A.p.reload(); await A.p.waitForFunction(() => S.loaded.children); await sleep(500);
    ok(await A.p.evaluate(() => S.role === 'admin' && Object.keys(S.children).length === 2), 'super admin : rôle et 2 dossiers');
    await A.p.screenshot({ path: OUT + '/02-admin-home.png' });
    await A.p.goto(BASE + '/admin'); await sleep(800); await A.p.screenshot({ path: OUT + '/03-admin-panel.png', fullPage: true });
    await A.p.click('[data-tab=sauvegardes]'); await sleep(600);
    await A.p.click('#bkNow'); await sleep(1500); await A.p.screenshot({ path: OUT + '/04-admin-backups.png', fullPage: true });
    const bks = await (await A.req.get(BASE + '/api/admin/backups')).json();
    ok(bks.backups.length === 1 && bks.backups[0].size > 1000, 'sauvegarde créée');
    ok((await A.req.get(BASE + '/api/admin/backups/' + bks.backups[0].name)).status() === 200, 'sauvegarde téléchargeable');

    /* ---- parent ---- */
    const P = await mk();
    await setPw(P.p, rP.link);
    ok(await P.p.evaluate(() => S.role === 'parent' && /^p-/.test(S.view.name)), 'parent : arrive dans l’espace famille');
    const pk = await dbj(P.req, { op: 'list', path: 'children' });
    ok(pk.docs.length === 1 && pk.docs[0].id === 'lina', 'parent : ne voit que son enfant');
    const pl = pk.docs[0].data; ok(!pl.obsInitiales && !pl.notes && !pl.tarif && !pl.suivisExterieurs, 'parent : champs internes de la fiche masqués');
    ok(!(await dbj(P.req, { op: 'get', path: 'children/adam' })).exists, 'parent : autre enfant inaccessible');
    ok((await dbj(P.req, { op: 'list', path: 'children/adam/sessions' })).docs.length === 0, 'parent : séances d’un autre enfant inaccessibles');
    const ps = (await dbj(P.req, { op: 'list', path: 'children/lina/sessions' })).docs;
    const s1 = ps.find(d => d.id === 's1').data, s2 = ps.find(d => d.id === 's2').data;
    ok(!s1.vigilance && !s1.pistes && !s1.historique && !s1.reactions && s1.activites === 'Puzzle des animaux', 'parent : notes internes et non partagées absentes');
    ok(!s2.activites && !s2.message, 'parent : séance non partagée vide');
    const pph = (await dbj(P.req, { op: 'list', path: 'children/lina/photos' })).docs;
    ok(pph.length === 1 && pph[0].id === 'p1', 'parent : photos non partagées masquées');
    ok((await dbj(P.req, { op: 'list', path: 'billing' })).docs.length === 0 && (await dbj(P.req, { op: 'list', path: 'tasks' })).docs.length === 0, 'parent : facturation et tâches inaccessibles');
    const tm = (await dbj(P.req, { op: 'get', path: 'team/m-samira' })).data; ok(tm && tm.nom && tm.role && Object.keys(tm).every(k => ['nom', 'prenom', 'role', 'photoId', 'photoUrl', 'bio', 'tel', 'email'].includes(k)), 'parent : fiche équipe réduite');
    ok((await db(P.req, { op: 'update', path: 'children/lina/sessions/s1', data: { parentNote: { stars: 5 }, historique: [{ at: 2, action: 'a noté la séance 5/5' }] } })).ok(), 'parent : peut noter une séance');
    const s1a = (await dbj(A.req, { op: 'get', path: 'children/lina/sessions/s1' })).data;
    ok(s1a.historique.length === 2 && s1a.vigilance === 'SECRET-VIGILANCE' && s1a.parentNote.stars === 5, 'note du parent ajoutée sans effacer l’historique ni les notes');
    ok((await db(P.req, { op: 'update', path: 'children/lina/sessions/s1', data: { vigilance: 'pirate' } })).status() === 403, 'parent : ne peut pas modifier les notes');
    ok((await db(P.req, { op: 'delete', path: 'children/lina/sessions/s1' })).status() === 403, 'parent : ne peut pas supprimer');
    ok((await db(P.req, { op: 'set', path: 'children/adam/sessions/x', data: { a: 1 } })).status() === 403, 'parent : ne peut pas écrire chez un autre enfant');
    ok((await P.req.post(BASE + '/api/assets', { headers: { 'X-MEMB': '1', 'Content-Type': 'image/jpeg' }, data: Buffer.from('x') })).status() === 403, 'parent : ne peut pas envoyer de fichiers');
    ok((await P.req.get(BASE + '/_blob/22222222222222222222222222222222')).status() === 200, 'parent : voit la photo partagée');
    ok((await P.req.get(BASE + '/admin', { maxRedirects: 0 })).status() === 302, 'parent : pas d’accès au panneau');
    const html = await P.p.content(); ok(!html.includes('SECRET'), 'parent : aucune donnée secrète dans la page');
    await P.p.screenshot({ path: OUT + '/05-parent-home.png' });
    await P.p.click('.tabbar [data-v="p-seances"]'); await sleep(500); await P.p.screenshot({ path: OUT + '/06-parent-seances.png' });
    await P.p.evaluate(() => go('p-params')); await sleep(400); await P.p.screenshot({ path: OUT + '/07-parent-params.png', fullPage: true });
    ok(await P.p.evaluate(() => !!document.querySelector('a[href="/logout"]')), 'parent : bouton se déconnecter');

    /* ---- intervenante ---- */
    const I = await mk();
    await setPw(I.p, rI.link);
    ok(await I.p.evaluate(() => S.role === 'intervenante' && Object.keys(S.children).join() === 'lina'), 'intervenante : ne voit que ses enfants');
    ok((await dbj(I.req, { op: 'list', path: 'billing' })).docs.length === 0, 'intervenante : pas de facturation');
    ok((await db(I.req, { op: 'set', path: 'children/adam/sessions/z', data: { a: 1 } })).status() === 403, 'intervenante : pas d’écriture hors de ses enfants');
    ok((await db(I.req, { op: 'delete', path: 'children/lina' })).status() === 403, 'intervenante : ne supprime pas de dossier');
    ok((await db(I.req, { op: 'update', path: 'children/lina', data: { intervenante: 'm-alice' } })).status() === 403, 'intervenante : ne réattribue pas un enfant');
    ok((await db(I.req, { op: 'update', path: 'team/m-samira', data: { bio: 'Bonjour', role: 'admin' } })).ok() && (await dbj(A.req, { op: 'get', path: 'team/m-samira' })).data.role === 'intervenante', 'intervenante : modifie sa fiche sans changer son rôle');
    ok((await I.req.get(BASE + '/admin', { maxRedirects: 0 })).status() === 302, 'intervenante : pas d’accès au panneau');
    await I.p.screenshot({ path: OUT + '/08-intervenante-home.png' });

    /* ---- en direct : une modification apparaît chez les autres sans recharger ---- */
    await A.p.goto(BASE + '/app'); await A.p.waitForFunction(() => S.loaded.children); await sleep(800);
    await db(I.req, { op: 'update', path: 'children/lina/sessions/s1', data: { activites: 'Puzzle puis lecture' } });
    let live = false; for (let i = 0; i < 30 && !live; i++) { await sleep(150); live = await A.p.evaluate(() => ((S.sessions.lina || {}).s1 || {}).activites === 'Puzzle puis lecture'); }
    ok(live, 'mise à jour en direct chez le super admin');
    let liveP = false; for (let i = 0; i < 30 && !liveP; i++) { await sleep(150); liveP = await P.p.evaluate(() => ((S.sessions.lina || {}).s1 || {}).activites === 'Puzzle puis lecture'); }
    ok(liveP, 'mise à jour en direct chez le parent');

    /* ---- coordinatrice ---- */
    const C = await mk(1024);
    await setPw(C.p, rC.link);
    ok(await C.p.evaluate(() => S.role === 'coordinatrice' && Object.keys(S.children).length === 2), 'coordinatrice : voit tous les dossiers');
    ok((await C.req.get(BASE + '/admin', { maxRedirects: 0 })).status() === 200, 'coordinatrice : accès au panneau');
    ok((await C.req.post(BASE + '/api/admin/users', { headers: H, data: { name: 'Y', email: 'y@test.fr', role: 'admin' } })).status() === 403, 'coordinatrice : ne crée pas de super admin');
    ok((await C.req.post(BASE + '/api/admin/backups', { headers: H })).status() === 403, 'coordinatrice : sauvegardes réservées au super admin');

    /* ---- parcours dans l'application (intervenante) : séance avec minuteur ---- */
    await I.p.evaluate(() => go('enfant', { id: 'lina', tab: 'journal' })); await sleep(500);
    await I.p.evaluate(() => chGo('lina', 's3')); await sleep(600);
    await I.p.click('[data-act="ch-start"]'); await sleep(400);
    await I.p.click('[data-act="ch-pick"]'); await sleep(400);
    await I.p.click('[data-act="ch-act"]'); await sleep(1500);
    const chr = (await dbj(A.req, { op: 'get', path: 'children/lina/sessions/s3' })).data.chrono;
    ok(chr && chr.ev.some(e => e.k === 'act'), 'minuteur : activité enregistrée sur le serveur');
    await I.p.screenshot({ path: OUT + '/09-intervenante-minuteur.png' });

    /* ---- mot de passe ---- */
    const F = await mk(); ok((await F.req.post(BASE + '/api/login', { headers: H, data: { email: 'samira@test.fr', password: 'MotDePasse2026' } })).ok(), 'connexion par mot de passe');
    ok((await F.req.post(BASE + '/api/password', { headers: H, data: { current: 'MotDePasse2026', password: 'court' } })).status() === 400, 'mot de passe trop court refusé');
    await F.p.goto(BASE + '/logout'); ok((await F.req.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'children' } })).status() === 401, 'déconnexion effective');
    for (let i = 0; i < 9; i++) await anon.req.post(BASE + '/api/login', { headers: H, data: { email: 'parent@test.fr', password: 'faux' } });
    ok((await anon.req.post(BASE + '/api/login', { headers: H, data: { email: 'parent@test.fr', password: 'MotDePasse2026' } })).status() === 429, 'blocage après trop d’essais');
    await A.p.goto(BASE + '/admin'); await sleep(500); await A.p.click('[data-tab=journal]'); await sleep(500); await A.p.screenshot({ path: OUT + '/10-admin-journal.png' });
  } catch (e) { failN++; fails.push('EXCEPTION ' + e.message); console.log(e); }
  ok(!errors.length, 'aucune erreur JavaScript dans les pages : ' + errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} vérifications réussies, ${failN} échec(s).`); if (fails.length) console.log(fails.join('\n'));
  console.log('Captures :', OUT);
  await browser.close(); srv.kill();
  if (/ERREUR/.test(srvLog)) console.log('Journal serveur :\n' + srvLog.split('\n').filter(l => /ERREUR/.test(l)).slice(0, 5).join('\n'));
  process.exit(failN ? 1 : 0);
})();
