/* ======================= v17 : « Modifier le planning » d'un enfant ======================= */
/* Déplacer un créneau régulier (ex. mardi 17h → mercredi 14h), le supprimer ou en ajouter un,
   à partir d'une date. Le serveur déplace toutes les séances futures non réalisées et prévient
   la famille une seule fois. */
const PJ17=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const plCan17=c=>!!c&&role()!=='parent'&&(isManager()||c.intervenante===actingId());
const plH17=h=>h?h.replace(':','h'):'sans heure';
const plDu17=x=>String(Number(x)||1).replace('.',',')+' h';
function plJourSel17(id,v){return `<select id="${id}">${PJ17.map((j,i)=>`<option value="${i+1}" ${Number(v)===i+1?'selected':''}>${j}</option>`).join('')}</select>`}

/* lit les champs du formulaire avant de redessiner, pour ne rien perdre */
function plRead17(){const P=S.pl17;if(!P)return;const dp=$('#plDep');if(dp&&dp.value)P.depuis=dp.value;
  P.creneaux.forEach((x,i)=>{const a=$('#plA'+i);if(!a)return;const ch=P.changes[x.cle]||(P.changes[x.cle]={action:'garder',jour:x.jour,heure:x.heure,duree:x.duree});ch.action=a.value;const j=$('#plJ'+i),h=$('#plH'+i),d=$('#plD'+i);if(j)ch.jour=Number(j.value);if(h)ch.heure=h.value;if(d)ch.duree=Number(d.value)||x.duree});
  P.ajouts.forEach((a,i)=>{const j=$('#paJ'+i),h=$('#paH'+i),d=$('#paD'+i),f=$('#paF'+i);if(j)a.jour=Number(j.value);if(h)a.heure=h.value;if(d)a.duree=Number(d.value)||1;if(f)a.jusquau=f.value})}

function plModal17(){const P=S.pl17;const c=S.children[P.cid];if(!c)return;
  const rows=P.creneaux.map((x,i)=>{const ch=P.changes[x.cle]||{action:'garder',jour:x.jour,heure:x.heure,duree:x.duree};
    return `<div class="card flat stack" style="gap:8px"><div class="row between" style="gap:8px;flex-wrap:wrap"><div><b>${PJ17[x.jour-1].replace(/^./,m=>m.toUpperCase())} · ${plH17(x.heure)}</b><div class="tiny muted">${plDu17(x.duree)} · ${x.n} séance${x.n>1?'s':''} prévue${x.n>1?'s':''}, du ${fmtLong(x.premiere)} au ${fmtLong(x.derniere)}</div></div>
     <select id="plA${i}" data-act="pl17-act" style="max-width:190px"><option value="garder" ${ch.action==='garder'?'selected':''}>Ne pas changer</option><option value="deplacer" ${ch.action==='deplacer'?'selected':''}>Changer jour / heure</option><option value="supprimer" ${ch.action==='supprimer'?'selected':''}>Supprimer ce créneau</option></select></div>
     ${ch.action==='deplacer'?`<div class="fields three"><label class="f"><span>Nouveau jour</span>${plJourSel17('plJ'+i,ch.jour)}</label><label class="f"><span>Heure</span><input type="time" id="plH${i}" value="${esc(ch.heure||'')}"></label><label class="f"><span>Durée (h)</span><input type="number" id="plD${i}" step="0.25" min="0.25" value="${ch.duree||x.duree}"></label></div>`:''}
     ${ch.action==='supprimer'?`<div class="tiny" style="color:var(--cor-ink)">Ces ${x.n} séance${x.n>1?'s seront annulées':' sera annulée'} (elles restent visibles, barrées, et peuvent être rétablies une par une).</div>`:''}</div>`}).join('');
  const adds=P.ajouts.map((a,i)=>`<div class="card flat stack" style="gap:8px"><div class="row between"><b class="small">Nouveau créneau chaque semaine</b><button class="btn ghost sm" data-act="pl17-adddel" data-i="${i}">Retirer</button></div>
    <div class="fields two"><label class="f"><span>Jour</span>${plJourSel17('paJ'+i,a.jour)}</label><label class="f"><span>Heure</span><input type="time" id="paH${i}" value="${esc(a.heure||'')}"></label><label class="f"><span>Durée (h)</span><input type="number" id="paD${i}" step="0.25" min="0.25" value="${a.duree||1}"></label><label class="f"><span>Jusqu’au</span><input type="date" id="paF${i}" value="${esc(a.jusquau||'')}"></label></div></div>`).join('');
  const prev=P.apercu?`<div class="banner men stack" style="gap:6px"><b>${P.apercu.n?`${P.apercu.n} séance${P.apercu.n>1?'s':''} ${P.apercu.n>1?'seront modifiées':'sera modifiée'}`:'Aucun changement à faire'}</b>${P.apercu.resume.length?`<ul style="margin:0;padding-left:18px">${P.apercu.resume.map(l=>`<li class="small">${esc(l)}</li>`).join('')}</ul>`:''}${P.apercu.n?`<div class="tiny">La famille, l’intervenante et la coordination recevront une seule notification.</div>`:''}</div>`:'';
  modal(`<div class="row" style="flex-wrap:nowrap;gap:10px">${kidFace(c,46)}<div><h2 style="margin:0">Modifier le planning</h2><div class="small muted">${esc(childName(c))}</div></div></div>
   <label class="f"><span>À partir du</span><input type="date" id="plDep" value="${esc(P.depuis)}" data-act="pl17-dep"></label>
   <p class="tiny muted" style="margin:0">Seules les séances à venir, non réalisées et non remplies, sont concernées. L’historique de chaque séance garde la trace du changement.</p>
   ${P.loading?'<p class="small muted">Chargement…</p>':P.creneaux.length?`<div class="stack" style="gap:8px">${rows}</div>`:'<div class="banner">Aucune séance prévue à partir de cette date. Tu peux ajouter un créneau ci-dessous.</div>'}
   ${adds}
   <button class="btn ghost sm" style="align-self:flex-start" data-act="pl17-add">${I.plus}Ajouter un créneau chaque semaine</button>
   ${prev}
   <div class="row" style="margin-top:6px">${P.apercu&&P.apercu.n?`<button class="btn" data-act="pl17-go">Confirmer les changements</button><button class="btn ghost" data-act="pl17-prev">Recalculer</button>`:`<button class="btn" data-act="pl17-prev">Voir les changements</button>`}<button class="btn ghost" data-act="close">Annuler</button></div>`)}

async function plLoad17(){const P=S.pl17;P.loading=true;P.apercu=null;plModal17();
  try{const r=await api15('/api/planning/creneaux',{cid:P.cid,depuis:P.depuis});P.creneaux=r.creneaux||[]}catch(e){P.creneaux=[];toast(e.message||'Planning indisponible')}
  P.loading=false;if(S.pl17===P)plModal17()}
function plOpen17(cid){const c=S.children[cid];if(!plCan17(c)){toast('Seule la coordination ou l’intervenante de l’enfant peut modifier son planning.');return}
  S.pl17={cid,depuis:today(),creneaux:[],changes:{},ajouts:[],apercu:null};plLoad17()}
function plBody17(){const P=S.pl17;const changes={};Object.entries(P.changes).forEach(([k,v])=>{if(v.action!=='garder')changes[k]=v});return {cid:P.cid,depuis:P.depuis,changes,ajouts:P.ajouts}}

ACT['pl17-open']=el=>plOpen17(el.dataset.c);
ACT['pl17-dep']=()=>{};
ACT['pl17-act']=()=>{};
ACT['pl17-add']=()=>{plRead17();const P=S.pl17;const fin=P.creneaux.reduce((m,x)=>x.derniere>m?x.derniere:m,'')||addDays(P.depuis,7*12);P.ajouts.push({jour:2,heure:'17:00',duree:1,jusquau:fin});P.apercu=null;plModal17()};
ACT['pl17-adddel']=el=>{plRead17();S.pl17.ajouts.splice(Number(el.dataset.i),1);S.pl17.apercu=null;plModal17()};
ACT['pl17-prev']=async()=>{plRead17();const P=S.pl17;try{P.apercu=await api15('/api/planning/modifier',{...plBody17(),apercu:true})}catch(e){toast(e.message||'Calcul impossible');return}plModal17()};
ACT['pl17-go']=async el=>{plRead17();const P=S.pl17;el.disabled=true;
  try{const r=await api15('/api/planning/modifier',plBody17());closeModal();S.pl17=null;toast(r.n?`Planning modifié : ${r.n} séance${r.n>1?'s':''}`:'Aucun changement');render()}catch(e){el.disabled=false;toast(e.message||'Modification impossible')}};
/* listes et dates : redessiner quand on change le choix ou la date de départ */
document.addEventListener('change',e=>{const t=e.target;if(!S.pl17||!t||!t.id)return;
  if(t.id==='plDep'){plRead17();plLoad17()}
  else if(/^plA\d+$/.test(t.id)){plRead17();S.pl17.apercu=null;plModal17()}
  else if(/^(pl[JHD]|pa[JHDF])\d+$/.test(t.id)&&S.pl17.apercu){plRead17();S.pl17.apercu=null;plModal17()}});

/* points d'entrée : fiche de l'enfant (journal des séances) et fenêtre d'un rendez-vous */
const _tJournal17=tJournal;
tJournal=function(c){const h=_tJournal17(c);if(!plCan17(c))return h;
  const b=`<button class="btn sm" data-act="new-session" data-id="${c.id}">`;return h.replace(b,`<div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn ghost sm" data-act="pl17-open" data-c="${c.id}">${I.repeat.replace('class="ico"','class="ico" style="width:16px;height:16px"')}Modifier le planning</button>${b}`).replace(/(data-act="new-session" data-id="[^"]*">[\s\S]*?<\/button>)/,'$1</div>')};
const _evModal17=evModal;
evModal=function(cid,sid){_evModal17(cid,sid);const c=S.children[cid];if(!plCan17(c))return;const row=document.querySelector('#modal .sheet [data-act="ev-move"]');if(!row)return;
  const b=document.createElement('button');b.className='btn ghost sm';b.style.alignSelf='flex-start';b.dataset.act='pl17-open';b.dataset.c=cid;b.innerHTML=`${I.repeat.replace('class="ico"','class="ico" style="width:16px;height:16px"')}Changer tout le planning de ${esc(c.prenom)}`;row.insertAdjacentElement('afterend',b)};
