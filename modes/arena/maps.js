'use strict';
// ---------------------------------------------------------------------------
// Cartes de l'Arène. Une carte = une grille de tuiles (sol), des objets posés
// dessus (maisons, arbres, rochers…) et les rectangles de collision qui en
// découlent. Images : pack « Medieval RTS » de Kenney (CC0), dans
// public/assets/medieval/ (versions 128 px, affichées sur des tuiles de TILE unités).
// ---------------------------------------------------------------------------

const TILE = 96;

// Zone « solide » de chaque image, en fraction de la tuile (gauche, haut, droite, bas),
// mesurée sur l'image puis légèrement réduite pour que les collisions paraissent justes.
const SOLID = {
  structure_01: [0.26, 0.45, 0.74, 0.97],  // tour
  structure_05: [0.18, 0.05, 0.82, 0.62],  // donjon
  structure_09: [0.08, 0.10, 0.92, 0.92],  // grande halle
  structure_12: [0.36, 0.30, 0.64, 0.76],  // statue
  structure_16: [0.18, 0.10, 0.82, 0.92],  // maison
  structure_17: [0.18, 0.10, 0.82, 0.92],
  structure_18: [0.18, 0.18, 0.82, 0.86],
  structure_21: [0.06, 0.06, 0.94, 0.94],  // ferme
  tile_44: [0.12, 0.10, 0.88, 0.90],       // bosquet (tuile pleine)
  tile_48: [0.10, 0.08, 0.90, 0.92],       // forêt dense (tuile pleine)
  env_11: [0.22, 0.30, 0.78, 0.76],        // gros rocher gris
  env_18: [0.22, 0.30, 0.78, 0.76],        // gros rocher ocre
};

/**
 * Village médiéval, symétrique : routes en croix, statue au carrefour,
 * maisons dans les coins, halles, tours, bosquets et rochers pour se cacher.
 */
function medievalVillage() {
  const COLS = 21, ROWS = 13;
  const MID_C = 10, MID_R = 6;
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // sol : herbe variée, quelques souches / buissons décoratifs
  const ground = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const v = rnd();
      row.push(v < 0.06 ? 'tile_49' : v < 0.1 ? 'tile_50' : v < 0.12 ? 'tile_51' : v < 0.5 ? 'tile_58' : 'tile_57');
    }
    ground.push(row);
  }
  // routes en croix
  for (let c = 0; c < COLS; c++) ground[MID_R][c] = 'tile_04';
  for (let r = 0; r < ROWS; r++) ground[r][MID_C] = 'tile_03';
  ground[MID_R][MID_C] = 'tile_05';

  // objets (colonne, ligne, image) — symétriques par rapport au centre
  const objects = [];
  const place = (c, r, img, solid = true) => objects.push({ c, r, img, solid });
  const mirror4 = (c, r, imgs) => {
    place(c, r, imgs[0]);
    place(COLS - 1 - c, r, imgs[1] || imgs[0]);
    place(c, ROWS - 1 - r, imgs[2] || imgs[0]);
    place(COLS - 1 - c, ROWS - 1 - r, imgs[3] || imgs[1] || imgs[0]);
  };

  place(MID_C, MID_R, 'structure_12');                         // statue au carrefour
  place(MID_C, 1, 'structure_01');                             // tours nord / sud
  place(MID_C, ROWS - 2, 'structure_01');
  mirror4(2, 2, ['structure_17', 'structure_18', 'structure_16', 'structure_17']);   // maisons des coins
  mirror4(4, 2, ['structure_21']);                              // fermes
  mirror4(7, 4, ['structure_09']);                              // halles près du centre
  mirror4(5, 5, ['tile_44']);                                   // bosquets
  mirror4(1, 5, ['tile_48']);
  mirror4(8, 2, ['env_11', 'env_18']);                          // rochers
  mirror4(3, 4, ['env_18', 'env_11']);
  place(4, MID_R, 'structure_05');                              // donjons est / ouest, en bord de route
  place(COLS - 1 - 4, MID_R, 'structure_05');

  // décor sans collision
  const decor = [];
  for (let i = 0; i < 26; i++) {
    const c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS);
    if (c === MID_C || r === MID_R || objects.some(o => o.c === c && o.r === r)) continue;
    decor.push({ x: (c + 0.2 + rnd() * 0.6) * TILE, y: (r + 0.2 + rnd() * 0.6) * TILE, img: rnd() < 0.5 ? 'env_02' : 'env_04' });
  }

  const obstacles = objects.filter(o => o.solid && SOLID[o.img]).map(o => {
    const [l, t, rr, b] = SOLID[o.img];
    return {
      x: Math.round((o.c + l) * TILE), y: Math.round((o.r + t) * TILE),
      w: Math.round((rr - l) * TILE), h: Math.round((b - t) * TILE),
    };
  });

  return {
    id: 'village', name: 'Village médiéval', theme: 'medieval',
    w: COLS * TILE, h: ROWS * TILE, tile: TILE, cols: COLS, rows: ROWS,
    ground, objects: objects.map(({ c, r, img }) => ({ c, r, img })), decor, obstacles,
  };
}

module.exports = { medievalVillage, TILE };
