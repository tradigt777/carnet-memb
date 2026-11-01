/* ================= v14 : rappels, GPS, kilomètres, factures URSSAF, devoirs, messages des familles, minuteur ================= */
(function(){const st=document.createElement('style');st.textContent=`
.navbtns{display:flex;gap:6px;flex-wrap:wrap}.navbtns a{white-space:nowrap}
.leg{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0;border-bottom:.5px solid var(--line)}.leg:last-child{border-bottom:0}
.leg .from{font-size:.8rem;color:var(--muted)}.leg .km{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.kmday{display:flex;flex-direction:column;gap:6px}.kmtot{font-size:1.6rem;font-weight:700;font-variant-numeric:tabular-nums}
.fact{display:flex;flex-direction:column;gap:8px;padding:12px 0;border-bottom:.5px solid var(--line)}.fact:last-child{border-bottom:0}
.stpill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:.78rem;font-weight:600}
.devoir{display:flex;flex-direction:column;gap:8px;padding:12px 0;border-bottom:.5px solid var(--line)}.devoir:last-child{border-bottom:0}
.devoir .acts{display:flex;gap:6px;flex-wrap:wrap}.devoir .acts .btn[aria-pressed="true"]{box-shadow:inset 0 0 0 2px currentColor}
.fthread{display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto;padding:4px 2px}
.fb{max-width:85%;padding:9px 12px;border-radius:16px;font-size:.94rem;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.fb.me{align-self:flex-end;background:var(--nav);color:#fff;border-bottom-right-radius:6px}.fb.them{align-self:flex-start;background:var(--fill);border-bottom-left-radius:6px}
.fb .meta{display:block;font-size:.7rem;opacity:.75;margin-top:3px}
.ax-auto{font-size:.68rem;font-weight:600;border-radius:6px;padding:1px 5px;background:var(--azu-bg);color:var(--azu-ink);margin-left:4px}
.chip-b.off{opacity:.5;text-decoration:line-through}
.rset{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:10px 0;border-bottom:.5px solid var(--line)}.rset:last-child{border-bottom:0}
.rset select{width:auto;min-height:38px;padding:4px 8px}
@media (max-width:600px){.fb{max-width:92%}}`;document.head.appendChild(st)})();

/* ---------- données partagées ---------- */
S.factures=[];S.devoirs=[];S.fmsg=[];S.deplacements=[];S.kmjour={};
const _bootExtra14=bootExtra;
bootExtra=function(db){_bootExtra14(db);
  const sub=(col,cb)=>{try{db.collection(col).onSnapshot(q=>{cb(q.docs.map(d=>({id:d.id,...d.data()})));softRender14()},()=>{})}catch(e){}};
  sub('factures',l=>S.factures=l);sub('devoirs',l=>S.devoirs=l);sub('fmsg',l=>{S.fmsg=l.sort((a,b)=>a.at-b.at)});
  sub('prefs',l=>{S.prefs={};l.forEach(x=>S.prefs[x.id]=x)});
  if(S.role!=='parent'){sub('deplacements',l=>S.deplacements=l);sub('kmjour',l=>{S.kmjour={};l.forEach(x=>S.kmjour[x.id]=x)})}};
function softRender14(){if(S.dirty)return;if(['p-messages','messages'].includes(S.view.name)&&document.activeElement&&document.activeElement.tagName==='TEXTAREA'){renderChrome();paintThread14();return}render()}
const meId=()=>actingId()||S.me.id;
const fmtH=h=>(h||'').replace(':','h');
const addrOf=c=>String((c&&c.adresse)||'').trim();
const homeOf=uid=>String(((S.team[uid]||{}).domicile)||'').trim();
const travelerOf=(c,s)=>s.intervenante||c.intervenante||'';
const eur2=x=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(Number(x)||0);

/* ======================= 1. NAVIGATION GPS ======================= */
const gmapsUrl=(dest,origin)=>'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(dest)+(origin?'&origin='+encodeURIComponent(origin):'');
const wazeUrl=dest=>'https://waze.com/ul?navigate=yes&q='+encodeURIComponent(dest);
function navBtns(dest,origin,lbl){if(!dest)return '';return `<span class="navbtns"><a class="btn ghost sm" href="${gmapsUrl(dest,origin)}" target="_blank" rel="noopener">${I.map}${lbl||'Google Maps'}</a><a class="btn ghost sm" href="${wazeUrl(dest)}" target="_blank" rel="noopener">${I.map}Waze</a></span>`}
/* étapes de la journée d'une personne : domicile → rdv → rdv → domicile */
function dayStops(uid,d){const out=[];Object.values(S.children).forEach(c=>sessionsOf(c.id).forEach(s=>{if(s.date===d&&s.statut!=='annulee'&&travelerOf(c,s)===uid)out.push({c,s})}));return out.sort((a,b)=>(a.s.heure||'99').localeCompare(b.s.heure||'99'))}
function originFor(uid,c,s){const st=dayStops(uid,s.date);const i=st.findIndex(x=>x.s.id===s.id);const prev=i>0?st[i-1]:null;if(prev&&addrOf(prev.c))return {addr:addrOf(prev.c),lbl:'Depuis le rdv de '+prev.c.prenom};const h=homeOf(uid);return h?{addr:h,lbl:'Depuis le domicile'}:null}
function navBlock(c,s){const dest=addrOf(c);if(!dest)return `<div class="tiny muted">Adresse des séances non renseignée dans la fiche de ${esc(c.prenom)}.</div>`;const uid=travelerOf(c,s)||meId();const o=originFor(uid,c,s);
  return `<div class="stack" style="gap:6px"><div class="row" style="gap:6px">${I.pin}<span class="small">${esc(dest)}</span></div>${navBtns(dest,'', 'Google Maps')}${o?`<div class="row" style="gap:6px;align-items:center"><span class="tiny muted">${esc(o.lbl)} :</span><a class="btn link sm" href="${gmapsUrl(dest,o.addr)}" target="_blank" rel="noopener">Itinéraire complet</a></div>`:''}</div>`}
/* fenêtre d'un rendez-vous du planning */
const _evModal14=evModal;
evModal=function(cid,sid){_evModal14(cid,sid);const c=S.children[cid],s=(S.sessions[cid]||{})[sid];const box=document.querySelector('#modal .sheet .card.flat');if(!c||!s||!box)return;const d=document.createElement('div');d.className='card flat';d.style.marginBottom='10px';d.innerHTML=`<b class="small">Y aller</b><div style="margin-top:8px">${navBlock(c,s)}</div>`;box.parentNode.insertBefore(d,box)};
/* « Ma journée » : boutons Google Maps / Waze, depuis le domicile ou le rendez-vous précédent */
const _myDay14=myDay;
myDay=function(){let h=_myDay14();const t=today();
  h=h.replace(/<a class="btn ghost sm" href="https:\/\/maps\.apple\.com\/\?q=([^"]*)" target="_blank" rel="noopener">[\s\S]*?Itinéraire<\/a>/g,(m,q)=>{const dest=decodeURIComponent(q);let c=null,s=null;Object.values(S.children).some(k=>{if(addrOf(k)!==dest)return false;const x=sessionsOf(k.id).find(y=>y.date===t&&y.statut!=='annulee');if(x){c=k;s=x;return true}return false});
    const o=c&&s?originFor(travelerOf(c,s)||meId(),c,s):null;return `<a class="btn ghost sm" href="${gmapsUrl(dest,o&&o.addr)}" target="_blank" rel="noopener">${I.map}Maps</a><a class="btn ghost sm" href="${wazeUrl(dest)}" target="_blank" rel="noopener">${I.map}Waze</a>`});
  if(role()!=='parent'&&!isManager()&&!homeOf(meId()))h=h+`<div class="banner small" style="margin-top:-6px">Indique ton adresse de domicile dans <a href="#" data-act="nav" data-v="km">Déplacements</a> : le GPS partira de chez toi et tes kilomètres seront calculés.</div>`;
  return h};

/* ======================= 2. KILOMÈTRES ======================= */
const RT={};const RT_PEND=new Set();let RT_BUSY=false;
const rtKey=(a,b)=>a.toLowerCase()+'|'+b.toLowerCase();
function rtGet(a,b){if(!a||!b)return null;if(a.toLowerCase()===b.toLowerCase())return {km:0,src:'identique'};return RT[rtKey(a,b)]||RT[rtKey(b,a)]||null}
function rtNeed(a,b){if(!a||!b||rtGet(a,b))return;RT_PEND.add(JSON.stringify([a,b]))}
async function rtFlush(){if(RT_BUSY||!RT_PEND.size)return;RT_BUSY=true;try{while(RT_PEND.size){const batch=[...RT_PEND].slice(0,12);batch.forEach(x=>RT_PEND.delete(x));const pairs=batch.map(x=>JSON.parse(x));
  const r=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json','X-MEMB':'1'},credentials:'same-origin',body:JSON.stringify({pairs})});if(!r.ok)break;const j=await r.json();
  pairs.forEach(([a,b],i)=>{RT[rtKey(a,b)]=j.results[i]||{km:null}});if(S.view.name==='km')softRender()}}catch(e){}RT_BUSY=false}
function legsOf(uid,d){const home=homeOf(uid);const st=dayStops(uid,d);if(!st.length)return {stops:st,legs:[]};const pts=[];if(home)pts.push({addr:home,lbl:'Domicile'});st.forEach(x=>pts.push({addr:addrOf(x.c),lbl:x.c.prenom+(x.s.heure?' · '+fmtH(x.s.heure):''),c:x.c,s:x.s}));if(home)pts.push({addr:home,lbl:'Domicile'});
  const legs=[];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];const r=rtGet(a.addr,b.addr);if(!r)rtNeed(a.addr,b.addr);legs.push({a,b,r,miss:!a.addr||!b.addr})}if(!home)legs.push({a:{lbl:'Domicile',addr:''},b:{lbl:'Domicile',addr:''},r:null,miss:true,noHome:true});return {stops:st,legs,home}}
function extrasOf(uid,d){return S.deplacements.filter(x=>x.uid===uid&&x.date===d&&!x.deleted)}
function dayKm(uid,d){const fix=S.kmjour[uid+'_'+d];const {legs}=legsOf(uid,d);const auto=legs.reduce((a,l)=>a+(l.r&&l.r.km!=null?l.r.km:0),0);const missing=legs.some(l=>l.miss||!l.r||l.r.km==null);const extra=extrasOf(uid,d).reduce((a,x)=>a+(Number(x.km)||0),0);
  const base=fix&&fix.km!=null&&fix.km!==''?Number(fix.km):auto;return {auto,extra,total:base+extra,fixed:!!(fix&&fix.km!=null&&fix.km!==''),missing:missing&&!(fix&&fix.km!=null&&fix.km!==''),legs,note:fix&&fix.note}}
const kmTaux=uid=>Number((S.team[uid]||{}).kmTaux)||Number(S.settings.kmTaux)||0;
const f1km=x=>(Math.round((x||0)*10)/10).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1});
function kmPeople(){const t=Object.values(S.team).filter(m=>['intervenante','coordinatrice','admin'].includes(m.role));if(isManager())return t.sort((a,b)=>(pName(a.id)||'').localeCompare(pName(b.id)||''));return t.filter(m=>m.id===meId())}
function vKm(){const ppl=kmPeople();let uid=S.view.uid||(ppl.find(p=>p.id===meId())?meId():(ppl[0]||{}).id);if(!uid)return `<div class="card">${emptyBox('Aucun membre','')}</div>`;S.view.uid=uid;
  const mode=S.view.kmode||'semaine';const ref=S.view.ref||today();const m=S.team[uid]||{};const home=homeOf(uid);const can=isManager()||uid===meId();
  let from,to,title;if(mode==='semaine'){from=mondayOf(ref);to=addDays(from,6);title=`Semaine du ${fmtLong(from)}`}else{from=ref.slice(0,7)+'-01';to=addDays(addMonths(from,1),-1);title=monthLbl(from.slice(0,7)).replace(/^./,x=>x.toUpperCase())}
  const days=[];for(let d=from;d<=to;d=addDays(d,1))days.push(d);
  const rows=days.map(d=>({d,...dayKm(uid,d),n:dayStops(uid,d).length,ex:extrasOf(uid,d)})).filter(r=>r.n||r.ex.length||r.fixed);
  setTimeout(rtFlush,30);
  const tot=rows.reduce((a,r)=>a+r.total,0);const tx=kmTaux(uid);const miss=rows.filter(r=>r.missing).length;
  const head=`<div class="lt"><div class="ttl">${it('map','men')}<div><div class="eyebrow">Déplacements</div><h1>${esc(title)}</h1><div class="sub">${esc(pName(uid)||'')}${m.role?' · '+esc(ROLES[m.role]||''):''}</div></div></div>
   <div class="row" style="gap:6px"><div class="tabs">${[['semaine','Semaine'],['mois','Mois']].map(([k,l])=>`<button aria-selected="${mode===k}" data-act="km-mode" data-m="${k}">${l}</button>`).join('')}</div><button class="btn ghost sm" data-act="km-move" data-d="-1" aria-label="Précédent">${I.back}</button><button class="btn ghost sm" data-act="km-today">Aujourd’hui</button><button class="btn ghost sm" data-act="km-move" data-d="1" aria-label="Suivant"><span style="display:inline-flex;transform:scaleX(-1)">${I.back}</span></button></div></div>`;
  const pick=ppl.length>1?`<label class="f" style="max-width:340px"><span>Personne</span><select id="kmWho">${ppl.map(p=>`<option value="${p.id}" ${p.id===uid?'selected':''}>${esc(pName(p.id)||'Membre')} · ${esc(ROLES[p.role]||'')}</option>`).join('')}</select></label>`:'';
  const homeCard=`<div class="card stack" style="gap:10px"><div class="card-h" style="margin:0"><div class="l">${it('home','azu')}<h3>Point de départ</h3></div></div>
   ${can?`<div class="fields two"><label class="f"><span>Adresse du domicile</span><input type="text" data-member="${uid}" data-k="domicile" value="${esc(home)}" placeholder="N°, rue, code postal, ville"></label><label class="f"><span>Taux du forfait (€ par km)</span><input type="number" step="0.001" min="0" data-member="${uid}" data-k="kmTaux" value="${esc(m.kmTaux??'')}" placeholder="${S.settings.kmTaux?String(S.settings.kmTaux).replace('.',','):'ex. 0,636'}"></label></div><p class="tiny muted" style="margin:0">L’adresse n’est visible que par la personne et la coordination. Les distances sont calculées en voiture, par la route.</p>`:`<div class="small">${home?esc(home):'<span class="muted">Domicile non renseigné</span>'}</div>`}
   ${!home?`<div class="banner cor small">Sans adresse de domicile, seuls les trajets entre rendez-vous sont comptés.</div>`:''}</div>`;
  const stats=`<div class="stats"><div class="stat men">${I.map}<b>${f1km(tot)} km</b><span>${mode==='semaine'?'cette semaine':'ce mois'}</span></div><div class="stat azu">${I.cal}<b>${rows.reduce((a,r)=>a+r.n,0)}</b><span>rendez-vous</span></div><div class="stat saf">${I.euro}<b>${tx?eur2(tot*tx):'—'}</b><span>${tx?'forfait à '+String(tx).replace('.',',')+' €/km':'taux non renseigné'}</span></div><div class="stat ${miss?'cor':'lav'}">${I.alert}<b>${miss}</b><span>jour${miss>1?'s':''} à vérifier</span></div></div>`;
  let body='';
  if(mode==='semaine')body=rows.length?rows.map(r=>`<div class="card kmday"><div class="row between"><b>${jourSem(r.d)} ${fmtLong(r.d)}</b><span class="kmtot" style="font-size:1.1rem">${f1km(r.total)} km${r.fixed?' <span class="chip saf">corrigé</span>':''}</span></div>
     <div>${r.legs.filter(l=>l.noHome).map(()=>`<div class="leg"><div><div class="from">Domicile → rendez-vous → domicile</div><div class="tiny" style="color:var(--cor-ink)">Adresse du domicile manquante : trajets aller et retour non comptés</div></div><div class="km">—</div></div>`).join('')}${r.legs.filter(l=>!l.noHome).map(l=>`<div class="leg"><div><div class="from">${esc(l.a.lbl)} → ${esc(l.b.lbl)}</div>${l.miss?`<div class="tiny" style="color:var(--cor-ink)">Adresse manquante${!l.b.addr&&l.b.c?' (fiche de '+esc(l.b.c.prenom)+')':''}</div>`:''}</div><div class="km">${l.r?(l.r.km==null?'<span class="tiny" style="color:var(--cor-ink)">introuvable</span>':f1km(l.r.km)+' km'+(l.r.src==='estimation'?' <span class="tiny muted">≈</span>':'')):l.miss?'—':'<span class="tiny muted">calcul…</span>'}</div>
       ${l.b.addr?`<div style="grid-column:1/-1">${l.a.addr?`<a class="btn link sm" href="${gmapsUrl(l.b.addr,l.a.addr)}" target="_blank" rel="noopener">${I.map}Google Maps</a>`:''}<a class="btn link sm" href="${wazeUrl(l.b.addr)}" target="_blank" rel="noopener">${I.map}Waze</a></div>`:''}</div>`).join('')}
     ${r.ex.map(x=>`<div class="leg"><div><div class="from">${esc(x.motif||'Autre déplacement')}</div><div class="tiny muted">${esc([x.de,x.vers].filter(Boolean).join(' → '))}</div></div><div class="km">${f1km(x.km)} km ${can?`<button class="btn link sm" data-act="km-x-del" data-id="${x.id}" aria-label="Supprimer">${I.trash}</button>`:''}</div></div>`).join('')}</div>
     ${can?`<details><summary class="tiny muted">Corriger ou ajouter un déplacement</summary><div class="stack" style="gap:8px;margin-top:8px"><div class="fields two"><label class="f"><span>Total du jour corrigé (km)</span><input type="number" step="0.1" min="0" id="kmFix_${r.d}" value="${r.fixed?esc(S.kmjour[uid+'_'+r.d].km):''}" placeholder="${f1km(r.auto+0)} calculés"></label><label class="f"><span>Raison</span><input type="text" id="kmNote_${r.d}" value="${esc(r.note||'')}" placeholder="Ex. détour, route barrée"></label></div><button class="btn ghost sm" style="align-self:flex-start" data-act="km-fix" data-d="${r.d}">Enregistrer la correction</button></div></details>`:''}</div>`).join(''):`<div class="card">${emptyBox('Aucun déplacement','Les trajets se calculent à partir des rendez-vous du planning.','map','men')}</div>`;
  else{const weeks={};rows.forEach(r=>{const w=mondayOf(r.d);(weeks[w]=weeks[w]||[]).push(r)});
    body=`<div class="card"><div class="tablewrap" style="box-shadow:none"><table><tr><th>Semaine</th><th class="c">Jours</th><th class="c">Rdv</th><th class="r">Km</th>${tx?'<th class="r">Montant</th>':''}</tr>
     ${Object.entries(weeks).map(([w,l])=>{const k=l.reduce((a,r)=>a+r.total,0);return `<tr class="clickable" data-act="km-week" data-d="${w}"><td>Semaine du ${fmtLong(w)}</td><td class="c num">${l.length}</td><td class="c num">${l.reduce((a,r)=>a+r.n,0)}</td><td class="r num">${f1km(k)}${l.some(r=>r.missing)?' <span class="chip cor">à vérifier</span>':''}</td>${tx?`<td class="r num">${eur2(k*tx)}</td>`:''}</tr>`}).join('')||'<tr><td colspan="5" class="muted">Aucun déplacement ce mois-ci.</td></tr>'}
     <tr><th>Total du mois</th><th class="c num">${rows.length}</th><th class="c num">${rows.reduce((a,r)=>a+r.n,0)}</th><th class="r num">${f1km(tot)}</th>${tx?`<th class="r num">${eur2(tot*tx)}</th>`:''}</tr></table></div>
     <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="km-csv">${I.file}Exporter le détail (CSV)</button>${isManager()&&ppl.length>1?`<button class="btn ghost sm" data-act="km-csv-all">${I.file}Récap de toute l’équipe (CSV)</button>`:''}</div></div>
     <div class="card"><div class="card-h"><div class="l">${it('cal','azu')}<h3>Détail par jour</h3></div></div><div class="list">${rows.map(r=>`<div class="li"><div class="body small"><b>${jourSem(r.d)} ${fmtLong(r.d)}</b><div class="tiny muted">${r.n} rdv${r.ex.length?' + '+r.ex.length+' autre'+(r.ex.length>1?'s':''):''}${r.fixed?' · corrigé':''}</div></div><b class="num small">${f1km(r.total)} km</b></div>`).join('')}</div></div>`}
  const add=can?`<details class="card"><summary><b class="small">Ajouter un autre déplacement</b> <span class="tiny muted">(réunion, bilan, achat de matériel…)</span></summary><div class="stack" style="gap:8px;margin-top:10px"><div class="fields three"><label class="f"><span>Date</span><input type="date" id="kxD" value="${today()}"></label><label class="f"><span>Km aller-retour</span><input type="number" step="0.1" min="0" id="kxK"></label><label class="f"><span>Motif</span><input type="text" id="kxM" placeholder="Ex. réunion d’équipe"></label></div><div class="fields two"><label class="f"><span>Départ (facultatif)</span><input type="text" id="kxA"></label><label class="f"><span>Arrivée (facultatif)</span><input type="text" id="kxB"></label></div><div class="row"><button class="btn sm" data-act="km-x-add">Ajouter</button><button class="btn ghost sm" data-act="km-x-calc">Calculer les km depuis les adresses</button></div></div></details>`:'';
  return `<div class="stack">${head}${pick}${homeCard}${stats}${body}${add}<p class="tiny muted">Distances par la route (OpenStreetMap). « ≈ » : estimation quand l’itinéraire exact n’a pas pu être calculé. Chaque jour, le trajet part du domicile, passe par chaque rendez-vous dans l’ordre des horaires et revient au domicile.</p></div>`}
function kmCsvRows(uid,from,to){const out=[];for(let d=from;d<=to;d=addDays(d,1)){const r=dayKm(uid,d);const n=dayStops(uid,d).length;const ex=extrasOf(uid,d);if(!n&&!ex.length&&!r.fixed)continue;
  out.push([pName(uid)||'',fmt(d),n,dayStops(uid,d).map(x=>x.c.prenom+(x.s.heure?' '+x.s.heure:'')).join(' / '),Math.round(r.auto*10)/10,r.fixed?Number(S.kmjour[uid+'_'+d].km):'',ex.reduce((a,x)=>a+(Number(x.km)||0),0),Math.round(r.total*10)/10,kmTaux(uid)?Math.round(r.total*kmTaux(uid)*100)/100:'',r.note||'',ex.map(x=>x.motif).join(' / ')])}return out}
async function kmCsv(all){const ref=S.view.ref||today();const from=ref.slice(0,7)+'-01',to=addDays(addMonths(from,1),-1);const ids=all?kmPeople().map(p=>p.id):[S.view.uid];
  const head=['Personne','Date','Rendez-vous','Étapes','Km calculés','Km corrigés','Autres déplacements (km)','Total km','Montant (€)','Raison de la correction','Motif autres déplacements'];
  const lines=ids.flatMap(u=>kmCsvRows(u,from,to));if(all){lines.push([]);ids.forEach(u=>{const t=kmCsvRows(u,from,to).reduce((a,l)=>a+Number(l[7]||0),0);lines.push([pName(u)||'','TOTAL '+monthLbl(from.slice(0,7)),'','','','','',Math.round(t*10)/10,kmTaux(u)?Math.round(t*kmTaux(u)*100)/100:''])})}
  const csv='﻿'+[head,...lines].map(l=>l.map(v=>'"'+(typeof v==='number'?String(v).replace('.',','):String(v??'')).replace(/"/g,'""')+'"').join(';')).join('\r\n');
  if(!S.downloads){toast('Téléchargement indisponible ici.');return}try{await S.downloads.save({filename:'deplacements_'+(all?'equipe':slug(pName(S.view.uid)))+'_'+from.slice(0,7)+'.csv',data:csv});toast('Fichier prêt')}catch(e){}}
Object.assign(ACT,{
 'km-mode':el=>{S.view.kmode=el.dataset.m;render()},
 'km-move':el=>{const r=S.view.ref||today();S.view.ref=(S.view.kmode||'semaine')==='semaine'?addDays(r,7*Number(el.dataset.d)):addMonths(r.slice(0,7)+'-01',Number(el.dataset.d));render()},
 'km-today':()=>{S.view.ref=today();render()},
 'km-week':el=>{S.view.kmode='semaine';S.view.ref=el.dataset.d;render()},
 'km-csv':()=>kmCsv(false),'km-csv-all':()=>kmCsv(true),
 'km-fix':async el=>{const d=el.dataset.d,uid=S.view.uid;const v=($('#kmFix_'+d)||{}).value;const note=(($('#kmNote_'+d)||{}).value||'').trim();const data={uid,date:d,km:v===''?null:Number(String(v).replace(',','.')),note,by:meId(),at:Date.now()};if(await write('kmjour/'+uid+'_'+d,data)){S.kmjour[uid+'_'+d]={id:uid+'_'+d,...data};toast(v===''?'Correction retirée':'Correction enregistrée');render()}},
 'km-x-add':async()=>{const km=Number(String(($('#kxK')||{}).value||'').replace(',','.'));const date=($('#kxD')||{}).value;if(!date||!(km>0)){toast('Indique la date et les kilomètres.');return}
   const ref=S.db.collection('deplacements').doc();const data={uid:S.view.uid,date,km,motif:(($('#kxM')||{}).value||'').trim(),de:(($('#kxA')||{}).value||'').trim(),vers:(($('#kxB')||{}).value||'').trim(),by:meId(),at:Date.now()};if(await write('deplacements/'+ref.id,data)){S.deplacements.push({id:ref.id,...data});toast('Déplacement ajouté');render()}},
 'km-x-calc':async()=>{const a=(($('#kxA')||{}).value||'').trim(),b=(($('#kxB')||{}).value||'').trim();if(!a||!b){toast('Indique le départ et l’arrivée.');return}toast('Calcul en cours…');try{const r=await fetch('/api/route',{method:'POST',headers:{'Content-Type':'application/json','X-MEMB':'1'},credentials:'same-origin',body:JSON.stringify({from:a,to:b})});const j=await r.json();const x=(j.results||[])[0];if(!x||x.km==null){toast('Adresse introuvable.');return}$('#kxK').value=String(Math.round(x.km*2*10)/10);toast(f1km(x.km)+' km aller, soit '+f1km(x.km*2)+' km aller-retour')}catch(e){toast('Calcul indisponible.')}},
 'km-x-del':async el=>{if(await write('deplacements/'+el.dataset.id,{deleted:true},true)){const x=S.deplacements.find(y=>y.id===el.dataset.id);if(x)x.deleted=true;render()}},
});
document.addEventListener('change',e=>{if(e.target.id==='kmWho'){S.view.uid=e.target.value;render()}});

/* ======================= 3. FACTURES ET URSSAF ======================= */
const URSSAF_URL='https://www.particulier.urssaf.fr/';
const F_ST={a_transmettre:['À transmettre','saf'],transmise:['Transmise à l’URSSAF','azu'],payee:['Payée','men'],refusee:['Refusée, à corriger','cor'],annulee:['Annulée','gray']};
const fPill=f=>{const [l,c]=F_ST[f.statut]||F_ST.a_transmettre;return `<span class="chip ${c}">${l}</span>`};
const factOfSess=()=>{const m={};S.factures.filter(f=>f.statut!=='annulee').forEach(f=>(f.sessions||[]).forEach(x=>m[x.sid]=f));return m};
function aFacturer(){const fm=factOfSess();const t=today();const out={};Object.values(S.children).forEach(c=>sessionsOf(c.id).forEach(s=>{if(s.statut==='annulee'||!s.date||s.date>t||fm[s.id])return;(out[c.id]=out[c.id]||{c,ss:[]}).ss.push(s)}));Object.values(out).forEach(o=>o.ss.sort((a,b)=>a.date.localeCompare(b.date)));return Object.values(out).sort((a,b)=>childName(a.c).localeCompare(childName(b.c)))}
function factLibelle(ss){const d=ss.map(s=>s.date).sort();if(!d.length)return '';if(d.length===1)return 'Séance du '+fmtLong(d[0]);return `${d.length} séances du ${fmtLong(d[0])} au ${fmtLong(d[d.length-1])}`}
function nextNumero(){const y=today().slice(0,4);const n=S.factures.filter(f=>(f.numero||'').startsWith('F-'+y)).map(f=>Number((f.numero||'').split('-')[2])||0);return 'F-'+y+'-'+String((n.length?Math.max(...n):0)+1).padStart(4,'0')}
function vFactures(){const tab=S.view.ftab||'afacturer';const todo=aFacturer();const sel=S.view.fsel||(S.view.fsel={});
  const totTodo=todo.reduce((a,o)=>a+o.ss.reduce((x,s)=>x+(Number(s.duree)||0)*tarifOf(o.c),0),0);const tr=S.factures.filter(f=>f.statut==='transmise');const mk=monthKey(today());const paid=S.factures.filter(f=>f.statut==='payee'&&monthKey(f.payeeAt?new Date(f.payeeAt).toISOString().slice(0,10):'')===mk);
  const stats=`<div class="stats"><div class="stat saf" data-act="f-tab" data-t="afacturer">${I.euro}<b>${eur(totTodo)}</b><span>${todo.reduce((a,o)=>a+o.ss.length,0)} séances à facturer</span></div><div class="stat azu" data-act="f-tab" data-t="factures">${I.clock}<b>${tr.length}</b><span>transmises, en attente</span></div><div class="stat men" data-act="f-tab" data-t="factures">${I.star}<b>${eur(paid.reduce((a,f)=>a+(Number(f.montant)||0),0))}</b><span>payé ce mois-ci</span></div><div class="stat cor" data-act="f-tab" data-t="factures">${I.alert}<b>${S.factures.filter(f=>f.statut==='refusee').length}</b><span>à corriger</span></div></div>`;
  const tabs=`<div class="seg">${[['afacturer','Séances à facturer'],['factures','Factures'],['recap','Récap du mois']].map(([k,l])=>`<button type="button" data-act="f-tab" data-t="${k}" aria-selected="${tab===k}">${l}</button>`).join('')}</div>`;
  let body='';
  if(tab==='afacturer')body=todo.length?todo.map(o=>{const s0=sel[o.c.id]||(sel[o.c.id]=Object.fromEntries(o.ss.map(s=>[s.id,true])));const chosen=o.ss.filter(s=>s0[s.id]);const amt=chosen.reduce((a,s)=>a+(Number(s.duree)||0)*tarifOf(o.c),0);
     return `<div class="card stack" style="gap:10px"><div class="row between"><div class="row" style="flex-wrap:nowrap;gap:10px">${kidFace(o.c,36)}<div><b>${esc(childName(o.c))}</b><div class="tiny muted">${esc(o.c.parentRef||'')} · ${esc(intervName(o.c))} · ${String(tarifOf(o.c)).replace('.',',')} €/h</div></div></div><span class="chip saf">${o.ss.length} séance${o.ss.length>1?'s':''}</span></div>
     <div class="list">${o.ss.map(s=>`<label class="li" style="cursor:pointer"><input type="checkbox" data-fsel="${o.c.id}" data-s="${s.id}" ${s0[s.id]?'checked':''} style="width:20px;height:20px;accent-color:var(--men)"><div class="body small"><b>${jourSem(s.date)} ${fmtLong(s.date)}</b>${s.heure?' · '+fmtH(s.heure):''} · ${hrs(Number(s.duree)||0)} h ${s.signature?'<span class="chip men">signée</span>':'<span class="chip saf">non signée</span>'}</div><span class="num small">${eur2((Number(s.duree)||0)*tarifOf(o.c))}</span></label>`).join('')}</div>
     <div class="row between"><span class="small">Sélection : <b>${chosen.length} séance${chosen.length>1?'s':''} · ${hrs(chosen.reduce((a,s)=>a+(Number(s.duree)||0),0))} h · ${eur2(amt)}</b></span><button class="btn sm" data-act="f-create" data-c="${o.c.id}" ${chosen.length?'':'disabled'}>${I.plus}Créer la facture</button></div>
     ${chosen.some(s=>!s.signature)?'<div class="tiny" style="color:var(--saf-ink)">Certaines séances ne sont pas signées par la famille.</div>':''}</div>`}).join(''):`<div class="card">${emptyBox('Tout est facturé','Les séances réalisées apparaîtront ici dès qu’elles auront eu lieu.','euro','men')}</div>`;
  else if(tab==='factures'){const f0=S.view.ff||'encours';const list=S.factures.filter(f=>f0==='tout'||(f0==='encours'?['a_transmettre','transmise','refusee'].includes(f.statut):f.statut===f0)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    body=`<div class="row" style="gap:6px">${[['encours','En cours'],['payee','Payées'],['annulee','Annulées'],['tout','Toutes']].map(([k,l])=>`<button class="btn ${f0===k?'':'ghost '}sm" data-act="f-filter" data-f="${k}">${l}</button>`).join('')}</div>
    <div class="card" style="padding:4px 16px">${list.length?list.map(f=>{const c=S.children[f.cid]||{prenom:'?'};return `<div class="fact"><div class="row between"><div class="row" style="flex-wrap:nowrap;gap:10px">${kidFace(c,32)}<div><b class="small">${esc(f.numero||'')} · ${esc(childName(c))}</b><div class="tiny muted">${esc(f.libelle||'')}</div></div></div><div style="text-align:right"><b class="num">${eur2(f.montant)}</b><div class="tiny muted">${hrs(f.heures||0)} h</div></div></div>
      <div class="row" style="gap:6px">${fPill(f)}${f.parentValide?'<span class="chip men">Validée par la famille</span>':f.statut==='transmise'?'<span class="chip">Pas encore validée par la famille</span>':''}${f.transmiseAt?`<span class="tiny muted">transmise le ${fmt(new Date(f.transmiseAt).toISOString().slice(0,10))}</span>`:''}${f.payeeAt?`<span class="tiny muted">payée le ${fmt(new Date(f.payeeAt).toISOString().slice(0,10))}</span>`:''}</div>
      ${f.note?`<div class="tiny">${esc(f.note)}</div>`:''}
      <div class="row" style="gap:6px">${f.statut==='a_transmettre'||f.statut==='refusee'?`<button class="btn sm" data-act="f-st" data-id="${f.id}" data-v="transmise">J’ai transmis à l’URSSAF</button>`:''}${f.statut==='transmise'?`<button class="btn sm" data-act="f-st" data-id="${f.id}" data-v="payee">Payée par l’URSSAF</button><button class="btn ghost sm" data-act="f-st" data-id="${f.id}" data-v="refusee">Refusée par la famille</button>`:''}${f.statut!=='payee'&&f.statut!=='annulee'?`<button class="btn ghost sm" data-act="f-st" data-id="${f.id}" data-v="annulee">Annuler</button>`:''}${f.statut==='payee'?`<button class="btn ghost sm" data-act="f-st" data-id="${f.id}" data-v="transmise">Annuler le paiement</button>`:''}<button class="btn link sm" data-act="f-detail" data-id="${f.id}">Détail</button></div></div>`}).join(''):`<p class="small muted" style="padding:12px 0">Aucune facture ici.</p>`}</div>`}
  else body=vBilling();
  return `${stats}<div class="banner small">Le circuit : 1) tu crées la facture ici en regroupant les séances, 2) tu la déclares dans ton logiciel d’avance immédiate et coches « transmise », 3) la famille la valide sous 48 h sur <a href="${URSSAF_URL}" target="_blank" rel="noopener">son espace URSSAF</a> (elle reçoit un rappel), 4) l’URSSAF te paie et tu coches « payée ».</div>${tabs}${body}`}
function factDetail(id){const f=S.factures.find(x=>x.id===id);if(!f)return;const c=S.children[f.cid]||{};
  modal(`<div class="row between"><h2>${esc(f.numero||'Facture')}</h2><button class="btn link" data-act="close">Fermer</button></div><div class="small muted">${esc(childName(c))} · ${esc(f.libelle||'')}</div>
  <div class="card" style="padding:4px 14px;margin-top:10px"><div class="list">${(f.sessions||[]).map(x=>`<div class="li small"><div class="body">${jourSem(x.date)} ${fmtLong(x.date)}</div><span class="num">${hrs(x.duree)} h · ${eur2(x.montant)}</span></div>`).join('')}</div></div>
  <div class="row between" style="margin-top:8px"><b>Total</b><b class="num">${hrs(f.heures||0)} h · ${eur2(f.montant)}</b></div>
  <label class="f" style="margin-top:12px"><span>Note interne (ex. n° de demande URSSAF)</span><input type="text" id="fNote" value="${esc(f.note||'')}"></label><button class="btn ghost sm" style="margin-top:8px" data-act="f-note" data-id="${f.id}">Enregistrer la note</button>`)}
Object.assign(ACT,{
 'f-tab':el=>{S.view.ftab=el.dataset.t;render()},'f-filter':el=>{S.view.ff=el.dataset.f;render()},'f-detail':el=>factDetail(el.dataset.id),
 'f-create':async el=>{const cid=el.dataset.c;const c=S.children[cid];const o=aFacturer().find(x=>x.c.id===cid);if(!o)return;const s0=(S.view.fsel||{})[cid]||{};const ss=o.ss.filter(s=>s0[s.id]);if(!ss.length)return;el.disabled=true;
   const items=ss.map(s=>({sid:s.id,date:s.date,duree:Number(s.duree)||0,montant:Math.round((Number(s.duree)||0)*tarifOf(c)*100)/100}));const ref=S.db.collection('factures').doc();
   const f={cid,numero:nextNumero(),libelle:factLibelle(ss),sessions:items,heures:items.reduce((a,x)=>a+x.duree,0),montant:Math.round(items.reduce((a,x)=>a+x.montant,0)*100)/100,tarif:tarifOf(c),statut:'a_transmettre',createdAt:Date.now(),createdBy:meId(),createdByName:actName()};
   if(await write('factures/'+ref.id,f)){S.factures.push({id:ref.id,...f});delete S.view.fsel[cid];toast('Facture '+f.numero+' créée');S.view.ftab='factures';render()}else el.disabled=false},
 'f-st':async el=>{const f=S.factures.find(x=>x.id===el.dataset.id);if(!f)return;const v=el.dataset.v;if(v==='annulee'&&!confirm('Annuler cette facture ? Les séances redeviendront « à facturer ».'))return;
   const p={statut:v};if(v==='transmise'&&!f.transmiseAt)p.transmiseAt=Date.now();if(v==='payee')p.payeeAt=Date.now();if(v==='transmise'&&f.payeeAt)p.payeeAt=null;
   if(await write('factures/'+f.id,p,true)){Object.assign(f,p);toast(F_ST[v][0]);render()}},
 'f-note':async el=>{const f=S.factures.find(x=>x.id===el.dataset.id);const v=($('#fNote').value||'').trim();if(f&&await write('factures/'+f.id,{note:v},true)){f.note=v;closeModal();toast('Note enregistrée');render()}},
});
document.addEventListener('change',e=>{const t=e.target;if(!t.matches('[data-fsel]'))return;const cid=t.dataset.fsel;S.view.fsel=S.view.fsel||{};S.view.fsel[cid]=S.view.fsel[cid]||{};S.view.fsel[cid][t.dataset.s]=t.checked;render()});
/* l'onglet « Suivi facturation » de l'équipe devient la gestion des factures */
const _vTeam14=vTeam;
vTeam=function(){if((S.view.tab||'equipe')!=='facturation')return _vTeam14();const h=_vTeam14();const i=h.indexOf('<div class="card"><div class="row between"><label class="f" style="max-width:220px"><span>Mois</span>');if(i<0)return h;
  return h.slice(0,i)+vFactures()+'</div>'};
/* côté famille */
function paFactures(c){const list=S.factures.filter(f=>f.cid===c.id&&f.statut!=='annulee').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));const todo=list.filter(f=>f.statut==='transmise'&&!f.parentValide);
  const lbl=f=>f.statut==='payee'?['Réglée','men']:f.statut==='transmise'?(f.parentValide?['Validée, en cours de paiement','azu']:['À valider sur votre espace URSSAF','saf']):f.statut==='refusee'?['En cours de correction','cor']:['En préparation','gray'];
  return `<div class="stack">${paHeader(c,'Factures',list.length?`${list.length} facture${list.length>1?'s':''}`:'')}
  <div class="card stack" style="gap:10px"><div class="row" style="flex-wrap:nowrap;gap:12px">${it('euro','men')}<div class="small"><b>Avance immédiate du crédit d’impôt</b><div class="muted">Pour chaque facture, l’URSSAF vous envoie une demande de paiement. Vous la validez sur votre espace particulier, sous 48 heures, et vous ne payez que la moitié du montant : l’autre moitié est votre crédit d’impôt, versé directement.</div></div></div>
   <a class="btn" href="${URSSAF_URL}" target="_blank" rel="noopener" style="align-self:flex-start">${I.shield}Me connecter à mon espace URSSAF</a></div>
  ${todo.length?`<div class="banner saf"><b>${todo.length} facture${todo.length>1?'s':''} à valider</b> sur votre espace URSSAF. Une fois fait, touchez « C’est validé » pour nous prévenir.</div>`:''}
  <div class="card" style="padding:4px 16px">${list.length?list.map(f=>{const [l,col]=lbl(f);return `<div class="fact"><div class="row between"><div><b>${esc(f.libelle||'Séances')}</b><div class="tiny muted">${esc(f.numero||'')}</div></div><div style="text-align:right"><b class="num">${eur2(f.montant)}</b><div class="tiny muted">soit environ ${eur2((Number(f.montant)||0)/2)} à votre charge</div></div></div>
    <div class="row" style="gap:6px"><span class="chip ${col}">${l}</span>${f.parentValide&&f.statut!=='payee'?'<span class="tiny muted">merci, nous suivons le paiement</span>':''}</div>
    <details><summary class="tiny muted">Séances comprises (${(f.sessions||[]).length})</summary><div class="list">${(f.sessions||[]).map(x=>`<div class="li small"><div class="body">${jourSem(x.date)} ${fmtLong(x.date)}</div><span class="num">${hrs(x.duree)} h · ${eur2(x.montant)}</span></div>`).join('')}</div></details>
    ${f.statut==='transmise'&&!f.parentValide?`<div class="row" style="gap:6px"><a class="btn sm" href="${URSSAF_URL}" target="_blank" rel="noopener">Valider sur l’URSSAF</a><button class="btn ghost sm" data-act="pf-valide" data-id="${f.id}">C’est validé</button></div>`:''}</div>`}).join(''):`<div style="padding:8px 0">${emptyBox('Pas encore de facture','Vos factures apparaîtront ici, avec leur avancement.','euro','men')}</div>`}</div></div>`}
ACT['pf-valide']=async el=>{const f=S.factures.find(x=>x.id===el.dataset.id);if(!f)return;const p={parentValide:true,parentValideAt:Date.now()};if(await write('factures/'+f.id,p,true)){Object.assign(f,p);toast('Merci, c’est noté');render()}};

/* ======================= 4. DEVOIRS À LA MAISON ======================= */
const D_ST={fait:['C’est fait','men'],pas_fait:['Pas fait','cor'],en_cours:['En cours','azu']};
function devoirsOf(c,parent){const fromSess=sessionsOf(c.id).filter(s=>s.maison&&s.statut!=='annulee'&&(!parent||shK(s,'maison'))).map(s=>({kind:'s',id:s.id,cid:c.id,texte:s.maison,date:s.date,statut:s.maisonStatut||(s.maisonFait?'fait':null),commentaire:s.maisonCom||'',par:intervName(c),at:s.maisonAt}));
  const docs=S.devoirs.filter(d=>d.cid===c.id&&!d.deleted).map(d=>({kind:'d',id:d.id,cid:c.id,texte:d.texte,date:d.date||'',pour:d.pour,statut:d.statut||null,commentaire:d.commentaire||'',par:d.parNom||'',at:d.faitAt}));
  return [...docs,...fromSess].sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
function devoirRow(d,parent){const [l,col]=D_ST[d.statut]||['À faire','saf'];
  return `<div class="devoir"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap;gap:10px"><div style="min-width:0"><div>${esc(d.texte)}</div><div class="tiny muted">${d.kind==='s'?'Séance du '+fmtLong(d.date):'Donné le '+fmtLong(d.date)}${d.pour?' · pour le '+fmtLong(d.pour):''}${d.par?' · '+esc(d.par):''}</div></div><span class="chip ${col}" style="flex:none">${l}</span></div>
   ${parent?`<div class="acts"><button class="btn sm" style="background:var(--men);border-color:var(--men)" data-act="dv-st" data-k="${d.kind}" data-id="${d.id}" data-c="${d.cid}" data-v="fait" aria-pressed="${d.statut==='fait'}">✓ C’est fait</button><button class="btn ghost sm" data-act="dv-st" data-k="${d.kind}" data-id="${d.id}" data-c="${d.cid}" data-v="en_cours" aria-pressed="${d.statut==='en_cours'}">En cours</button><button class="btn ghost sm" data-act="dv-st" data-k="${d.kind}" data-id="${d.id}" data-c="${d.cid}" data-v="pas_fait" aria-pressed="${d.statut==='pas_fait'}">Pas fait</button></div>
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="dvc_${d.id}" value="${esc(d.commentaire)}" placeholder="Un mot pour l’intervenante (facultatif)" style="min-height:40px;font-size:.9rem"><button class="btn ghost sm" data-act="dv-com" data-k="${d.kind}" data-id="${d.id}" data-c="${d.cid}">OK</button></div>`
   :`${d.commentaire?`<div class="pcom par"><b class="tiny">La famille</b><div class="small">${esc(d.commentaire)}</div></div>`:''}${d.kind==='d'?`<div class="row" style="gap:6px"><button class="btn link sm" data-act="dv-del" data-id="${d.id}">${I.trash}Retirer</button></div>`:''}`}</div>`}
function paDevoirs(c){const all=devoirsOf(c,true);const todo=all.filter(d=>d.statut!=='fait'),done=all.filter(d=>d.statut==='fait');
  return `<div class="stack">${paHeader(c,'Devoirs',all.length?`${todo.length} à faire · ${done.length} fait${done.length>1?'s':''}`:'')}
  <p class="small muted" style="margin:0">Ce que l’intervenante propose de refaire à la maison avec ${esc(c.prenom)}. Dites-nous si c’est fait : cela nous aide à préparer la séance suivante.</p>
  <div class="section-t">À faire</div><div class="card" style="padding:4px 16px">${todo.length?todo.map(d=>devoirRow(d,true)).join(''):`<p class="small muted" style="padding:10px 0">Rien à faire pour le moment. Bravo !</p>`}</div>
  ${done.length?`<div class="section-t">Déjà faits</div><div class="card" style="padding:4px 16px">${done.slice(0,30).map(d=>devoirRow(d,true)).join('')}</div>`:''}</div>`}
function tDevoirs(c){const all=devoirsOf(c,false);const n=all.filter(d=>d.statut==='fait').length;
  return `<div class="card stack" style="gap:10px"><div class="card-h" style="margin:0"><div class="l">${it('home','lav')}<h3>Donner un devoir à la maison</h3></div><span class="chip lav">${n}/${all.length} faits</span></div>
   <label class="f"><span>Ce que la famille doit faire</span><textarea id="dvT" placeholder="Ex. Rejouer au memory 10 minutes, deux fois dans la semaine."></textarea></label>
   <div class="fields two"><label class="f"><span>Pour le (facultatif)</span><input type="date" id="dvP"></label></div><button class="btn sm" style="align-self:flex-start" data-act="dv-add" data-c="${c.id}">${I.plus}Envoyer à la famille</button>
   <p class="tiny muted" style="margin:0">Le champ « À refaire à la maison » d’une séance apparaît aussi ici automatiquement.</p></div>
  <div class="card" style="padding:4px 16px">${all.length?all.map(d=>devoirRow(d,false)).join(''):`<div style="padding:8px 0">${emptyBox('Aucun devoir','','home','lav')}</div>`}</div>`}
async function dvSet(el,patch){const {k,id,c:cid}=el.dataset;if(k==='s'){const p={};if('statut' in patch){p.maisonStatut=patch.statut;p.maisonFait=patch.statut==='fait';p.maisonAt=Date.now()}if('commentaire' in patch)p.maisonCom=patch.commentaire;const s=(S.sessions[cid]||{})[id];if(await write('children/'+cid+'/sessions/'+id,p,true)){if(s)Object.assign(s,p);return true}return false}
  const d=S.devoirs.find(x=>x.id===id);const p={...patch};if('statut' in p)p.faitAt=Date.now();if(await write('devoirs/'+id,p,true)){if(d)Object.assign(d,p);return true}return false}
Object.assign(ACT,{
 'dv-st':async el=>{if(await dvSet(el,{statut:el.dataset.v})){toast(D_ST[el.dataset.v][0]);render()}},
 'dv-com':async el=>{const v=(($('#dvc_'+el.dataset.id)||{}).value||'').trim();if(await dvSet(el,{commentaire:v})){toast('Message transmis à l’intervenante');render()}},
 'dv-add':async el=>{const cid=el.dataset.c;const t=(($('#dvT')||{}).value||'').trim();if(!t){toast('Écris le devoir.');return}const ref=S.db.collection('devoirs').doc();const d={cid,texte:t,pour:($('#dvP')||{}).value||'',date:today(),par:meId(),parNom:actName(),statut:null,createdAt:Date.now()};if(await write('devoirs/'+ref.id,d)){S.devoirs.push({id:ref.id,...d});toast('Devoir envoyé à la famille');render()}},
 'dv-del':async el=>{if(await write('devoirs/'+el.dataset.id,{deleted:true},true)){const d=S.devoirs.find(x=>x.id===el.dataset.id);if(d)d.deleted=true;render()}},
});

/* ======================= 5. MESSAGES ENTRE FAMILLES ET ÉQUIPE ======================= */
const fThreadMsgs=(cid,to)=>S.fmsg.filter(m=>m.cid===cid&&m.to===to);
const fMine=(cid,to)=>{if(role()==='parent')return true;const c=S.children[cid]||{};return to==='direction'?isManager():c.intervenante===meId()};
const fUnread=(cid,to)=>fMine(cid,to)?fThreadMsgs(cid,to).filter(m=>!(m.readBy||[]).includes(meId())&&m.from!==meId()&&(role()==='parent'?m.fromRole!=='parent':m.fromRole==='parent')).length:0;
function fThreads(){if(role()==='parent')return [];const out=[];Object.values(S.children).forEach(c=>['intervenante','direction'].forEach(to=>{if(to==='direction'&&!isManager())return;if(!isManager()&&c.intervenante!==meId())return;const ms=fThreadMsgs(c.id,to);if(ms.length)out.push({c,to,ms,last:ms[ms.length-1],u:fUnread(c.id,to)})}));return out.sort((a,b)=>b.last.at-a.last.at)}
function fMarkRead(cid,to){fThreadMsgs(cid,to).forEach(m=>{if(m.from!==meId()&&!(m.readBy||[]).includes(meId())){m.readBy=[...(m.readBy||[]),meId()];write('fmsg/'+m.id,{readBy:m.readBy},true)}})}
function threadHtml(cid,to,meLbl){const ms=fThreadMsgs(cid,to);return `<div class="fthread" id="fthread">${ms.length?ms.map(m=>{const mine=m.from===meId();return `<div class="fb ${mine?'me':'them'}">${!mine?`<b class="tiny" style="display:block">${esc(m.fromName||'')}${m.fromRole==='parent'?'':' · '+esc(ROLES[m.fromRole]||'')}</b>`:''}${esc(m.text)}<span class="meta">${relTime(m.at)}${mine&&(m.readBy||[]).length>1?' · lu':''}</span></div>`}).join(''):`<p class="small muted" style="margin:auto;text-align:center">${esc(meLbl)}</p>`}</div>`}
function paintThread14(){const box=$('#fthread');if(!box)return;const cid=box.dataset.c,to=box.dataset.to;if(!cid)return}
function paMessages(c){const to=S.view.fto||'';const tm=S.team[c.intervenante]||{};const iname=intervName(c);
  const convs=[['intervenante',iname,'Son intervenante',c.intervenante],['direction','La direction','Coordination de l’association',null]];
  if(!to)return `<div class="stack">${paHeader(c,'Messages','Écrivez à l’équipe')}
   <div class="card" style="padding:4px 16px">${convs.map(([k,n,sub,id])=>{const ms=fThreadMsgs(c.id,k);const last=ms[ms.length-1];const u=fUnread(c.id,k);return `<div class="li clickable" data-act="pm-open" data-to="${k}">${id?memberFace(id,44):`<span class="av" style="width:44px;height:44px;background:linear-gradient(180deg,var(--nav-hi),var(--nav))">${I.team.replace('class="ico"','class="ico" style="width:22px;height:22px"')}</span>`}<div class="body"><div class="row between" style="flex-wrap:nowrap"><b>${esc(n)}</b>${last?`<span class="tiny muted">${relTime(last.at)}</span>`:''}</div><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${last?esc(last.text):esc(sub)}</div></div>${u?`<span class="nb">${u}</span>`:''}<span class="chev">${I.chev}</span></div>`}).join('')}</div>
   <p class="tiny muted">Pour une urgence le jour même (absence, retard), appelez directement${tm.tel?' : <a href="tel:'+esc(String(tm.tel).replace(/[^\d+]/g,''))+'">'+esc(tm.tel)+'</a>':''}.</p></div>`;
  const conv=convs.find(x=>x[0]===to)||convs[0];setTimeout(()=>{fMarkRead(c.id,to);const b=$('#fthread');if(b)b.scrollTop=b.scrollHeight},30);
  return `<div class="stack">${paHeader(c,'','')}<button class="btn ghost sm" style="align-self:flex-start" data-act="pm-open" data-to="">${I.back}Messages</button>
   <div class="card stack" style="gap:10px"><div class="row" style="flex-wrap:nowrap;gap:10px">${conv[3]?memberFace(conv[3],40):''}<div><b>${esc(conv[1])}</b><div class="tiny muted">${esc(conv[2])}</div></div></div>
   ${threadHtml(c.id,to,'Écrivez votre premier message. Vous recevrez la réponse ici.')}
   <div class="composer" style="display:flex;gap:8px;align-items:flex-end"><textarea id="pmText" placeholder="Votre message" style="min-height:48px;flex:1"></textarea><button class="btn" data-act="pm-send" data-c="${c.id}" data-to="${to}">Envoyer</button></div></div></div>`}
async function fSend(cid,to,ta){const t=(ta&&ta.value||'').trim();if(!t)return;const ref=S.db.collection('fmsg').doc();const m={cid,to,text:t};
  if(await write('fmsg/'+ref.id,m)){fMarkRead(cid,to);S.fmsg.push({id:ref.id,...m,from:meId(),fromName:actName(),fromRole:S.role,at:Date.now(),readBy:[meId()]});ta.value='';S.dirty=false;render();toast('Message envoyé')}}
Object.assign(ACT,{
 'pm-open':el=>{S.view.fto=el.dataset.to;render();window.scrollTo(0,0)},
 'pm-send':el=>fSend(el.dataset.c,el.dataset.to,$('#pmText')),
 'fm-open':el=>{go('messages',{fchan:el.dataset.c+'|'+el.dataset.to})},
 'fm-send':el=>fSend(el.dataset.c,el.dataset.to,$('#fmText')),
});
const _vMessages14=vMessages;
vMessages=function(){const fc=S.view.fchan;if(fc){const [cid,to]=fc.split('|');const c=S.children[cid];if(!c)return _vMessages14();setTimeout(()=>{fMarkRead(cid,to);const b=$('#fthread');if(b)b.scrollTop=b.scrollHeight},30);
   return `<div class="stack"><button class="btn ghost sm" style="align-self:flex-start" data-act="nav" data-v="messages">${I.back}Messages</button>
   <div class="card stack" style="gap:10px"><div class="row" style="flex-wrap:nowrap;gap:10px">${kidFace(c,40)}<div><b>Famille de ${esc(childName(c))}</b><div class="tiny muted">${to==='direction'?'Écrit à la direction':'Écrit à '+esc(intervName(c))}${c.parentRef?' · '+esc(c.parentRef):''}</div></div></div>
   ${threadHtml(cid,to,'')}
   ${to==='direction'&&!isManager()?'':`<div class="composer" style="display:flex;gap:8px;align-items:flex-end"><textarea id="fmText" placeholder="Répondre à la famille" style="min-height:48px;flex:1"></textarea><button class="btn" data-act="fm-send" data-c="${cid}" data-to="${to}">Envoyer</button></div>`}
   <p class="tiny muted" style="margin:0">La famille reçoit votre réponse dans son espace (et par e-mail ou notification si elle les a activés).</p></div></div>`}
  const h=_vMessages14();const th=fThreads();
  const fam=`<div class="card" style="padding:4px 14px"><div class="card-h" style="margin:10px 0 4px"><div class="l">${it('heart','cor')}<h3>Messages des familles</h3></div>${th.reduce((a,x)=>a+x.u,0)?`<span class="nb">${th.reduce((a,x)=>a+x.u,0)}</span>`:''}</div>${th.length?th.map(x=>`<div class="li clickable" data-act="fm-open" data-c="${x.c.id}" data-to="${x.to}">${kidFace(x.c,38)}<div class="body"><div class="row between" style="flex-wrap:nowrap"><b class="small">${esc(x.c.prenom)} · ${x.to==='direction'?'Direction':esc(intervName(x.c))}</b><span class="tiny muted">${relTime(x.last.at)}</span></div><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.last.fromRole==='parent'?'':x.last.from===meId()?'Vous : ':esc((x.last.fromName||'').split(' ')[0])+' : '}${esc(x.last.text)}</div></div>${x.u?`<span class="nb">${x.u}</span>`:''}</div>`).join(''):'<p class="small muted" style="margin:4px 0 12px">Aucun message des familles pour l’instant.</p>'}</div>`;
  const i=h.indexOf('<div class="chat">');return i<0?h+fam:h.slice(0,i)+fam+h.slice(i)};
const _unreadMsg14=unreadMsgCount;
unreadMsgCount=function(){return _unreadMsg14()+fThreads().reduce((a,x)=>a+x.u,0)};

/* ======================= 6. RAPPELS DE SÉANCE ======================= */
const R_DEF={veille:{on:true,heure:'18:00'},jour:{on:true,avant:120},perso:[],canal:'auto'};
S.prefs={};const myPrefs=()=>S.prefs[meId()]||{};
/* réglage général < réglage de l'enfant < réglage personnel du parent (c === 'me') */
function rappelsOf(c){const me=c==='me';const kid=me?paChild():c;const g=S.settings.rappels||{};const r=(kid&&kid.rappels)||{};const m=me?(myPrefs().rappels||{}):{};
  const R={...R_DEF,...g,...r,...m,veille:{...R_DEF.veille,...(g.veille||{}),...(r.veille||{}),...(m.veille||{})},jour:{...R_DEF.jour,...(g.jour||{}),...(r.jour||{}),...(m.jour||{})},perso:Array.isArray(m.perso)?m.perso:Array.isArray(r.perso)?r.perso:(g.perso||[])};
  if(!['auto','email','both'].includes(R.canal))R.canal='auto';return R}
const AVANT=[[30,'30 min avant'],[60,'1 h avant'],[120,'2 h avant'],[180,'3 h avant'],[240,'4 h avant']];
const PERSO=[[15,'15 min'],[45,'45 min'],[90,'1 h 30'],[360,'6 h'],[720,'12 h'],[1440,'1 jour'],[2880,'2 jours'],[4320,'3 jours']];
const HEURES=['08:00','12:00','17:00','18:00','19:00','20:00','21:00'];
function rappelsForm(R,pfx){return `<div class="rset"><div><b class="small">La veille</b><div class="tiny muted">Un rappel le jour d’avant</div></div><div class="row" style="gap:6px;flex-wrap:nowrap"><select data-rp="${pfx}" data-k="veille.heure">${HEURES.map(h=>`<option value="${h}" ${R.veille.heure===h?'selected':''}>à ${fmtH(h)}</option>`).join('')}</select><input type="checkbox" class="sw" data-rp="${pfx}" data-k="veille.on" ${R.veille.on?'checked':''}></div></div>
  <div class="rset"><div><b class="small">Le jour même</b><div class="tiny muted">Avant l’heure de la séance</div></div><div class="row" style="gap:6px;flex-wrap:nowrap"><select data-rp="${pfx}" data-k="jour.avant">${AVANT.map(([v,l])=>`<option value="${v}" ${Number(R.jour.avant)===v?'selected':''}>${l}</option>`).join('')}</select><input type="checkbox" class="sw" data-rp="${pfx}" data-k="jour.on" ${R.jour.on?'checked':''}></div></div>
  <div class="rset"><div><b class="small">Rappels personnalisés</b><div class="tiny muted">${(R.perso||[]).length?(R.perso||[]).map(p=>`<span class="chip" style="margin:2px 4px 0 0">${(PERSO.find(x=>x[0]===Number(p.avant))||[0,p.avant+' min'])[1]} avant <button class="btn link" style="padding:0 0 0 4px;min-height:0" data-act="rp-del" data-p="${pfx}" data-m="${p.avant}" aria-label="Retirer">×</button></span>`).join(''):'Aucun'}</div></div><select data-rp="${pfx}" data-k="perso.add"><option value="">+ Ajouter</option>${PERSO.map(([v,l])=>`<option value="${v}">${l} avant</option>`).join('')}</select></div>
  ${pfx==='g'?'':`<div class="rset"><div><b class="small">Comment les recevoir</b><div class="tiny muted">${R.canal==='auto'?'Sur le téléphone s’il est activé ci-dessous, sinon par e-mail : vous recevez toujours vos rappels, sans doublon.':R.canal==='both'?'Par e-mail et sur le téléphone.':'Par e-mail uniquement.'}</div></div><select data-rp="${pfx}" data-k="canal">${[['auto','Téléphone, sinon e-mail'],['email','E-mail'],['both','Les deux']].map(([v,l])=>`<option value="${v}" ${R.canal===v?'selected':''}>${l}</option>`).join('')}</select></div>`}`}
async function rpSave(pfx,R){if(pfx==='me'){const v={...myPrefs(),rappels:R};if(await write('prefs/'+meId(),v,true)){S.prefs[meId()]=v;toast('Vos rappels sont enregistrés');render()}return}if(pfx==='g'){const v={...(S.settings.rappels||{}),...R};if(await write('settings/main',{rappels:v},true)){S.settings.rappels=v;toast('Rappels enregistrés');render()}}else{const c=S.children[pfx];if(!c)return;if(await write('children/'+c.id,{rappels:R},true)){c.rappels=R;toast('Rappels enregistrés');render()}}}
document.addEventListener('change',e=>{const t=e.target;if(!t.matches('[data-rp]'))return;const pfx=t.dataset.rp;const c=pfx==='me'?'me':S.children[pfx];const R=JSON.parse(JSON.stringify(pfx==='g'?rappelsOf(null):rappelsOf(c)));const k=t.dataset.k;
  if(k==='perso.add'){const m=Number(t.value);if(!m)return;R.perso=[...(R.perso||[]).filter(p=>Number(p.avant)!==m),{avant:m}].sort((a,b)=>b.avant-a.avant)}
  else{const [a,b]=k.split('.');const v=t.type==='checkbox'?t.checked:(b==='avant'?Number(t.value):t.value);if(b)R[a]={...R[a],[b]:v};else R[a]=v}
  rpSave(pfx,R)});
ACT['rp-del']=el=>{const pfx=el.dataset.p;const R=JSON.parse(JSON.stringify(pfx==='g'?rappelsOf(null):rappelsOf(pfx==='me'?'me':S.children[pfx])));R.perso=(R.perso||[]).filter(p=>Number(p.avant)!==Number(el.dataset.m));rpSave(pfx,R)};
/* notifications sur ce téléphone (Web Push) */
const b64u=s=>{const p='='.repeat((4-s.length%4)%4);const r=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...r].map(ch=>ch.charCodeAt(0)))};
const pushOk=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const standalone=()=>window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function pushState(){if(!pushOk())return 'unsupported';try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();return sub?'on':(Notification.permission==='denied'?'denied':'off')}catch(e){return 'off'}}
async function pushOn(){try{if(!pushOk()){toast(isIOS()&&!standalone()?'Sur iPhone : ajoutez d’abord le carnet à l’écran d’accueil (Partager › Sur l’écran d’accueil), puis ouvrez-le depuis l’icône.':'Ce navigateur ne gère pas les notifications.');return}
  const perm=await Notification.requestPermission();if(perm!=='granted'){toast('Notifications refusées dans les réglages du téléphone.');return}
  const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;const k=await (await fetch('/api/push/key',{credentials:'same-origin'})).json();
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(k.key)});
  await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json','X-MEMB':'1'},credentials:'same-origin',body:JSON.stringify({sub})});
  await fetch('/api/push/test',{method:'POST',headers:{'X-MEMB':'1'},credentials:'same-origin'});toast('Notifications activées sur ce téléphone');render()}catch(e){toast('Activation impossible : '+(e.message||'erreur'))}}
async function pushOff(){try{const reg=await navigator.serviceWorker.getRegistration('/');const sub=reg&&await reg.pushManager.getSubscription();if(sub){await fetch('/api/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json','X-MEMB':'1'},credentials:'same-origin',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}toast('Notifications désactivées sur ce téléphone');render()}catch(e){}}
Object.assign(ACT,{'push-on':pushOn,'push-off':pushOff});
function pushCard(){setTimeout(async()=>{const el=$('#pushState');if(!el)return;const s=await pushState();el.innerHTML=s==='on'?`<span class="chip men">Activées sur ce téléphone</span> <button class="btn link sm" data-act="push-off">Désactiver</button>`:s==='denied'?'<span class="small" style="color:var(--cor-ink)">Bloquées : autorisez-les dans les réglages du téléphone pour ce site.</span>':s==='unsupported'?(isIOS()&&!standalone()?'<span class="small">Sur iPhone : touchez Partager › « Sur l’écran d’accueil », puis ouvrez le carnet depuis cette icône et revenez ici.</span>':'<span class="small muted">Non disponible dans ce navigateur.</span>'):`<button class="btn sm" data-act="push-on">${I.bell}Activer sur ce téléphone</button>`},20);
  return `<div class="section-t">Notifications sur ce téléphone</div><div class="card stack" style="gap:8px"><div class="small muted">${role()==='parent'?'Rappels de séance, messages de l’équipe, devoirs et factures à valider.':'Messages des familles et alertes.'}</div><div id="pushState"><span class="tiny muted">…</span></div></div>`}
const _paParams14=paParams;
paParams=function(c){const h=_paParams14(c);const own=S.role==='parent';const R=rappelsOf(own?'me':c);const card=`<div class="section-t">Mes rappels de séance</div><div class="card" style="padding:4px 16px">${rappelsForm(R,own?'me':c.id)}</div><p class="tiny muted" style="margin:-4px 0 0">${own?'Ces réglages ne concernent que vous : l’autre parent garde les siens.':'Aperçu : chaque parent règle ses propres rappels.'}</p>${pushCard()}`;const i=h.indexOf('<div class="section-t">Ce que l’accueil met en avant</div>');return i<0?h+card:h.slice(0,i)+card+h.slice(i)};
const _vParams14=vParams;
vParams=function(){const h=_vParams14();let add=pushCard();
  if(isManager()){add+=`<div class="section-t">Rappels envoyés aux familles</div><div class="card" style="padding:4px 16px">${rappelsForm(rappelsOf(null),'g')}</div><p class="tiny muted" style="margin:-4px 0 0">Réglage par défaut. Chaque famille peut l’ajuster dans son espace (Réglages).</p><div class="card"><button class="btn ghost sm" data-act="rp-apercu">${I.cal}Voir les prochains rappels</button></div>
   <div class="section-t">Ce que voient les familles</div><div class="card" style="padding:4px 16px"><label class="li" style="cursor:pointer"><div class="body"><b class="small">Déroulé du minuteur visible par les familles</b><div class="tiny muted">Désactivé par défaut. Peut aussi se régler enfant par enfant, dans son dossier.</div></div><input type="checkbox" class="sw" data-gset="parentDeroule" ${S.settings.parentDeroule?'checked':''}></label></div>
   <div class="section-t">Forfait kilométrique</div><div class="card"><label class="f" style="max-width:260px"><span>Taux par défaut (€ par km)</span><input type="number" step="0.001" min="0" data-gset="kmTaux" value="${esc(S.settings.kmTaux??'')}" placeholder="ex. 0,636"></label><p class="tiny muted" style="margin:6px 0 0">Utilisé quand le taux de la personne n’est pas renseigné (Déplacements).</p></div>`}
  const i=h.indexOf('<div class="section-t">Affichage</div>');return i<0?h+add:h.slice(0,i)+add+h.slice(i)};
document.addEventListener('change',async e=>{const t=e.target;if(!t.matches('[data-gset]'))return;const k=t.dataset.gset;const v=t.type==='checkbox'?t.checked:(t.value===''?null:Number(String(t.value).replace(',','.')));if(await write('settings/main',{[k]:v},true)){S.settings[k]=v;toast('Enregistré')}});
ACT['rp-apercu']=async()=>{try{const r=await fetch('/api/rappels/apercu',{credentials:'same-origin'});const j=await r.json();const KL=k=>k==='veille'?'La veille':k==='jour'?'Le jour même':'Personnalisé';
  modal(`<div class="row between"><h2>Prochains rappels</h2><button class="btn link" data-act="close">Fermer</button></div><div class="card" style="padding:4px 14px">${j.next.length?j.next.map(x=>`<div class="li small"><div class="body"><b>${esc(x.prenom)}</b> · séance ${jourSem(x.date)} ${fmtLong(x.date)}${x.heure?' à '+fmtH(x.heure):''}<div class="tiny muted">${KL(x.kind)} · envoi ${new Date(x.at).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${!x.parents?' · <span style="color:var(--cor-ink)">aucun compte parent</span>':x.joignables<x.parents?` · <span style="color:var(--cor-ink)">${x.parents-x.joignables} parent${x.parents-x.joignables>1?'s':''} sans e-mail ni notification</span>`:''}</div></div></div>`).join(''):'<p class="small muted">Aucun rappel prévu dans les 8 prochains jours.</p>'}</div>`)}catch(e){toast('Aperçu indisponible')}};

/* ======================= 7. DÉROULÉ : réservé à l'équipe sauf activation ======================= */
['deroule','interruptions'].forEach(k=>{const i=SHARE_F.findIndex(x=>x[0]===k);if(i>=0)SHARE_F.splice(i,1)});SHARE_DEF.deroule=false;
const derouleOn=c=>c&&c.parentDeroule===true?true:c&&c.parentDeroule===false?false:!!S.settings.parentDeroule;
const _sessBody14=sessBody;
sessBody=function(c,s,o){if(o&&o.parent){if(!derouleOn(c))s={...s,chrono:null};else s={...s,share:{...(s.share||{}),fields:{...((s.share||{}).fields||{}),deroule:true}}}}return _sessBody14(c,s,o)};
ACT['ch-pdr']=async el=>{const c=S.children[el.dataset.c];const v=el.dataset.v==='def'?null:el.dataset.v==='on';if(await write('children/'+c.id,{parentDeroule:v},true)){c.parentDeroule=v;toast('Réglage enregistré');render()}};

/* ======================= 8. MINUTEUR : commentaire de comportement, axes cochés automatiquement ======================= */
MEMO_NOTES.comportement=['Comportement','Ex. Très calme après la pause, a demandé de l’aide une fois.'];
const AXE_RULES=[[1,/lectur|\blire\b|\blu\b|album|livre|histoire|syllab|lettre|\bmots?\b/],[2,/écri|ecri|graphi|dessin|tracé|trace|crayon|prénom|prenom|copie|colori/],[3,/compt|chiffr|nombre|numér|numer|calcul|\btri|class|logique|puzzle|forme|loto|quantit/],[4,/memory|mémo|memo|retenir|rappel|souvien|mémoris/],
 [5,/concentr|sablier|attention soutenue|resté longtemps|reste longtemps/],[6,/\bentrée? dans|\bentre dans|\bcommenc|mise au travail|\baccepté de|\baccepte de/],[7,/consigne|étape|etape|instruction/],[8,/tout seul|toute seule|\bseule?\b|autonom|sans aide|sans relance/],[9,/transition|changement d’activité|changement d'activité|imprévu|imprevu/],
 [10,/perle|enfil|découp|decoup|ciseau|pâte|pate a|coll|pince|gommette|vignette|motricité fine|motricite fine|boutonn/],[11,/parcours|ballon|saut|équilibre|equilibre|lancer|attraper|motricité globale|motricite globale|courir|danse/],[12,/espace|gauche|droite|\bhaut\b|\ben bas\b|repérage|reperage|labyrinthe|quadrillage/],
 [13,/demandé de l|demande de l|demandé une|pictogram|carte pause|besoin|carte oui|carte non/],[14,/tour de rôle|tour de role|chacun son tour|son tour|à deux\b|jeu de société|jeu de societe|regard|interaction/],[15,/émotion|emotion|colère|colere|retour au calme|frustr|\bcrises?\b|respir|punching|pleur|énerv|enerv/]];
const DOM_AXE={Motricité:10,Communication:14,Attention:5,Régulation:15,Scolaire:null};
function autoAxes(ch){const out=new Set();if(!ch)return out;const st=chStats(ch);const nrm=x=>String(x||'').toLowerCase();
  (st.order||[]).forEach(l=>{const a=actByName(l);if(a&&Array.isArray(a.axes)&&a.axes.length){a.axes.forEach(n=>out.add(Number(n)));return}const txt=nrm(l);let hit=false;AXE_RULES.forEach(([n,rx])=>{if(rx.test(txt)){out.add(n);hit=true}});if(!hit&&a&&DOM_AXE[a.d])out.add(DOM_AXE[a.d])});
  (ch.ev||[]).filter(e=>e.k==='note'&&e.text&&!['vigilance','pistes','message'].includes(e.f)).forEach(e=>{const t=nrm(e.text);AXE_RULES.forEach(([n,rx])=>{if(rx.test(t))out.add(n)})});
  if(st.byCause&&st.byCause.crise)out.add(15);
  return out}
function effAxes(ch){const off=new Set((ch.axesOff||[]).map(Number));const s=new Set([...(ch.axes||[]).map(Number),...autoAxes(ch)]);off.forEach(n=>s.delete(n));return [...s].sort((a,b)=>a-b)}
ACT['ch-axes']=()=>{const {ch}=chCur();const auto=autoAxes(ch);const eff=new Set(effAxes(ch));const off=new Set((ch.axesOff||[]).map(Number));
  modal(`<div class="row between" style="flex-wrap:nowrap"><h2>Axes travaillés</h2><button class="btn link" data-act="close">OK</button></div><p class="small muted" style="margin:0 0 8px">Les axes marqués <span class="ax-auto">auto</span> sont cochés d’après les activités et tes commentaires. Touche un axe pour l’ajouter ou le retirer.</p><div class="chips-pick">${AXES.map(a=>`<button class="chip-b ${eff.has(a.n)?'on':''} ${off.has(a.n)?'off':''}" data-act="ch-axe" data-n="${a.n}">${a.n}. ${esc(a.nom)}${auto.has(a.n)?'<span class="ax-auto">auto</span>':''}</button>`).join('')}</div>`)};
ACT['ch-axe']=el=>{const {cid,sid,ch}=chCur();const n=Number(el.dataset.n);const auto=autoAxes(ch);const man=new Set((ch.axes||[]).map(Number));const off=new Set((ch.axesOff||[]).map(Number));const on=effAxes(ch).includes(n);
  if(on){man.delete(n);if(auto.has(n))off.add(n)}else{off.delete(n);if(!auto.has(n))man.add(n)}ch.axes=[...man];ch.axesOff=[...off];chSave(cid,sid,ch);ACT['ch-axes']();render()};
/* l'aide-mémoire : la ligne Comportement s'ouvre pour ajouter son propre commentaire ; les axes affichent ce qui est coché automatiquement */
const _chMemo14=chMemo;
chMemo=function(c,ch,st){const ch2={...ch,axes:effAxes(ch),ev:(ch.ev||[]).filter(e=>!(e.k==='note'&&e.f==='comportement'))};const notesC=(ch.ev||[]).filter(e=>e.k==='note'&&e.f==='comportement');
  const saveNotes=MEMO_NOTES.comportement;delete MEMO_NOTES.comportement;let h;try{h=_chMemo14(c,ch2,st)}finally{MEMO_NOTES.comportement=saveNotes}
  const auto=st.nInt?st.nInt+' arrêt'+(st.nInt>1?'s':'')+' · '+chDur(st.intTot):'Aucun arrêt pour l’instant';
  const sub=(notesC.length?esc(notesC[notesC.length-1].text)+' · ':'')+auto;const ok=!!st.workAt||notesC.length;
  const row=`<div class="memo ${ok?'ok':''} clickable" data-act="ch-note" data-f="comportement"><span class="mk">${ok?'✓':''}</span><div style="flex:1;min-width:0"><b class="small">Interruptions et comportement</b><div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</div><div class="tiny" style="color:var(--azu-ink)">${notesC.length?notesC.length+' commentaire'+(notesC.length>1?'s':'')+' · ':''}Touche pour ajouter ton commentaire</div></div><span class="chev">${I.chev}</span></div>`;
  h=h.replace(/<div class="memo[^"]*"\s*><span class="mk">[^<]*<\/span><div style="flex:1;min-width:0"><b class="small">Interruptions et comportement<\/b>[\s\S]*?<\/div><\/div>(<span class="tiny muted">auto<\/span>)?<\/div>/,row);
  const na=autoAxes(ch).size;if(na)h=h.replace('<b class="small">Axes travaillés</b>','<b class="small">Axes travaillés</b> <span class="ax-auto">'+na+' auto</span>');return h};
/* remplissage de la séance : résumé automatique + commentaire de l'intervenante, axes effectifs */
const _chFill14=chFillPatch;
chFillPatch=function(c,s,ch){const notesC=(ch.ev||[]).filter(e=>e.k==='note'&&e.f==='comportement'&&e.text).map(e=>e.text.trim());
  const p=_chFill14(c,s,{...ch,axes:effAxes(ch),ev:(ch.ev||[]).filter(e=>!(e.k==='note'&&e.f==='comportement'))});
  if(notesC.length){const base=p.comportement!=null?p.comportement:(s.comportement||'');const add=notesC.filter(n=>!base.includes(n));if(add.length)p.comportement=[base.trim(),...add].filter(Boolean).join('\n')}
  const ax=effAxes(ch);if(ax.length){const all=[...new Set([...(s.axes||[]).map(Number),...ax])];if(all.length!==(s.axes||[]).length)p.axes=all}
  return p};

/* ======================= Navigation et écrans ======================= */
PA_TABS.splice(0,PA_TABS.length,['p-home','Accueil','home','azu'],['p-agenda','Agenda','cal','cor'],['p-seances','Séances','book','men'],['p-messages','Messages','chat','azu'],['p-devoirs','Devoirs','task','lav'],['p-factures','Factures','euro','men'],['p-medias','Photos','image','saf'],['p-stats','Progrès','chart','lav'],['p-params','Réglages','gear','gray']);
const PA_MAIN=['p-home','p-agenda','p-messages','p-devoirs'];
const _navItems14=navItems;
navItems=function(){const n=_navItems14();if(role()==='parent')return n;const i=n.findIndex(x=>x[0]==='taches');n.splice(i<0?n.length:i+1,0,['km','Déplacements','map','men']);return n};
function paBadge(k){const c=paChild();if(!c)return 0;if(k==='p-messages')return ['intervenante','direction'].reduce((a,t)=>a+fUnread(c.id,t),0);if(k==='p-devoirs')return devoirsOf(c,true).filter(d=>!d.statut).length;if(k==='p-factures')return S.factures.filter(f=>f.cid===c.id&&f.statut==='transmise'&&!f.parentValide).length;return 0}
const _renderChrome14=renderChrome;
renderChrome=function(){_renderChrome14();if(role()!=='parent')return;const cur=S.view.name==='p-seance'?'p-seances':S.view.name;const items=navItems();
  $('#navSide').innerHTML=items.map(([k,l,ic,t])=>{const b=paBadge(k);return `<button data-act="nav" data-v="${k}" ${cur===k?'aria-current="page"':''}>${it(ic,t)}<span>${l}</span>${b?`<span class="nb">${b}</span>`:''}</button>`}).join('');
  const main=items.filter(x=>PA_MAIN.includes(x[0]));const inMore=!PA_MAIN.includes(cur);const moreB=items.filter(x=>!PA_MAIN.includes(x[0])).reduce((a,x)=>a+paBadge(x[0]),0);
  $('#navBottom').innerHTML=main.map(([k,l,ic])=>{const b=paBadge(k);return `<button data-act="nav" data-v="${k}" ${cur===k?'aria-current="page"':''}>${I[ic]}<span>${l}</span>${b?`<span class="badge">${b}</span>`:''}</button>`}).join('')+`<button data-act="pa-more" ${inMore?'aria-current="page"':''}>${I.more}<span>Plus</span>${moreB?'<span class="badge">'+moreB+'</span>':''}</button>`};
ACT['pa-more']=()=>{const items=navItems().filter(x=>!PA_MAIN.includes(x[0]));modal(`<div class="row between"><h2>Plus</h2><button class="btn link" data-act="close">Fermer</button></div><div class="card" style="padding:4px 14px">${items.map(([k,l,ic,t])=>{const b=paBadge(k);return `<div class="li clickable" data-act="more-go" data-v="${k}">${it(ic,t)}<div class="body"><b>${l}</b></div>${b?`<span class="nb">${b}</span>`:''}<span class="chev">${I.chev}</span></div>`}).join('')}</div>`)};
const _vParent14=vParent;
vParent=function(){const v=S.view.name;const c=paChild();if(c&&['p-messages','p-devoirs','p-factures'].includes(v)){subPhotos(c.id);return ({'p-messages':paMessages,'p-devoirs':paDevoirs,'p-factures':paFactures}[v])(c)}return _vParent14()};
/* accueil famille : ce qui attend une action */
const _paHome14=paHome;
paHome=function(c){const h=_paHome14(c);const nm=['intervenante','direction'].reduce((a,t)=>a+fUnread(c.id,t),0);const nd=devoirsOf(c,true).filter(d=>!d.statut).length;const nf=S.factures.filter(f=>f.cid===c.id&&f.statut==='transmise'&&!f.parentValide).length;
  const items=[nm?[`${nm} nouveau${nm>1?'x':''} message${nm>1?'s':''} de l’équipe`,'p-messages','chat','azu']:null,nf?[`${nf} facture${nf>1?'s':''} à valider sur votre espace URSSAF`,'p-factures','euro','saf']:null,nd?[`${nd} devoir${nd>1?'s':''} à faire à la maison`,'p-devoirs','task','lav']:null].filter(Boolean);
  const card=items.length?`<div class="card" style="padding:4px 14px">${items.map(([t,v,ic,col])=>`<div class="li clickable" data-act="nav" data-v="${v}">${it(ic,col)}<div class="body"><b class="small">${t}</b></div><span class="chev">${I.chev}</span></div>`).join('')}</div>`:'';
  const msgBtn=`<div class="row" style="gap:6px"><button class="btn ghost sm" data-act="nav" data-v="p-messages">${I.chat}Écrire à l’équipe</button></div>`;
  const i=h.indexOf('<div class="section-t">Ce mois-ci</div>');const ins=card+msgBtn;if(i>=0)return h.slice(0,i)+ins+h.slice(i);const j=h.lastIndexOf('</div>');return h.slice(0,j)+ins+h.slice(j)};
/* dossier enfant : onglet Devoirs, messages de la famille, réglage du déroulé */
const _vChild14=vChild;
vChild=function(){const tab=S.view.tab||'journal';const extra=['devoirs','famille'].includes(tab);if(extra)S.view.tab='journal';let h;try{h=_vChild14()}finally{if(extra)S.view.tab=tab}
  const c=S.children[S.view.id];if(!c)return h;const nd=devoirsOf(c,false).filter(d=>!d.statut).length;const nm=['intervenante','direction'].reduce((a,t)=>a+fUnread(c.id,t),0);
  const btns=`<button role="tab" aria-selected="${tab==='devoirs'}" data-act="tab" data-t="devoirs">${I.task}Devoirs${nd?' <span class="nb">'+nd+'</span>':''}</button><button role="tab" aria-selected="${tab==='famille'}" data-act="tab" data-t="famille">${I.chat}Famille${nm?' <span class="nb">'+nm+'</span>':''}</button>`;
  const ti=h.indexOf('<div class="tabs" role="tablist">');if(ti<0)return h;const te=h.indexOf('</div>',ti);h=h.slice(0,te)+btns+h.slice(te);
  if(extra){h=h.replace(/aria-selected="true" data-act="tab" data-t="journal"/,'aria-selected="false" data-act="tab" data-t="journal"');const te2=h.indexOf('</div>',ti)+6;const body=tab==='devoirs'?tDevoirs(c):tFamille(c);h=h.slice(0,te2)+'\n  '+body+'</div>'}
  if(isManager()){const v=c.parentDeroule===true?'on':c.parentDeroule===false?'off':'def';const sec=h.indexOf('</section>');if(sec>0){const ctl=`<div class="row small" style="gap:8px;margin-top:-4px"><span class="muted">Déroulé du minuteur visible par la famille :</span>${[['def','Réglage général ('+(S.settings.parentDeroule?'oui':'non')+')'],['on','Oui'],['off','Non']].map(([k,l])=>`<button class="btn ${v===k?'':'ghost '}sm" data-act="ch-pdr" data-c="${c.id}" data-v="${k}">${l}</button>`).join('')}</div>`;h=h.slice(0,sec+10)+ctl+h.slice(sec+10)}}
  return h};
function tFamille(c){const th=['intervenante','direction'].filter(t=>t==='intervenante'||isManager()).map(t=>({t,ms:fThreadMsgs(c.id,t)}));
  return `<div class="card" style="padding:4px 16px">${th.map(x=>`<div class="li clickable" data-act="fm-open" data-c="${c.id}" data-to="${x.t}">${it(x.t==='direction'?'team':'chat',x.t==='direction'?'lav':'azu')}<div class="body"><b class="small">${x.t==='direction'?'Échanges avec la direction':'Échanges avec '+esc(intervName(c))}</b><div class="tiny muted">${x.ms.length?esc(x.ms[x.ms.length-1].text):'Aucun message'}</div></div>${fUnread(c.id,x.t)?`<span class="nb">${fUnread(c.id,x.t)}</span>`:''}<span class="chev">${I.chev}</span></div>`).join('')}</div>
  <p class="tiny muted">Les familles écrivent depuis leur espace (onglet Messages). Les commentaires laissés sous une séance restent visibles dans la séance.</p>`}
/* accueil équipe : facturation et devoirs à suivre */
const _vHome14=vHome;
vHome=function(){const h=_vHome14();const items=[];
  if(isManager()){const n=aFacturer().reduce((a,o)=>a+o.ss.length,0);const tr=S.factures.filter(f=>f.statut==='transmise').length;if(n)items.push([`${n} séance${n>1?'s':''} réalisée${n>1?'s':''} à facturer`,'equipe','facturation','euro','saf']);if(tr)items.push([`${tr} facture${tr>1?'s':''} transmise${tr>1?'s':''}, en attente de paiement`,'equipe','facturation','clock','azu'])}
  const fm=fThreads().reduce((a,x)=>a+x.u,0);if(fm)items.push([`${fm} message${fm>1?'s':''} de famille non lu${fm>1?'s':''}`,'messages','','heart','cor']);
  if(!items.length)return h;const card=`<div class="card" style="padding:4px 14px">${items.map(([t,v,tab,ic,col])=>`<div class="li clickable" data-act="home-go14" data-v="${v}" data-t="${tab}">${it(ic,col)}<div class="body"><b class="small">${t}</b></div><span class="chev">${I.chev}</span></div>`).join('')}</div>`;
  const i=h.indexOf('<div class="card day">');return i<0?card+h:h.slice(0,i)+card+h.slice(i)};
ACT['home-go14']=el=>go(el.dataset.v,el.dataset.t?{tab:el.dataset.t}:{});
/* routage des nouveaux écrans */
const _render14=render;
const PA_NEW=['p-messages','p-devoirs','p-factures'];
render=function(){if(PA_NEW.includes(S.view.name)){if(role()!=='parent'&&!S.viewAs){S.view={name:'home'};return _render14()}renderChrome();const m=$('#main');if(!S.loaded.children){m.innerHTML='<div class="loader">Ouverture du carnet…</div>';return}const y=window.scrollY;m.innerHTML=vParent();if(S.view._keep){window.scrollTo(0,y);S.view._keep=false}return}
  if(S.view.name==='km'&&role()!=='parent'){renderChrome();const m=$('#main');if(!S.loaded.children){m.innerHTML='<div class="loader">Ouverture du carnet…</div>';return}m.innerHTML=vKm();checkUrgent();return}return _render14()};
