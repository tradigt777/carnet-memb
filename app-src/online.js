/* ================= Version en ligne : comptes réels ================= */
const ONLINE=true;
/* Le rôle vient du compte (et non plus de Claude) */
computeRole=function(){const m=(window.MEMB_ONLINE&&window.MEMB_ONLINE.me())||{};S.me.role=m.role;if(m.id&&m.name)S.profiles[m.id]=S.profiles[m.id]||{id:m.id,name:m.name};S.role=m.role||((S.team[S.me.id]||{}).role)||'intervenante';if(S.role==='parent'&&!S.pcid){const k=Object.keys(S.children);if(k.length)S.pcid=k[0]}};
/* L'équipe est gérée par le panneau d'administration */
ensureOwner=function(){};
/* Un parent ne reçoit du serveur que les dossiers de ses enfants */
const _visKids0=visibleChildren;
visibleChildren=function(){return role()==='parent'?Object.values(S.children):_visKids0()};
/* Ajouter un membre : se fait dans le panneau d'administration (invitation par e-mail) */
ACT['add-member']=()=>{location.href='/admin#nouveau'};
/* Section « Mon compte » dans les paramètres (équipe) et dans les réglages (parents) */
function accountCard(){const m=(window.MEMB_ONLINE&&window.MEMB_ONLINE.me())||{};const mgr=['admin','coordinatrice'].includes(m.role);
  return `<div class="section-t">Mon compte</div><div class="card stack" style="gap:10px"><div class="small"><b>${esc(m.name||'')}</b><div class="muted">${esc(m.email||'')} · ${esc(ROLES[m.role]||m.role||'')}</div></div>
  <div class="row" style="gap:8px"><a class="btn ghost sm" href="/compte">${I.gear}Changer mon mot de passe</a>${mgr?`<a class="btn sm" href="/admin">${I.team}Panneau d’administration</a>`:''}<a class="btn ghost sm" href="/logout" style="color:var(--cor-ink)">Se déconnecter</a></div></div>`}
const _vParams0=vParams;
vParams=function(){const h=_vParams0();const i=h.indexOf('<div class="section-t">');return i<0?h+accountCard():h.slice(0,i)+accountCard()+h.slice(i)};
const _paParams0=paParams;
paParams=function(c){return _paParams0(c)+accountCard()};
/* Champs à caractère médical masqués (cadre : aide scolaire uniquement) */
(function(){const st=document.createElement('style');st.textContent='label.f:has([data-f="suivisExterieurs"]),label.f:has([data-f="notes.pros"]){display:none!important}';document.head.appendChild(st)})();
ROLES.parent=ROLES.parent||'Parent';
