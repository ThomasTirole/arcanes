# Arcanes — jeux de révision pour la classe

Plateforme de jeux multijoueurs en temps réel pour la classe. Le prof prépare ses **quiz à l'avance**,
puis choisit au lancement **avec quel jeu** les jouer. Premier jeu disponible : **l'Arène** (inspirée de
WayArena) — les élèves répondent pour charger leurs sorts, puis s'affrontent. D'autres jeux peuvent être
ajoutés sans toucher aux quiz ni au reste (voir « Ajouter un jeu »).

- **Élèves** : `https://ton-domaine/` → code + pseudo (sur PC, clavier)
- **Prof** : `https://ton-domaine/prof` → mot de passe, éditeur de quiz, lancement, vue spectateur, résultats

## Lancer en local

```bash
npm install
ADMIN_PASSWORD=monmotdepasse npm start      # Windows PowerShell : $env:ADMIN_PASSWORD="..."; npm start
```

Puis ouvrir http://localhost:3000/prof. Sur le réseau de l'école, les élèves vont sur `http://<IP-de-ton-PC>:3000`.

`npm test` lance une partie simulée (1 prof + 4 robots) pour vérifier que tout fonctionne.

## Déployer sur Infomaniak (hébergement Node.js)

1. Envoie le dossier (sans `node_modules`) sur l'hébergement Node.js (FTP/SSH ou dépôt Git).
2. Dans le Manager, pour le site Node.js :
   - commande de construction : `npm install --omit=dev`
   - commande d'exécution : `node server.js`
   - port : celui indiqué par Infomaniak (le serveur lit la variable `PORT`, sinon 3000)
3. Ajoute la variable d'environnement **`ADMIN_PASSWORD`** (sinon le mot de passe par défaut est `arcanes` !).
4. Les quiz sont enregistrés dans `data/quizzes.json` : pense à le sauvegarder (ou utilise « Exporter JSON »).

Le temps réel passe par Socket.io (WebSocket, avec repli automatique en long-polling si un proxy bloque).

## Le jeu « Arène »

1. Vague de questions plein écran (QCM ou choix multiples) → chaque réponse remplit les munitions.
2. Arène : vue du dessus, chacun lance ses sorts. À 0 PV, le joueur est **étourdi** (stun).
3. Étourdi → 1 question pour revenir. Plus de munitions → 2 questions pour recharger. `R` = recharger volontairement.
4. Toutes les 45–75 s, nouvelle vague pour tout le monde (compteur « Prochain quiz »).
5. Fin : podium (stuns), précision de la classe, 👑 meilleure précision, rapport par question, export CSV.

| Sort | Touche | Effet | Munitions / bonne réponse |
|---|---|---|---|
| ⚡ Éclair | 1 | projectile rapide, 20 dégâts | +6 (max 20) |
| ❄️ Gel | 2 | onde autour de soi, 10 dégâts + gel 1,8 s | +2 (max 5) |
| 🔥 Boule de feu | 3 | projectile lent, 30 dégâts + explosion | +1 (max 5) |

**Contrôles** : flèches ou WASD (détection par position physique de touche : marche en QWERTZ suisse, QWERTY et AZERTY),
Espace ou clic pour lancer (le clic vise la souris, Espace tire droit devant), 1-2-3 pour changer de sort.
Pendant le quiz : 1-6 pour répondre, Entrée pour valider.

**Réglages prof** : durée (3/5/7/10 min), affichage de la réponse — communs à tous les jeux —, fréquence des questions
(juste/faux, bonne réponse, rien), aménagements (les mauvaises réponses donnent aussi quelques sorts,
et un retour dans l'arène est garanti après une question ; sans aménagements, il faut une bonne réponse,
3 essais max).

Tous les chiffres (dégâts, vitesses, durées, carte) sont en haut de `modes/arena/server.js`.

## Format d'import JSON

```json
{
  "title": "Excel — bases",
  "questions": [
    { "text": "Symbole d'une référence absolue ?", "choices": ["#", "$", "&"], "correct": [1] },
    { "text": "Lesquelles sont des fonctions ?", "choices": ["SOMME", "MOYENNE", "CELLULE$"], "correct": [0, 1] }
  ]
}
```

`correct` contient les index (à partir de 0) des bonnes réponses. 2 à 6 réponses par question.

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
modes/arena/          l'Arène (server.js, public/client.js, render.js, arena.css)
modes/_modele/        modèle commenté pour créer un nouveau jeu (ignoré tant qu'il commence par « _ »)

server.js             HTTP + API + Socket.io (générique)
public/               pages communes : élève (index.html), prof (prof.html), fenêtre de questions (js/quiz.js)
test/simulation.js    partie simulée (npm test)
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
