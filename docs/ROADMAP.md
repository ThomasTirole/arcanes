# Roadmap & idées — Arcanes

Tout ce qu'on veut faire ou qui nous passe par la tête. On coche au fur et à mesure ; les idées
non triées vont dans « Boîte à idées ».

Légende : **[fait]** réalisé (avec le numéro de session) · **[idée]** à creuser · case vide = à faire

---

## Prochaines étapes

- [x] **[fait]** Mise à jour par « Build » + « Run » (la construction récupère le code sur GitHub) (session 4)
- [ ] **[idée]** Retenter un vrai déploiement automatique plus tard (API Infomaniak, ou demander au support pourquoi le SSH depuis GitHub est refusé)
- [ ] Tester l'Arène en vraie classe (réseau de l'école, 20+ élèves) et régler l'équilibrage
      (dégâts, munitions, rythme des vagues)
- [x] **[fait]** Carte « village médiéval » avec le pack Kenney Medieval RTS (session 4) — à enrichir (plus de variété, autres cartes)
- [ ] **Sons** : lancer de sort, impact, stun, bonne / mauvaise réponse (avec bouton couper le son)

## Nouveaux jeux

- [ ] **[idée]** **FPS rapide** façon Quake / Doom / Ultrakill, très basique et fluide dans le navigateur
      (Three.js, 3D low-poly). **Décision : les deux modes, PvP et coop**, sur un moteur commun :
  - un seul jeu « FPS » avec un réglage « Mode : chacun pour soi / coopératif » au lancement
  - PvP (deathmatch) : questions → munitions / armes, étourdi → question pour revenir
  - coop : toute la classe contre des vagues de monstres, bonnes réponses → bonus pour l'équipe
  - orbes de questions sur la carte (armes, vitesse) dans les deux modes
  - visée souris + mode clavier seul (les flèches tournent la caméra) pour les élèves sans souris
  - étapes : prototype solo (déplacements, tir, sensation de jeu, perf sur les PC de l'école) →
    multijoueur PvP → vagues de monstres pour la coop
  - style cartoon sans gore (robots, slime, étourdissement)
- [ ] **[idée]** Tir à la corde par équipes (classe contre classe ou deux moitiés de classe)
- [ ] **[idée]** Course : chaque bonne réponse fait avancer
- [ ] **[idée]** Jeu sur un seul écran projeté (pour les salles sans PC élèves)

## Arène

- [x] **[fait]** Prédiction du joueur local, interpolation, projectiles fluides (session 4)
- [x] **[fait]** Particules, ondes de choc, chiffres de dégâts, caméra qui suit, mini-carte (session 4)
- [ ] **Carte plus grande, ou qui s'agrandit selon le nombre de joueurs** (évite l'entassement à 25)
- [ ] **Spectateur qui suit un joueur** : le prof clique sur un élève dans le classement en direct et la
      caméra le suit (retour à la vue d'ensemble d'un clic)
- [ ] Cartes multiples (forêt, hiver avec les tuiles de neige du pack, château…) + choix de la carte par le prof
- [ ] **[idée]** Personnages : utiliser les petits soldats du pack Kenney (4 couleurs) à la place des mages ?
- [x] **[fait]** Plus aucun emoji dans l'appli : icônes SVG maison (session 4)
- [ ] **[idée]** Cartes créées par les élèves (comme WayArena) avec leur nom en filigrane
- [ ] Plus de sorts débloqués selon les réglages (bouclier, téléportation, soin…)
- [ ] Avatars / couleurs choisis par l'élève
- [ ] Mode équipes

## Questions & quiz

- [x] **[fait]** Explication par question (session 4)
- [x] **[fait]** Import Excel / CSV compatible Wayground + modèle téléchargeable (session 4)
- [x] **[fait]** Règle stricte pour les questions à plusieurs bonnes réponses (session 4)
- [ ] Images dans les questions (lien ou envoi de fichier)
- [ ] Temps par question réglable (par quiz ou par question)
- [ ] Autres types : vrai/faux, réponse à taper (texte court), remise en ordre
- [ ] Dossiers / étiquettes pour ranger les quiz (par module : Excel, MCD, Java…)
- [ ] **[idée]** Génération de questions à partir d'un cours (IA)

## Résultats & suivi

- [x] **[fait]** Rapport par question dépliable : juste / faux, réponses choisies, élèves en erreur, explication (session 4)
- [ ] Historique des parties (retrouver un rapport d'une ancienne session)
- [ ] Suivi par élève sur plusieurs parties (progression)
- [ ] **[idée]** Projeter la correction d'une question à la classe depuis le rapport

## Technique

- [x] **[fait]** Dépôt GitHub (session 4) — déploiement auto par SSH abandonné, mise à jour via « Build »
- [ ] Sauvegarde automatique de `data/quizzes.json` (copie datée, ou export vers GitHub)
- [ ] Comptes prof multiples (collègues) avec quiz séparés
- [ ] Tester la charge (30 élèves) et la consommation réseau à l'école

## Boîte à idées

- [ ] **[idée]** Classe virtuelle : retrouver les mêmes pseudos d'une partie à l'autre
- [ ] **[idée]** Récompenses cosmétiques gagnées avec les bonnes réponses (chapeaux, couleurs de sorts)
