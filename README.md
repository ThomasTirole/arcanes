# Arcanes — jeux de révision pour la classe

Plateforme de jeux multijoueurs en temps réel pour la classe. Le prof prépare ses **quiz à l'avance**,
puis choisit au lancement **avec quel jeu** les jouer. Premier jeu disponible : **l'Arène** (inspirée de
WayArena) — les élèves répondent pour charger leurs sorts, puis s'affrontent. D'autres jeux peuvent être
ajoutés sans toucher aux quiz ni au reste (voir « Ajouter un jeu »).

- **En ligne** : https://quiz.tirtho.ch (élèves) — https://quiz.tirtho.ch/prof (prof)
- **Élèves** : code + pseudo, sur PC (clavier)
- **Prof** : mot de passe, éditeur de quiz, import Excel, lancement, vue spectateur, résultats détaillés

Suivi du projet : [journal de travail](docs/JOURNAL.md) · [roadmap et idées](docs/ROADMAP.md)

## Lancer en local

```bash
npm install
ADMIN_PASSWORD=monmotdepasse npm start      # Windows PowerShell : $env:ADMIN_PASSWORD="..."; npm start
```

Puis ouvrir http://localhost:3000/prof. Sur le réseau de l'école, les élèves vont sur `http://<IP-de-ton-PC>:3000`.

`npm test` lance les tests unitaires (correction des questions, import Excel) puis une partie simulée
(1 prof + 4 robots).

## Mise en ligne (Infomaniak, déploiement automatique)

Le site tourne sur l'hébergement Node.js Infomaniak (`quiz.tirtho.ch`). **Chaque push sur `main` est
déployé automatiquement** par GitHub Actions (`.github/workflows/deploy.yml`) :

1. les fichiers sont envoyés par SSH (le dossier `data/` avec les quiz n'est jamais touché) ;
2. `npm install --omit=dev` est lancé sur le serveur ;
3. le fichier `.restart` est mis à jour : le serveur se relance tout seul **dès qu'aucune partie n'est en
   cours** (jamais au milieu d'une partie).

Secrets à créer une fois dans GitHub → *Settings → Secrets and variables → Actions* :

| Secret | Valeur |
|---|---|
| `IK_SSH_HOST` | hôte SSH (Manager Infomaniak → FTP / SSH) |
| `IK_SSH_USER` | utilisateur du compte SSH de l'environnement Node.js |
| `IK_SSH_PASSWORD` | son mot de passe |
| `IK_PATH` | `/srv/customer/sites/quiz.tirtho.ch` |

Le déploiement peut aussi être relancé à la main : onglet *Actions → Déployer sur Infomaniak → Run workflow*.

Réglages du site dans le Manager (onglet Node.js) : construction `npm install --omit=dev`, lancement
`ADMIN_PASSWORD=… node server.js`. Sans `ADMIN_PASSWORD`, le mot de passe prof est `arcanes`.

Le temps réel passe par Socket.io (WebSocket, avec repli automatique en long-polling si un proxy bloque).

## Le jeu « Arène »

1. Vague de questions plein écran (QCM ou choix multiples) → chaque réponse remplit les munitions.
2. Arène : vue du dessus, caméra qui suit le joueur + mini-carte. À 0 PV, le joueur est **étourdi** (stun).
3. Étourdi → 1 question pour revenir. Plus de munitions → 2 questions pour recharger. `R` = recharger volontairement.
4. Toutes les 45–75 s, nouvelle vague pour tout le monde (compteur « Prochain quiz »).
5. Fin : podium (stuns), précision de la classe, 👑 meilleure précision, rapport par question, export CSV.

| Sort | Touche | Effet | Munitions / bonne réponse |
|---|---|---|---|
| ⚡ Éclair | 1 | projectile rapide, 20 dégâts | +6 (max 20) |
| ❄️ Gel | 2 | onde autour de soi, 10 dégâts + gel 1,8 s | +2 (max 5) |
| 🔥 Boule de feu | 3 | projectile lent, 30 dégâts + explosion | +1 (max 5) |

**Contrôles** : flèches ou WASD (position physique des touches : marche en QWERTZ suisse, QWERTY et AZERTY),
Espace ou clic pour lancer (le clic vise la souris, Espace tire droit devant), 1-2-3 pour changer de sort.
Pendant le quiz : 1-6 pour répondre, Entrée pour valider / continuer.

**Fluidité** : le navigateur simule lui-même le déplacement de son joueur (aucun délai ressenti) et le
serveur vérifie les positions (vitesse max, obstacles). Les autres joueurs sont interpolés, les projectiles
animés localement à 60 images/s ; le serveur reste seul juge des touches et des dégâts.

**Réglages prof** : durée (3/5/7/10 min) et affichage de la réponse (communs à tous les jeux), fréquence des
questions, aménagements (les mauvaises réponses donnent aussi quelques sorts, et un retour dans l'arène est
garanti après une question ; sans aménagements, il faut une bonne réponse, 3 essais max).

Tous les chiffres (dégâts, vitesses, durées, carte) sont en haut de `modes/arena/server.js`.

## Les questions

- QCM à une ou plusieurs bonnes réponses (2 à 6 réponses). **Plusieurs bonnes réponses : l'élève n'a juste
  que s'il coche toutes les bonnes réponses et aucune autre.**
- **Explication** facultative par question : montrée à l'élève quand il se trompe (si « montrer la bonne
  réponse » est activé), et toujours dans le rapport du prof.
- **Rapport par question** : chaque question se déplie — juste / faux / sans réponse, nombre de fois que
  chaque réponse a été choisie, élèves qui se sont trompés, explication.

### Import / export

- **Excel / CSV** : bouton « ⬇ Modèle Excel » dans « Mes quiz ». Colonnes : `Question`, `Réponse 1` à
  `Réponse 6`, `Bonnes réponses` (numéros séparés par des virgules, ex. `1,3`), `Explication`.
- Les fichiers **Wayground / Quizizz** (`Question Text`, `Option 1…`, `Correct Answer`, `Answer explanation`)
  s'importent tels quels ; les questions à réponse libre / sondage sont ignorées et signalées.
- **JSON** :

```json
{
  "title": "Excel — bases",
  "questions": [
    { "text": "Symbole d'une référence absolue ?", "choices": ["#", "$", "&"], "correct": [1],
      "explanation": "Le $ fige la ligne et/ou la colonne." },
    { "text": "Lesquelles sont des fonctions ?", "choices": ["SOMME", "MOYENNE", "CELLULE$"], "correct": [0, 1] }
  ]
}
```

`correct` contient les index (à partir de 0) des bonnes réponses.

## Structure

Trois couches indépendantes :

```
lib/quizzes.js        1. LES QUIZ — stockage (data/quizzes.json), utilisables par tous les jeux
lib/session.js        2. LE MOTEUR COMMUN — salle d'attente, joueurs, reconnexion, questions
                         (tirage sans répétition, mélange, correction, minuteur), statistiques,
                         résultats, podium, rapport par question
modes/<id>/           3. LES JEUX — un dossier par jeu, chargé automatiquement
  server.js              règles du jeu (hérite de Session)
  public/client.js       affichage élève + vue spectateur du prof
modes/arena/          l'Arène : server.js (règles), public/physics.js (collisions partagées serveur/navigateur),
                      public/render.js (dessin, particules), public/client.js (contrôles, prédiction)
modes/_modele/        modèle commenté pour créer un nouveau jeu (ignoré tant qu'il commence par « _ »)

server.js             HTTP + API + Socket.io (générique)
public/               pages communes : élève (index.html), prof (prof.html), fenêtre de questions (js/quiz.js),
                      import/export Excel (js/import.js, vendor/xlsx.full.min.js = SheetJS, licence Apache 2.0)
test/                 unit.js (correction, import) et simulation.js (partie complète) — npm test
docs/                 JOURNAL.md (journal de travail), ROADMAP.md (idées et prochaines étapes)
.github/workflows/    deploy.yml (déploiement automatique sur Infomaniak)
scripts/              remote-deploy.sh (lancé sur le serveur après l'envoi : npm install + redémarrage)
```

## Ajouter un jeu

1. Copier `modes/_modele` en `modes/mon-jeu` et mettre `mon-jeu` comme identifiant dans `server.js`
   (`static id`) et `public/client.js` (`register('mon-jeu', …)`).
2. Redémarrer le serveur : le jeu apparaît dans « Lancer une partie », avec ses propres réglages.

Le modèle est un jeu minimal qui fonctionne tel quel (chaque bonne réponse rapporte des points). Un jeu
ne s'occupe que de ses règles ; il décide :

| Côté serveur (`server.js`) | Rôle |
|---|---|
| `static meta`, `settings`, `help`, `columns` | nom, réglages en plus, aide pour les élèves, colonnes de score |
| `onStart`, `onLateJoin`, `onRejoin` | qui reçoit des questions et quand (`this.startQuiz(p, n, raison)`) |
| `onAnswer(p, { correct })` | ce que rapporte une réponse (sorts, points, force…) |
| `onQuizDone(p)` | ce qui se passe après une série de questions |
| `onAction`, `update(now, dt)` | actions des élèves et boucle de jeu (30×/s) |
| `playerScore`, `compareRows` | scores affichés et classement du podium |

Côté navigateur, `client.js` fournit `createPlayer(ctx)` (écran élève) et `createSpectator(ctx)`
(vue projetée) ; la fenêtre de questions, l'horloge, la fin de partie et les résultats prof sont communs.
