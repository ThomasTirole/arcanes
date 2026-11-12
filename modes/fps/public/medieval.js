// Habillage médiéval du FPS : décor, personnages, armes et sons.
// Les collisions et la jouabilité restent dans game.js (boîtes) : ce fichier ne fait que l'apparence.
// Si le chargement échoue (réseau lent, vieux navigateur), le jeu garde ses boîtes colorées.
// Modèles : Quaternius (Medieval Village MegaKit, RPG Characters), sons : Kenney — tous en CC0.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from './vendor/jsm/utils/SkeletonUtils.js';

const BASE = './assets/';
export const CLASSES = ['Warrior', 'Wizard', 'Rogue', 'Ranger', 'Cleric', 'Monk'];
const CHAR_HEIGHT = 1.95;          // taille visée (la boîte de touche de game.js reste la même)

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
let village = null;
const chars = {};
const textures = {};
export const ready = { level: false, chars: false };

// ------------------------------------------------------------------ matériaux
// Lambert (sans reflets) : bien plus léger pour les PC de l'école que les matériaux PBR d'origine
const lamCache = new Map();
function lambert(m) {
  if (Array.isArray(m)) return m.map(lambert);
  if (m.isMeshBasicMaterial) return m;     // personnages : couleurs déjà « peintes » (matériau sans ombrage)
  if (lamCache.has(m.uuid)) return lamCache.get(m.uuid);
  const alpha = m.transparent || m.alphaTest > 0 || (m.map && /Vine|Leaf/i.test(m.name || ''));
  const l = new THREE.MeshLambertMaterial({
    map: m.map || null, color: m.map ? 0xffffff : m.color, name: m.name,
    alphaTest: alpha ? 0.5 : 0, side: alpha ? THREE.DoubleSide : THREE.FrontSide,
  });
  lamCache.set(m.uuid, l);
  return l;
}

function tex(name) {
  if (!textures[name]) {
    const t = texLoader.load(`${BASE}textures/${name}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures[name] = new THREE.MeshLambertMaterial({ map: t, name });
  }
  return textures[name];
}

// ------------------------------------------------------------------ chargement
export async function loadLevelAssets() {
  village = await gltfLoader.loadAsync(`${BASE}models/village.glb`);
  ready.level = true;
}

export async function loadCharacters() {
  await Promise.all(CLASSES.map(async c => {
    const g = await gltfLoader.loadAsync(`${BASE}models/${c}.glb`);
    g.scene.traverse(o => { if (o.isMesh) { o.material = lambert(o.material); o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(g.scene);
    chars[c] = { scene: g.scene, clips: g.animations, scale: CHAR_HEIGHT / Math.max(0.5, box.max.y - box.min.y) };
  }));
  ready.chars = true;
}

function piece(name) {
  const s = village.scenes.find(x => x.name === name);
  if (!s) throw new Error('pièce absente : ' + name);
  return s.clone();
}

// ------------------------------------------------------------------ fusion du décor statique
// Tout le décor finit en une poignée de maillages (un par matériau) : peu d'appels de dessin.
class Batch {
  constructor() { this.groups = new Map(); }
  addObject(obj) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const geo = o.geometry;
      if (Array.isArray(o.material) && geo.groups.length) {
        for (const gr of geo.groups) this.push(lambert(mats[gr.materialIndex]), sub(geo, gr), o.matrixWorld);
      } else this.push(lambert(mats[0]), geo, o.matrixWorld);
    });
  }
  push(mat, geo, matrix) {
    const g = clean(geo).applyMatrix4(matrix);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  build(scene) {
    const out = [];
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.matrixAutoUpdate = false;
      scene.add(m);
      out.push(m);
    }
    return out;
  }
}
// garde seulement position / normale / uv, toujours sans index (pour pouvoir tout fusionner)
function clean(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}
function sub(geo, gr) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
  }
  return out;
}

// boîte texturée, la texture se répète tous les `tile` mètres
function texturedBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = dims[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * a / tile, uv.getY(i) * b / tile);
  }
  return g;
}

// ------------------------------------------------------------------ le village
// parts : les boîtes du niveau { x, y, z, w, h, d, kind, mesh } (y = bas de la boîte)
export function dressLevel(scene, parts, floor, ARENA) {
  const batch = new Batch();
  const put = (name, x, y, z, ry = 0, s = 1) => {
    const o = piece(name);
    o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
    batch.addObject(o);
    return o;
  };
  const boxAt = (p, texName, tile) => batch.push(tex(texName), texturedBox(p.w, p.h, p.d, tile),
    new THREE.Matrix4().makeTranslation(p.x, p.y + p.h / 2, p.z));

  // sol pavé
  floor.material = tex('brick').clone();
  floor.material.map = floor.material.map.clone();
  floor.material.map.repeat.set(ARENA, ARENA);

  let crate = 0;
  for (const p of parts) {
    const hide = () => { p.mesh.visible = false; };
    if (p.kind === 'wall' && (Math.abs(p.x) >= ARENA || Math.abs(p.z) >= ARENA)) {
      // derrière les fenêtres des façades : intérieur sombre
      p.mesh.material = new THREE.MeshBasicMaterial({ color: 0x2a1d14 });
      continue;
    }
    if (p.kind === 'pad') continue;
    if (p.kind === 'wood') {
      // caisses de la place
      hide();
      put('Prop_Crate', p.x, p.y, p.z, (crate++ % 4) * Math.PI / 2, p.w / 1.08);
      continue;
    }
    hide();
    if (p.h >= 6) {
      // piliers → petites tours avec toit pointu
      boxAt(p, 'unevenbrick', 2);
      put('Roof_Tower_RoundTiles', p.x, p.y + p.h, p.z, 0, (p.w + 0.6) / 5.66);
    } else if (p.w >= 8 && p.d >= 8) {
      boxAt(p, 'rocktrim', 2.5);            // estrade centrale
    } else if (p.h >= 3.5 && p.w >= 5) {
      boxAt(p, 'plaster', 2);               // tours de guet des coins
    } else if (p.h <= 1.4 && Math.max(p.w, p.d) >= 6) {
      boxAt(p, 'unevenbrick', 1.6);         // murets
    } else {
      boxAt(p, p.h > 1.6 ? 'woodtrim' : 'rocktrim', 1.2);   // marches
    }
  }

  // façades des maisons tout autour de la place
  const styles = [
    { wall: 'Wall_UnevenBrick', ground: ['Door_Round', 'Window_Wide_Round', 'Straight', 'Window_Thin_Round'], up: ['Window_Wide_Round', 'Straight', 'Window_Thin_Round', 'Window_Wide_Round'] },
    { wall: 'Wall_Plaster', ground: ['Window_Wide_Round', 'Door_Round', 'Window_Thin_Round', 'WoodGrid'], up: ['WoodGrid', 'Window_Wide_Round', 'Window_Wide_Round', 'Straight'] },
  ];
  const H = 3.12;
  const F = ARENA - 0.12;                  // façades un peu devant le mur sombre (pas de scintillement)
  const sides = [
    { ry: 0, pos: t => [t, -F] },
    { ry: Math.PI, pos: t => [-t, F] },
    { ry: Math.PI / 2, pos: t => [-F, -t] },
    { ry: -Math.PI / 2, pos: t => [F, t] },
  ];
  sides.forEach((side, si) => {
    const n = ARENA;                       // pièces de 2 m : 2 * ARENA / 2
    for (let i = 0; i < n; i++) {
      const t = -ARENA + 1 + i * 2;
      const house = Math.floor((i + si) / 4);
      const st = styles[(house + si) % 2];
      const k = (i + si) % 4;
      const [x, z] = side.pos(t);
      for (let row = 0; row < 3; row++) {
        const kind = row === 0 ? st.ground[k] : st.up[(k + row) % 4];
        put(`${st.wall}_${kind}`, x, row * H, z, side.ry);
      }
      // poutres d'angle entre deux maisons
      if (k === 0) {
        const [bx, bz] = side.pos(t - 1);
        for (let row = 0; row < 3; row++) put('Corner_Exterior_Wood', bx, row * H, bz, side.ry);
      }
    }
    // toits : une rangée de pans de toiture derrière les façades
    for (let i = 0; i < n / 4; i++) {
      const t = -ARENA + 4 + i * 8;
      const [x, z] = side.pos(t);
      const back = [Math.sin(side.ry), Math.cos(side.ry)];   // vers l'extérieur
      put('Roof_RoundTiles_8x8', x - back[0] * 4.2, 3 * H - 0.4, z - back[1] * 4.2, side.ry + Math.PI / 2, 1);
    }
  });

  // coins de la place : piliers de pierre pour boucher la jonction des façades
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    batch.push(tex('unevenbrick'), texturedBox(1.4, 3 * H, 1.4, 2), new THREE.Matrix4().makeTranslation(cx * (ARENA + 0.1), 1.5 * H, cz * (ARENA + 0.1)));
  }
  // charrettes près des coins (elles ont leur boîte de collision dans game.js)
  return batch.build(scene);
}

// ------------------------------------------------------------------ personnages
const ATTACK = { Warrior: 'Sword_Attack', Wizard: 'Staff_Attack', Rogue: 'Punch', Ranger: 'Punch', Cleric: 'Staff_Attack', Monk: 'Punch' };

export function createCharacter(cls) {
  const c = chars[cls] || chars[CLASSES[0]];
  const model = SkeletonUtils.clone(c.scene);
  model.scale.setScalar(c.scale);
  model.rotation.y = Math.PI;              // le modèle regarde +z, le jeu vise -z
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of c.clips) actions[clip.name] = mixer.clipAction(clip);
  let current = null;
  const flashMats = [];
  model.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone();
      flashMats.push(o.material);
    }
  });
  const ch = {
    root, mixer, cls,
    play(name, fade = 0.15) {
      const a = actions[name] || actions.Idle;
      if (!a || a === current) return;
      a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
      if (current) current.fadeOut(fade);
      current = a;
    },
    once(name, after = 'Idle') {
      const a = actions[name] || actions[ATTACK[cls]];
      if (!a) return;
      a.reset().setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = name === 'Death';
      a.fadeIn(0.05).play();
      if (current && current !== a) current.fadeOut(0.05);
      current = a;
      if (name !== 'Death') {
        const back = () => { mixer.removeEventListener('finished', back); current = null; ch.play(after, 0.1); };
        mixer.addEventListener('finished', back);
      }
    },
    attack() { ch.once(ATTACK[cls]); },
    flash(on) { for (const m of flashMats) m.color.setHex(on ? 0xff9a9a : 0xffffff); },
    opacity(v) { for (const m of flashMats) { m.transparent = v < 1; m.opacity = v; } },
    update(dt) { mixer.update(dt); },
    dispose() { root.traverse(o => { if (o.isMesh) o.material.dispose(); }); },
  };
  ch.play('Idle', 0);
  return ch;
}

// arme seule tirée d'un personnage, pour la vue à la première personne
export function weaponModel(cls, nodeName) {
  const c = chars[cls];
  if (!c) return null;
  const src = c.scene.getObjectByName(nodeName);
  if (!src) return null;
  const m = src.clone();
  m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.setScalar(1);
  m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.depthTest = true; } });
  return m;
}

// ------------------------------------------------------------------ sons
const SOUNDS = {
  sword: ['knifeSlice', 'knifeSlice2'], hit: ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002'],
  kill: ['impactBell_heavy_000', 'impactBell_heavy_001'], parry: ['impactMetal_heavy_000', 'impactMetal_heavy_001'],
  jump: ['cloth1', 'cloth2'], dash: ['clothBelt', 'clothBelt2'], slide: ['cloth3'], down: ['impactSoft_heavy_000'],
  land: ['impactSoft_medium_000', 'impactSoft_medium_001'], step: ['footstep_concrete_000', 'footstep_concrete_001', 'footstep_concrete_002', 'footstep_concrete_003', 'footstep_concrete_004'],
  wood: ['impactWood_medium_000', 'impactWood_medium_001'],
};
const buffers = {};
export async function loadSounds(ctx) {
  const names = [...new Set(Object.values(SOUNDS).flat())];
  await Promise.all(names.map(async n => {
    try {
      const r = await fetch(`${BASE}sounds/${n}.ogg`);
      buffers[n] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* son manquant : on garde le son synthétisé */ }
  }));
}
export function hasSound(kind) { return !!(SOUNDS[kind] && SOUNDS[kind].some(n => buffers[n])); }
export function playSound(ctx, kind, volume = 0.5, rate = 1) {
  const list = (SOUNDS[kind] || []).filter(n => buffers[n]);
  if (!list.length) return false;
  const src = ctx.createBufferSource();
  src.buffer = buffers[list[Math.floor(Math.random() * list.length)]];
  src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g); g.connect(ctx.destination);
  src.start();
  return true;
}
