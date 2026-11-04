# Roadmap & idées — Arcanes

Tout ce qu'on veut faire ou qui nous passe par la tête. On coche au fur et à mesure ; les idées
non triées vont dans « Boîte à idées ».

Légende : ✅ fait · 🔜 prochaine étape · 💡 idée à creuser

---

## 🔜 Prochaines étapes

- [ ] Créer les secrets GitHub et valider le premier **déploiement automatique**
- [ ] Tester l'Arène en vraie classe (réseau de l'école, 20+ élèves) et régler l'équilibrage
      (dégâts, munitions, rythme des vagues)
- [ ] Remplacer les visuels dessinés en code par un **vrai pack d'images** (ex. Kenney, licence CC0) —
      Tirtho télécharge le pack, on l'intègre
- [ ] **Sons** : lancer de sort, impact, stun, bonne / mauvaise réponse (avec bouton couper le son)

## 🎮 Nouveaux jeux

- [ ] 💡 **FPS rapide** façon Quake / Doom / Ultrakill, très basique et fluide dans le navigateur
      (Three.js, 3D low-poly). À trancher :
  - PvP (deathmatch) ou coopératif contre des vagues de monstres ?
  - visée souris + mode clavier seul (les flèches tournent la caméra) pour les élèves sans souris
  - questions → munitions / armes, mort → question pour revenir, orbes de questions sur la carte
  - commencer par un prototype solo pour régler la sensation de jeu et tester les PC de l'école
  - style cartoon sans gore (robots, slime, étourdissement)
- [ ] 💡 Tir à la corde par équipes (classe contre classe ou deux moitiés de classe)
- [ ] 💡 Course : chaque bonne réponse fait avancer
- [ ] 💡 Jeu sur un seul écran projeté (pour les salles sans PC élèves)

## ⚔️ Arène

- ✅ Prédiction du joueur local, interpolation, projectiles fluides (session 4)
- ✅ Particules, ondes de choc, chiffres de dégâts, caméra qui suit, mini-carte (session 4)
- [ ] Cartes multiples (forêt, glace, lave) + choix de la carte par le prof
- [ ] 💡 Cartes créées par les élèves (comme WayArena) avec leur nom en filigrane
- [ ] Plus de sorts débloqués selon les réglages (bouclier, téléportation, soin…)
- [ ] Avatars / couleurs choisis par l'élève
- [ ] Mode équipes

## ❓ Questions & quiz

- ✅ Explication par question (session 4)
- ✅ Import Excel / CSV compatible Wayground + modèle téléchargeable (session 4)
- ✅ Règle stricte pour les questions à plusieurs bonnes réponses (session 4)
- [ ] Images dans les questions (lien ou envoi de fichier)
- [ ] Temps par question réglable (par quiz ou par question)
- [ ] Autres types : vrai/faux, réponse à taper (texte court), remise en ordre
- [ ] Dossiers / étiquettes pour ranger les quiz (par module : Excel, MCD, Java…)
- [ ] 💡 Génération de questions à partir d'un cours (IA)

## 📊 Résultats & suivi

- ✅ Rapport par question dépliable : juste / faux, réponses choisies, élèves en erreur, explication (session 4)
- [ ] Historique des parties (retrouver un rapport d'une ancienne session)
- [ ] Suivi par élève sur plusieurs parties (progression)
- [ ] 💡 Projeter la correction d'une question à la classe depuis le rapport

## 🛠️ Technique

- ✅ Dépôt GitHub + déploiement automatique sur Infomaniak (session 4)
- [ ] Sauvegarde automatique de `data/quizzes.json` (copie datée, ou export vers GitHub)
- [ ] Comptes prof multiples (collègues) avec quiz séparés
- [ ] Tester la charge (30 élèves) et la consommation réseau à l'école

## 🗃️ Boîte à idées

- 💡 Classe virtuelle : retrouver les mêmes pseudos d'une partie à l'autre
- 💡 Récompenses cosmétiques gagnées avec les bonnes réponses (chapeaux, couleurs de sorts)
