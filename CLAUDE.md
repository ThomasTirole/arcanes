# Instructions pour Claude — projet Arcanes

Projet de Tirtho (enseignant en école professionnelle, Jura suisse) : jeux de révision multijoueurs pour la
classe. Langue du projet, du code commenté et des échanges : **français**, ton informel, réponses courtes.
Pour reprendre le projet depuis un autre compte ou une nouvelle session : lire d'abord `docs/PASSATION.md`.

## Suivi du projet (obligatoire à chaque session)

1. **`docs/JOURNAL.md`** — ajouter en haut une entrée « Session N — date · titre » avec trois rubriques :
   *Décisions* (avec la raison), *Réalisé*, *Reste ouvert*.
2. **`docs/ROADMAP.md`** — y noter **toutes** les idées évoquées (même vagues, dans « Boîte à idées »),
   cocher ce qui est fait (« [x] **[fait]** » + numéro de session), tenir « Prochaines étapes » à jour.
3. **`README.md`** — le mettre à jour dès qu'une fonctionnalité, un réglage ou la structure change.

## Style

- **Aucun emoji**, ni dans l'appli ni dans la doc : utiliser les icônes SVG de `public/js/icons.js`
  (`UI.icon('nom')`), ou en ajouter une dans le même style (trait 24×24).

## Architecture (voir README)

- `lib/accounts.js` (comptes profs), `lib/quizzes.js` (stockage des quiz), `lib/session.js` (moteur commun),
  `modes/<id>/` (un jeu par dossier, fichier navigateur `public/jeu.js`).
- Un nouveau jeu = copie de `modes/_modele`. Ne pas mettre de logique propre à un jeu dans `lib/` ou `public/`.
- Serveur maître des dégâts / scores ; le navigateur simule seulement son propre déplacement.

## Avant de pousser sur `main`

- `npm test` doit passer (tests unitaires + partie simulée).
- Un push sur `main` ne déploie **pas** tout seul : Tirtho met en ligne avec **Build** puis **Run** dans le Manager
  Infomaniak (le build récupère `main` sur GitHub). Ne pousser que du code testé, et lui rappeler de ne pas
  faire Build/Run pendant une partie.
- Ne jamais envoyer ni écraser `data/` (les quiz de Tirtho).
