// Reconstruit les assets du FPS (modes/fps/public/assets/) à partir des packs d'origine.
// Les packs ne sont PAS dans le dépôt (trop lourds) : Tirtho les a (Quaternius « Medieval Village MegaKit
// [Standard] » et « RPG Characters - Nov 2020 », dézippés dans <dossier>/assets/village et <dossier>/assets/chars).
// Installation (hors du projet) : npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
// Utilisation : node build-fps-assets.mjs <dossier-des-packs> <dossier-de-sortie>
// Résultat : village.glb (une scène par pièce), Warrior/Wizard/Rogue/Ranger/Cleric/Monk.glb, textures *.webp
// (normales / rugosité retirées, textures 512 px WebP) → à copier dans modes/fps/public/assets/models et textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, textureCompress, weld, resample, flatten } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const SP = process.argv[2], OUT = process.argv[3];
const VDIR = `${SP}/assets/village/Medieval Village MegaKit[Standard]/glTF`;
const CDIR = `${SP}/assets/chars/RPG Characters - Nov 2020/glTF`;
const PIECES = ['Wall_UnevenBrick_Straight','Wall_UnevenBrick_Window_Wide_Round','Wall_UnevenBrick_Door_Round','Wall_UnevenBrick_Window_Thin_Round',
 'Wall_Plaster_Straight','Wall_Plaster_Window_Wide_Round','Wall_Plaster_WoodGrid','Wall_Plaster_Window_Thin_Round','Wall_Plaster_Door_Round',
 'Corner_Exterior_Wood','Corner_Exterior_Brick','Roof_RoundTiles_8x8','Roof_RoundTiles_6x6','Roof_RoundTiles_8x10','Roof_Tower_RoundTiles',
 'Prop_Crate','Prop_Wagon','Prop_WoodenFence_Single','Prop_WoodenFence_Extension1','Prop_MetalFence_Ornament','Prop_Support',
 'Prop_Vine1','Prop_Vine4','Prop_Vine6','Prop_Chimney','Prop_ExteriorBorder_Straight1','Prop_ExteriorBorder_Corner','Stairs_Exterior_Straight',
 'WindowShutters_Wide_Round_Open','WindowShutters_Thin_Round_Closed','Door_1_Round','Door_2_Round','Floor_WoodDark','Balcony_Simple_Straight','Overhang_UnevenBrick_Long'];
function strip(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null);
  }
}
async function finish(doc, size) {
  strip(doc);
  await doc.transform(dedup(), prune(), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }));
}
// village : une scène par pièce
const base = await io.read(`${VDIR}/${PIECES[0]}.gltf`);
base.getRoot().listScenes()[0].setName(PIECES[0]);
for (const p of PIECES.slice(1)) {
  if (!fs.existsSync(`${VDIR}/${p}.gltf`)) { console.log('absent', p); continue; }
  const d = await io.read(`${VDIR}/${p}.gltf`);
  d.getRoot().listScenes()[0].setName(p);
  mergeDocuments(base, d);
}
// une seule copie du buffer
const bufs = base.getRoot().listBuffers();
for (const b of bufs.slice(1)) { for (const a of base.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(bufs[0]); b.dispose(); }
await finish(base, 512);
await io.write(`${OUT}/village.glb`, base);
console.log('village', (fs.statSync(`${OUT}/village.glb`).size / 1e6).toFixed(2), 'Mo', base.getRoot().listMaterials().map(m => m.getName()).join(','));
for (const c of ['Warrior', 'Wizard', 'Rogue', 'Ranger', 'Cleric', 'Monk']) {
  const d = await io.read(`${CDIR}/${c}.gltf`);
  await d.transform(resample());
  await finish(d, 512);
  await io.write(`${OUT}/${c}.glb`, d);
  console.log(c, (fs.statSync(`${OUT}/${c}.glb`).size / 1e6).toFixed(2), 'Mo');
}
// textures pour les boîtes
for (const t of ['T_UnevenBrick_BaseColor', 'T_Brick_BaseColor', 'T_WoodTrim_BaseColor', 'T_Plaster_BaseColor', 'T_RockTrim_BaseColor', 'T_RoundTiles_BaseColor', 'T_RedBrick_BaseColor']) {
  await sharp(`${SP}/assets/village/Medieval Village MegaKit[Standard]/Textures/${t}.png`).resize(512, 512).webp({ quality: 80 }).toFile(`${OUT}/${t.replace('_BaseColor', '').replace('T_', '').toLowerCase()}.webp`);
}
