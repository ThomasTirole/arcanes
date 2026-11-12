# Journal de travail — Arcanes

Une entrée par session : ce qui a été décidé, ce qui a été fait, ce qui reste ouvert.
Les plus récentes en haut.

---

## Session 9 — 12 novembre 2026 · Vraie direction médiévale + correctif du FPS en ligne

**Décisions**
- Tirtho : la première DA (cartes sombres arrondies, bouton doré) faisait « appli moderne / IA ». Nouvelle
  direction **manuscrit enluminé** : vélin sur mur de pierre, encre, vermillon, lapis, double filet, gothique
  pour les titres, lettrine sur chaque question, réponses en bannières héraldiques, écus pour les joueurs.
  La liste des quiz devient un seul feuillet réglé (pas une pile de cartes).
- **Polices embarquées** (OFL) au lieu de Google Fonts : marche même si le réseau de l'école bloque Google.
- FPS en ligne bloqué chez Tirtho (`SyntaxError: expected expression, got '<'` = un fichier JS reçu sous forme
  de page HTML, cause exacte non trouvée, pas reproduit dans Chrome) : l'habillage médiéval est maintenant
  chargé **à part** (import dynamique) et sans « importmap » ; si quelque chose manque, le jeu démarre quand
  même avec les boîtes. v0.8.1.

**Réalisé**
- `public/css/style.css` réécrit, `public/css/fonts.css`, `public/fonts/`, `public/img/pierre.webp`, styles de
  `prof.html` (liste réglée, éditeur avec numéros gothiques rouges, cartes de mode à double filet, classement
  en direct sur vélin), `quiz.js` (lettrine, couleur du titre par la feuille de style), couleurs des
  pourcentages en sinople / or / gueules. HUD et menu du FPS en vélin. v0.9.0.
- Captures vérifiées : accueil élève, liste prof, lancement, quiz, vue en direct, menu et HUD du FPS.

**Reste ouvert**
- Savoir quel fichier renvoyait du HTML chez Tirtho (nom du fichier dans la console, navigateur).
- Retours du test du 12 nov. notés dans la roadmap (pour une prochaine session) : Brave en navigation privée
  ne charge pas `/modes/fps/client.js` (Firefox OK) ; le menu des commandes du FPS revient après chaque série
  de questions ; épée peu convaincante ; bâton de feu = il faut une grosse boule de feu ; armes « modernes »
  peut-être plus tard. Tirtho aime la DA « manuscrit » des captures.
- Arène 2D dans le même thème.

---

## Session 8 — 12 novembre 2026 · Assets médiévaux et nouvelle direction artistique

**Décisions**
- Thème **médiéval** (choix de Tirtho), assets Quaternius (village + personnages RPG) et sons Kenney, tous CC0.
- Le pack Kenney *Blaster Kit* (armes de science-fiction) n'est **pas utilisé** : il ne colle pas au thème.
  Armes tirées du pack RPG : bâton du magicien (foudre), bâton du clerc (feu), épée du guerrier (coup au corps
  à corps). Les règles ne changent pas, seulement les noms et l'apparence.
- Décor = **habillage** posé sur les boîtes de collision existantes, pas une nouvelle carte : rien ne change
  pour la jouabilité ni pour le serveur, et le jeu reste jouable si les modèles ne chargent pas.
- Légèreté pour les PC de l'école : textures 512 px en WebP, normales / rugosité supprimées, matériaux sans
  reflets, décor fusionné par matériau. ~4,5 Mo d'assets au total (au lieu de ~250 Mo dans les packs).
- Robots → **brigands** (personnages animés) ; les volants restent des orbes magiques.
- Pages élève / prof : palette « taverne » (bois, parchemin, or, rouge brique), Cinzel + Alegreya Sans,
  icônes SVG médiévales. L'Arène (dessin canvas) n'est pas encore repeinte.

**Réalisé**
- `modes/fps/public/medieval.js` : chargement, place pavée, façades de maisons sur 3 étages avec toits,
  tours à toit pointu, estrade, murets, caisses, piliers d'angle ; personnages animés (course, attaque, chute,
  clignotement protégé) ; armes en vue à la première personne ; sons échantillonnés (épée, impacts, cloche
  d'étourdissement, pas).
- `game.js` : intégration (sans toucher aux collisions), brigands, avatars PvP, bruits de pas, ciel et lumière
  de fin d'après-midi ; HUD et menu du jeu restylés.
- `public/css/style.css`, `index.html`, `prof.html` : nouvelle DA ; favicon bouclier ; vue prof PvP aux
  couleurs de la place.
- Testé : `npm test`, test PvP serveur, captures Chrome (place sous 6 angles, avatar PvP touché, pages élève /
  prof / quiz). v0.8.0.

**Reste ouvert**
- Repeindre l'Arène 2D dans le même thème (fond, sorts, magiciens → personnages vus du dessus ?).
- Vérifier les performances sur les PC de l'école (le décor est plus lourd que les boîtes).
- Petits ajustements visuels à voir en vrai : position des bâtons, taille des personnages, escaliers.

---

## Session 7 — 12 novembre 2026 · Retours du premier test PvP en classe

**Décisions**
- **Protection** de 4 s après chaque retour dans l'arène (pas seulement après un étourdissement : après une
  série de questions aussi), qui s'arrête dès qu'on tire ou frappe. Plus efficace qu'une durée fixe courte.
- **Réglages en jeu** : ouvrir le menu pendant cette protection rend invisible et intouchable (30 s max) ;
  en plein combat, le menu ne protège pas (sinon on s'en servirait pour fuir).
- **Étourdi** : la question arrive 1,5 s après (le temps de lire « Étourdi par X »), et la fenêtre de
  questions ignore clics, chiffres et Entrée pendant 0,9 s à l'ouverture (vaut pour tous les jeux).
- **Souris libérée** (Alt+Tab, Échap) : plus de grand menu ; un petit bandeau « clique pour reprendre »,
  avec un bouton Réglages. Le jeu continue.
- **Bords de la carte** : murs invisibles au-dessus de l'enceinte + le joueur est ramené dans l'arène s'il
  en sort quand même (le serveur bornait déjà la position).

**Réalisé**
- `modes/fps/server.js` (protection, action `guard`, étourdissement différé y compris en mode robots),
  `game.js` / `index.html` (bandeau de reprise, indicateur « Protégé », murs invisibles), `public/js/quiz.js`
  (anti-clic réflexe). Tests : `npm test` + test PvP à 2 joueurs (protection, invisibilité pendant les
  réglages, délai avant la question) + bandeau vérifié dans Chrome. v0.7.1.

**Reste ouvert**
- Assets et nouvelle direction artistique (couleurs, police, icônes) selon ce que Tirtho apporte.

---

## Session 6 — 10 novembre 2026 · FPS chacun pour soi (PvP)

**Décisions**
- Un seul jeu « FPS » avec un réglage **Mode de jeu** (robots / chacun pour soi) plutôt qu'un 2e mode :
  mêmes règles de questions, même interface.
- Comme l'Arène : chaque navigateur calcule **son propre déplacement** (réactivité), mais le **serveur
  tranche les dégâts** : il vérifie munitions, cadence, distance (poing, rayon des explosions) et refuse
  les téléportations (6 m max par message). Le tir au revolver est visé côté tireur (« favor the
  shooter ») : simple et agréable, suffisant en classe.
- Réapparition au point le plus éloigné des autres + 1,5 s d'invulnérabilité (pas de « spawn kill »).
- Points d'apparition éloignés des passerelles des coins (les élèves apparaissaient face à un mur).
- Vue prof : carte vue du dessus en 2D (lisible au projecteur), le classement reste celui de la page prof.

**Réalisé**
- Serveur (`modes/fps/server.js`) : énergie, actions `pos` / `shoot` / `rocket` / `boom` / `punch`,
  étourdissements (`feed`, question pour revenir), état de tous les joueurs ~15 fois par seconde,
  régénération identique au jeu. Colonnes du classement : Étourdis / Subis.
- Jeu (`game.js`, `&mode=pvp`) : avatars des autres (couleur, nom, interpolation 110 ms, clignotent quand
  invulnérables), touches au revolver (corps / tête), roquettes et explosions visibles chez tout le monde,
  poing et piqué contre les joueurs, poussée quand on est touché, « Étourdi par X ».
- Vue prof PvP : carte de l'arène avec joueurs, regard, énergie, traits de tir, explosions.
- Testé : 2 robots par socket (téléportation limitée, poing de loin refusé, poing + 2 tirs à la tête =
  étourdi, question pour revenir, réapparition éloignée, tir sans munitions refusé, rapport) ;
  dans Chrome : 2 élèves + prof, avatar visible et touché, roquette d'un autre joueur. v0.7.0.

**Reste ouvert**
- Test en classe à 20+ : bande passante (état de tous à 15 Hz), équité du tir côté tireur.
- Coop contre des vagues de robots ; orbes de bonus sur la carte ; thème et assets.

---

## Session 5 — 10 novembre 2026 · Première version jouable du FPS avec questions

**Décisions**
- Peu de temps avant un cours : pas de multijoueur, **chaque élève joue seul contre des robots**, mais
  dans la même partie Arcanes (questions, munitions, classement commun, rapport). Rapide à livrer et
  testable en classe ; PvP / coop restent la suite.
- Le jeu 3D tourne dans une **iframe** (le prototype quasi inchangé, mode `?embed=1`) reliée à la page
  élève par messages : moins de risque qu'une réécriture.
- Robots étourdis annoncés par le navigateur, limités à 6 par seconde côté serveur (garde-fou simple).

**Réalisé**
- `modes/fps/` : serveur (vagues de questions, munitions balles / roquettes, question pour revenir,
  recharge, classement robots / étourdi), client (iframe, pause pendant les questions, « Reprendre »),
  vue prof (classement en barres + fil des robots étourdis).
- Le prototype a déménagé dans `modes/fps/public/` ; `/proto/fps/` pointe dessus.
- **Double saut corrigé** : il ne donne plus d'élan (vitesse plafonnée à la course, dans la direction
  voulue) ; saut mural moins propulsif.
- Testé : logique serveur avec un robot (munitions, revive, recharge, limite), parcours complet dans
  Chrome (prof → élève → questions → jeu → classement).

- Quiz Wayground de Tirtho (ICT-294, séq. 5) testé à l'import : 12/12 questions, explications comprises.
  Problème repéré : une réponse « Les réponses 2 et 3 sont correctes » n'a plus de sens si l'ordre est
  mélangé → **ordre gardé automatiquement** quand une réponse cite d'autres réponses, et case « Garder
  l'ordre des réponses » dans l'éditeur (`fixedOrder`). v0.6.1.

- Arène, à la demande de Tirtho : **WASD = bouger, flèches = tirer** dans leur direction (tir continu en
  maintenant, Gel une fois par appui), façon Binding of Isaac. v0.6.2.

**Reste ouvert**
- Premier test en classe : souris / clavier, performances, compréhension des élèves.
- Thème et assets du FPS ; PvP et coop.

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
  (SSH ControlMaster)… qui échoue aussi. Une hypothèse « Infomaniak redémarre l'appli quand les fichiers
  changent » a été écartée : `/api/status` répondait toujours 404, l'ancienne version tournait encore.
  **Diagnostic retenu : Infomaniak refuse la ~4ᵉ session SSH rapprochée** (y compris les canaux d'une
  connexion partagée) et bloque quelques minutes. Solution finale : **une seule session SSH** — archive
  envoyée sur l'entrée standard, déballée, puis `scripts/remote-deploy.sh` (npm install si `package.json`
  a changé, écriture de `.restart`). Le workflow attend la fin des parties avant (`/api/status`) et vérifie
  la version en ligne après. Réessaie 3 fois à 90 s d'intervalle si la connexion est refusée.
- Ajout de `/api/status` (version, heure de démarrage, nombre de parties en cours).
- Mise en ligne de la v0.3.1 par « Build » dans le Manager (les fichiers étaient déjà arrivés) : mages,
  effets et rapport détaillé validés en vraie partie par Tirtho (« c'est beaucoup mieux ! »).
- **Plus aucun emoji** (demande de Tirtho) : icônes SVG maison (`public/js/icons.js`) pour les sorts, les
  modes de jeu, l'horloge, la couronne, l'explication, l'état des élèves ; étoiles du canvas dessinées en
  tracé ; récompenses des questions affichées avec les icônes des sorts ; docs nettoyées aussi.
- Roadmap : carte plus grande / adaptée au nombre de joueurs, spectateur qui suit un élève choisi dans la
  liste, cartes médiévales dessinées avec de vrais tiles/assets.

- Après plusieurs essais encore refusés (même avec une seule session SSH), **abandon du déploiement par
  SSH depuis GitHub** : le workflow ne se lance plus à chaque push (seulement à la main). Nouvelle méthode :
  la commande de construction du Manager récupère elle-même le code sur GitHub (`git fetch` + `reset --hard`,
  `data/` intact) ; mettre à jour = « Build » puis « Run ».

- v0.3.3 : version et heure de démarrage du serveur affichées en bas de « Mes quiz ». **Mise à jour par
  « Build » + « Run » validée** (dépôt passé en public, la construction récupère le code sur GitHub).

- v0.4.0 : **carte « village médiéval »** avec le pack Kenney Medieval RTS (CC0) fourni par Tirtho :
  grille de tuiles (herbe, routes en croix), maisons, fermes, halles, tours, donjons, statue, bosquets,
  rochers ; collisions calculées depuis la zone visible de chaque image (`modes/arena/maps.js`). Carte
  agrandie (2016 × 1248, tuiles de 96). Seules les images utilisées sont copiées dans le projet.
- v0.4.1 : à la demande de Tirtho, carte par défaut = **« Cour du château »** : disposition du tout premier
  prototype (4 murs, bloc central, 2 piliers, 2 petits blocs) habillée uniquement avec le pack Kenney
  (murailles, forteresse avec porte, tours, maisons, route). Le village reste disponible comme 2ᵉ carte.
- Tirtho n'aime pas les cartes médiévales (plus de délimitation claire de l'arène comme avant) :
  **retour à la carte d'origine** (v0.5.0). Les cartes Kenney restent dans `maps.js` pour plus tard.
- **Prototype FPS solo** (`/proto/fps/`) : Three.js embarqué, déplacements façon Quake / Ultrakill (saut
  enchaîné, air strafe, dash 3 charges, piqué au sol), revolver (tête ×2) et lance-roquettes (rocket
  jump), robots au sol + drones en vagues, visée clavier possible, réglages, compteur d'images/s.
  Testé dans Chrome sans carte graphique (33 img/s en rendu logiciel, bien plus avec un vrai GPU).
- Retours de Tirtho sur le prototype FPS (« bien réactif, agréable ») → v0.5.1 : valeurs des réglages
  affichées, saut plus haut, **double saut**, un appui = un saut (plus besoin de maintenir), **vrai contrôle
  en l'air** (le contrôle « Quake » empêchait de se décaler en sautant), **glissade** et glissade-saut,
  **coup de poing** avec **parade** des tirs, et inspiré d'Ultrakill : saut mural, rebond après un piqué,
  compteur de style, soin en étourdissant au contact, arrêt sur image à la parade. Ctrl n'est pas utilisé
  (Ctrl+W fermerait l'onglet) : glissade et piqué sur C ; tir au clavier sur Entrée, F = poing.
- Décision FPS : **les deux modes (PvP et coop)** dans un seul jeu, choisis par un réglage au lancement.

**Reste ouvert**
- FPS : le double saut propulse trop vers l'avant (accélération non voulue) — à corriger à la prochaine session.
- La version qui tournait avant ne connaît pas `.restart` : la première fois, relancer l'application à la
  main depuis le Manager. Ensuite, vérifier sur quelques déploiements que la relance auto est fiable.
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
