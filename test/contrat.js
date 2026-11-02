'use strict';
/* Parcours complet : une famille crée son espace, remplit son dossier (avec IBAN), la coordination prépare le contrat,
   le parent le signe au doigt ; contrat papier téléversé ; droits d'accès ; IBAN chiffré. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const PORT = 3960, BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync('/tmp/memb-ct-');
const OUT = path.join(__dirname, '..', 'sim-out3'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const H = { 'X-MEMB': '1', 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, l, d) => { if (c) pass++; else { fail++; console.log('ÉCHEC', l, d || ''); } };
const IBAN = 'FR76 3000 6000 0112 3456 7890 189';

(async () => {
  const srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), BASE_URL: BASE, OWNER_EMAIL: 'hasan@t.fr', OWNER_NAME: 'Hasan', OWNER_ID: 'u_owner', SMTP_HOST: '', NO_SCHED: '1', MAIL_STUB: path.join(DATA, 'mail.jsonl') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 60 && !fs.existsSync(path.join(DATA, 'premier-lien.txt')); i++) await sleep(100);
  const browser = await chromium.launch(); const errs = [];
  const ctx = async (w = 390) => { const c = await browser.newContext({ viewport: { width: w, height: 860 } }); await c.route('**/fonts.googleapis.com/**', r => r.abort()); await c.route('**/cdnjs.cloudflare.com/**', r => r.abort()); return c; };
  const open = async (c, url) => { const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(BASE + url); return p; };
  const ready = p => p.waitForFunction(() => typeof S !== 'undefined' && S.loaded && S.loaded.children, null, { timeout: 15000 });
  try {
    /* équipe */
    const A = await ctx(1280); const tok = new URL(fs.readFileSync(path.join(DATA, 'premier-lien.txt'), 'utf8').trim()).searchParams.get('t');
    await A.request.post(BASE + '/api/token/use', { headers: H, data: { token: tok, password: 'MotDePasse2026' } });
    const mk = async b => (await A.request.post(BASE + '/api/admin/users', { headers: H, data: b })).json();
    const rC = await mk({ id: 'c-alice', name: 'Alice Maalouf', email: 'alice@t.fr', role: 'coordinatrice' });
    const rI = await mk({ id: 'i-samira', name: 'Samira B.', email: 'samira@t.fr', role: 'intervenante' });
    const C = await ctx(1280); await C.request.post(BASE + '/api/token/use', { headers: H, data: { token: new URL(rC.link).searchParams.get('t'), password: 'MotDePasse2026' } });
    const I = await ctx(); await I.request.post(BASE + '/api/token/use', { headers: H, data: { token: new URL(rI.link).searchParams.get('t'), password: 'MotDePasse2026' } });
    /* adresse de l'intervenante modifiable par le super admin dans le panneau */
    const pAdm = await open(A, '/admin'); await sleep(900); await pAdm.click('[data-edit="i-samira"]'); await sleep(300);
    await pAdm.fill('#ef [name=domicile]', '12 rue de la République, 92800 Puteaux'); await pAdm.fill('#ef [name=kmTaux]', '0,636'.replace(',', '.'));
    await pAdm.screenshot({ path: OUT + '/01-admin-adresse-intervenante.png' }); await pAdm.click('#ef button.btn:not([type=button])'); await sleep(800); await pAdm.close();
    const tSam = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'team/i-samira' } })).json()).data;
    ok(tSam.domicile === '12 rue de la République, 92800 Puteaux' && tSam.kmTaux === 0.636, 'super admin : adresse et taux de l’intervenante enregistrés', JSON.stringify(tSam));
    /* l'intervenante la voit et peut la modifier dans ses paramètres */
    const pI = await open(I, '/app'); await ready(pI); await pI.evaluate(() => { closeModal(); go('parametres'); }); await sleep(400);
    const domField = await pI.$('input[data-k="domicile"]'); ok(!!domField && (await domField.inputValue()).includes('République'), 'intervenante : adresse visible et modifiable dans Paramètres');
    await pI.screenshot({ path: OUT + '/02-intervenante-parametres.png', fullPage: true }); await pI.close();
    /* signature de l'association enregistrée une fois */
    const pC0 = await open(C, '/app'); await ready(pC0); await pC0.evaluate(() => { closeModal(); go('parametres'); ACT['sa-edit'](); }); await sleep(300);
    await (await pC0.$('#saFile')).setInputFiles(process.env.SIG_IMG || require('path').join(__dirname, '..', '..', 'signature-alice.png')); await sleep(600);
    ok(await pC0.evaluate(() => /^data:image\/png/.test(S.saImport || '') && getComputedStyle(document.getElementById('saPrev')).display !== 'none'), 'signature importée depuis une image, fond rendu transparent');
    await pC0.screenshot({ path: OUT + '/01b-signature-importee.png' });
    await pC0.click('[data-act="sa-save"]'); await sleep(500); await pC0.close();
    const st = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'settings/main' } })).json()).data;
    ok(st && st.signatureAsso && /^data:image\/png/.test(st.signatureAsso.img), 'signature de l’association enregistrée');
    await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'set', path: 'contrats/auto1', data: { cid: 'zz', statut: 'a_signer', numero: 'T-1', contenu: {} } } });
    const auto1 = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'contrats/auto1' } })).json()).data;
    ok(auto1.signatureAsso && auto1.signatureAsso.img === st.signatureAsso.img, 'contrat envoyé sans signature : le serveur appose celle de l’association');
    await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'delete', path: 'contrats/auto1' } });

    /* 1. la famille crée son espace */
    const P = await ctx(); const pS = await open(P, '/inscription'); await sleep(300);
    await pS.screenshot({ path: OUT + '/03-inscription.png', fullPage: true });
    await pS.fill('#nm', 'Sophie Moreau'); await pS.fill('#em', 'sophie@t.fr'); await pS.fill('#pw', 'MotDePasse2026'); await pS.fill('#pw2', 'MotDePasse2026'); await pS.check('#ok'); await pS.click('#go');
    await pS.waitForURL('**/app', { timeout: 8000 }); await ready(pS); await sleep(1500); await pS.evaluate(() => { closeModal(); });
    const onForm = await pS.evaluate(() => !!document.getElementById('dPi')); ok(onForm, 'parent inscrit : arrive sur le dossier d’inscription');
    await pS.fill('#dPd', '1988-04-12'); await pS.fill('#dPl', 'Lyon, France'); await pS.fill('#dPa', '15 rue Voltaire, 92800 Puteaux'); await pS.fill('#dPt', '06 11 22 33 44');
    await pS.fill('#dPi', 'FR76 3000 6000 0112 3456 7890 180');
    await pS.fill('#dEp', 'Inès'); await pS.fill('#dEn', 'Moreau'); await pS.fill('#dEd', '2019-03-02'); await pS.fill('#dEc', 'CP'); await pS.fill('#dSv', '3'); await pS.fill('#dSj', 'lundi, mercredi'); await pS.fill('#dSh', '17 h');
    await pS.click('[data-act="dz-send"]'); await sleep(700);
    const badIban = (await (await P.request.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'dossiers' } })).json()).docs[0].data;
    ok(badIban.statut !== 'envoye', 'IBAN erroné refusé (clé de contrôle)');
    await pS.fill('#dPi', IBAN); await pS.click('[data-act="dz-send"]'); await sleep(800);
    await pS.screenshot({ path: OUT + '/04-dossier-envoye.png', fullPage: true });
    const dos = (await (await P.request.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'dossiers' } })).json()).docs[0];
    ok(dos.data.statut === 'envoye' && /•/.test(dos.data.parent.iban) && dos.data.parent.iban.endsWith('0189'), 'dossier envoyé ; le parent voit son IBAN masqué', dos.data.parent.iban);
    const raw = new Database(path.join(DATA, 'memb.sqlite'), { readonly: true }).prepare("SELECT data FROM docs WHERE path LIKE 'dossiers/%'").get().data;
    ok(!raw.includes('30006000') && raw.includes('iban_enc'), 'IBAN chiffré dans la base');
    ok((await (await I.request.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'dossiers' } })).json()).docs.length === 0, 'intervenante : aucun accès aux dossiers');
    const cDos = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'dossiers/' + dos.id } })).json()).data;
    ok(cDos.parent.iban === 'FR76 3000 6000 0112 3456 7890 189', 'coordination : IBAN complet pour l’URSSAF', cDos.parent.iban);
    const mails = fs.readFileSync(path.join(DATA, 'mail.jsonl'), 'utf8'); ok(/Nouvelle inscription : Inès Moreau/.test(mails), 'coordination prévenue de la nouvelle inscription');

    /* 2. la coordination prépare le contrat depuis « À traiter » */
    const pC = await open(C, '/app'); await ready(pC); await pC.evaluate(() => { closeModal(); go('atraiter'); }); await sleep(800);
    await pC.screenshot({ path: OUT + '/05-a-traiter-inscription.png' });
    await pC.click('[data-act="go-dossier"]'); await sleep(500); await pC.selectOption('#kxI', 'i-samira'); await pC.fill('#kxD', '2026-11-09');
    await pC.screenshot({ path: OUT + '/06-dossier-preparer-contrat.png', fullPage: true });
    await pC.click('[data-act="kx-go"]'); await sleep(2500);
    const ks = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'contrats' } })).json()).docs;
    const k = ks[0];
    ok(ks.length === 1 && k.data.statut === 'a_signer' && k.data.numero === 'MEMB-001-2026' && k.data.contenu.fin === '2027-05-08', 'contrat préparé (numéro, fin à 6 mois hors juillet-août)', k && JSON.stringify({ n: k.data.numero, fin: k.data.contenu.fin }));
    const kid = k.data.cid; const child = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'children/' + kid } })).json()).data;
    ok(child && child.prenom === 'Inès' && child.adresse && child.intervenante === 'i-samira', 'dossier enfant créé et intervenante attribuée');
    await pC.close();

    /* 3. le parent signe au doigt */
    const pP = await open(P, '/app'); await ready(pP); await sleep(1800); await pP.evaluate(() => ACT['guide-done']()); await sleep(300);
    const hasKid = await pP.evaluate(() => !!paChild()); ok(hasKid, 'parent rattaché à l’enfant');
    await pP.evaluate(id => go('p-contrat', { kid: id }), k.id); await sleep(600);
    await pP.screenshot({ path: OUT + '/07-contrat-a-signer.png', fullPage: true });
    const txt = await pP.evaluate(() => document.getElementById('contrat').innerText);
    ok(/Lyon, France/.test(txt) && /12\/04\/1988/.test(txt) && /FR76 •••• •••• •••• 0189/.test(txt) && /9\.1 Vos avis/.test(txt), 'contrat rempli : naissance, IBAN masqué, clause avis');
    await (await pP.$('#sigK')).scrollIntoViewIfNeeded(); await sleep(200); const sb = await (await pP.$('#sigK')).boundingBox(); await pP.mouse.move(sb.x + 30, sb.y + 100); await pP.mouse.down(); for (let i = 0; i < 35; i++) await pP.mouse.move(sb.x + 30 + i * 8, sb.y + 100 + Math.cos(i / 2) * 30); await pP.mouse.up();
    await pP.check('#sigOk'); await pP.fill('#sigLieu', 'Puteaux'); await pP.click('[data-act="k-sign"]'); await sleep(1200);
    const k2 = (await (await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'get', path: 'contrats/' + k.id } })).json()).data;
    ok(k2.signatureAsso && k2.signatureAsso.img === st.signatureAsso.img, 'contrat signé des deux parties (association + famille)');
    ok(k2.statut === 'signe' && k2.signatureClient.nom === 'Sophie Moreau' && /^data:image\/png/.test(k2.signatureClient.img) && k2.signatureClient.empreinte.length === 64, 'contrat signé, horodaté, empreinte du texte');
    const reSign = await P.request.post(BASE + '/api/db', { headers: H, data: { op: 'update', path: 'contrats/' + k.id, data: { signatureClient: { img: k2.signatureClient.img } } } });
    ok(reSign.status() === 403, 'un contrat signé ne peut plus être modifié');
    await pP.evaluate(id => go('p-contrat', { kid: id }), k.id); await sleep(500); await pP.screenshot({ path: OUT + '/08-contrat-signe.png', fullPage: true });
    await pP.evaluate(() => go('p-docs')); await sleep(400); await pP.screenshot({ path: OUT + '/09-documents-famille.png', fullPage: true }); await pP.close();

    /* 4. contrat papier téléversé, visible par la famille uniquement */
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const up = await (await C.request.post(BASE + '/api/contrats/upload?cid=' + kid, { headers: { 'X-MEMB': '1', 'Content-Type': 'application/pdf' }, data: pdf })).json();
    await C.request.post(BASE + '/api/db', { headers: H, data: { op: 'set', path: 'contrats/scan1', data: { cid: kid, type: 'televerse', statut: 'signe', nom: 'Contrat papier 2025', fichier: { id: up.id, url: up.url, mime: 'application/pdf' }, creeLe: Date.now() } } });
    ok((await P.request.get(BASE + up.url)).status() === 200, 'famille : peut ouvrir le contrat papier téléversé');
    const P2 = await ctx(); const r2 = await P2.request.post(BASE + '/api/inscription', { headers: H, data: { name: 'Autre Parent', email: 'autre@t.fr', password: 'MotDePasse2026', accepte: true } });
    ok(r2.ok(), 'deuxième inscription');
    ok((await P2.request.get(BASE + up.url)).status() === 403, 'autre famille : contrat papier inaccessible');
    ok((await (await P2.request.post(BASE + '/api/db', { headers: H, data: { op: 'list', path: 'contrats' } })).json()).docs.length === 0, 'autre famille : aucun contrat visible');
    ok((await I.request.get(BASE + up.url)).status() === 403, 'intervenante : contrat papier inaccessible');
    ok((await P2.request.post(BASE + '/api/inscription', { headers: H, data: { name: 'X Y', email: 'sophie@t.fr', password: 'MotDePasse2026', accepte: true } })).status() === 400, 'inscription avec un e-mail existant refusée');
    console.log(`Contrats : ${pass}/${pass + fail} contrôles réussis · erreurs d’écran : ${errs.length}`); if (errs.length) console.log(errs.slice(0, 5));
  } catch (e) { console.error('ERREUR', e); console.error(log.slice(-2000)); process.exitCode = 1; }
  finally { await browser.close(); srv.kill(); }
})();
