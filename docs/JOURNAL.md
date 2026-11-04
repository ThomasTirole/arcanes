# Journal de travail — Arcanes

Une entrée par session : ce qui a été décidé, ce qui a été fait, ce qui reste ouvert.
Les plus récentes en haut.

---

## Session 4 — 4 novembre 2026 · GitHub, déploiement auto, fluidité, rapport détaillé

**Décisions**
- Code versionné sur GitHub (`ThomasTirole/arcanes`, privé), branche `main`.
- Déploiement automatique par **GitHub Actions → SSH Infomaniak** (idée de Tirtho) plutôt que `git pull`
  sur le serveur : les identifiants restent dans les secrets GitHub, rien à faire à la main.
- Redémarrage après déploiement : le serveur surveille un fichier `.restart` et se relance **uniquement
  quand aucune partie n'est en cours** (Infomaniak relance automatiquement un processus arrêté — constaté
  dans les logs lors de la mise en ligne).
- Mouvement du joueur **calculé dans le navigateur** (réactivité immédiate) et vérifié par le serveur
  (vitesse max avec « budget » de déplacement, obstacles, bords). Le serveur reste seul juge des dégâts.
  Choix assumé : risque de triche faible en classe, gain de fluidité énorme.
- Projectiles envoyés une seule fois (départ + vitesse) puis animés localement à 60 images/s ; les autres
  joueurs affichés avec 110 ms d'interpolation.
- Visuels : pas d'accès aux banques d'images depuis l'environnement de travail → personnages et décor
  **dessinés en code** (mages vectoriels, dalles, blocs, torches). Un vrai pack d'images reste dans la roadmap.
- Explication d'une question montrée à l'élève **seulement quand il se trompe et si la correction est
  activée** (sinon elle donnerait la réponse). Elle reste toujours visible dans le rapport du prof.
- Import : format compatible **Wayground/Quizizz** + notre modèle Excel en français ; détection des colonnes
  par leur nom (français ou anglais).

**Réalisé**
- Dépôt GitHub initialisé avec la version en ligne.
- `.github/workflows/deploy.yml` : vérification des secrets, contrôle de syntaxe, envoi (tar + scp),
  `npm install`, déclenchement du redémarrage. Lançable aussi à la main.
- Questions : champ **explication** (éditeur, élève, rapport, CSV) ; bouton « Continuer » pour passer.
- Règle « plusieurs bonnes réponses » vérifiée et couverte par des tests (juste seulement si toutes les
  bonnes réponses et aucune fausse) ; indication plus claire côté élève et dans l'éditeur.
- Import/export **Excel/CSV** (SheetJS embarqué dans `public/vendor`), modèle téléchargeable avec mode
  d'emploi, export Excel d'un quiz.
- **Rapport par question dépliable** : juste / faux / sans réponse, réponses choisies (nombre et %),
  élèves qui se sont trompés, explication. Export CSV enrichi.
- Arène : physique partagée (`physics.js`), prédiction locale, interpolation, projectiles locaux avec
  traînées, particules (étincelles, éclats de glace, fumée), ondes de choc, chiffres de dégâts, flash
  d'impact, voile rouge, secousses d'écran, **caméra qui suit le joueur + mini-carte**, mages animés
  (marche, bâton orienté vers la visée, orbe à la couleur du sort choisi), indicateur de recharge des sorts,
  temps de recharge par sort côté serveur.
- Tests : `test/unit.js` (correction multi-réponses, statistiques, import Wayground) + simulation mise à jour.
- Documentation : README, ce journal, `docs/ROADMAP.md`, `CLAUDE.md` (règles de suivi du projet).

- Premier déploiement auto : l'envoi des fichiers marche, mais l'étape distante échouait (code 255) —
  `sshpass` + commande passée par l'entrée standard (« heredoc ») ne fonctionne pas. Remplacé par un script
  `scripts/remote-deploy.sh` envoyé avec le code et lancé par une simple commande SSH (cherche aussi npm
  dans les profils du shell, n'échoue pas si npm est absent). Toujours 255 sans aucune sortie : en fait
  Infomaniak **refuse la 4ᵉ connexion SSH en rafale**. Solution : une seule connexion authentifiée
  (SSH ControlMaster) réutilisée pour toutes les commandes du déploiement.

**Reste ouvert**
- Vérifier que le redémarrage automatique est effectif (Infomaniak relance-t-il le processus ?).
- Tester la fluidité en vraie classe (réseau de l'école, 20+ élèves).

---

## Session 3 — 4 novembre 2026 · Mise en ligne sur quiz.tirtho.ch

**Décisions**
- Hébergement **Infomaniak Node.js** plutôt que Vercel : Vercel gère maintenant les WebSockets, mais sans
  mémoire partagée entre instances ni disque persistant → il aurait fallu Redis + une base de données.
- Envoi initial en SFTP (FileZilla) : le réseau de l'école bloque le port 22, envoi fait depuis un autre réseau.

**Réalisé**
- Sous-domaine `quiz.tirtho.ch` en site Node.js (slot libéré en supprimant n8n), démo Infomaniak supprimée.
- Erreur `Cannot find module 'express'` au premier lancement : les dépendances s'installent avec
  « Build » dans le Manager, puis « Run ».
- Partie testée de bout en bout en ligne.

---

## Session 2 — 26 octobre 2026 · Architecture « quiz + modes de jeu »

**Décisions**
- Séparer trois couches : **quiz** (stockage), **moteur commun** (salle d'attente, questions, stats,
  résultats) et **modes de jeu** (un dossier par jeu, chargé automatiquement), pour pouvoir ajouter
  d'autres jeux sans toucher au reste.

**Réalisé**
- `lib/quizzes.js`, `lib/session.js`, `modes/arena/`, `modes/_modele/` (modèle commenté), choix du jeu
  au lancement avec réglages propres à chaque jeu, tableaux de résultats selon les colonnes du jeu.

---

## Session 1 — 23 octobre 2026 · Prototype de l'Arène

**Décisions**
- Copier fidèlement la mécanique de **WayArena** (Wayground) : vagues de questions → munitions de 3 sorts →
  combat en vue de dessus ; étourdi ou à court de sorts → retour aux questions ; classement par stuns,
  précision mise en avant.
- Jeu web (Node.js + Socket.io + canvas), sur PC, contrôles 100 % clavier (flèches / WASD, Espace, 1-2-3),
  souris en option. Nom et visuels originaux (« Arcanes »).
- Questions saisies dans un éditeur intégré (pas de fichier à préparer).

**Réalisé**
- Serveur faisant autorité, espace prof (éditeur, réglages, salle d'attente, spectateur, +1 min,
  résultats, CSV), écran élève, simulation de partie avec robots.
- Libellés « WASD » (claviers QWERTZ suisses).
