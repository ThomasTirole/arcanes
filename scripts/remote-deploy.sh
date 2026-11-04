#!/bin/sh
# Exécuté sur le serveur Infomaniak par GitHub Actions, après l'envoi des fichiers.
# Installe les dépendances puis demande au serveur de redémarrer (hors parties en cours).
cd "$(dirname "$0")/.." || exit 1
echo "Dossier : $(pwd)"

# npm n'est pas toujours dans le PATH d'une connexion SSH : on essaie les profils habituels
if ! command -v npm >/dev/null 2>&1; then
  for f in "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.nvm/nvm.sh"; do
    [ -f "$f" ] && . "$f" >/dev/null 2>&1
  done
fi

if command -v npm >/dev/null 2>&1; then
  echo "node $(node -v 2>/dev/null), npm $(npm -v 2>/dev/null)"
  if npm install --omit=dev --no-audit --no-fund; then
    echo "Dépendances installées."
  else
    echo "::warning::npm install a échoué : lance « Build » depuis le Manager Infomaniak."
  fi
else
  echo "::warning::npm introuvable en SSH. Si les dépendances ont changé, lance « Build » dans le Manager Infomaniak."
fi

date > .restart
echo "Déploiement terminé : le serveur redémarre dès qu'aucune partie n'est en cours."
