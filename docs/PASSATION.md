# Passation — reprendre le projet Arcanes avec un autre compte Claude

Document écrit le 18 novembre 2026 pour qu'un autre compte Claude (ou une autre session) reprenne le projet
**sans rien perdre**. Il complète, sans les remplacer : `CLAUDE.md` (règles), `README.md` (fonctionnement),
`docs/JOURNAL.md` (historique des 11 sessions et décisions), `docs/ROADMAP.md` (tout ce qui reste à faire).
À lire en premier, puis ces quatre fichiers.

---

## 1. Message à coller dans la nouvelle conversation

> Je reprends mon projet **Arcanes** (jeux de révision multijoueurs pour mes classes). Le code est sur GitHub :
> https://github.com/ThomasTirole/arcanes (dépôt public, branche `main`). Clone-le, puis lis dans cet ordre
> `docs/PASSATION.md`, `CLAUDE.md`, `README.md`, `docs/ROADMAP.md` et les dernières entrées de
> `docs/JOURNAL.md`. Suis les règles de `CLAUDE.md` (journal, roadmap, README à chaque session, aucun emoji,
> `npm test` avant de pousser, ne jamais toucher à `data/`). On parle français, ton informel, réponses
> courtes. Dis-moi quand tu es prêt et propose la suite de la roadmap.

Si la nouvelle session doit **pousser** sur GitHub, il faut lui donner l'accès au dépôt (connecteur GitHub du
compte ou ajout du dépôt à la session).

---

## 2. Qui, quoi, où

- **Tirtho** (Thomas Tirole) : enseignant en école professionnelle dans le Jura suisse (DIVTEC ; adresse pro en
  migration vers un nouveau compte @edu.jura.ch). Classes d'apprentis (polymécaniciens, informatique : modules
  ICT, Excel, MCD, etc.). Claviers suisses **QWERTZ**. GitHub : **ThomasTirole**.
- **Arcanes** : plateforme web de jeux de révision en temps réel, inspirée de **WayArena** (Wayground). Les
  élèves jouent sur leur PC, les questions donnent des pouvoirs / munitions, être « étourdi » = répondre pour
  revenir. Les quiz sont indépendants des jeux.
- **En ligne** : https://quiz.tirtho.ch (élèves) et https://quiz.tirtho.ch/prof (profs). Version actuelle
  **v0.11.0** (`/api/status` donne la version qui tourne).
- **Hébergement** : Infomaniak, site Node.js. Le dépôt GitHub est **public**.

---

## 3. Mise à jour du site (important, souvent source de confusion)

- Pousser sur `main` **ne met pas** le site à jour. Le déploiement GitHub Actions par SSH est désactivé
  (Infomaniak refuse le SSH venant de GitHub ; le workflow `.github/workflows/deploy.yml` reste en manuel).
- Pour mettre en ligne : Tirtho va dans le **Manager Infomaniak** → son site Node.js → **Build** puis **Run**.
  Jamais pendant une partie (ça redémarre le serveur).
- Commande de construction configurée dans le Manager :
  `[ -d .git ] || { git init -q && git remote add origin https://github.com/ThomasTirole/arcanes.git; }; git fetch --depth 1 origin main && git reset --hard FETCH_HEAD && npm install --omit=dev`
- Commande de lancement : `ADMIN_PASSWORD=… node server.js` (variable d'environnement). Depuis la v0.10,
  `ADMIN_PASSWORD` ne sert plus qu'à créer le **premier compte administrateur** (« code de mise en route »).
- `data/` sur le serveur (non suivi par Git) contient les quiz de Tirtho et des collègues, les comptes
  (`accounts.json`), la clé de signature (`secret.key`) et des sauvegardes. **Ne jamais l'écraser ni le pousser.**
- Après une mise à jour qui ne s'affiche pas : Build + Run, puis Ctrl+F5 côté navigateur.
- À faire par Tirtho après la mise à jour v0.10+ : créer son compte administrateur sur `/prof` avec l'ancien
  mot de passe prof comme code de mise en route (ses quiz existants y sont rattachés automatiquement, avec une
  copie de sauvegarde). Vérifier avec lui que c'est fait.

---

## 4. Comment travailler avec Tirtho

- **Français**, ton informel, **réponses courtes et concrètes**. Il n'aime pas attendre longtemps : ne pas
  surveiller des builds / runs GitHub pendant des minutes, ne pas faire de longs comptes rendus.
- **Aucun emoji** nulle part (appli, docs, messages de commit) : icônes SVG de `public/js/icons.js`.
- Il teste **en vrai en classe** et revient avec des listes de retours : les noter tout de suite dans la
  roadmap (même s'il dit « on corrigera plus tard »), puis corriger.
- Il veut une **DA médiévale crédible, pas « IA »** : il a rejeté une première version « appli moderne » (cartes
  sombres arrondies, bouton doré). Il **aime** la DA actuelle « manuscrit enluminé ». Prochaine grosse demande :
  **overhaul graphique** façon jeu à gros budget (HUD + questions), sobre, animé, détaillé mais simple.
- Il apprécie qu'on lui demande ses préférences avant un gros chantier irréversible (ex. comptes : invitation,
  mot de passe provisoire, pas de partage — tout validé par lui).
- Il a rejeté les cartes médiévales Kenney de l'Arène (pas de délimitation claire) : garder des bords nets.
- Il aime Ultrakill / Quake / Doom pour le FPS (nervosité, mouvement).
- Les captures d'écran envoyées l'aident beaucoup à valider.

---

## 5. Architecture en bref (détails dans README)

```
server.js            Express + Socket.io : API comptes / quiz / admin, création des parties, sockets
lib/accounts.js      comptes profs : invitations, scrypt, jetons signés HMAC (data/secret.key), rôles
lib/quizzes.js       quiz (data/quizzes.json), un propriétaire par quiz, migration des anciens quiz
lib/session.js       moteur commun : lobby, questions (pioche sans répétition, mélange, multi-réponses
                     strict, 25 s, explications, anti-hasard), stats, rapport, podium, hooks des modes
modes/index.js       charge automatiquement modes/<id>/server.js (dossiers commençant par _ ignorés)
modes/_modele/       gabarit pour un nouveau jeu
modes/arena/         « Arène » 2D vue du dessus (sorts éclair / gel / feu), prédiction + interpolation
modes/fps/           « FPS — place du village » : Three.js, variante robots/brigands ou PvP
  public/game.js     jeu (collisions en boîtes, mouvement façon Ultrakill, armes, PvP)
  public/medieval.js habillage : village Quaternius, personnages animés, armes, sons Kenney
  public/jeu.js      pont entre la page élève et l'iframe du jeu (+ vue prof PvP : carte du dessus)
  public/assets/     modèles GLB, textures WebP, sons OGG, licences CC0
public/              pages élève (index.html) et prof (prof.html), css/style.css (DA), fonts/ (OFL),
                     js/common.js, quiz.js (fenêtre de questions), prof.js, eleve.js, import.js, icons.js
test/                unit.js + simulation.js (comptes, partie complète avec robots) → npm test
scripts/             remote-deploy.sh (ancien déploiement SSH), assets/build-fps-assets.mjs
docs/                JOURNAL.md, ROADMAP.md, PASSATION.md
```

Règles d'architecture : un jeu = un dossier `modes/<id>/` ; rien de propre à un jeu dans `lib/` ou `public/` ;
le **serveur décide** des dégâts, scores et munitions, le navigateur ne simule que son propre déplacement.
Les fichiers côté navigateur des jeux s'appellent **`jeu.js`** (pas `client.js`, bloqué par Brave).

---

## 6. État actuel (v0.11.0)

- **Comptes profs** (multi-tenant) : inscription par **code d'invitation** (8 caractères, 14 jours, usage
  unique) créé par un admin ; mot de passe oublié → **mot de passe provisoire** créé par un admin ; quiz et
  parties séparés par prof ; désactivation, rôles admin. Pas de partage de quiz, pas d'e-mail (choix de Tirtho).
- **Quiz** : éditeur, import Excel / CSV (compatible Wayground) et JSON, modèle Excel, export, explications,
  ordre gardé quand une réponse cite d'autres réponses, multi-réponses strict.
- **Fenêtre de questions** : feuillet de vélin, lettrine enluminée, réponses en bannières héraldiques,
  blocage 0,9 s à l'ouverture (clic réflexe), **anti-hasard** (mauvaise réponse plus rapide que le temps de
  lecture → rien gagné + blocage 5/8/11/14 s ; colonne « Au hasard » côté prof ; réglage activé par défaut).
- **Résultats** : podium, précision, tableau triable, rapport dépliable par question, export CSV.
- **Arène** : WASD + flèches pour tirer, 3 sorts, gel, mini-carte, vue prof de toute la carte.
- **FPS** : place de village médiévale (façades, toits, tours, caisses), brigands animés ou **PvP** (avatars
  personnages RPG avec anneau de couleur), bâton de foudre (tir instantané), bâton de feu (grosse boule de feu
  dessinée par le code), épée (taille avec arc lumineux, parade), protection 4 s au retour (fin dès qu'on
  attaque), réglages = invisible pendant la protection, étourdi → question 1,5 s après, bandeau « clique pour
  reprendre » après les questions, murs invisibles au-dessus de l'enceinte, vue prof PvP = carte du dessus.
- **DA** : « manuscrit enluminé » (vélin sur mur de pierre, encre, vermillon, lapis, or, double filet rouge),
  polices embarquées UnifrakturMaguntia (titres) + Alegreya (texte).

---

## 7. Problèmes connus et points à vérifier

- **Erreur « SyntaxError: expected expression, got '<' »** vue en ligne sur la vue élève du FPS (Firefox ?) :
  jamais reproduite, contournée en v0.8.1 (habillage chargé à part, sans importmap). Si elle revient : demander
  le nom du fichier dans la console.
- **Brave en navigation privée** : corrigé en v0.11 par le renommage `jeu.js` — **pas encore confirmé** par
  Tirtho.
- **Performances** du FPS médiéval (décor, 4 lumières réservées) sur les PC de l'école : pas mesurées en vrai.
- Pas encore testé avec 20+ élèves (réseau : PvP envoie la position de tous ~15 fois/s).
- Réglages à juger en vrai : vitesse de l'épée, taille de la boule de feu, durées de l'anti-hasard.
- L'Arène garde son dessin d'origine (violet) : pas encore dans le thème médiéval.
- Mes scripts de test navigateur de la session précédente (connexion par `#pwInput`) sont obsolètes depuis
  les comptes : la connexion prof se fait maintenant par e-mail + mot de passe, ou par API
  (`/api/auth/setup`, `/api/auth/login` → jeton `Authorization: Bearer`, et `token` dans `host:create`).

---

## 8. Suite prévue (voir ROADMAP pour tout)

1. **Overhaul graphique** (demande du 17 nov.) : HUD et questions dignes d'un jeu à gros budget, animations,
   sobre, dans le thème. Préparer avec des **références** (captures de jeux que Tirtho aime) et des
   **maquettes validées** avant de coder.
2. **Récap de quiz en diaporama** (une question à l'écran, puis ses résultats) — prochaine étape annoncée.
3. Questions plus sobres et lisibles (police, couleurs) — à fusionner avec l'overhaul.
4. Arène : marteler une touche pour se dégeler (barre de progression autour de la touche) ; Arène dans le thème.
5. Page de présentation d'Arcanes.
6. Sauvegarde automatique de `data/` (maintenant qu'il y a des comptes de collègues), historique des parties,
   dossiers de quiz.
7. Plus tard : FPS coop, PvP par équipes, choix du personnage, autres armes (le pack Kenney *Blaster Kit* de
   Tirtho, science-fiction, est mis de côté « pour rire plus tard »), autres types de questions, temps par
   question, images dans les questions.

---

## 9. Outils et méthodes utiles pour la prochaine session

- **Tests** : `npm install` puis `npm test` (le test démarre un serveur sur un port libre avec un dossier de
  données temporaire). Ne pas utiliser `npm install --omit=dev` en local (supprime `socket.io-client`, utilisé
  par les tests).
- **Serveur local** : `PORT=3994 ADMIN_PASSWORD=pw ARCANES_DATA_DIR=$(mktemp -d) node server.js`, puis créer le
  premier compte via `/prof` (code de mise en route `pw`).
- **Captures** : Playwright + Chromium, avec `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`
  pour la 3D. Le FPS seul s'ouvre sur `/modes/fps/index.html?debug` : `window.__fps` expose `player`, `scene`,
  `camera`, `fire()`, `punch()`, `rockets`, `Med`, `dbg()` ; `window.__swing = 0..1` fige le coup d'épée.
  Mode PvP seul : `?embed=1&mode=pvp` et messages `postMessage({ arcanesFps: true, t: ... })`.
- **Assets FPS** : reconstructibles avec `scripts/assets/build-fps-assets.mjs` à partir des packs Quaternius
  (non versionnés, Tirtho les a : « Medieval Village MegaKit [Standard] », « RPG Characters - Nov 2020 »).
  Sons pris dans les packs Kenney « RPG Audio » et « Impact Sounds ». Tous CC0, licences dans
  `modes/fps/public/assets/`.
- **Commits** : messages en français, sans emoji. La nouvelle session ajoute sa propre ligne d'attribution.

---

## 10. Historique rapide des sessions (détail dans JOURNAL)

1–3 : idée, choix (Node + Socket.io, éditeur prof, quiz réutilisables), Arène, mise en ligne Infomaniak.
4 : GitHub, mise à jour par Build, Arène fluide, import Wayground, plus d'emoji, prototype FPS solo.
5 : FPS jouable avec questions (robots), ordre des réponses gardé, Arène WASD + flèches.
6–7 : FPS PvP, puis retours de classe (spawnkill, délai d'étourdissement, Alt+Tab, sortie de carte).
8–9 : assets médiévaux, puis DA « manuscrit enluminé » (la première DA a été jugée trop « IA »).
10 : comptes profs (multi-tenant).
11 : retours de classe (bandeau de reprise, Brave, boule de feu, épée) + anti-hasard.
