# Instructions pour Claude — projet Arcanes

Projet de Tirtho (enseignant en école professionnelle, DIVTEC) : jeux de révision multijoueurs pour la
classe. Langue du projet, du code commenté et des échanges : **français**, ton informel.

## Suivi du projet (obligatoire à chaque session)

1. **`docs/JOURNAL.md`** — ajouter en haut une entrée « Session N — date · titre » avec trois rubriques :
   *Décisions* (avec la raison), *Réalisé*, *Reste ouvert*.
2. **`docs/ROADMAP.md`** — y noter **toutes** les idées évoquées (même vagues, dans « Boîte à idées »),
   cocher ce qui est fait (✅ + numéro de session), tenir « Prochaines étapes » à jour.
3. **`README.md`** — le mettre à jour dès qu'une fonctionnalité, un réglage ou la structure change.

## Architecture (voir README)

- `lib/quizzes.js` (stockage des quiz), `lib/session.js` (moteur commun), `modes/<id>/` (un jeu par dossier).
- Un nouveau jeu = copie de `modes/_modele`. Ne pas mettre de logique propre à un jeu dans `lib/` ou `public/`.
- Serveur maître des dégâts / scores ; le navigateur simule seulement son propre déplacement.

## Avant de pousser sur `main`

- `npm test` doit passer (tests unitaires + partie simulée).
- Chaque push sur `main` **déploie en production** (quiz.tirtho.ch) via GitHub Actions : ne pousser que du
  code testé. Le serveur ne redémarre qu'en dehors des parties en cours.
- Ne jamais envoyer ni écraser `data/` (les quiz de Tirtho).
