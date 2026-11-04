#!/bin/sh
# Exécuté sur le serveur Infomaniak par GitHub Actions, APRÈS la mise en place des nouveaux fichiers.
# Infomaniak relance l'application dès que ses fichiers changent ; ce script ne fait donc que
# réinstaller les dépendances si package.json a changé depuis le dernier déploiement.
cd "$(dirname "$0")/.." || exit 1
echo "Dossier : $(pwd)"

HASH=$(md5sum package.json package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1)
if [ -d node_modules ] && [ -f .deps-hash ] && [ "$(cat .deps-hash)" = "$HASH" ]; then
  echo "Dépendances inchangées, rien à installer."
  exit 0
fi

# npm n'est pas toujours dans le PATH d'une connexion SSH : on essaie les profils habituels
if ! command -v npm >/dev/null 2>&1; then
  for f in "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.nvm/nvm.sh"; do
    [ -f "$f" ] && . "$f" >/dev/null 2>&1
  done
fi

if command -v npm >/dev/null 2>&1; then
  echo "node $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null)"
  if npm install --omit=dev --no-audit --no-fund; then
    echo "$HASH" > .deps-hash
    echo "Dépendances installées."
  else
    echo "::warning::npm install a échoué : lance « Build » depuis le Manager Infomaniak."
  fi
else
  echo "::warning::npm introuvable en SSH. Les dépendances ont changé : lance « Build » puis « Run » dans le Manager Infomaniak."
fi
