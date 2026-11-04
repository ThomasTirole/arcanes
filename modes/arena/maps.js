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
  structure_02: [0.03, 0.45, 0.97, 0.98],  // muraille (deux tours reliées par un mur)
  structure_06: [0.05, 0.03, 0.95, 0.58],  // forteresse avec porte
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

  return finish('village', 'Village médiéval', COLS, ROWS, ground, objects, decor);
}

// rectangles de collision déduits des images, puis description envoyée aux navigateurs
function finish(id, name, cols, rows, ground, objects, decor) {
  const obstacles = objects.filter(o => o.solid !== false && SOLID[o.img]).map(o => {
    const [l, t, rr, b] = SOLID[o.img];
    const k = (o.s || 1) * TILE;
    return {
      x: Math.round(o.c * TILE + l * k), y: Math.round(o.r * TILE + t * k),
      w: Math.round((rr - l) * k), h: Math.round((b - t) * k),
    };
  });
  return {
    id, name, theme: 'medieval',
    w: cols * TILE, h: rows * TILE, tile: TILE, cols, rows,
    ground, objects: objects.map(({ c, r, img, s }) => ({ c, r, img, s: s || 1 })), decor, obstacles,
  };
}

/**
 * Cour du château : la disposition du tout premier prototype (4 murs, un bloc central,
 * deux piliers latéraux, deux petits blocs nord / sud), habillée avec le pack Kenney :
 * murailles, forteresse au centre, tours, maisons.
 */
function castleCourtyard() {
  const COLS = 20, ROWS = 13;
  let seed = 777;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const ground = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const v = rnd();
      row.push(v < 0.05 ? 'tile_49' : v < 0.08 ? 'tile_50' : v < 0.5 ? 'tile_58' : 'tile_57');
    }
    ground.push(row);
  }
  for (let c = 0; c < COLS; c++) ground[6][c] = 'tile_04';      // route qui traverse la porte du château

  const objects = [];
  const wall = (c, r) => { objects.push({ c, r, img: 'structure_02' }, { c: c + 1, r, img: 'structure_02' }); };
  wall(4.63, 2.53);  wall(13.37, 2.53);                           // murailles nord
  wall(4.63, 9.03);  wall(13.37, 9.03);                           // murailles sud
  objects.push({ c: 9, r: 5.9, img: 'structure_06', s: 2 });      // forteresse centrale
  objects.push({ c: 2, r: 5.44, img: 'structure_01', s: 1.5 });   // tours est / ouest
  objects.push({ c: 16.5, r: 5.44, img: 'structure_01', s: 1.5 });
  objects.push({ c: 9.5, r: 1.23, img: 'structure_18' });         // maisons nord / sud
  objects.push({ c: 9.5, r: 10.73, img: 'structure_17' });

  // décor sans collision : petits arbres
  const decor = [];
  for (let i = 0; i < 34; i++) {
    const x = (0.4 + rnd() * (COLS - 0.8)) * TILE, y = (0.4 + rnd() * (ROWS - 0.8)) * TILE;
    if (Math.abs(y - 6.5 * TILE) < TILE * 0.7) continue;                        // pas sur la route
    if (objects.some(o => x > (o.c - 0.3) * TILE && x < (o.c + (o.s || 1) * 2 + 0.3) * TILE
      && y > (o.r - 0.3) * TILE && y < (o.r + (o.s || 1) + 0.3) * TILE)) continue;
    decor.push({ x, y, img: rnd() < 0.5 ? 'env_02' : 'env_04' });
  }
  return finish('chateau', 'Cour du château', COLS, ROWS, ground, objects, decor);
}

module.exports = { castleCourtyard, medievalVillage, TILE };
