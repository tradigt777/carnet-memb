'use strict';
/* Jeu de données de test (enfants fictifs) au format de sauvegarde du carnet. */
const T = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const px = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
module.exports = function fixture() {
  const docs = {
    'team/u_owner': { nom: 'Hasan', role: 'admin', bio: '', photoId: '11111111111111111111111111111111' },
    'team/m-alice': { nom: 'Alice M.', role: 'coordinatrice', bio: 'Coordinatrice' },
    'team/m-samira': { nom: 'Samira B.', role: 'intervenante', bio: '' },
    'settings/main': { tarif: 55, dureeDef: 1 },
    'billing/lina_2026-10': { statut: 'facturee' },
    'children/lina': { prenom: 'Lina', nom: 'Test', genre: 'f', intervenante: 'm-samira', objectifs: [{ axe: 13, objectif: 'Montrer la carte pause' }], suivisExterieurs: 'Orthophoniste (donnée santé)', notes: { pros: 'échange psy', autres: 'contrat' }, obsInitiales: { premiere: 'interne' }, tarif: 55 },
    'children/adam': { prenom: 'Adam', nom: 'Test', genre: 'm', intervenante: 'm-alice', objectifs: [] },
    'children/lina/sessions/s1': { date: T(-7), heure: '16:30', duree: 1, statut: 'realisee', activites: 'Puzzle des animaux', reussite: 'A fini seule', message: 'Belle séance', vigilance: 'SECRET-VIGILANCE', pistes: 'SECRET-PISTES', reactions: 'Réaction interne', historique: [{ at: 1, action: 'a créé la séance', byName: 'Samira' }], share: { on: true, fields: { reactions: false } } },
    'children/lina/sessions/s2': { date: T(-3), heure: '16:30', duree: 1, statut: 'realisee', activites: 'SECRET-NON-PARTAGE', message: 'Message non partagé', share: { on: false } },
    'children/lina/sessions/s3': { date: T(2), heure: '16:30', duree: 1, statut: 'prevue' },
    'children/lina/photos/p1': { sessionId: 's1', date: T(-7), assetId: '22222222222222222222222222222222', visibleParent: true },
    'children/lina/photos/p2': { sessionId: 's1', date: T(-7), assetId: '33333333333333333333333333333333', visibleParent: false },
    'children/adam/sessions/a1': { date: T(-2), heure: '10:00', duree: 1, statut: 'realisee', activites: 'SECRET-ADAM', message: 'Adam' },
    'tasks/t1': { text: 'Préparer les pictos', assignee: 'm-samira', done: false },
    'messages/m1': { chan: 'equipe', text: 'Réunion vendredi', at: Date.now() - 3600e3, from: 'm-alice', fromName: 'Alice', urgent: false, ackBy: [] },
  };
  return { app: 'carnet-memb', format: 2, createdAt: new Date().toISOString(), docs, blobs: { '11111111111111111111111111111111': px, '22222222222222222222222222222222': px, '33333333333333333333333333333333': px } };
};
