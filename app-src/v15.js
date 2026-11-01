/* ================= v15 : les améliorations issues de la simulation ================= */
(function(){const st=document.createElement('style');st.textContent=`
.todo-sec{display:flex;flex-direction:column;gap:0}.todo-it{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:.5px solid var(--line)}.todo-it:last-child{border-bottom:0}
.todo-it .body{flex:1;min-width:0}.todo-it .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.cpl{display:inline-flex;gap:3px;align-items:center}.cpl i{width:8px;height:8px;border-radius:50%;background:var(--line);display:inline-block}.cpl i.on{background:var(--men)}
.rank{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;padding:10px 0;border-bottom:.5px solid var(--line)}.rank:last-child{border-bottom:0}
.guide-step{display:flex;gap:12px;align-items:flex-start;padding:10px 0}.guide-step b.n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--nav);color:#fff;display:grid;place-items:center;font-size:.9rem}
html[data-simple="1"] .btn{min-height:52px;font-size:1.05rem}html[data-simple="1"] .stat b{font-size:1.9rem}html[data-simple="1"] body{font-size:1.08rem}
.axpick{display:flex;flex-wrap:wrap;gap:6px}.axpick label{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-size:.82rem;cursor:pointer}.axpick input{width:16px;height:16px;accent-color:var(--men)}`;document.head.appendChild(st)})();

S.indispos=[];
const _bootExtra15=bootExtra;
bootExtra=function(db){_bootExtra15(db);if(S.role!=='parent'){try{db.collection('indispos').onSnapshot(q=>{S.indispos=q.docs.map(d=>({id:d.id,...d.data()}));softRender14()},()=>{})}catch(e){}try{db.collection('kmmois').onSnapshot(q=>{S.kmmois={};q.docs.forEach(d=>S.kmmois[d.id]={id:d.id,...d.data()});softRender14()},()=>{})}catch(e){}}
  setTimeout(boot15,1500)};
S.kmmois={};
const api15=async(url,body)=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-MEMB':'1'},credentials:'same-origin',body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).message||'erreur');return r.json()};
const isPast=s=>{const t=today();if(s.date<t)return true;if(s.date>t)return false;const n=new Date();return s.heure?toMin(s.heure)+(Number(s.duree)||1)*60<=n.getHours()*60+n.getMinutes():false};
const filled15=s=>!!(s.activites||s.message||s.reussite);
const ago=ms=>{const h=Math.round((Date.now()-ms)/3600e3);return h<1?'moins d’une heure':h<48?h+' h':Math.round(h/24)+' jours'};

/* ======================= 1. REMPLACEMENT SÉANCE PAR SÉANCE ======================= */
const _vis15=visibleChildren;
visibleChildren=function(){const base=_vis15();if(role()!=='intervenante')return base;const me=meId();const ids=new Set(base.map(c=>c.id));Object.values(S.children).forEach(c=>{if(!ids.has(c.id)&&sessionsOf(c.id).some(s=>s.intervenante===me)){base.push(c);ids.add(c.id)}});return base};
const replOf=(c,s)=>s.intervenante&&s.intervenante!==c.intervenante?s.intervenante:null;
const _evCard15=evCard;
evCard=function(e,showWho){let h=_evCard15(e,showWho);const r=replOf(e.c,e.s);const bits=[];
  if(r)bits.push(`<span class="w" style="color:var(--azu-ink)">${r===meId()?'Remplacement : vous':'Remplacée par '+esc(pName(r)||'')}</span>`);
  if(e.s.absence&&e.s.statut!=='annulee')bits.push('<span class="w" style="color:var(--cor-ink)">Absence signalée</span>');
  if(e.s.demandeHoraire&&e.s.demandeHoraire.statut==='en_attente')bits.push('<span class="w" style="color:var(--saf-ink)">Changement demandé</span>');
  if(indispoOf(travelerOf(e.c,e.s),e.s.date)&&!r&&e.s.statut!=='annulee')bits.push('<span class="w" style="color:var(--cor-ink)">Intervenante indisponible</span>');
  return bits.length?h.replace('</button>',bits.join('')+'</button>'):h};
/* qui peut remplacer : disponible, sans autre séance au même moment, classée par distance */
async function rankRempl(c,s){const cands=Object.values(S.team).filter(m=>m.role==='intervenante'&&m.id!==c.intervenante);const t0=toMin(s.heure||'09:00'),t1=t0+(Number(s.duree)||1)*60;
  const busy=uid=>Object.values(S.children).some(k=>sessionsOf(k.id).some(x=>x.id!==s.id&&x.date===s.date&&x.statut!=='annulee'&&travelerOf(k,x)===uid&&x.heure&&toMin(x.heure)<t1&&t0<toMin(x.heure)+(Number(x.duree)||1)*60));
  const rows=cands.map(m=>({m,indispo:!!indispoOf(m.id,s.date),busy:busy(m.id),home:homeOf(m.id)}));const pairs=rows.filter(r=>r.home&&addrOf(c)).map(r=>[r.home,addrOf(c)]);
  let res=[];if(pairs.length){try{res=(await api15('/api/route',{pairs})).results}catch(e){}}let i=0;rows.forEach(r=>{if(r.home&&addrOf(c)){const x=res[i++];r.km=x&&x.km;r.min=x&&x.min}});
  return rows.sort((a,b)=>(a.indispo-b.indispo)||(a.busy-b.busy)||((a.km??999)-(b.km??999)))}
ACT['rp-find']=async el=>{const c=S.children[el.dataset.c],s=(S.sessions[el.dataset.c]||{})[el.dataset.s];if(!c||!s)return;const box=$('#rplBox');if(box)box.innerHTML='<p class="small muted">Recherche des intervenantes disponibles…</p>';
  const rows=await rankRempl(c,s);if(!$('#rplBox'))return;$('#rplBox').innerHTML=rows.length?rows.map((r,i)=>`<div class="rank"><div><b class="small">${esc(pName(r.m.id)||'')}</b>${i===0&&!r.indispo&&!r.busy?' <span class="chip men">la plus proche</span>':''}<div class="tiny muted">${r.indispo?'<span style="color:var(--cor-ink)">indisponible ce jour</span>':r.busy?'<span style="color:var(--cor-ink)">déjà en séance à cette heure</span>':'disponible'}${r.km!=null?' · '+f1km(r.km)+' km de chez elle ('+r.min+' min)':r.home?'':' · domicile non renseigné'}</div></div><button class="btn sm" data-act="rp-set" data-c="${c.id}" data-s="${s.id}" data-u="${r.m.id}" ${r.indispo?'disabled':''}>Confier</button></div>`).join(''):'<p class="small muted">Aucune autre intervenante dans l’équipe.</p>'};
ACT['rp-set']=async el=>{const cid=el.dataset.c,sid=el.dataset.s,u=el.dataset.u||null;const s=(S.sessions[cid]||{})[sid];if(await write('children/'+cid+'/sessions/'+sid,{intervenante:u},true)){if(s)s.intervenante=u;closeModal();toast(u?'Séance confiée à '+(pName(u)||''):'Remplacement retiré');render()}};
/* dans la fenêtre du rendez-vous : remplacement, absence, demande d'horaire */
const _evModal15=evModal;
evModal=function(cid,sid){_evModal15(cid,sid);const c=S.children[cid],s=(S.sessions[cid]||{})[sid];const sheet=document.querySelector('#modal .sheet');if(!c||!s||!sheet)return;const extra=[];
  if(s.absence&&s.statut!=='annulee')extra.push(`<div class="banner cor small"><b>Absence signalée</b> par ${esc(s.absence.byName||'la famille')} ${relTime(s.absence.at)}${s.absence.motif?' : « '+esc(s.absence.motif)+' »':''}<div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" data-act="abs-ok" data-c="${cid}" data-s="${sid}">Confirmer l’annulation</button><button class="btn ghost sm" data-act="abs-no" data-c="${cid}" data-s="${sid}">La séance est maintenue</button></div></div>`);
  const dh=s.demandeHoraire;if(dh&&dh.statut==='en_attente')extra.push(`<div class="banner saf small"><b>${esc(dh.byName||'La famille')} demande un autre horaire :</b> ${jourSem(dh.date)} ${fmtLong(dh.date)}${dh.heure?' à '+fmtH(dh.heure):''}${dh.msg?' — « '+esc(dh.msg)+' »':''}<div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" data-act="dh-ok" data-c="${cid}" data-s="${sid}">Accepter</button><button class="btn ghost sm" data-act="dh-no" data-c="${cid}" data-s="${sid}">Refuser</button></div></div>`);
  if(isManager()&&s.statut!=='annulee'){const r=replOf(c,s);extra.push(`<div class="card flat stack" style="gap:8px"><b class="small">Remplacement</b>${r?`<div class="small">Séance confiée à <b>${esc(pName(r)||'')}</b>. <button class="btn link sm" data-act="rp-set" data-c="${cid}" data-s="${sid}" data-u="">Retirer</button></div>`:`<div class="tiny muted">Confier cette séance seulement à une autre intervenante : elle verra l’enfant et pourra remplir la séance, ses kilomètres seront comptés.</div>`}<button class="btn ghost sm" style="align-self:flex-start" data-act="rp-find" data-c="${cid}" data-s="${sid}">${I.team}Trouver une remplaçante</button><div id="rplBox"></div></div>`)}
  if(!extra.length)return;const d=document.createElement('div');d.className='stack';d.style.gap='10px';d.innerHTML=extra.join('');const h2=sheet.querySelector('.row');h2.parentNode.insertBefore(d,h2.nextSibling)};
Object.assign(ACT,{
 'abs-ok':async el=>{if(await write('children/'+el.dataset.c+'/sessions/'+el.dataset.s,{statut:'annulee',annulation:{motif:'Absence signalée par la famille',par:'famille',at:Date.now(),confirmePar:actName()}},true)){closeModal();toast('Séance annulée, la famille et l’intervenante sont prévenues');render()}},
 'abs-no':async el=>{if(await write('children/'+el.dataset.c+'/sessions/'+el.dataset.s,{absence:null},true)){closeModal();toast('Séance maintenue');render()}},
 'dh-ok':async el=>{const s=(S.sessions[el.dataset.c]||{})[el.dataset.s];if(!s||!s.demandeHoraire)return;const dh=s.demandeHoraire;if(await write('children/'+el.dataset.c+'/sessions/'+el.dataset.s,{date:dh.date,heure:dh.heure||s.heure,demandeHoraire:{...dh,statut:'acceptee',par:actName(),le:Date.now()}},true)){closeModal();toast('Rendez-vous déplacé, la famille est prévenue');render()}},
 'dh-no':el=>{modal(`<h2>Refuser le changement</h2><label class="f"><span>Un mot pour la famille (facultatif)</span><input type="text" id="dhR" placeholder="Ex. Pas de créneau libre ce jour-là, proposons jeudi ?"></label><div class="row" style="margin-top:10px"><button class="btn" data-act="dh-no-ok" data-c="${el.dataset.c}" data-s="${el.dataset.s}">Envoyer</button><button class="btn ghost" data-act="close">Annuler</button></div>`)},
 'dh-no-ok':async el=>{const s=(S.sessions[el.dataset.c]||{})[el.dataset.s];if(!s||!s.demandeHoraire)return;if(await write('children/'+el.dataset.c+'/sessions/'+el.dataset.s,{demandeHoraire:{...s.demandeHoraire,statut:'refusee',reponse:($('#dhR').value||'').trim(),par:actName(),le:Date.now()}},true)){closeModal();toast('Réponse envoyée à la famille');render()}},
});

/* ======================= 15. INDISPONIBILITÉS ======================= */
const indispoOf=(uid,d)=>uid&&S.indispos.find(x=>x.uid===uid&&!x.deleted&&x.du<=d&&d<=(x.au||x.du));
function indispoModal(){const ppl=isManager()?Object.values(S.team).filter(m=>m.role!=='admin'||m.id===meId()):[S.team[meId()]||{id:meId()}];
  modal(`<h2>Déclarer une indisponibilité</h2><p class="small muted">Maladie, congés, formation… Les séances concernées apparaissent dans « À traiter » pour trouver une remplaçante.</p>
  ${ppl.length>1?`<label class="f"><span>Personne</span><select id="inU">${ppl.map(m=>`<option value="${m.id}" ${m.id===meId()?'selected':''}>${esc(pName(m.id)||'')}</option>`).join('')}</select></label>`:''}
  <div class="fields two"><label class="f"><span>Du</span><input type="date" id="inD" value="${today()}"></label><label class="f"><span>Au (inclus)</span><input type="date" id="inA" value="${today()}"></label></div><label class="f"><span>Motif (facultatif)</span><input type="text" id="inM" placeholder="Ex. malade"></label>
  <div class="row" style="margin-top:10px"><button class="btn" data-act="in-ok">Enregistrer</button><button class="btn ghost" data-act="close">Annuler</button></div>
  ${S.indispos.filter(x=>!x.deleted&&(x.au||x.du)>=today()&&(isManager()||x.uid===meId())).length?`<div class="section-t">À venir</div><div class="card" style="padding:4px 14px">${S.indispos.filter(x=>!x.deleted&&(x.au||x.du)>=today()&&(isManager()||x.uid===meId())).map(x=>`<div class="li small"><div class="body"><b>${esc(pName(x.uid)||'')}</b> · du ${fmtLong(x.du)} au ${fmtLong(x.au||x.du)}${x.motif?' · '+esc(x.motif):''}</div><button class="btn link sm" data-act="in-del" data-id="${x.id}">${I.trash}</button></div>`).join('')}</div>`:''}`)}
Object.assign(ACT,{
 'in-open':()=>indispoModal(),
 'in-ok':async()=>{const uid=($('#inU')||{}).value||meId();const du=$('#inD').value,au=$('#inA').value||du;if(!du||au<du){toast('Vérifie les dates.');return}const ref=S.db.collection('indispos').doc();const d={uid,du,au,motif:($('#inM').value||'').trim(),by:meId(),byName:actName(),at:Date.now()};
   if(await write('indispos/'+ref.id,d)){S.indispos.push({id:ref.id,...d});const n=Object.values(S.children).reduce((a,c)=>a+sessionsOf(c.id).filter(s=>s.statut!=='annulee'&&s.date>=du&&s.date<=au&&travelerOf(c,s)===uid).length,0);closeModal();toast(n?`Enregistré : ${n} séance${n>1?'s':''} à remplacer`:'Indisponibilité enregistrée');render()}},
 'in-del':async el=>{if(await write('indispos/'+el.dataset.id,{deleted:true},true)){const x=S.indispos.find(y=>y.id===el.dataset.id);if(x)x.deleted=true;closeModal();render()}},
});
const _vPlanning15=vPlanning;
vPlanning=function(){let h=_vPlanning15();const ref=S.view.ref||today();const from=mondayOf(ref),to=addDays(from,6);const list=S.indispos.filter(x=>!x.deleted&&x.du<=to&&(x.au||x.du)>=from);
  const ban=`<div class="row" style="gap:8px;flex-wrap:wrap">${list.map(x=>`<span class="chip cor">${esc(pName(x.uid)||'')} indisponible ${(x.au||x.du)===x.du?'le '+fmtLong(x.du):'du '+Number(x.du.slice(8))+' au '+fmtLong(x.au)}</span>`).join('')}<button class="btn ghost sm" data-act="in-open">${I.alert}Déclarer une indisponibilité</button></div>`;
  const i=h.indexOf('<div class="stats">');return i<0?h:h.slice(0,i)+ban+h.slice(i)};

/* ======================= 7. SIGNATURE À DISTANCE ======================= */
const needSign=s=>s.statut!=='annulee'&&isPast(s)&&!s.signature&&(s.statut==='realisee'||filled15(s));
ACT['pa-sign']=el=>{const c=paChild();const s=(S.sessions[c.id]||{})[el.dataset.s];if(!s)return;modal(`<h2>Confirmer la présence</h2><p>Je confirme que la séance de <b>${esc(c.prenom)}</b> a bien eu lieu le <b>${jourSem(s.date)} ${fmtLong(s.date)}${s.heure?' à '+fmtH(s.heure):''}</b>, d’une durée de ${hrs(Number(s.duree)||1)} h.</p><p class="tiny muted">Votre confirmation vaut signature de la feuille de présence. Elle est horodatée à votre nom.</p><div class="row"><button class="btn" data-act="pa-sign-ok" data-s="${s.id}">Je confirme</button><button class="btn ghost" data-act="close">Annuler</button></div>`)};
ACT['pa-sign-ok']=async el=>{const c=paChild();if(await write('children/'+c.id+'/sessions/'+el.dataset.s,{signature:{distance:true}},true)){closeModal();toast('Merci, la présence est confirmée');render()}};
const signBtn=(c,s)=>needSign(s)?`<button class="btn sm" data-act="pa-sign" data-s="${s.id}">${I.pen}Confirmer la présence</button>`:s.signature&&s.signature.distance?'<span class="chip men">Présence confirmée en ligne</span>':'';
const _paSeance15=paSeance;
paSeance=function(c){let h=_paSeance15(c);const s=(S.sessions[c.id]||{})[S.view.sid];if(!s)return h;const b=signBtn(c,s);if(!b)return h;const i=h.indexOf('<div class="card stack" style="gap:10px"><div class="row"><b class="small">Votre avis');return i<0?h:h.slice(0,i)+`<div class="card row between" style="gap:10px"><span class="small">${needSign(s)?'Cette séance n’a pas été signée sur place.':'Présence'}</span>${b}</div>`+h.slice(i)};
/* factures : une séance non signée demande un motif */
const _fCreate15=ACT['f-create'];
ACT['f-create']=el=>{const cid=el.dataset.c;const o=aFacturer().find(x=>x.c.id===cid);if(!o)return;const s0=(S.view.fsel||{})[cid]||{};const uns=o.ss.filter(s=>s0[s.id]&&!s.signature);
  if(!uns.length||el.dataset.motif)return _fCreate15(el);
  modal(`<h2>Séances non signées</h2><p class="small">${uns.length} séance${uns.length>1?'s':''} n’${uns.length>1?'ont':'a'} pas été signée${uns.length>1?'s':''} par la famille : ${uns.map(s=>fmtLong(s.date)).join(', ')}.</p><p class="tiny muted">La famille peut aussi confirmer la présence depuis son espace. Pour facturer quand même, indique pourquoi.</p>
  <label class="f"><span>Motif</span><select id="fmS"><option>Parent absent à la fin de la séance</option><option>Confirmée par téléphone</option><option>Oubli de l’intervenante</option><option>Autre</option></select></label><input type="text" id="fmT" placeholder="Précision (facultatif)" style="margin-top:8px">
  <div class="row" style="margin-top:10px"><button class="btn" data-act="f-create-motif" data-c="${cid}">Créer la facture</button><button class="btn ghost" data-act="pa-remind-sign" data-c="${cid}">Demander à la famille de confirmer</button></div>`)};
ACT['f-create-motif']=async el=>{const motif=$('#fmS').value+(($('#fmT').value||'').trim()?' : '+$('#fmT').value.trim():'');closeModal();const cid=el.dataset.c;const before=S.factures.length;
  await _fCreate15({dataset:{c:cid,motif:'1'},disabled:false});const f=S.factures[S.factures.length-1];if(S.factures.length>before&&f&&f.cid===cid&&await write('factures/'+f.id,{motifNonSigne:motif},true))f.motifNonSigne=motif};
ACT['pa-remind-sign']=async el=>{const c=S.children[el.dataset.c];const ref=S.db.collection('fmsg').doc();if(await write('fmsg/'+ref.id,{cid:c.id,to:'direction',text:`Bonjour, certaines séances de ${c.prenom} n’ont pas été signées sur place. Pouvez-vous confirmer la présence depuis l’espace famille (onglet Séances, « Confirmer la présence ») ? Merci !`})){closeModal();toast('Demande envoyée à la famille')}};

/* ======================= 8. ADRESSE OBLIGATOIRE, DOMICILE DEMANDÉ ======================= */
ACT['new-child']=()=>modal(`<h2>Nouvel enfant</h2><label class="f"><span>Prénom</span><input type="text" id="ncP"></label><label class="f"><span>Nom</span><input type="text" id="ncN"></label><label class="f"><span>Genre</span><select id="ncG"><option value="m">Garçon</option><option value="f">Fille</option></select></label>
 <label class="f"><span>Adresse des séances (obligatoire)</span><input type="text" id="ncA" placeholder="N°, rue, code postal, ville"></label><p class="tiny muted" style="margin:0">Elle sert aux rappels, au GPS et au calcul des kilomètres.</p>
 ${isManager()?`<label class="f"><span>Intervenante</span><select id="ncI"><option value="">À attribuer plus tard</option>${Object.values(S.team).filter(m=>m.role==='intervenante').map(m=>`<option value="${m.id}">${esc(pName(m.id)||'')}</option>`).join('')}</select></label>`:''}
 <div class="row"><button class="btn" data-act="new-child-ok">Créer le dossier</button><button class="btn ghost" data-act="close">Annuler</button></div>`);
ACT['new-child-ok']=async()=>{const p=$('#ncP').value.trim(),a=$('#ncA').value.trim();if(!p){toast('Indique le prénom.');return}if(a.length<8||!/\d{5}/.test(a)){toast('Indique l’adresse complète avec le code postal.');return}
  const ref=S.db.collection('children').doc();if(await write('children/'+ref.id,{prenom:p,nom:$('#ncN').value.trim(),genre:$('#ncG').value,adresse:a,createdAt:Date.now(),objectifs:[{},{},{}],intervenante:S.role==='intervenante'?S.me.id:(($('#ncI')||{}).value||'')})){closeModal();go('enfant',{id:ref.id,tab:'fiche'})}};
/* on ne peut pas enregistrer une fiche en effaçant l'adresse */
const _write15=write;
write=async function(path,data,merge){const p=String(path).split('/');if(p[0]==='children'&&p.length===2&&data&&Object.prototype.hasOwnProperty.call(data,'adresse')&&!String(data.adresse||'').trim()&&role()!=='parent'){toast('L’adresse des séances est obligatoire (rappels, GPS, kilomètres).');return false}return _write15(path,data,merge)};
function askDomicile(){if(role()==='parent'||S.viewAs)return;const me=meId();if(!S.team[me]||homeOf(me))return;const k='memb-dom-ask-'+me+'-'+today();if(ls.get(k,0))return;ls.set(k,1);
  modal(`<h2>Ton adresse de départ</h2><p class="small">Indique ton adresse : le GPS partira de chez toi et tes kilomètres seront calculés automatiquement pour le forfait. Elle n’est visible que par toi et la coordination.</p><label class="f"><span>Adresse du domicile</span><input type="text" id="domIn" placeholder="N°, rue, code postal, ville"></label><div class="row" style="margin-top:10px"><button class="btn" data-act="dom-ok">Enregistrer</button><button class="btn ghost" data-act="close">Plus tard</button></div>`)}
ACT['dom-ok']=async()=>{const v=($('#domIn').value||'').trim();if(v.length<8){toast('Adresse trop courte.');return}if(await write('team/'+meId(),{domicile:v},true)){S.team[meId()].domicile=v;closeModal();toast('Adresse enregistrée')}};

/* ======================= 9-10. ABSENCE ET CHANGEMENT D'HORAIRE (FAMILLE) ======================= */
Object.assign(ACT,{
 'pa-abs':el=>{const c=paChild();const s=(S.sessions[c.id]||{})[el.dataset.s];if(!s)return;modal(`<h2>Prévenir d’une absence</h2><p class="small">Séance du <b>${jourSem(s.date)} ${fmtLong(s.date)}${s.heure?' à '+fmtH(s.heure):''}</b>. L’intervenante et la coordination sont prévenues tout de suite.</p><label class="f"><span>Motif (facultatif)</span><input type="text" id="paAbsM" placeholder="Ex. malade, sortie scolaire"></label><div class="row" style="margin-top:10px"><button class="btn" data-act="pa-abs-ok" data-s="${s.id}">Prévenir</button><button class="btn ghost" data-act="close">Annuler</button></div>`)},
 'pa-abs-ok':async el=>{const c=paChild();if(await write('children/'+c.id+'/sessions/'+el.dataset.s,{absence:{motif:($('#paAbsM').value||'').trim()}},true)){closeModal();toast('C’est noté, l’équipe est prévenue');render()}},
 'pa-abs-undo':async el=>{const c=paChild();if(await write('children/'+c.id+'/sessions/'+el.dataset.s,{absence:null},true)){toast('Signalement retiré');render()}},
 'pa-dh':el=>{const c=paChild();const s=(S.sessions[c.id]||{})[el.dataset.s];if(!s)return;modal(`<h2>Demander un autre horaire</h2><p class="small">Séance prévue le <b>${jourSem(s.date)} ${fmtLong(s.date)}${s.heure?' à '+fmtH(s.heure):''}</b>.</p><div class="fields two"><label class="f"><span>Nouvelle date</span><input type="date" id="dhD" value="${s.date}" min="${today()}"></label><label class="f"><span>Nouvelle heure</span><input type="time" id="dhH" value="${esc(s.heure||'')}"></label></div><label class="f"><span>Message (facultatif)</span><input type="text" id="dhM"></label><div class="row" style="margin-top:10px"><button class="btn" data-act="pa-dh-ok" data-s="${s.id}">Envoyer la demande</button><button class="btn ghost" data-act="close">Annuler</button></div>`)},
 'pa-dh-ok':async el=>{const c=paChild();const d=$('#dhD').value,h=$('#dhH').value;if(!d){toast('Choisis une date.');return}if(await write('children/'+c.id+'/sessions/'+el.dataset.s,{demandeHoraire:{date:d,heure:h,msg:($('#dhM').value||'').trim()}},true)){closeModal();toast('Demande envoyée, vous recevrez la réponse ici');render()}},
});
const _paAgenda15=paAgenda;
paAgenda=function(c){let h=_paAgenda15(c);const d=paData(c);
  d.nexts.forEach(s=>{const marker=`<b class="small">${jourSem(s.date)} ${fmtLong(s.date)}</b>`;const i=h.indexOf(marker);if(i<0)return;const end=h.indexOf('</div></div>',i);if(end<0)return;const dh=s.demandeHoraire;
    const st=s.absence?`<div class="row" style="gap:6px;margin-top:6px"><span class="chip cor">Absence signalée</span><button class="btn link sm" data-act="pa-abs-undo" data-s="${s.id}">Annuler</button></div>`:dh&&dh.statut==='en_attente'?`<div class="row" style="gap:6px;margin-top:6px"><span class="chip saf">Demande : ${fmtLong(dh.date)}${dh.heure?' à '+fmtH(dh.heure):''}, en attente</span></div>`:dh&&dh.statut==='refusee'&&dh.le>Date.now()-7*864e5?`<div class="tiny" style="color:var(--cor-ink);margin-top:4px">Changement d’horaire refusé${dh.reponse?' : '+esc(dh.reponse):''}</div>`:'';
    const btns=`${st}${s.absence?'':`<div class="row" style="gap:6px;margin-top:6px"><button class="btn ghost sm" data-act="pa-abs" data-s="${s.id}">Prévenir d’une absence</button>${dh&&dh.statut==='en_attente'?'':`<button class="btn ghost sm" data-act="pa-dh" data-s="${s.id}">Autre horaire</button>`}</div>`}`;
    h=h.slice(0,end)+btns+h.slice(end)});return h};

/* ======================= 12. PAYEUR DÉSIGNÉ ======================= */
let FAM=null,FAM_AT=0;async function famLoad(force){if(!isManager())return null;if(FAM&&!force&&Date.now()-FAM_AT<60000)return FAM;try{FAM=(await api15('/api/familles')).familles;FAM_AT=Date.now();softRender14()}catch(e){}return FAM}

/* ======================= 13. À TRAITER AUJOURD'HUI ======================= */
function todoItems(){const me=meId();const mgr=isManager();const t=today();const kids=visibleChildren();const out={};const add=(k,x)=>(out[k]=out[k]||[]).push(x);
  kids.forEach(c=>sessionsOf(c.id).forEach(s=>{if(s.statut==='annulee')return;const mine=mgr||travelerOf(c,s)===me;if(!mine)return;
    if(s.absence)add('absences',{c,s});
    if(s.demandeHoraire&&s.demandeHoraire.statut==='en_attente')add('horaires',{c,s});
    if(s.date>=addDays(t,-14)&&isPast(s)&&!filled15(s)&&!s.absence)add('remplir',{c,s});
    else if(s.date>=addDays(t,-14)&&needSign(s))add('signer',{c,s});
    if(s.chrono&&s.chrono.start&&!s.chrono.end)add('minuteurs',{c,s});
    if(filled15(s)&&s.date>=addDays(t,-7)&&cplScore(s).n<3)add('incomplets',{c,s});
    if(mgr&&s.date>=t&&s.date<=addDays(t,14)&&indispoOf(travelerOf(c,s),s.date)&&!replOf(c,s))add('remplacer',{c,s})}));
  fThreads().forEach(x=>{const last=x.ms[x.ms.length-1];if(x.u&&last.fromRole==='parent')add('messages',{c:x.c,to:x.to,last,u:x.u})});
  if(mgr){S.factures.filter(f=>f.statut==='transmise'&&!f.parentValide&&f.transmiseAt&&Date.now()-f.transmiseAt>24*3600e3).forEach(f=>add('factures',{f}));S.factures.filter(f=>f.statut==='refusee').forEach(f=>add('factures',{f}));
    kids.forEach(c=>{if(!addrOf(c))add('adresses',{c});if(c.demandeDeroule&&c.parentDeroule!==true)add('deroule',{c})});
    Object.values(S.team).filter(m=>['intervenante','coordinatrice'].includes(m.role)&&!homeOf(m.id)).forEach(m=>add('domiciles',{m}));
    (FAM||[]).forEach(f=>{const c=S.children[f.cid];if(!c)return;if(!f.parents.length)add('familles',{c,why:'aucun compte parent'});else if(!f.parents.some(p=>p.actif))add('familles',{c,why:'invitation jamais acceptée'})});
    const n=aFacturer().reduce((a,o)=>a+o.ss.length,0);if(n)add('facturer',{n})}
  return out}
const TODO_SEC=[['absences','Absences signalées','alert','cor'],['horaires','Demandes de changement d’horaire','cal','saf'],['remplacer','Séances à remplacer','team','cor'],['remplir','Séances à remplir','pen','saf'],['minuteurs','Minuteurs restés ouverts','clock','cor'],['messages','Messages des familles sans réponse','chat','azu'],['signer','Séances non signées','pen','lav'],['factures','Factures URSSAF bloquées','euro','cor'],['facturer','À facturer','euro','saf'],['incomplets','Comptes rendus incomplets (7 jours)','book','lav'],['deroule','Demandes de déroulé','eye','azu'],['familles','Familles injoignables','heart','cor'],['adresses','Fiches sans adresse','pin','cor'],['domiciles','Domiciles non renseignés','home','saf']];
function todoCount(){const o=todoItems();return Object.entries(o).reduce((a,[k,l])=>a+(k==='facturer'?1:l.length),0)}
function todoRow(k,x){const sl=x.s?`${jourSem(x.s.date)} ${fmtLong(x.s.date)}${x.s.heure?' · '+fmtH(x.s.heure):''}`:'';const kid=x.c?`${kidFace(x.c,32)}`:'';
  const ev=x.s?`<button class="btn sm" data-act="ev" data-c="${x.c.id}" data-s="${x.s.id}">Ouvrir</button>`:'';
  switch(k){
   case 'absences':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">${esc(x.s.absence.byName||'')} ${relTime(x.s.absence.at)}${x.s.absence.motif?' : « '+esc(x.s.absence.motif)+' »':''}</div></div><div class="acts"><button class="btn sm" data-act="abs-ok" data-c="${x.c.id}" data-s="${x.s.id}">Annuler la séance</button></div>`;
   case 'horaires':{const d=x.s.demandeHoraire;return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl} → <b>${fmtLong(d.date)}${d.heure?' à '+fmtH(d.heure):''}</b><div class="tiny muted">${esc(d.byName||'')}${d.msg?' : « '+esc(d.msg)+' »':''}</div></div><div class="acts"><button class="btn sm" data-act="dh-ok" data-c="${x.c.id}" data-s="${x.s.id}">Accepter</button><button class="btn ghost sm" data-act="dh-no" data-c="${x.c.id}" data-s="${x.s.id}">Refuser</button></div>`}
   case 'remplacer':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">${esc(pName(travelerOf(x.c,x.s))||'')} indisponible</div></div><div class="acts">${ev}</div>`;
   case 'remplir':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">${esc(pName(travelerOf(x.c,x.s))||'')} · réalisée il y a ${ago(new Date(x.s.date+'T'+(x.s.heure||'12:00')).getTime())}</div></div><div class="acts"><button class="btn sm" data-act="open-session" data-c="${x.c.id}" data-s="${x.s.id}">Remplir</button></div>`;
   case 'signer':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">La famille peut confirmer en ligne depuis son espace</div></div>`;
   case 'minuteurs':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">Arrêt automatique 1 h après la fin prévue</div></div><div class="acts"><button class="btn sm" data-act="ch-go" data-c="${x.c.id}" data-s="${x.s.id}">Ouvrir</button></div>`;
   case 'messages':return `${kidFace(x.c,32)}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${x.to==='direction'?'Direction':esc(intervName(x.c))}<div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.last.text)}</div><div class="tiny" style="color:${Date.now()-x.last.at>24*3600e3?'var(--cor-ink)':'var(--muted)'}">en attente depuis ${ago(x.last.at)}</div></div><div class="acts"><button class="btn sm" data-act="fm-open" data-c="${x.c.id}" data-to="${x.to}">Répondre</button></div>`;
   case 'factures':{const c=S.children[x.f.cid]||{prenom:'?'};return `${kidFace(c,32)}<div class="body small"><b>${esc(x.f.numero||'')} · ${esc(c.prenom)}</b> · ${eur2(x.f.montant)}<div class="tiny muted">${x.f.statut==='refusee'?'Refusée, à corriger':'Transmise il y a '+ago(x.f.transmiseAt)+', pas encore validée par la famille'}</div></div><div class="acts"><button class="btn sm" data-act="home-go14" data-v="equipe" data-t="facturation">Voir</button></div>`}
   case 'facturer':return `<div class="body small"><b>${x.n} séance${x.n>1?'s':''} réalisée${x.n>1?'s':''}</b> pas encore facturée${x.n>1?'s':''}</div><div class="acts"><button class="btn sm" data-act="home-go14" data-v="equipe" data-t="facturation">Facturer</button></div>`;
   case 'incomplets':{const sc=cplScore(x.s);return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b> · ${sl}<div class="tiny muted">${sc.n}/5 · manque : ${sc.miss.join(', ')}</div></div><div class="acts"><button class="btn ghost sm" data-act="open-session" data-c="${x.c.id}" data-s="${x.s.id}">Voir</button></div>`}
   case 'deroule':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b><div class="tiny muted">La famille demande à voir le déroulé minute par minute</div></div><div class="acts"><button class="btn sm" data-act="dr-ok" data-c="${x.c.id}">Activer</button><button class="btn ghost sm" data-act="dr-no" data-c="${x.c.id}">Pas maintenant</button></div>`;
   case 'familles':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b><div class="tiny muted">${esc(x.why)} : aucun rappel ne part</div></div><div class="acts"><a class="btn sm" href="/admin">Inviter</a></div>`;
   case 'adresses':return `${kid}<div class="body small"><b>${esc(x.c.prenom)}</b><div class="tiny muted">Pas d’adresse : ni GPS, ni kilomètres</div></div><div class="acts"><button class="btn sm" data-act="enfant-fiche" data-c="${x.c.id}">Compléter</button></div>`;
   case 'domiciles':return `${memberFace(x.m.id,32)}<div class="body small"><b>${esc(pName(x.m.id)||'')}</b><div class="tiny muted">Ses trajets depuis le domicile ne sont pas comptés</div></div><div class="acts"><button class="btn sm" data-act="km-who" data-u="${x.m.id}">Renseigner</button></div>`;
  }return ''}
function vTodo(){famLoad();const o=todoItems();const secs=TODO_SEC.filter(([k])=>(o[k]||[]).length);const n=todoCount();
  return `<div class="stack"><div class="lt"><div class="ttl">${it('task','saf')}<div><div class="eyebrow">${jourSem(today())} ${fmtLong(today())}</div><h1>À traiter</h1><div class="sub">${n?n+' point'+(n>1?'s':'')+' à regarder':'Tout est à jour'}</div></div></div><button class="btn ghost sm" data-act="in-open">${I.alert}Indisponibilité</button></div>
  ${secs.length?secs.map(([k,l,ic,col])=>`<div class="card"><div class="card-h"><div class="l">${it(ic,col)}<h3>${l}</h3></div>${k==='facturer'?'':`<span class="chip ${col}">${(o[k]||[]).length}</span>`}</div><div class="todo-sec">${o[k].slice(0,25).map(x=>`<div class="todo-it">${todoRow(k,x)}</div>`).join('')}</div></div>`).join(''):`<div class="card">${emptyBox('Rien à traiter','Absences, demandes des familles, séances à remplir ou à signer, factures bloquées : tout apparaîtra ici.','task','men')}</div>`}</div>`}
Object.assign(ACT,{
 'dr-ok':async el=>{const c=S.children[el.dataset.c];if(await write('children/'+c.id,{parentDeroule:true,demandeDeroule:null},true)){c.parentDeroule=true;c.demandeDeroule=null;toast('Déroulé activé pour '+c.prenom);render()}},
 'dr-no':async el=>{const c=S.children[el.dataset.c];if(await write('children/'+c.id,{demandeDeroule:null},true)){c.demandeDeroule=null;render()}},
 'enfant-fiche':el=>go('enfant',{id:el.dataset.c,tab:'fiche'}),
 'km-who':el=>go('km',{uid:el.dataset.u}),
});

/* ======================= 16. VALIDATION MENSUELLE DES KILOMÈTRES ======================= */
const kmLock=(uid,ym)=>{const x=S.kmmois[uid+'_'+ym];return x&&x.valide?x:null};
const _vKm15=vKm;
vKm=function(){let h=_vKm15();const uid=S.view.uid;if(!uid)return h;const ref=S.view.ref||today();const ym=ref.slice(0,7);const lk=kmLock(uid,ym);
  const from=ym+'-01',to=addDays(addMonths(from,1),-1);let tot=0;for(let d=from;d<=to;d=addDays(d,1))tot+=dayKm(uid,d).total;const tx=kmTaux(uid);
  const bar=lk?`<div class="banner men row between" style="gap:10px"><span class="small"><b>${monthLbl(ym).replace(/^./,x=>x.toUpperCase())} validé</b> par ${esc(lk.byName||'')} le ${fmt(new Date(lk.at).toISOString().slice(0,10))} : ${f1km(lk.km)} km${lk.montant?' · '+eur2(lk.montant):''}. Les corrections sont verrouillées.</span>${isManager()?`<button class="btn ghost sm" data-act="km-unlock" data-ym="${ym}">Rouvrir le mois</button>`:''}</div>`
   :isManager()?`<div class="card row between" style="gap:10px"><span class="small">${monthLbl(ym).replace(/^./,x=>x.toUpperCase())} : <b>${f1km(tot)} km</b>${tx?' · '+eur2(tot*tx):''}. Une fois vérifié, valide le mois pour la paie.</span><button class="btn sm" data-act="km-lock" data-ym="${ym}">Valider le mois</button></div>`:'';
  if(lk)h=h.replace(/<details><summary class="tiny muted">Corriger ou ajouter un déplacement<\/summary>[\s\S]*?<\/details>/g,'').replace(/<details class="card"><summary><b class="small">Ajouter un autre déplacement[\s\S]*?<\/details>/,'').replace(/<button class="btn link sm" data-act="km-x-del"[^>]*>[\s\S]*?<\/button>/g,'');
  const i=h.indexOf('<div class="stats">');return i<0?h+bar:h.slice(0,i)+bar+h.slice(i)};
Object.assign(ACT,{
 'km-lock':async el=>{const uid=S.view.uid,ym=el.dataset.ym;const from=ym+'-01',to=addDays(addMonths(from,1),-1);let km=0,miss=0;for(let d=from;d<=to;d=addDays(d,1)){const r=dayKm(uid,d);km+=r.total;if(r.missing&&dayStops(uid,d).length)miss++}
   if(miss&&!confirm(`${miss} jour${miss>1?'s sont':' est'} encore « à vérifier ». Valider quand même ?`))return;const d={uid,ym,valide:true,km:Math.round(km*10)/10,montant:kmTaux(uid)?Math.round(km*kmTaux(uid)*100)/100:null,taux:kmTaux(uid)||null,by:meId(),byName:actName(),at:Date.now()};
   if(await write('kmmois/'+uid+'_'+ym,d)){S.kmmois[uid+'_'+ym]={id:uid+'_'+ym,...d};toast('Mois validé');render()}},
 'km-unlock':async el=>{const uid=S.view.uid,ym=el.dataset.ym;if(await write('kmmois/'+uid+'_'+ym,{valide:false,rouvertPar:actName(),rouvertLe:Date.now()},true)){S.kmmois[uid+'_'+ym].valide=false;toast('Mois rouvert');render()}},
});

/* ======================= 17. COMPTE RENDU MINIMUM ======================= */
function cplScore(s){const parts=[['activités',!!s.activites],['comportement',!!s.comportement],['axes',(s.axes||[]).length>0],['message',!!s.message],['devoir',!!s.maison]];return {n:parts.filter(x=>x[1]).length,parts,miss:parts.filter(x=>!x[1]).map(x=>x[0])}}
const cplChip=s=>{const sc=cplScore(s);return `<span class="chip ${sc.n>=4?'men':sc.n>=3?'saf':'cor'}" title="Manque : ${sc.miss.join(', ')||'rien'}"><span class="cpl">${sc.parts.map(p=>`<i class="${p[1]?'on':''}"></i>`).join('')}</span> ${sc.n}/5</span>`};
const _vSessionRead15=vSessionRead;
vSessionRead=function(){let h=_vSessionRead15();const s=(S.sessions[S.view.cid]||{})[S.view.sid];if(!s||!filled15(s))return h;const sc=cplScore(s);
  h=h.replace('<div class="row" style="gap:6px"><span class="chip"',`<div class="row" style="gap:6px">${cplChip(s)}<span class="chip"`);
  if(sc.n<5){const i=h.indexOf('<div class="card win">')>=0?h.indexOf('<div class="card win">'):h.indexOf('<div class="card stack" style="gap:12px">');if(i>0)h=h.slice(0,i)+`<div class="banner saf small">Compte rendu ${sc.n}/5 : il manque ${sc.miss.join(', ')}. <button class="btn link sm" data-act="sres-edit" data-c="${S.view.cid}" data-s="${s.id}">Compléter</button></div>`+h.slice(i)}
  return h};

/* ======================= 18. AXES RATTACHÉS À CHAQUE ACTIVITÉ ======================= */
const BASE_AXES={'Vignettes de couleurs à coller':[3,10],'Comptage avec gommettes':[3,10],'Écriture du prénom':[2,12],'Loto des animaux':[1,4,14],'Tri de formes avec sablier':[3,5],'Memory à deux':[4,14],'Consignes à deux étapes':[7],'Enfilage de grosses perles':[10],'Découpage sur les lignes':[10,12],'Parcours moteur dans le salon':[11,9],'Pâte à modeler : boudins et boules':[10],'Cartes des émotions':[15,13],'Pictogrammes oui / non / pause':[13],'Comptine à gestes':[11,14],'Lecture d’un album avec questions':[1,7],'Punching ball et retour au calme':[15]};
const _libAll15=libAll;
libAll=function(){const ov={};(S.libExtra||[]).filter(e=>e.base).forEach(e=>ov[e.base]=e);return _libAll15().map(a=>a.base?{...a,axes:Array.isArray((ov[a.t]||{}).axes)?ov[a.t].axes:(BASE_AXES[a.t]||[])}:a)};
libItems=function(){return libAll().filter(a=>!a.hidden)};
const _actForm15=actForm;
actForm=function(a){_actForm15(a);const full=a?libAll().find(x=>x.key===a.key)||a:null;const sel=new Set(((full&&full.axes)||[]).map(Number));const btn=document.querySelector('#modal [data-act="act-save"]');if(!btn)return;
  const d=document.createElement('div');d.className='f';d.innerHTML=`<span>Axes travaillés par cette activité <span class="tiny muted">(cochés automatiquement dans le minuteur)</span></span><div class="axpick">${AXES.map(x=>`<label><input type="checkbox" data-afax="${x.n}" ${sel.has(x.n)?'checked':''}>${x.n}. ${esc(x.nom)}</label>`).join('')}</div>`;btn.parentNode.insertBefore(d,btn)};
const _actSave15=ACT['act-save'];
ACT['act-save']=el=>{const ax=[...document.querySelectorAll('[data-afax]:checked')].map(x=>Number(x.dataset.afax));S._afImg={...(S._afImg||{}),axes:ax};return _actSave15(el)};

/* ======================= 19-20-21-22. FAMILLES : devoirs, récap, guide, mode simplifié ======================= */
const simpleOn=()=>role()==='parent'&&!!myPrefs().simple;
async function prefSet(patch){const v={...myPrefs(),...patch};if(await write('prefs/'+meId(),v,true)){S.prefs[meId()]=v;return true}return false}
Object.assign(ACT,{
 'pf-simple':async el=>{if(await prefSet({simple:!!el.checked})){applySimple();toast(el.checked?'Affichage simplifié activé':'Affichage complet');render()}},
 'pf-recap':async el=>{if(await prefSet({recap:!!el.checked}))toast(el.checked?'Vous recevrez le récapitulatif chaque dimanche':'Récapitulatif désactivé')},
 'guide':()=>guideModal(),
 'guide-done':async()=>{await prefSet({guideVu:Date.now()});closeModal()},
 'pa-proche':async()=>{const c=paChild();const ref=S.db.collection('fmsg').doc();if(await write('fmsg/'+ref.id,{cid:c.id,to:'direction',text:`Bonjour, je souhaiterais qu’un proche puisse m’aider à suivre l’espace de ${c.prenom}. Pouvez-vous lui ouvrir un accès ? Je vous donne ses coordonnées en réponse.`})){toast('Demande envoyée à la direction');go('p-messages',{fto:'direction'})}},
 'pa-deroule-ask':async()=>{const c=paChild();if(await write('children/'+c.id,{demandeDeroule:Date.now()},true)){c.demandeDeroule=Date.now();toast('Demande envoyée à la coordination');render()}},
});
function applySimple(){const on=simpleOn();document.documentElement.dataset.simple=on?'1':'';if(on)document.documentElement.dataset.size='grand';else if(ls.get('memb-size','normal')!=='grand')delete document.documentElement.dataset.size}
const SIMPLE_MAIN=['p-home','p-messages','p-devoirs'];
const _renderChrome15=renderChrome;
renderChrome=function(){_renderChrome15();if(role()!=='parent'||!simpleOn())return;const cur=S.view.name==='p-seance'?'p-seances':S.view.name;const items=navItems();const main=items.filter(x=>SIMPLE_MAIN.includes(x[0]));
  $('#navBottom').innerHTML=main.map(([k,l,ic])=>{const b=paBadge(k);return `<button data-act="nav" data-v="${k}" ${cur===k?'aria-current="page"':''}>${I[ic]}<span>${l}</span>${b?`<span class="badge">${b}</span>`:''}</button>`}).join('')+`<button data-act="pa-more" ${SIMPLE_MAIN.includes(cur)?'':'aria-current="page"'}>${I.more}<span>Plus</span></button>`};
const devType=()=>isIOS()?'ios':/Android/i.test(navigator.userAgent)?'android':'autre';
let BIP=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();BIP=e});
ACT['pwa-install']=async()=>{if(BIP){BIP.prompt();try{await BIP.userChoice}catch(e){}BIP=null}else toast('Menu ⋮ du navigateur › « Installer l’application » ou « Ajouter à l’écran d’accueil »')};
function guideModal(){const dt=devType();const inst=standalone();const st=(n,t,x)=>`<div class="guide-step"><b class="n">${n}</b><div><b>${t}</b>${x?`<div class="small muted">${x}</div>`:''}</div></div>`;
  const steps=dt==='ios'?(inst?[st(1,'Le carnet est bien installé','Vous l’ouvrez depuis son icône : parfait.'),st(2,'Activez les notifications','Touchez le bouton ci-dessous, puis « Autoriser ».')]:[st(1,'Touchez le bouton Partager','Le carré avec une flèche vers le haut, en bas de Safari.'),st(2,'Choisissez « Sur l’écran d’accueil »','Faites défiler la liste si besoin, puis touchez « Ajouter ».'),st(3,'Ouvrez le carnet depuis la nouvelle icône','C’est indispensable sur iPhone pour recevoir les notifications.'),st(4,'Revenez ici et activez les notifications','Réglages › Notifications sur ce téléphone.')])
   :[st(1,'Installez le carnet sur le téléphone',`<button class="btn ghost sm" style="margin-top:6px" data-act="pwa-install">${I.download}Installer</button>`),st(2,'Activez les notifications','Touchez le bouton ci-dessous, puis « Autoriser ».')];
  modal(`<div class="row between"><h2>Bienvenue dans l’espace famille</h2><button class="btn link" data-act="guide-done">Fermer</button></div><p class="small">Deux minutes pour recevoir les rappels de séance et les messages de l’équipe sur votre téléphone :</p>${steps.join('')}
  ${dt!=='ios'||inst?`<button class="btn" style="width:100%;margin-top:6px" data-act="push-on">${I.bell}Activer les notifications</button>`:''}
  <label class="li" style="cursor:pointer;margin-top:10px"><div class="body"><b class="small">Affichage simplifié</b><div class="tiny muted">Grands boutons, 3 onglets seulement</div></div><input type="checkbox" class="sw" data-act="pf-simple" ${simpleOn()?'checked':''}></label>
  <button class="btn ghost" style="width:100%;margin-top:8px" data-act="guide-done">C’est fait, merci</button>`)}
/* réglages famille : affichage simplifié, récap, guide, aide d'un proche */
const _paParams15=paParams;
paParams=function(c){const h=_paParams15(c);if(S.role!=='parent')return h;const P=myPrefs();
  const card=`<div class="section-t">Confort</div><div class="card" style="padding:4px 16px"><label class="li" style="cursor:pointer"><div class="body"><b class="small">Affichage simplifié</b><div class="tiny muted">Grands boutons, 3 onglets : Accueil, Messages, Devoirs</div></div><input type="checkbox" class="sw" data-act="pf-simple" ${P.simple?'checked':''}></label>
   <label class="li" style="cursor:pointer"><div class="body"><b class="small">Récapitulatif chaque dimanche</b><div class="tiny muted">Un e-mail avec les séances, réussites, devoirs et la semaine suivante</div></div><input type="checkbox" class="sw" data-act="pf-recap" ${P.recap!==false?'checked':''}></label>
   <div class="li clickable" data-act="guide"><div class="body"><b class="small">Installer le carnet sur mon téléphone</b><div class="tiny muted">Guide pas à pas (iPhone et Android)</div></div><span class="chev">${I.chev}</span></div>
   <div class="li clickable" data-act="pa-proche"><div class="body"><b class="small">Faire aider un proche</b><div class="tiny muted">Demander à la direction d’ouvrir un accès à un proche</div></div><span class="chev">${I.chev}</span></div></div>`;
  const i=h.indexOf('<div class="section-t">Ce que l’accueil met en avant</div>');return i<0?h+card:h.slice(0,i)+card+h.slice(i)};
/* 23. le déroulé expliqué à la famille */
const _paSeances15=paSeances;
paSeances=function(c){const h=_paSeances15(c);const on=derouleOn(c);const ask=c.demandeDeroule;
  const card=`<div class="card row" style="flex-wrap:nowrap;gap:12px;align-items:flex-start">${it('clock','azu')}<div class="small" style="flex:1"><b>Le déroulé minute par minute</b><div class="muted">${on?'Activé : vous le trouvez dans chaque compte rendu, avec la durée de chaque activité.':'L’intervenante chronomètre chaque activité. Vous pouvez demander à voir ce déroulé détaillé dans les comptes rendus.'}</div>${on?'':ask?'<span class="chip azu" style="margin-top:6px">Demande envoyée</span>':`<button class="btn ghost sm" style="margin-top:8px" data-act="pa-deroule-ask">Demander à le voir</button>`}</div></div>`;
  const i=h.indexOf('<div class="card" style="padding:4px 16px"><div class="list">');return i<0?h+card:h.slice(0,i)+card+h.slice(i)};
/* séances côté famille : signature à distance dans la liste */
const _paSeancesList15=paSeances;
paSeances=function(c){let h=_paSeancesList15(c);const n=sessionsOf(c.id).filter(needSign).length;if(!n)return h;const ban=`<div class="banner saf small">${n} séance${n>1?'s':''} à confirmer : ouvrez-la et touchez « Confirmer la présence ».</div>`;const i=h.indexOf('<div class="seg">');return i<0?ban+h:h.slice(0,i)+ban+h.slice(i)};
/* accueil famille : présence à confirmer */
const _paHome15=paHome;
paHome=function(c){let h=_paHome15(c);const ns=sessionsOf(c.id).filter(needSign);if(!ns.length)return h;const row=`<div class="li clickable" data-act="pa-open" data-s="${ns[0].id}">${it('pen','saf')}<div class="body"><b class="small">${ns.length} séance${ns.length>1?'s':''} à confirmer (présence)</b></div><span class="chev">${I.chev}</span></div>`;
  const K='<div class="card" style="padding:4px 14px">';const i=h.indexOf(K);if(i>=0)return h.slice(0,i+K.length)+row+h.slice(i+K.length);const j=h.indexOf('<button class="btn ghost sm" data-act="nav" data-v="p-messages">');return j<0?h:h.slice(0,j)+`<div class="card" style="padding:4px 14px">${row}</div>`+h.slice(j)};

/* ======================= Dossier enfant : payeur ; aperçu des rappels ; minuteur arrêté ======================= */
const _vChild15=vChild;
vChild=function(){let h=_vChild15();const c=S.children[S.view.id];if(!c||!isManager())return h;famLoad();const f=(FAM||[]).find(x=>x.cid===c.id);
  const ctl=`<div class="row small" style="gap:8px;margin-top:6px"><span class="muted">Payeur URSSAF :</span><select data-payeur="${c.id}" style="width:auto;min-height:34px;padding:2px 8px"><option value="">Tous les parents</option>${(f?f.parents:[]).map(p=>`<option value="${p.id}" ${c.payeur===p.id?'selected':''}>${esc(p.name)}${p.actif?'':' (invitation en attente)'}</option>`).join('')}</select>${!addrOf(c)?'<span class="chip cor">Adresse manquante</span>':''}</div>`;
  const i=h.indexOf('Déroulé du minuteur visible par la famille');if(i>0){const j=h.indexOf('</div>',h.indexOf('</button>',h.lastIndexOf('data-act="ch-pdr"')));return h.slice(0,j+6)+ctl+h.slice(j+6)}const sec=h.indexOf('</section>');return sec<0?h:h.slice(0,sec+10)+ctl+h.slice(sec+10)};
document.addEventListener('change',async e=>{const el=e.target;if(!el.matches('select[data-payeur]'))return;const c=S.children[el.dataset.payeur];const v=el.value||null;if(await write('children/'+c.id,{payeur:v},true)){c.payeur=v;toast(v?'Payeur enregistré':'Tous les parents recevront les demandes')}});
ACT['rp-apercu']=async()=>{try{const j=await api15('/api/rappels/apercu');const KL=k=>k==='veille'?'La veille':k==='jour'?'Le jour même':k==='aucun'?'—':'Personnalisé';
  modal(`<div class="row between"><h2>Prochains rappels</h2><button class="btn link" data-act="close">Fermer</button></div><div class="card" style="padding:4px 14px">${j.next.length?j.next.map(x=>`<div class="li small"><div class="body"><b>${esc(x.prenom)}</b> · séance ${jourSem(x.date)} ${fmtLong(x.date)}${x.heure?' à '+fmtH(x.heure):''}<div class="tiny muted">${x.kind==='aucun'?'<span style="color:var(--cor-ink)">aucun compte parent : aucun rappel</span>':`${KL(x.kind)} · ${esc(x.parent||'')} · par ${x.canal} · ${new Date(x.at).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`}</div></div></div>`).join(''):'<p class="small muted">Aucun rappel prévu dans les 8 prochains jours.</p>'}</div>`)}catch(e){toast('Aperçu indisponible')}};
const _vChrono15=vChrono;
vChrono=function(){let h=_vChrono15();const ch=chGet(S.view.cid,S.view.sid);if(ch&&ch.autoEnd){const i=h.indexOf('<div class="banner men">Séance terminée');if(i>=0)h=h.slice(0,i)+'<div class="banner saf small">Le minuteur était resté ouvert : il a été arrêté automatiquement à l’heure de fin prévue.</div>'+h.slice(i)}return h};

/* ======================= Navigation : « À traiter » ======================= */
const _navItems15=navItems;
navItems=function(){const n=_navItems15();if(role()==='parent')return n;n.splice(1,0,['atraiter','À traiter','task','saf']);return n};
const _navBadge15=navBadge;
navBadge=function(k){if(k==='atraiter'){const n=todoCount();return n?`<span class="nb">${n}</span>`:''}return _navBadge15(k)};
const _render15=render;
render=function(){if(S.view.name==='atraiter'&&role()!=='parent'){renderChrome();const m=$('#main');if(!S.loaded.children){m.innerHTML='<div class="loader">Ouverture du carnet…</div>';return}m.innerHTML=vTodo();checkUrgent();return}const r=_render15();applySimple();return r};
/* l'accueil de l'équipe renvoie vers « À traiter » */
const _vHome15=vHome;
vHome=function(){const h=_vHome15();const n=todoCount();if(!n)return h;const card=`<div class="card clickable row between" data-act="nav" data-v="atraiter" style="gap:10px"><div class="row" style="gap:10px;flex-wrap:nowrap">${it('task','saf')}<div><b>À traiter aujourd’hui</b><div class="small muted">${n} point${n>1?'s':''} : absences, demandes, séances à remplir…</div></div></div><span class="nb">${n}</span></div>`;const i=h.indexOf('<div class="card" style="padding:4px 14px">');const j=h.indexOf('<div class="card day">');const at=i>=0&&(j<0||i<j)?i:j;return at<0?card+h:h.slice(0,at)+card+h.slice(at)};
function boot15(){try{applySimple();if(role()==='parent'){if(!myPrefs().guideVu&&!S.viewAs)guideModal()}else{askDomicile();famLoad()}}catch(e){}}
