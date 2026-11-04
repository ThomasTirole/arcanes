'use strict';
// Registre des modes de jeu : chaque sous-dossier de modes/ qui contient un server.js
// est chargé automatiquement. Son dossier public/ est servi sur /modes/<id>/.
const fs = require('fs');
const path = require('path');

const modes = new Map();

for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
  const file = path.join(__dirname, entry.name, 'server.js');
  if (!fs.existsSync(file)) continue;
  const Mode = require(file);
  if (Mode.id !== entry.name) {
    throw new Error(`modes/${entry.name}/server.js : static id doit valoir "${entry.name}" (trouvé "${Mode.id}")`);
  }
  modes.set(Mode.id, { Mode, publicDir: path.join(__dirname, entry.name, 'public') });
}

module.exports = {
  get: id => (modes.get(id) || {}).Mode || null,
  list: () => [...modes.values()].map(m => m.Mode.describe()),
  entries: () => [...modes.values()],
};
