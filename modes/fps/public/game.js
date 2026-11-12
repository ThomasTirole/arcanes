// FPS Arcanes — déplacements nerveux façon Quake / Ultrakill, dans une place de village médiévale.
// Les collisions sont des boîtes (ce fichier) ; l'apparence (décor, personnages, sons) vient de medieval.js.
import * as THREE from 'three';
import * as Med from './medieval.js';

// ?embed=1 : intégré dans une partie Arcanes (munitions données par les questions, échanges avec la page parente)
const EMBED = new URLSearchParams(location.search).has('embed');
const toParent = msg => { if (EMBED) window.parent.postMessage({ arcanesFps: true, ...msg }, location.origin); };
const PVP = EMBED && new URLSearchParams(location.search).get('mode') === 'pvp';   // chacun pour soi entre élèves
let embedPaused = EMBED;     // en partie : pause tant que la page parente ne donne pas le départ

// ------------------------------------------------------------------ réglages du jeu
const P = {
  gravity: 27,
  jump: 10.5,           // saut (≈ 2 m de haut)
  doubleJump: 9,        // second saut en l'air
  groundSpeed: 10,      // vitesse max au sol (m/s)
  groundAccel: 12,
  friction: 7,
  airSpeed: 10,         // contrôle en l'air à la Ultrakill : on peut se diriger (gauche / droite) en sautant
  airAccel: 6,          //   … sans perdre l'élan d'un dash ou d'une glissade
  dashSpeed: 22,
  dashTime: 0.16,
  dashCharges: 3,
  dashRecharge: 1.1,    // s par charge
  slideSpeed: 17,       // glissade (C maintenu au sol), vitesse constante
  slideEye: 0.8,        // hauteur de la caméra en glissade
  slamSpeed: 38,        // piqué au sol (C en l'air)
  slamBounce: 1.7,      // saut juste après un piqué = rebond plus haut
  wallJumps: 3,         // sauts contre un mur avant de retoucher le sol
  coyote: 0.1,          // on peut encore sauter 0,1 s après avoir quitté le bord
  jumpBuffer: 0.12,     // un appui juste avant d'atterrir compte
  radius: 0.4,
  height: 1.8,
  eye: 1.6,
  stepUp: 0.55,
  punchRange: 2.8,
  punchRate: 0.45,
};

const WEAPONS = [
  { name: 'Bâton de foudre', rate: 0.32, dmg: 40, kick: 0.035, color: 0xbfdbfe },
  { name: 'Bâton de feu', rate: 0.85, dmg: 95, splash: 3.6, speed: 30, kick: 0.06, color: 0xf97316 },
];

const settings = { sens: 1, keyTurn: 2.2, fov: 90, quality: 0.75 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arcanes-fps') || '{}')); } catch (e) { /* rien */ }

// ------------------------------------------------------------------ rendu
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc3e4);     // ciel de fin d'après-midi
scene.fog = new THREE.Fog(0xc9d8e6, 40, 110);
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 200);
scene.add(camera);

function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.quality);
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', applyQuality);
applyQuality();

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5b4a3a, 1.5));
const sun = new THREE.DirectionalLight(0xffe7c2, 1.9);
sun.position.set(20, 40, 12);
scene.add(sun);

// texture en damier (sensation de vitesse au sol)
function checker(c1, c2, n = 8) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const s = 128 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? c1 : c2;
    g.fillRect(x * s, y * s, s, s);
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ niveau (boîtes)
const boxes = [];   // { min: Vector3, max: Vector3 } pour les collisions
const mats = {
  wall: new THREE.MeshLambertMaterial({ color: 0x6d5bd0 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x8b8fa8 }),
  wood: new THREE.MeshLambertMaterial({ color: 0xb7793d }),
  pad: new THREE.MeshBasicMaterial({ color: 0x67e8f9 }),
};

let levelFloor = null;
const levelParts = [];   // pour l'habillage médiéval
function addBox(x, y, z, w, h, d, mat = mats.stone) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y + h / 2, z);
  scene.add(mesh);
  levelParts.push({ x, y, z, w, h, d, mesh, kind: Object.keys(mats).find(k => mats[k] === mat) || 'stone' });
  boxes.push({ min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2) });
  return mesh;
}

function addStairs(x, z, dirX, dirZ, steps, stepH, stepD, width) {
  for (let i = 0; i < steps; i++) {
    const cx = x + dirX * (i * stepD + stepD / 2), cz = z + dirZ * (i * stepD + stepD / 2);
    const w = dirX ? stepD : width, d = dirZ ? stepD : width;
    addBox(cx, 0, cz, w, (i + 1) * stepH, d, mats.stone);
  }
}

const ARENA = 30;   // demi-taille de l'arène
(function buildLevel() {
  const floorTex = checker('#3b2f6b', '#46397d', 2);
  floorTex.repeat.set(ARENA, ARENA);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  levelFloor = floor;
  boxes.push({ min: new THREE.Vector3(-ARENA - 5, -5, -ARENA - 5), max: new THREE.Vector3(ARENA + 5, 0, ARENA + 5) });

  // murs d'enceinte
  const H = 8;
  addBox(0, 0, -ARENA - 0.5, ARENA * 2 + 2, H, 1, mats.wall);
  addBox(0, 0, ARENA + 0.5, ARENA * 2 + 2, H, 1, mats.wall);
  addBox(-ARENA - 0.5, 0, 0, 1, H, ARENA * 2, mats.wall);
  addBox(ARENA + 0.5, 0, 0, 1, H, ARENA * 2, mats.wall);
  // murs invisibles au-dessus de l'enceinte : impossible d'en sortir en enchaînant les sauts muraux
  for (const [x, z, w, d] of [[0, -ARENA - 0.5, ARENA * 2 + 2, 1], [0, ARENA + 0.5, ARENA * 2 + 2, 1], [-ARENA - 0.5, 0, 1, ARENA * 2], [ARENA + 0.5, 0, 1, ARENA * 2]]) {
    boxes.push({ min: new THREE.Vector3(x - w / 2, H, z - d / 2), max: new THREE.Vector3(x + w / 2, 200, z + d / 2) });
  }

  // plateforme centrale + escaliers
  addBox(0, 0, 0, 10, 2.4, 10, mats.stone);
  addStairs(-5, -1.5, -1, 0, 6, 0.4, 0.9, 3);
  addStairs(5, 1.5, 1, 0, 6, 0.4, 0.9, 3);
  addBox(0, 2.4, 0, 2, 0.12, 2, mats.pad).position.y = 2.46;

  // piliers et caisses
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) addBox(x, 0, z, 2.2, 7, 2.2, mats.wall);
  for (const [x, z, s] of [[-8, -20, 1.6], [-6.5, -20, 1.2], [9, 19, 1.6], [20, -6, 1.6], [-21, 7, 1.6], [-20, 8.6, 1.1], [22, 10, 1.2]]) {
    addBox(x, 0, z, s, s, s, mats.wood);
  }
  // passerelles hautes
  addBox(-22, 0, -22, 6, 3.6, 6, mats.stone);
  addStairs(-22, -19, 0, 1, 9, 0.4, 0.8, 2.4);
  addBox(22, 0, 22, 6, 3.6, 6, mats.stone);
  addStairs(22, 19, 0, -1, 9, 0.4, 0.8, 2.4);
  // murets de couverture
  addBox(0, 0, -16, 8, 1.3, 0.8, mats.stone);
  addBox(0, 0, 16, 8, 1.3, 0.8, mats.stone);
  addBox(-16, 0, 0, 0.8, 1.3, 8, mats.stone);
  addBox(16, 0, 0, 0.8, 1.3, 8, mats.stone);
})();

// ------------------------------------------------------------------ joueur
const player = {
  pos: new THREE.Vector3(0, 2.5, 10), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
  onGround: false, hp: 100, lastHurt: 0, dash: P.dashCharges, dashT: 0, dashDir: new THREE.Vector3(),
  weapon: 0, cooldown: 0, alive: true, bob: 0, kick: 0, slamming: false, fovKick: 0,
  airJumps: 1, wallJumps: P.wallJumps, lastGround: 0, jumpQueued: -1, slamLanded: -1,
  sliding: false, slideDir: new THREE.Vector3(), eyeH: P.eye, punchCd: 0,
};
const keys = {};
let locked = false, started = false, mouseDown = false;

function aabbHit(px, py, pz) {
  const r = P.radius;
  for (const b of boxes) {
    if (px + r > b.min.x && px - r < b.max.x && pz + r > b.min.z && pz - r < b.max.z && py + P.height > b.min.y && py < b.max.y) return b;
  }
  return null;
}

// déplacement axe par axe avec marche d'escalier
function moveAxis(axis, amount) {
  if (!amount) return false;
  const p = player.pos;
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.2));
  const delta = amount / steps;
  for (let i = 0; i < steps; i++) {
    p[axis] += delta;
    const b = aabbHit(p.x, p.y, p.z);
    if (!b) continue;
    if (axis !== 'y') {
      const rise = b.max.y - p.y;
      if (player.onGround && rise > 0 && rise <= P.stepUp && !aabbHit(p.x, b.max.y + 0.01, p.z)) {
        p.y = b.max.y + 0.001;
        continue;
      }
      p[axis] -= delta;
      return true;
    }
    if (delta < 0) { p.y = b.max.y; } else { p.y = b.min.y - P.height - 0.001; }
    return true;
  }
  return false;
}

function accelerate(wish, wishSpeed, accel, dt) {
  const cur = player.vel.x * wish.x + player.vel.z * wish.z;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishSpeed, add);
  player.vel.x += a * wish.x;
  player.vel.z += a * wish.z;
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
// (pas Ctrl : Ctrl+W fermerait l'onglet du navigateur)
const crouchHeld = () => keys.KeyC;

// normale du mur touché (pour le saut contre un mur), ou null
function wallNormal() {
  const p = player.pos;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (aabbHit(p.x + dx * 0.25, p.y + 0.3, p.z + dz * 0.25)) return new THREE.Vector3(-dx, 0, -dz);
  }
  return null;
}

function tryJump(now) {
  const p = player;
  const t = now / 1000;
  const grounded = p.onGround || t - p.lastGround < P.coyote;
  if (grounded) {
    const bounce = t - p.slamLanded < 0.3;
    p.vel.y = P.jump * (bounce ? P.slamBounce : 1);
    if (p.sliding) {                       // slide-jump : on garde toute la vitesse de la glissade
      p.sliding = false;
      const sp = Math.max(P.slideSpeed, Math.hypot(p.vel.x, p.vel.z));
      p.vel.x = p.slideDir.x * sp; p.vel.z = p.slideDir.z * sp;
      p.vel.y = P.jump * 0.85;
      addStyle(0, 'GLISSADE-SAUT');
    }
    if (bounce) { addStyle(0, 'REBOND'); burst(p.pos.clone(), 0xc4b5fd, 12, 6); }
    p.onGround = false; p.lastGround = -1;
    sfx('jump');
    return true;
  }
  const wn = wallNormal();
  if (wn && p.wallJumps > 0) {
    p.wallJumps--;
    p.vel.x = wn.x * 7 + wish.x * 2; p.vel.z = wn.z * 7 + wish.z * 2;
    p.vel.y = P.jump * 0.9;
    p.slamming = false;
    burst(p.pos.clone().add(new THREE.Vector3(-wn.x * 0.4, 1, -wn.z * 0.4)), 0xe9d5ff, 8, 4);
    sfx('jump');
    return true;
  }
  if (p.airJumps > 0) {
    p.airJumps--;
    p.vel.y = P.doubleJump;
    // le double saut ne donne pas d'élan : on garde au plus la vitesse de course, dans la direction voulue
    const h = Math.hypot(p.vel.x, p.vel.z), keep = Math.min(h, P.groundSpeed);
    if (wish.lengthSq()) { p.vel.x = wish.x * keep; p.vel.z = wish.z * keep; }
    else if (h > keep) { p.vel.x *= keep / h; p.vel.z *= keep / h; }
    p.slamming = false;
    ring(p.pos.clone(), 1.2, 0x67e8f9);
    sfx('dash');
    return true;
  }
  return false;
}

function updatePlayer(dt, now) {
  const p = player;
  const t = now / 1000;
  // visée au clavier (élèves sans souris)
  const turn = settings.keyTurn * dt;
  if (keys.ArrowLeft) p.yaw += turn;
  if (keys.ArrowRight) p.yaw -= turn;
  if (keys.ArrowUp) p.pitch = Math.min(1.5, p.pitch + turn * 0.8);
  if (keys.ArrowDown) p.pitch = Math.max(-1.5, p.pitch - turn * 0.8);

  fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  right.set(-fwd.z, 0, fwd.x);
  wish.set(0, 0, 0);
  if (keys.KeyW) wish.add(fwd);
  if (keys.KeyS) wish.sub(fwd);
  if (keys.KeyD) wish.add(right);
  if (keys.KeyA) wish.sub(right);
  if (wish.lengthSq()) wish.normalize();

  // saut : un appui = un saut (mémorisé un court instant avant l'atterrissage)
  if (p.jumpQueued >= 0 && t - p.jumpQueued <= P.jumpBuffer && p.dashT <= 0) {
    if (tryJump(now)) p.jumpQueued = -1;
  }

  // glissade : C / Ctrl maintenu au sol
  if (p.onGround && crouchHeld() && p.dashT <= 0) {
    if (!p.sliding) {
      p.sliding = true;
      const h = Math.hypot(p.vel.x, p.vel.z);
      if (wish.lengthSq()) p.slideDir.copy(wish);
      else if (h > 1) p.slideDir.set(p.vel.x / h, 0, p.vel.z / h);
      else p.slideDir.copy(fwd);
      sfx('slide');
    }
  } else if (p.sliding && (!crouchHeld() || p.dashT > 0)) p.sliding = false;

  p.dash = Math.min(P.dashCharges, p.dash + dt / P.dashRecharge);
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vel.x = p.dashDir.x * P.dashSpeed;
    p.vel.z = p.dashDir.z * P.dashSpeed;
    p.vel.y = 0;
    if (p.dashT <= 0) { p.vel.x *= 0.6; p.vel.z *= 0.6; }
  } else if (p.sliding && p.onGround) {
    p.vel.x = p.slideDir.x * P.slideSpeed;
    p.vel.z = p.slideDir.z * P.slideSpeed;
    if (Math.random() < dt * 40) {
      puff(p.pos.clone().addScaledVector(p.slideDir, 0.5).add(new THREE.Vector3(0, 0.05, 0)), 0xfde68a, 0.25);
    }
  } else if (p.onGround) {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0) {
      const drop = Math.max(sp, 2) * P.friction * dt;
      const k = Math.max(0, sp - drop) / sp;
      p.vel.x *= k; p.vel.z *= k;
    }
    accelerate(wish, P.groundSpeed, P.groundAccel, dt);
  } else {
    accelerate(wish, P.airSpeed, P.airAccel, dt);
    p.vel.y -= P.gravity * dt;
    if (p.slamming) { p.vel.y = -P.slamSpeed; p.vel.x *= 0.9; p.vel.z *= 0.9; }
  }

  const wasGround = p.onGround;
  moveAxis('x', p.vel.x * dt);
  moveAxis('z', p.vel.z * dt);
  p.onGround = false;
  if (moveAxis('y', p.vel.y * dt)) {
    if (p.vel.y < 0) {
      if (p.slamming) {
        p.slamming = false; p.slamLanded = t;
        shake(0.5); burst(p.pos.clone(), 0xc4b5fd, 26, 9); slamWave();
      }
      p.onGround = true;
      if (!wasGround && p.vel.y < -12) shake(Math.min(0.35, -p.vel.y / 80));
    }
    p.vel.y = 0;
  } else {
    p.onGround = !!aabbHit(p.pos.x, p.pos.y - 0.04, p.pos.z) && p.vel.y <= 0;
    if (p.onGround) p.vel.y = 0;
  }
  if (p.onGround) { p.lastGround = t; p.airJumps = 1; p.wallJumps = P.wallJumps; }
  if (p.pos.y < -10) { p.pos.set(0, 3, 10); p.vel.set(0, 0, 0); }

  // régénération lente
  if (p.alive && now - p.lastHurt > 3000) p.hp = Math.min(100, p.hp + 10 * dt);

  // caméra
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && !p.sliding && speed > 1) p.bob += dt * speed * 1.4;
  const bobY = p.onGround && !p.sliding ? Math.sin(p.bob) * 0.04 * Math.min(1, speed / 10) : 0;
  p.eyeH += ((p.sliding ? P.slideEye : P.eye) - p.eyeH) * Math.min(1, dt * 14);
  p.kick *= Math.exp(-dt * 14);
  const fovTarget = p.dashT > 0 ? 12 : p.sliding ? 8 : Math.min(12, Math.max(0, speed - 10) * 0.8);
  p.fovKick += (fovTarget - p.fovKick) * Math.min(1, dt * 8);
  camera.fov = settings.fov + p.fovKick;
  camera.updateProjectionMatrix();
  // filet de sécurité : jamais hors de l'enceinte
  const lim = ARENA - P.radius;
  if (Math.abs(p.pos.x) > lim) { p.pos.x = Math.sign(p.pos.x) * lim; p.vel.x = 0; }
  if (Math.abs(p.pos.z) > lim) { p.pos.z = Math.sign(p.pos.z) * lim; p.vel.z = 0; }
  if (p.pos.y < -3) { p.pos.set(0, 2.5, 10); p.vel.set(0, 0, 0); }
  camera.position.set(p.pos.x, p.pos.y + p.eyeH + bobY, p.pos.z);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(p.yaw);
  camera.rotateX(p.pitch + p.kick);
  if (p.sliding) camera.rotateZ(0.04);
  if (shakeAmt > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shakeAmt * 0.3;
    camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.3;
    shakeAmt *= Math.exp(-dt * 10);
  }
}

function doDash() {
  const p = player;
  if (p.dash < 1 || p.dashT > 0 || !p.alive) return;
  p.dash -= 1;
  p.dashT = P.dashTime;
  p.sliding = false;
  if (wish.lengthSq()) p.dashDir.copy(wish); else p.dashDir.copy(fwd);
  p.slamming = false;
  sfx('dash');
}

// ------------------------------------------------------------------ arme (modèle à l'écran)
const gun = new THREE.Group();
camera.add(gun);
gun.position.set(0.32, -0.3, -0.55);
const gunMat = new THREE.MeshLambertMaterial({ color: 0x3f3a5a });
const gunAccent = new THREE.MeshLambertMaterial({ color: 0xfde68a });
const gunParts = [new THREE.Group(), new THREE.Group()];
{
  const g0 = gunParts[0];
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.42), gunMat); body.position.z = -0.1; g0.add(body);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8), gunAccent); drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.01, 0.02); g0.add(drum);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gunMat); grip.position.set(0, -0.13, 0.12); grip.rotation.x = -0.3; g0.add(grip);
  const g1 = gunParts[1];
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.7, 10), new THREE.MeshLambertMaterial({ color: 0x4b5563 })); tube.rotation.x = Math.PI / 2; tube.position.z = -0.15; g1.add(tube);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), new THREE.MeshLambertMaterial({ color: 0xf97316 })); ring.position.z = -0.48; g1.add(ring);
  const grip1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gunMat); grip1.position.set(0, -0.16, 0.05); g1.add(grip1);
}
gunParts[1].scale.setScalar(0.62);
gun.add(gunParts[0], gunParts[1]);
const flash = new THREE.PointLight(0xffd27a, 0, 8);
flash.position.set(0, 0.02, -0.6);
gun.add(flash);
let gunRecoil = 0, swapAnim = 0;

// bras gauche pour le coup de poing
const arm = new THREE.Group();
{
  const skin = new THREE.MeshLambertMaterial({ color: 0xf5d0b0 });
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.4), new THREE.MeshLambertMaterial({ color: 0x6d28d9 }));
  sleeve.position.z = 0.15; arm.add(sleeve);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.17), skin); fist.position.z = -0.1; arm.add(fist);
}
camera.add(arm);
let punchAnim = 0, swordMode = false;

// met un modèle à la bonne taille, son grand axe pointé vers l'avant (-z)
function fitModel(obj, length) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  const holder = new THREE.Group();
  const axis = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const inner = new THREE.Group();
  inner.add(obj);
  if (axis === 'x') inner.rotation.y = Math.PI / 2;
  if (axis === 'y') inner.rotation.x = -Math.PI / 2;
  inner.scale.setScalar(length / Math.max(size.x, size.y, size.z));
  holder.add(inner);
  return holder;
}

// armes médiévales : bâtons du magicien et du clerc, épée du guerrier
function medievalWeapons() {
  const looks = [['Wizard', 'Wizard_Staff', 1.25], ['Cleric', 'Cleric_Staff', 1.15]];
  looks.forEach(([cls, node, len], i) => {
    const m = Med.weaponModel(cls, node);
    if (!m) return;
    const staff = fitModel(m, len);
    staff.rotation.set(0.12, 0.05, -0.12);
    staff.position.set(0.02, -0.1, -0.2);
    gunParts[i].children.forEach(c => { c.visible = false; });
    gunParts[i].scale.setScalar(1);
    gunParts[i].add(staff);
  });
  const sword = Med.weaponModel('Warrior', 'Warrior_Sword');
  if (sword) {
    arm.children.forEach(c => { c.visible = false; });
    const s = fitModel(sword, 1.0);
    s.position.z = -0.35;
    arm.add(s);
    swordMode = true;
  }
  flash.position.set(0, 0.05, -0.85);
}

function punch(now) {
  const p = player;
  if (!p.alive || p.punchCd > 0) return;
  p.punchCd = P.punchRate;
  punchAnim = 1;
  sfx('punch');
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = aimDir();
  let hitSomething = false;
  // parade : renvoie les projectiles ennemis proches dans la direction visée
  for (const sh of enemyShots) {
    if (sh.player) continue;
    const to = sh.mesh.position.clone().sub(origin);
    const d = to.length();
    if (d < P.punchRange + 0.8 && to.normalize().dot(dir) > 0.5) {
      sh.player = true;
      sh.vel.copy(dir).multiplyScalar(38);
      sh.born = now;
      sh.mesh.material = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      sh.mesh.scale.setScalar(1.6);
      p.hp = Math.min(100, p.hp + 20);
      banner('PARADE !', '#fde047', 700);
      addStyle(150, 'PARADE');
      hitStop(0.08);
      sfx('parry');
      hitSomething = true;
    }
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const c = e.mesh.position.clone().add(e.center);
    const to = c.clone().sub(origin);
    const d = to.length();
    if (d < P.punchRange + e.r && to.normalize().dot(dir) > 0.55) {
      e.kb = (e.kb || new THREE.Vector3()).copy(dir).setY(0).normalize().multiplyScalar(14);
      damageEnemy(e, 45, c.clone().addScaledVector(dir, -e.r), false, 'poing');
      hitSomething = true;
    }
  }
  if (PVP) {
    const t = remoteInFront(origin, dir, P.punchRange + 0.5, 0.55);
    protectedUntil = 0;
    if (t) { toParent({ t: 'punch', id: t.id }); burst(t.center(), 0xe5e7eb, 6, 5); hitSomething = true; }
  }
  if (hitSomething) { shake(0.15); p.kick -= 0.02; }
}

let stopUntil = 0;
function hitStop(sec) { stopUntil = performance.now() + sec * 1000; }

function selectWeapon(i) {
  if (i === player.weapon) return;
  player.weapon = i;
  swapAnim = 1;
  document.getElementById('weaponName').textContent = WEAPONS[i].name;
  document.querySelectorAll('#weapons div').forEach(d => d.classList.toggle('on', Number(d.dataset.w) === i));
}
selectWeapon(0); player.weapon = 0; swapAnim = 0;
document.querySelectorAll('#weapons div').forEach(d => d.classList.toggle('on', Number(d.dataset.w) === 0));

function updateGun(dt) {
  gunParts.forEach((g, i) => { g.visible = i === player.weapon; });
  gunRecoil *= Math.exp(-dt * 12);
  swapAnim = Math.max(0, swapAnim - dt * 5);
  const speed = Math.hypot(player.vel.x, player.vel.z);
  const sway = player.onGround ? Math.sin(player.bob) * 0.012 * Math.min(1, speed / 9) : 0;
  gun.position.set(0.34 + sway, -0.32 - swapAnim * 0.4 + Math.abs(sway) * 0.5, -0.55 + gunRecoil * 0.18);
  gun.rotation.x = gunRecoil * 0.6;
  flash.intensity *= Math.exp(-dt * 30);
  player.punchCd = Math.max(0, player.punchCd - dt);
  punchAnim = Math.max(0, punchAnim - dt * 4);
  const ext = Math.sin(Math.min(1, (1 - punchAnim) * 1.6) * Math.PI);
  arm.visible = punchAnim > 0;
  if (swordMode) {
    // coup d'épée : balayage de droite à gauche
    const k = 1 - punchAnim;
    arm.position.set(0.35 - k * 0.7, -0.28 + ext * 0.1, -0.55);
    arm.rotation.set(-0.2, 0.9 - k * 1.8, -0.9 + k * 0.5);
  } else arm.position.set(-0.28 + ext * 0.12, -0.3 + ext * 0.08, -0.45 - ext * 0.35);
}

// ------------------------------------------------------------------ tirs
const raycaster = new THREE.Raycaster();
const rockets = [];
const enemyShots = [];
const tmpV = new THREE.Vector3();

function aimDir() { return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); }

// rayon contre les boîtes du niveau (distance au premier mur)
function rayBoxes(origin, dir, maxD) {
  let best = maxD;
  for (const b of boxes) {
    let tmin = 0, tmax = best;
    let ok = true;
    for (const a of ['x', 'y', 'z']) {
      if (Math.abs(dir[a]) < 1e-8) { if (origin[a] < b.min[a] || origin[a] > b.max[a]) { ok = false; break; } continue; }
      let t1 = (b.min[a] - origin[a]) / dir[a], t2 = (b.max[a] - origin[a]) / dir[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { ok = false; break; }
    }
    if (ok && tmin < best) best = tmin;
  }
  return best;
}

// munitions (seulement en partie : elles viennent des bonnes réponses)
const ammo = [0, 0];
let emptySent = false;
function updateAmmoHud() {
  document.querySelectorAll('#weapons div').forEach(d => {
    const i = Number(d.dataset.w);
    d.textContent = `${i + 1} · ${WEAPONS[i].name}` + (EMBED ? ` (${ammo[i]})` : '');
  });
}
function fire(now) {
  const p = player;
  if (!p.alive || p.cooldown > 0 || swapAnim > 0.3) return;
  if (EMBED) {
    if (ammo[p.weapon] <= 0) {
      const other = 1 - p.weapon;
      if (ammo[other] > 0) selectWeapon(other);
      else if (!emptySent) { emptySent = true; toParent({ t: 'empty' }); }
      return;
    }
    ammo[p.weapon]--;
    updateAmmoHud();
    toParent({ t: 'ammoLeft', ammo: ammo.slice() });
    if (ammo[0] <= 0 && ammo[1] <= 0 && !emptySent) { emptySent = true; setTimeout(() => toParent({ t: 'empty' }), 600); }
  }
  const w = WEAPONS[p.weapon];
  p.cooldown = w.rate;
  p.kick += w.kick;
  gunRecoil = 1;
  flash.intensity = 4;
  flash.color.setHex(w.color);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = aimDir();
  const muzzle = gun.localToWorld(new THREE.Vector3(0, swordMode ? 0.05 : 0.02, swordMode ? -0.8 : (p.weapon ? -0.55 : -0.35)));
  if (p.weapon === 0) {
    sfx('shot');
    const wallD = rayBoxes(origin, dir, 120);
    let hit = null, hitD = wallD;
    for (const e of enemies) {
      if (!e.alive) continue;
      tmpV.copy(e.mesh.position).add(e.center);
      const toE = tmpV.clone().sub(origin);
      const t = toE.dot(dir);
      if (t < 0 || t > hitD) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const head = e.headPos();
      const headHit = closest.distanceTo(head) < e.headR;
      if (closest.distanceTo(tmpV) < e.r || headHit) { hit = { e, head: headHit }; hitD = t; }
    }
    let rhit = null;
    if (PVP) {
      rhit = rayRemote(origin, dir, hitD);
      if (rhit) hitD = rhit.d;
    }
    const end = origin.clone().addScaledVector(dir, hitD);
    tracer(muzzle, end, 0x93c5fd);
    if (PVP) protectedUntil = 0;
  if (PVP) toParent({ t: 'shoot', hit: rhit ? rhit.id : 0, head: rhit ? rhit.head : false, e: [end.x, end.y, end.z].map(v => +v.toFixed(2)) });
    if (rhit) {
      burst(end, rhit.head ? 0xfde047 : 0xe5e7eb, rhit.head ? 10 : 6, 5);
    } else if (hit) {
      damageEnemy(hit.e, hit.head ? w.dmg * 2 : w.dmg, end, hit.head);
    } else if (wallD < 120) burst(end, 0xfde68a, 6, 4);
  } else {
    sfx('rocket');
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa94d }));
    m.position.copy(muzzle);
    scene.add(m);
    const k = ++rocketSeq;
    rockets.push({ mesh: m, vel: dir.clone().multiplyScalar(w.speed), born: now, trail: 0, k });
    if (PVP) { protectedUntil = 0; toParent({ t: 'rocket', k, o: [muzzle.x, muzzle.y, muzzle.z].map(v => +v.toFixed(2)), d: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) }); }
  }
}
let rocketSeq = 0;

function explode(pos, radius, dmg, rocket) {
  burst(pos, 0xf97316, 30, 12);
  burst(pos, 0xfde68a, 14, 7);
  ring(pos, radius, 0xf97316);
  sfx('boom');
  const d = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).distanceTo(pos);
  shake(Math.max(0, 0.5 - d / 30));
  // rocket jump : poussée + petits dégâts pour soi
  if (d < radius) {
    const push = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).sub(pos).normalize();
    const f = (1 - d / radius) * 15;
    player.vel.addScaledVector(push, f);
    if (push.y > 0.3) player.vel.y = Math.max(player.vel.y, f * 0.9);
    player.onGround = false;
    if (!PVP) hurtPlayer(Math.round((1 - d / radius) * 12), false);
  }
  if (PVP && rocket) {
    // le serveur vérifie et applique les dégâts
    const hits = [];
    for (const r of remotes.values()) {
      if (!r.visible) continue;
      const de = r.center().distanceTo(pos);
      if (de < radius + 0.5) hits.push({ id: r.id, dmg: Math.round(dmg * (1 - Math.min(1, de / (radius + 0.5)) * 0.6)) });
    }
    if (hits.length) hitMarker(false);
    toParent({ t: 'boom', k: rocket.k, p: [pos.x, pos.y, pos.z].map(v => +v.toFixed(2)), hits });
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const de = e.mesh.position.clone().add(e.center).distanceTo(pos);
    if (de < radius + e.r) damageEnemy(e, dmg * (1 - Math.min(1, de / (radius + e.r)) * 0.6), null, false);
  }
}

function updateRockets(dt, now) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    const step = r.vel.clone().multiplyScalar(dt);
    const len = step.length();
    const dir = step.clone().divideScalar(len || 1);
    const wallD = rayBoxes(r.mesh.position, dir, len);
    let hitEnemy = false;
    for (const e of enemies) {
      if (e.alive && r.mesh.position.distanceTo(e.mesh.position.clone().add(e.center)) < e.r + 0.3) { hitEnemy = true; break; }
    }
    if (PVP && !r.remote) for (const o of remotes.values()) {
      if (o.visible && r.mesh.position.distanceTo(o.center()) < 0.8) { hitEnemy = true; break; }
    }
    if (r.remote && (wallD < len || now - r.born > 4000)) {
      // roquette d'un autre joueur : l'explosion visible arrive avec le message du serveur
      scene.remove(r.mesh); r.mesh.geometry.dispose(); rockets.splice(i, 1);
      continue;
    }
    if (!r.remote && (wallD < len || hitEnemy || now - r.born > 4000)) {
      r.mesh.position.addScaledVector(dir, Math.min(wallD, len));
      explode(r.mesh.position.clone(), WEAPONS[1].splash, WEAPONS[1].dmg, r);
      scene.remove(r.mesh); r.mesh.geometry.dispose();
      rockets.splice(i, 1);
      continue;
    }
    r.mesh.position.add(step);
    r.trail += dt;
    if (r.trail > 0.02) { r.trail = 0; puff(r.mesh.position.clone(), 0xffd8a8, 0.35); }
  }
}

// ------------------------------------------------------------------ ennemis
const enemies = [];
const dying = [];
const robotMats = {
  body: new THREE.MeshLambertMaterial({ color: 0x9ca3af }),
  eye: new THREE.MeshBasicMaterial({ color: 0xf87171 }),
  drone: new THREE.MeshLambertMaterial({ color: 0x60a5fa }),
};
const SPAWNS = [[-26, -26], [26, -26], [-26, 26], [26, 26], [0, -27], [0, 27], [-27, 0], [27, 0]];

let enemyCount = 0;
function makeRobot(x, z, flying) {
  const g = new THREE.Group();
  let ch = null;
  const mat = new THREE.MeshLambertMaterial({ color: flying ? 0x60a5fa : 0x9ca3af });
  if (flying) {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat); g.add(core);
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), mat); wing.position.x = s * 0.7; g.add(wing); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), robotMats.eye); eye.position.set(0, 0, -0.5); g.add(eye);
  } else if (Med.ready.chars) {
    // brigand : un personnage du pack, dans des tons sombres
    ch = Med.createCharacter(['Rogue', 'Warrior', 'Monk'][enemyCount++ % 3]);
    ch.play('Run', 0);
    g.add(ch.root);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), mat); body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), mat); head.position.y = 1.75; g.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), robotMats.eye); eye.position.set(0, 1.78, -0.26); g.add(eye);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25), mat); leg.position.set(s * 0.22, 0.22, 0); g.add(leg); }
  }
  g.position.set(x, flying ? 3.5 + Math.random() * 2 : 0, z);
  scene.add(g);
  const e = {
    mesh: g, mat, flying, ch, hp: flying ? 60 : 100, alive: true, r: flying ? 0.7 : 0.6,
    center: new THREE.Vector3(0, flying ? 0 : 1, 0), headR: flying ? 0.25 : 0.32,
    nextShot: performance.now() + 1500 + Math.random() * 2000, flashT: 0, vel: new THREE.Vector3(),
    headPos() { return flying ? g.position.clone() : g.position.clone().add(new THREE.Vector3(0, 1.75, 0)); },
  };
  enemies.push(e);
  burst(g.position.clone().add(e.center), 0xa78bfa, 16, 5);
}

let wave = 0, score = 0, waveTimer = 0;
function startWave() {
  wave++;
  document.getElementById('wave').textContent = wave;
  banner(`Vague ${wave}`);
  const n = 3 + wave * 2;
  for (let i = 0; i < n; i++) {
    const [x, z] = SPAWNS[i % SPAWNS.length];
    setTimeout(() => makeRobot(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, wave >= 2 && i % 3 === 2), i * 350);
  }
}

function damageEnemy(e, dmg, at, head, how) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.flashT = 0.08;
  hitMarker(e.hp <= 0);
  if (at) burst(at, head ? 0xfde047 : 0xe5e7eb, head ? 10 : 6, 5);
  if (e.hp <= 0) {
    e.alive = false;
    score++;
    // style à la Ultrakill : variété et prise de risque rapportent plus
    const close = e.mesh.position.distanceTo(player.pos) < 6;
    addStyle(100, 'ÉTOURDI');
    if (head) addStyle(60, 'TÊTE');
    if (!player.onGround) addStyle(60, 'EN L\'AIR');
    if (how === 'poing') addStyle(80, 'POING');
    if (how === 'parade') addStyle(120, 'RENVOI');
    if (how === 'piqué') addStyle(80, 'PIQUÉ');
    if (close) { player.hp = Math.min(100, player.hp + 10); addStyle(30, 'AU CONTACT'); }
    toParent({ t: 'kill', head: !!head, air: !player.onGround, how: how || '' });
    document.getElementById('score').textContent = score;
    const c = e.mesh.position.clone().add(e.center);
    burst(c, e.flying ? 0x60a5fa : 0x9ca3af, 22, 8, true);
    burst(c, 0xfde047, 10, 6);
    sfx('kill');
    if (e.ch) {
      // le brigand s'effondre puis disparaît
      e.ch.flash(false);
      e.ch.once('Death');
      dying.push({ e, until: performance.now() + 1400 });
    } else scene.remove(e.mesh);
  }
}

function updateEnemies(dt, now) {
  const target = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
  for (const e of enemies) {
    if (!e.alive) continue;
    const pos = e.mesh.position;
    const to = target.clone().sub(pos.clone().add(e.center));
    const dist = to.length();
    e.mesh.rotation.y = Math.atan2(-to.x, -to.z);
    if (e.flying) {
      // tourne autour du joueur à distance
      const desired = target.clone().add(new THREE.Vector3(Math.sin(now / 1500 + e.r * 10) * 9, 3 + Math.sin(now / 900) * 1.5, Math.cos(now / 1500 + e.r * 10) * 9));
      e.vel.lerp(desired.sub(pos).multiplyScalar(0.8), Math.min(1, dt * 2));
      pos.addScaledVector(e.vel, dt);
      pos.y = Math.max(1.5, Math.min(7, pos.y));
    } else if (e.kb && e.kb.lengthSq() > 0.5) {
      const nx = pos.x + e.kb.x * dt, nz = pos.z + e.kb.z * dt;
      if (!blocked(nx, pos.z)) pos.x = nx;
      if (!blocked(pos.x, nz)) pos.z = nz;
      e.kb.multiplyScalar(Math.exp(-dt * 6));
    } else if (dist > 4) {
      const dir = new THREE.Vector3(to.x, 0, to.z).normalize();
      const sp = 3.6 + wave * 0.15;
      const nx = pos.x + dir.x * sp * dt, nz = pos.z + dir.z * sp * dt;
      // contourne grossièrement les obstacles
      if (!blocked(nx, pos.z)) pos.x = nx; else if (!blocked(pos.x, pos.z + Math.sign(dir.z || 1) * sp * dt)) pos.z += Math.sign(dir.z || 1) * sp * dt;
      if (!blocked(pos.x, nz)) pos.z = nz; else if (!blocked(pos.x + Math.sign(dir.x || 1) * sp * dt, pos.z)) pos.x += Math.sign(dir.x || 1) * sp * dt;
      e.mesh.children.forEach((c, i) => { if (i >= 3) c.position.z = Math.sin(now / 120 + i * Math.PI) * 0.15; });
    }
    if (e.flashT > 0) { e.flashT -= dt; e.mat.emissive.setHex(0xffffff); } else e.mat.emissive.setHex(0x000000);
    if (e.ch) {
      e.ch.flash(e.flashT > 0);
      e.ch.update(dt);
      e.ch.play(dist > 4 || (e.kb && e.kb.lengthSq() > 0.5) ? 'Run' : 'Idle_Attacking');
    }
    // tir
    if (now > e.nextShot && dist < 40 && player.alive) {
      const from = e.headPos();
      const d = target.clone().sub(from).normalize();
      if (rayBoxes(from, d, dist) >= dist - 0.5) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
        m.position.copy(from);
        scene.add(m);
        enemyShots.push({ mesh: m, vel: d.multiplyScalar(13 + wave * 0.5), born: now });
        if (e.ch) e.ch.once('Punch', 'Idle_Attacking');
      }
      e.nextShot = now + (e.flying ? 1800 : 2400) + Math.random() * 1200;
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    d.e.ch.update(dt);
    if (now > d.until) { scene.remove(d.e.mesh); d.e.ch.dispose(); dying.splice(i, 1); }
  }
  if (!enemies.length && started && player.alive) {
    waveTimer += dt;
    if (waveTimer > 2.5) { waveTimer = 0; startWave(); }
  }
}

function blocked(x, z) {
  for (const b of boxes) {
    if (b.max.y <= 0.3) continue;
    if (x + 0.5 > b.min.x && x - 0.5 < b.max.x && z + 0.5 > b.min.z && z - 0.5 < b.max.z && b.min.y < 1.8) return true;
  }
  return false;
}

function updateEnemyShots(dt, now) {
  const body = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  for (let i = enemyShots.length - 1; i >= 0; i--) {
    const s = enemyShots[i];
    const step = s.vel.clone().multiplyScalar(dt);
    const len = step.length();
    const wallD = rayBoxes(s.mesh.position, step.clone().divideScalar(len || 1), len);
    s.mesh.position.add(step);
    let dead = wallD < len || now - s.born > 5000;
    if (s.player) {
      for (const e of enemies) {
        if (e.alive && s.mesh.position.distanceTo(e.mesh.position.clone().add(e.center)) < e.r + 0.4) {
          damageEnemy(e, 150, s.mesh.position.clone(), false, 'parade'); dead = true; break;
        }
      }
    } else if (!dead && player.alive && s.mesh.position.distanceTo(body) < 0.9) { hurtPlayer(12, true); dead = true; }
    if (dead) { burst(s.mesh.position.clone(), 0xf472b6, 6, 4); scene.remove(s.mesh); s.mesh.geometry.dispose(); enemyShots.splice(i, 1); }
  }
}

// onde de choc du piqué au sol
function slamWave() {
  ring(player.pos.clone(), 4.5, 0xc4b5fd);
  if (PVP) {
    for (const r of remotes.values()) if (r.visible && r.pos.distanceTo(player.pos) < 4.5) toParent({ t: 'punch', id: r.id, slam: true });
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.mesh.position.distanceTo(player.pos);
    if (d < 4.5) damageEnemy(e, 45, null, false, 'piqué');
  }
}

function hurtPlayer(n, fromEnemy) {
  if (!player.alive || n <= 0) return;
  player.hp -= n;
  player.lastHurt = performance.now();
  document.getElementById('damage').style.boxShadow = `inset 0 0 160px rgba(220,38,38,${fromEnemy ? 0.7 : 0.35})`;
  setTimeout(() => { document.getElementById('damage').style.boxShadow = 'inset 0 0 160px rgba(220,38,38,0)'; }, 120);
  shake(fromEnemy ? 0.25 : 0.1);
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    banner(EMBED ? 'Étourdi !' : 'Étourdi ! R pour recommencer', '#f87171', EMBED ? 1500 : 999999);
    sfx('down');
    toParent({ t: 'down' });
  }
}

function restart() {
  for (const e of [...enemies, ...dying.map(d => d.e)]) scene.remove(e.mesh);
  enemies.length = 0; dying.length = 0;
  for (const s of [...enemyShots, ...rockets]) scene.remove(s.mesh);
  enemyShots.length = 0; rockets.length = 0;
  Object.assign(player, { hp: 100, alive: true, dash: P.dashCharges, slamming: false, sliding: false, airJumps: 1, wallJumps: P.wallJumps });
  style = 0; styleFeed.length = 0;
  player.pos.set(0, 2.5, 10); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = 0;
  if (PVP && lastSpawn) { player.pos.set(lastSpawn.x, lastSpawn.y + 0.5, lastSpawn.z); player.yaw = lastSpawn.yaw || 0; }
  wave = 0; score = 0; waveTimer = 0;
  document.getElementById('score').textContent = '0';
  hideBanner();
  if (!PVP) startWave();
}

// ------------------------------------------------------------------ effets
const particles = [];
const partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const matCache = new Map();
function partMat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
  return matCache.get(color);
}
function burst(pos, color, n, speed, chunky) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, partMat(color));
    m.position.copy(pos);
    const s = chunky ? 1.5 + Math.random() * 2 : 0.5 + Math.random();
    m.scale.setScalar(s);
    scene.add(m);
    particles.push({
      mesh: m, vel: new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.1, (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6)),
      life: 0.5 + Math.random() * 0.5, grav: chunky ? 18 : 8, spin: (Math.random() - 0.5) * 12,
    });
  }
}
function puff(pos, color, life) {
  const m = new THREE.Mesh(partGeo, partMat(color));
  m.position.copy(pos);
  m.scale.setScalar(1.6);
  scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(0, 0.4, 0), life, grav: -1, spin: 3 });
}
const rings = [];
function ring(pos, radius, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
  m.position.copy(pos); m.position.y += 0.1;
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
  rings.push({ mesh: m, radius, t: 0 });
}
const tracers = [];
function tracer(a, b, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true }));
  scene.add(line);
  tracers.push({ line, t: 0 });
}
function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) { scene.remove(q.mesh); particles.splice(i, 1); continue; }
    q.vel.y -= q.grav * dt;
    q.mesh.position.addScaledVector(q.vel, dt);
    if (q.mesh.position.y < 0.05) { q.mesh.position.y = 0.05; q.vel.multiplyScalar(0.5); q.vel.y = Math.abs(q.vel.y) * 0.4; }
    q.mesh.rotation.x += q.spin * dt; q.mesh.rotation.y += q.spin * dt;
    q.mesh.scale.multiplyScalar(Math.exp(-dt * 1.5));
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt * 2.5;
    if (r.t >= 1) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); rings.splice(i, 1); continue; }
    r.mesh.scale.setScalar(r.radius * (0.2 + r.t));
    r.mesh.material.opacity = 1 - r.t;
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.t += dt * 8;
    if (t.t >= 1) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); continue; }
    t.line.material.opacity = 1 - t.t;
  }
}
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

// petits sons synthétisés (aucun fichier à télécharger)
let audio = null;
const SAMPLE = { punch: ['sword', 0.6], hit: ['hit', 0.45], kill: ['kill', 0.35], parry: ['parry', 0.5], jump: ['jump', 0.35],
  dash: ['dash', 0.45], slide: ['slide', 0.4], down: ['down', 0.6], step: ['step', 0.18], land: ['land', 0.3] };
let soundsLoading = false;
function sfx(kind) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (!soundsLoading) { soundsLoading = true; Med.loadSounds(audio).catch(() => {}); }
    if (SAMPLE[kind] && Med.playSound(audio, SAMPLE[kind][0], SAMPLE[kind][1])) return;
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.connect(g); g.connect(audio.destination);
    const S = {
      shot: ['square', 520, 120, 0.12, 0.12], rocket: ['sawtooth', 160, 60, 0.25, 0.12], boom: ['sawtooth', 90, 30, 0.45, 0.2],
      jump: ['sine', 300, 520, 0.08, 0.05], dash: ['triangle', 700, 300, 0.12, 0.08], kill: ['square', 880, 1320, 0.12, 0.08],
      hit: ['square', 1200, 1200, 0.03, 0.04], down: ['sawtooth', 300, 60, 0.6, 0.15],
      slide: ['triangle', 220, 120, 0.2, 0.06], punch: ['square', 180, 80, 0.08, 0.1], parry: ['triangle', 1400, 2400, 0.2, 0.12],
    }[kind];
    if (!S) return;
    o.type = S[0];
    o.frequency.setValueAtTime(S[1], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, S[2]), t + S[3]);
    g.gain.setValueAtTime(S[4], t);
    g.gain.exponentialRampToValueAtTime(0.001, t + S[3]);
    o.start(t); o.stop(t + S[3] + 0.02);
  } catch (e) { /* son indisponible */ }
}

// ------------------------------------------------------------------ interface
let bannerTimer = 0;
function banner(text, color = '#fde68a', ms = 1500) {
  const b = document.getElementById('banner');
  b.textContent = text; b.style.color = color; b.style.opacity = 1;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, ms);
}
function hideBanner() { document.getElementById('banner').style.opacity = 0; }
let hitTimer = 0;
function hitMarker(kill) {
  const h = document.getElementById('hitmark');
  h.classList.toggle('kill', kill);
  h.style.opacity = 1;
  sfx(kill ? 'kill' : 'hit');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { h.style.opacity = 0; }, kill ? 220 : 90);
}

// compteur de style (inspiré d'Ultrakill)
const RANKS = [
  { min: 0, letter: 'D', name: 'Destructeur', color: '#60a5fa' },
  { min: 250, letter: 'C', name: 'Chaotique', color: '#4ade80' },
  { min: 550, letter: 'B', name: 'Brutal', color: '#facc15' },
  { min: 900, letter: 'A', name: 'Anarchique', color: '#fb923c' },
  { min: 1400, letter: 'S', name: 'Suprême', color: '#f87171' },
];
let style = 0;
const styleFeed = [];
function addStyle(points, label) {
  style = Math.min(2000, style + points);
  styleFeed.unshift({ label, t: performance.now() });
  styleFeed.length = Math.min(styleFeed.length, 5);
}
function updateStyle(dt) {
  style = Math.max(0, style - (60 + style * 0.08) * dt);
  const box = document.getElementById('style');
  if (style < 40) { box.style.opacity = 0; return; }
  box.style.opacity = 1;
  let r = RANKS[0];
  for (const k of RANKS) if (style >= k.min) r = k;
  const next = RANKS[RANKS.indexOf(r) + 1];
  const frac = next ? (style - r.min) / (next.min - r.min) : 1;
  document.getElementById('styleLetter').textContent = r.letter;
  document.getElementById('styleLetter').style.color = r.color;
  document.getElementById('styleName').textContent = r.name;
  document.getElementById('styleBar').style.width = `${frac * 100}%`;
  document.getElementById('styleBar').style.background = r.color;
  const now = performance.now();
  document.getElementById('styleFeed').innerHTML = '';
  for (const f of styleFeed) {
    if (now - f.t > 2500) continue;
    const d = document.createElement('div');
    d.textContent = '+ ' + f.label;
    d.style.opacity = String(1 - (now - f.t) / 2500);
    document.getElementById('styleFeed').append(d);
  }
}

const hpBar = document.getElementById('hpBar'), hpText = document.getElementById('hpText');
const dashBars = [...document.querySelectorAll('#dash i')];
const speedEl = document.getElementById('speed'), fpsEl = document.getElementById('fps');
let fpsFrames = 0, fpsTime = 0;
function updateHud(dt) {
  if (PVP) {
    const prot = performance.now() < protectedUntil;
    const el = document.getElementById('protect');
    if (el.classList.contains('hidden') === prot) el.classList.toggle('hidden', !prot);
  }
  hpBar.style.width = `${player.hp}%`;
  hpBar.style.background = player.hp > 50 ? 'linear-gradient(90deg,#22c55e,#86efac)' : player.hp > 25 ? '#eab308' : '#ef4444';
  hpText.textContent = Math.ceil(player.hp);
  dashBars.forEach((b, i) => { b.style.width = `${Math.max(0, Math.min(1, player.dash - i)) * 100}%`; });
  speedEl.textContent = Math.hypot(player.vel.x, player.vel.z).toFixed(1);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} img/s`; fpsFrames = 0; fpsTime = 0; }
}

// ------------------------------------------------------------------ contrôles
const canvas = renderer.domElement;
const menu = document.getElementById('menu');
const FORMAT = { sens: v => v.toFixed(1), keyTurn: v => v.toFixed(1), fov: v => `${v}°` };
for (const id of ['sens', 'keyTurn', 'fov', 'quality']) {
  const input = document.getElementById(id);
  input.value = settings[id];
  const out = document.getElementById(id + 'Val');
  if (out) out.textContent = FORMAT[id](Number(input.value));
  input.addEventListener('input', () => {
    settings[id] = Number(input.value);
    if (out) out.textContent = FORMAT[id](settings[id]);
    try { localStorage.setItem('arcanes-fps', JSON.stringify(settings)); } catch (e) { /* rien */ }
    applyQuality();
  });
}

function requestLock() { try { canvas.requestPointerLock(); } catch (e) { /* rien */ } }
document.getElementById('play').addEventListener('click', () => {
  if (EMBED && embedPaused) return;
  menu.classList.add('hidden');
  if (!started) { started = true; restart(); }
  requestLock();
  // sans pointer lock (navigateur qui refuse), on joue quand même au clavier
  setTimeout(() => { if (!locked) document.getElementById('menuHint').textContent = 'Souris non capturée : clique dans le jeu, ou joue au clavier (flèches + F).'; }, 400);
});
canvas.addEventListener('click', () => { if (started && !locked && menu.classList.contains('hidden')) requestLock(); });
// Souris libérée (Échap, Alt+Tab, notification…) : le jeu continue, un simple clic la reprend.
// Les réglages ne s'ouvrent que si on les demande (bouton ou 2e Échap).
const relock = document.getElementById('relock');
function showRelock(on) { relock.classList.toggle('hidden', !on); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { showRelock(false); return; }
  mouseDown = false;
  if (started && menu.classList.contains('hidden') && !embedPaused) showRelock(true);
});
relock.addEventListener('click', e => {
  if (e.target.closest('#relockMenu')) {
    showRelock(false);
    menu.classList.remove('hidden');
    document.getElementById('play').textContent = 'Reprendre';
  } else { showRelock(false); requestLock(); }
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  const k = 0.0022 * settings.sens;
  player.yaw -= e.movementX * k;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * k));
});
document.addEventListener('mousedown', e => { if (locked && e.button === 0) mouseDown = true; if (locked && e.button === 2) punch(performance.now()); });
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', () => { if (locked) selectWeapon(1 - player.weapon); });
const paused = () => !menu.classList.contains('hidden') || embedPaused;
document.addEventListener('keydown', e => {
  if (paused()) {
    if (e.code === 'Escape' && started) { menu.classList.add('hidden'); requestLock(); }
    return;
  }
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && !e.repeat) player.jumpQueued = performance.now() / 1000;
  if (e.code === 'KeyF' && !e.repeat) punch(performance.now());
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') doDash();
  if (e.code === 'Digit1' || e.code === 'Numpad1') selectWeapon(0);
  if (e.code === 'Digit2' || e.code === 'Numpad2') selectWeapon(1);
  if (e.code === 'KeyQ') selectWeapon(1 - player.weapon);
  if (e.code === 'KeyC' && !e.repeat && !player.onGround && player.alive && player.dashT <= 0) player.slamming = true;
  if (e.code === 'KeyR' && !player.alive && !EMBED) restart();
  if (e.code === 'KeyR' && EMBED && player.alive) toParent({ t: 'reload' });
  if (e.code === 'Escape' && !locked && started) { showRelock(false); menu.classList.remove('hidden'); document.getElementById('play').textContent = 'Reprendre'; }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

// ------------------------------------------------------------------ PvP : les autres joueurs
// Le serveur envoie la position de tout le monde ~15 fois par seconde ; on affiche les autres
// avec 110 ms de retard pour interpoler en douceur. Chacun annonce ses touches, le serveur tranche.
const remotes = new Map();   // id → avatar
let roster = new Map(), myId = 0, lastPosSent = 0;
const INTERP_MS = 110;

function nameSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(2.8, 0.7, 1);
  sp.renderOrder = 10;
  return sp;
}

function makeRemote(id) {
  const info = roster.get(id) || { name: '?', color: '#a78bfa' };
  const color = new THREE.Color(info.color);
  const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });
  const dark = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 1 });
  const g = new THREE.Group();
  let ch = null;
  if (Med.ready.chars) {
    // personnage du pack (classe choisie par l'identifiant) + anneau à la couleur du joueur
    ch = Med.createCharacter(Med.CLASSES[id % Med.CLASSES.length]);
    g.add(ch.root);
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.04; g.add(ringM);
    const label = nameSprite(info.name, info.color); label.position.y = 2.35; g.add(label);
    scene.add(g);
    const r = {
      id, g, ch, buf: [], visible: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, flashT: 0, speed: 0, dead: false,
      center() { return this.pos.clone().add(new THREE.Vector3(0, 0.9, 0)); },
      headPos() { return this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)); },
    };
    g.visible = false;
    remotes.set(id, r);
    return r;
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.0, 10), mat); body.position.y = 0.85; g.add(body);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), dark); legs.position.y = 0.2; g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat); head.position.y = 1.6; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x111827 }));
  visor.position.set(0, 1.64, -0.24); g.add(visor);
  const gunM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.6), new THREE.MeshLambertMaterial({ color: 0x3f3a5a }));
  gunM.position.set(0.38, 1.15, -0.35); g.add(gunM);
  const label = nameSprite(info.name, info.color); label.position.y = 2.3; g.add(label);
  scene.add(g);
  const r = {
    id, g, body, head, mats: [mat, dark], buf: [], visible: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, flashT: 0,
    center() { return this.pos.clone().add(new THREE.Vector3(0, 0.9, 0)); },
    headPos() { return this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)); },
  };
  g.visible = false;
  remotes.set(id, r);
  return r;
}

function removeRemote(r) {
  scene.remove(r.g);
  if (r.ch) r.ch.dispose();
  r.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  remotes.delete(r.id);
}

// angle le plus court entre deux lacets
const lerpAngle = (a, b, k) => a + (Math.atan2(Math.sin(b - a), Math.cos(b - a))) * k;

function updateRemotes(now, dt) {
  const t = performance.now() - INTERP_MS;
  for (const r of remotes.values()) {
    const b = r.buf;
    while (b.length > 2 && b[1].t <= t) b.shift();
    if (!b.length) continue;
    let s;
    if (b.length > 1 && b[0].t <= t && b[1].t > t) {
      const k = (t - b[0].t) / (b[1].t - b[0].t);
      s = { x: b[0].x + (b[1].x - b[0].x) * k, y: b[0].y + (b[1].y - b[0].y) * k, z: b[0].z + (b[1].z - b[0].z) * k,
        w: lerpAngle(b[0].w, b[1].w, k), sl: b[1].sl, v: b[1].v, h: b[1].h };
    } else s = b[b.length - 1];
    const moved = Math.hypot(s.x - r.pos.x, s.z - r.pos.z);
    r.speed += ((dt > 0 ? moved / dt : 0) - r.speed) * Math.min(1, dt * 8);
    r.pos.set(s.x, s.y, s.z); r.yaw = s.w;
    r.g.position.copy(r.pos);
    r.g.rotation.y = r.yaw;
    // invulnérable juste après la réapparition : clignote
    const op = s.v ? (Math.sin(now / 60) > 0 ? 0.35 : 0.8) : 1;
    if (r.ch) {
      if (s.h <= 0) { if (!r.dead) { r.dead = true; r.ch.once('Death'); } }
      else {
        if (r.dead) { r.dead = false; r.ch.play('Idle', 0); }
        r.ch.play(s.sl ? 'Roll' : r.speed > 1.5 ? 'Run' : 'Idle');
      }
      r.ch.opacity(op);
      r.ch.flash(r.flashT > 0);
      r.ch.update(dt);
    } else {
      r.body.scale.y = s.sl ? 0.6 : 1;
      r.head.position.y = s.sl ? 1.15 : 1.6;
      r.mats.forEach(m => { m.opacity = op; m.emissive && m.emissive.setHex(r.flashT > 0 ? 0xffffff : 0x000000); });
    }
    r.flashT = Math.max(0, r.flashT - dt);
    r.g.visible = r.visible;
  }
}

function onState(ps) {
  const seen = new Set();
  const t = performance.now();
  for (const s of ps) {
    if (s.i === myId) continue;
    seen.add(s.i);
    const r = remotes.get(s.i) || makeRemote(s.i);
    if (!r.visible) r.buf.length = 0;   // réapparition : pas d'interpolation depuis l'ancienne place
    r.visible = true;
    r.buf.push({ t, x: s.x, y: s.y, z: s.z, w: s.w, sl: s.sl, v: s.v, h: s.h });
    if (r.buf.length > 12) r.buf.shift();
  }
  // les joueurs absents du message sont en train de répondre aux questions : on les cache
  for (const r of remotes.values()) if (!seen.has(r.id)) { r.visible = false; r.g.visible = false; }
  document.getElementById('wave').textContent = String(seen.size + (player.alive && started && !embedPaused ? 1 : 0));
}

// rayon contre les avatars : corps (cylindre approché par segment) + tête
function rayRemote(origin, dir, maxD) {
  let best = null;
  const seg = (a, b, rad) => {
    // distance minimale entre le rayon et le segment [a,b]
    let bestT = null;
    for (let i = 0; i <= 6; i++) {
      const pt = a.clone().lerp(b, i / 6);
      const tt = pt.clone().sub(origin).dot(dir);
      if (tt < 0 || tt > maxD) continue;
      if (origin.clone().addScaledVector(dir, tt).distanceTo(pt) < rad && (bestT === null || tt < bestT)) bestT = tt;
    }
    return bestT;
  };
  for (const r of remotes.values()) {
    if (!r.visible) continue;
    const hp = r.headPos();
    const th = hp.clone().sub(origin).dot(dir);
    const headHit = th > 0 && th < maxD && origin.clone().addScaledVector(dir, th).distanceTo(hp) < 0.34;
    const tb = seg(r.pos.clone().setY(r.pos.y + 0.2), r.pos.clone().setY(r.pos.y + 1.3), 0.45);
    const d = headHit ? th : tb;
    if (d !== null && d !== undefined && (!best || d < best.d)) best = { id: r.id, head: headHit, d };
  }
  return best;
}

function remoteInFront(origin, dir, range, cos) {
  let best = null, bestD = Infinity;
  for (const r of remotes.values()) {
    if (!r.visible) continue;
    const to = r.center().sub(origin);
    const d = to.length();
    if (d < range && to.normalize().dot(dir) > cos && d < bestD) { best = r; bestD = d; }
  }
  return best;
}

function sendPos(now) {
  if (!player.alive || now - lastPosSent < 50) return;
  lastPosSent = now;
  toParent({ t: 'pos', x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2),
    yaw: +player.yaw.toFixed(3), pitch: +player.pitch.toFixed(2), sl: player.sliding ? 1 : 0 });
}

function remoteRocket(m) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa94d }));
  mesh.position.fromArray(m.o);
  scene.add(mesh);
  rockets.push({ mesh, vel: new THREE.Vector3().fromArray(m.d).normalize().multiplyScalar(WEAPONS[1].speed), born: performance.now(), trail: 0, k: m.k, owner: m.id, remote: true });
  sfx('rocket');
}

function remoteBoom(m) {
  const i = rockets.findIndex(r => r.remote && r.owner === m.id && r.k === m.k);
  if (i >= 0) { scene.remove(rockets[i].mesh); rockets.splice(i, 1); }
  const pos = new THREE.Vector3().fromArray(m.p);
  burst(pos, 0xf97316, 30, 12);
  burst(pos, 0xfde68a, 14, 7);
  ring(pos, WEAPONS[1].splash, 0xf97316);
  sfx('boom');
  shake(Math.max(0, 0.5 - player.pos.distanceTo(pos) / 30));
}

function onPvpMessage(m) {
  if (m.t === 'roster') {
    myId = m.me;
    roster = new Map(m.players.map(p => [p.id, p]));
    for (const r of [...remotes.values()]) if (!roster.has(r.id)) removeRemote(r);
  } else if (m.t === 'state') {
    onState(m.ps);
  } else if (m.t === 'shot') {
    if (m.id === myId) return;
    const r = remotes.get(m.id);
    if (r && r.ch) r.ch.attack();
    if (r && r.visible && m.e) {
      const from = r.headPos().add(new THREE.Vector3(0.3, -0.4, 0));
      tracer(from, new THREE.Vector3().fromArray(m.e), 0x93c5fd);
      if (r.pos.distanceTo(player.pos) < 40) sfx('shot');
    }
  } else if (m.t === 'rocket') {
    if (m.id !== myId) remoteRocket(m);
  } else if (m.t === 'boom') {
    if (m.id !== myId) remoteBoom(m);
  } else if (m.t === 'hit') {
    // touché : le serveur donne les points de vie restants
    player.hp = m.hp;
    player.lastHurt = performance.now();
    document.getElementById('damage').style.boxShadow = 'inset 0 0 160px rgba(220,38,38,0.7)';
    setTimeout(() => { document.getElementById('damage').style.boxShadow = 'inset 0 0 160px rgba(220,38,38,0)'; }, 120);
    shake(0.25);
    if (m.push) { player.vel.add(new THREE.Vector3().fromArray(m.push)); player.onGround = false; }
    if (m.hp <= 0 && player.alive) {
      player.alive = false;
      banner(m.by ? `Étourdi par ${m.by} !` : 'Étourdi !', '#f87171', 1800);
      sfx('down');
    }
  } else if (m.t === 'hitconfirm') {
    hitMarker(m.stun);
    const r = remotes.get(m.id);
    if (r) r.flashT = 0.08;
    if (m.stun) {
      addStyle(150, 'ÉTOURDI');
      if (!player.onGround) addStyle(60, 'EN L\'AIR');
      sfx('kill');
      if (r) { burst(r.center(), 0xfde047, 16, 7); burst(r.center(), new THREE.Color(roster.get(r.id) ? roster.get(r.id).color : '#ffffff').getHex(), 20, 8, true); }
    }
  } else if (m.t === 'scored') {
    score = m.stuns;
    document.getElementById('score').textContent = score;
    banner(`${m.victim} étourdi !`, '#fde047', 1200);
  }
}

// ------------------------------------------------------------------ intégration dans une partie Arcanes
let lastSpawn = null, protectedUntil = 0;
function revive(spawn) {
  if (spawn) lastSpawn = spawn;
  for (const sh of enemyShots) scene.remove(sh.mesh);
  enemyShots.length = 0;
  Object.assign(player, { hp: 100, alive: true, slamming: false, sliding: false, lastHurt: 0 });
  if (spawn) { player.pos.set(spawn.x, spawn.y + 0.5, spawn.z); player.yaw = spawn.yaw || 0; player.pitch = 0; }
  else player.pos.set(0, 2.5, 10);
  player.vel.set(0, 0, 0);
  // les robots trop proches reculent un peu
  for (const e of enemies) if (e.mesh.position.distanceTo(player.pos) < 8) e.mesh.position.add(e.mesh.position.clone().sub(player.pos).setY(0).normalize().multiplyScalar(8));
  hideBanner();
}
if (EMBED) {
  document.getElementById('menuText').textContent = PVP
    ? 'Chacun pour soi : réponds aux questions pour recharger tes bâtons, puis étourdis les autres joueurs !'
    : 'Réponds aux questions pour recharger tes bâtons, puis étourdis un maximum de brigands !';
  if (PVP) {
    document.querySelector('#topRight .lbl').textContent = 'En jeu';
    document.querySelectorAll('#topRight .lbl')[1].textContent = 'Joueurs étourdis';
    document.getElementById('wave').textContent = '1';
  }
  document.getElementById('play').textContent = 'Jouer';
  document.getElementById('topLeft').lastChild.textContent = ' · Arcanes';
  document.getElementById('topLeft').style.top = '110px';   // laisse la place à l'horloge de la partie
  updateAmmoHud();
  window.addEventListener('message', ev => {
    if (ev.origin !== location.origin || !ev.data || !ev.data.arcanesFps) return;
    const m = ev.data;
    if (m.t === 'pause') {
      embedPaused = true;
      showRelock(false);
      for (const k in keys) keys[k] = false;
      mouseDown = false;
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (m.t === 'resume') {
      embedPaused = false;
      if (PVP) protectedUntil = performance.now() + 4000;
      if (!started) { started = true; restart(); }
      menu.classList.remove('hidden');      // un clic est nécessaire pour reprendre la souris
      document.getElementById('play').textContent = 'Reprendre';
      document.getElementById('menuHint').textContent = 'Clique sur Reprendre (ou appuie sur Entrée) pour revenir dans l\'arène.';
    } else if (m.t === 'ammo') {
      ammo[0] = m.ammo[0]; ammo[1] = m.ammo[1];
      if (ammo[0] > 0 || ammo[1] > 0) emptySent = false;
      updateAmmoHud();
    } else if (m.t === 'revive') {
      revive(m.spawn);
    } else if (PVP) {
      onPvpMessage(m);
    } else if (m.t === 'reset') {
      started = false; embedPaused = true; score = 0; style = 0;
    }
  });
  // Entrée dans le menu = reprendre (pratique au clavier)
  document.addEventListener('keydown', e => {
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !menu.classList.contains('hidden') && started && !embedPaused) {
      document.getElementById('play').click();
    }
  });
  if (PVP) {
    // réglages ouverts juste après le retour dans l'arène : le serveur nous rend invisible
    let guardOn = false;
    new MutationObserver(() => {
      const open = !menu.classList.contains('hidden') && started && !embedPaused;
      if (open !== guardOn) { guardOn = open; toParent({ t: 'guard', on: open }); }
    }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  }
  toParent({ t: 'ready' });
}

// ------------------------------------------------------------------ boucle
let last = performance.now(), stepT = 0;

// ------------------------------------------------------------------ chargement des assets médiévaux
// (le jeu est jouable tout de suite avec les boîtes ; le décor arrive dès qu'il est chargé)
Med.loadLevelAssets()
  .then(() => { Med.dressLevel(scene, levelParts, levelFloor, ARENA); })
  .catch(e => console.warn('Décor médiéval indisponible', e));
Med.loadCharacters()
  .then(() => {
    medievalWeapons();
    if (PVP) for (const r of [...remotes.values()]) removeRemote(r);   // recréés avec les personnages
  })
  .catch(e => console.warn('Personnages indisponibles', e));
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (started && !paused() && now < stopUntil) {
    // arrêt sur image d'une fraction de seconde (parade)
  } else if (started && !paused()) {
    player.cooldown = Math.max(0, player.cooldown - dt);
    updateStyle(dt);
    if (player.alive) {
      updatePlayer(dt, now);
      // bruits de pas
      const sp = Math.hypot(player.vel.x, player.vel.z);
      if (player.onGround && !player.sliding && sp > 3) {
        stepT -= dt * sp;
        if (stepT <= 0) { stepT = 3.2; sfx('step'); }
      } else stepT = 0.5;
      if (mouseDown || keys.Enter || keys.NumpadEnter) fire(now);
    }
    updateGun(dt);
    updateRockets(dt, now);
    if (!PVP) {
      updateEnemies(dt, now);
      updateEnemyShots(dt, now);
    } else sendPos(now);
    updateEffects(dt);
    updateHud(dt);
  } else if (!started) {
    // menu : la caméra tourne lentement au-dessus de l'arène
    camera.position.set(Math.sin(now / 6000) * 24, 14, Math.cos(now / 6000) * 24);
    camera.lookAt(0, 2, 0);
  }
  if (PVP) updateRemotes(now, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// outils de test (captures automatiques) : ?debug
if (new URLSearchParams(location.search).has('debug')) window.__fps = { player, scene, camera, enemies, remotes: () => remotes, Med };
