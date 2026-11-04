// Prototype FPS solo — Arcanes
// Objectif : régler la sensation de jeu (déplacements nerveux façon Quake / Ultrakill) et mesurer
// les performances sur les PC de l'école. Pas encore de questions ni de multijoueur.
import * as THREE from './vendor/three.module.min.js';

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
  { name: 'Revolver', rate: 0.32, dmg: 40, kick: 0.035, color: 0xfde68a },
  { name: 'Lance-roquettes', rate: 0.85, dmg: 95, splash: 3.6, speed: 30, kick: 0.06, color: 0xf97316 },
];

const settings = { sens: 1, keyTurn: 2.2, fov: 90, quality: 0.75 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arcanes-fps') || '{}')); } catch (e) { /* rien */ }

// ------------------------------------------------------------------ rendu
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1f4d);
scene.fog = new THREE.Fog(0x2a1f4d, 30, 90);
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

scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x3b2f2f, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
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

function addBox(x, y, z, w, h, d, mat = mats.stone) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y + h / 2, z);
  scene.add(mesh);
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
  boxes.push({ min: new THREE.Vector3(-ARENA - 5, -5, -ARENA - 5), max: new THREE.Vector3(ARENA + 5, 0, ARENA + 5) });

  // murs d'enceinte
  const H = 8;
  addBox(0, 0, -ARENA - 0.5, ARENA * 2 + 2, H, 1, mats.wall);
  addBox(0, 0, ARENA + 0.5, ARENA * 2 + 2, H, 1, mats.wall);
  addBox(-ARENA - 0.5, 0, 0, 1, H, ARENA * 2, mats.wall);
  addBox(ARENA + 0.5, 0, 0, 1, H, ARENA * 2, mats.wall);

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
    p.vel.x = wn.x * 9 + wish.x * 4; p.vel.z = wn.z * 9 + wish.z * 4;
    p.vel.y = P.jump * 0.9;
    p.slamming = false;
    burst(p.pos.clone().add(new THREE.Vector3(-wn.x * 0.4, 1, -wn.z * 0.4)), 0xe9d5ff, 8, 4);
    sfx('jump');
    return true;
  }
  if (p.airJumps > 0) {
    p.airJumps--;
    p.vel.y = P.doubleJump;
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
let punchAnim = 0;

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
  arm.position.set(-0.28 + ext * 0.12, -0.3 + ext * 0.08, -0.45 - ext * 0.35);
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

function fire(now) {
  const p = player;
  if (!p.alive || p.cooldown > 0 || swapAnim > 0.3) return;
  const w = WEAPONS[p.weapon];
  p.cooldown = w.rate;
  p.kick += w.kick;
  gunRecoil = 1;
  flash.intensity = 4;
  flash.color.setHex(w.color);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = aimDir();
  const muzzle = gun.localToWorld(new THREE.Vector3(0, 0.02, p.weapon ? -0.55 : -0.35));
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
    const end = origin.clone().addScaledVector(dir, hitD);
    tracer(muzzle, end, 0xfde68a);
    if (hit) {
      damageEnemy(hit.e, hit.head ? w.dmg * 2 : w.dmg, end, hit.head);
    } else if (wallD < 120) burst(end, 0xfde68a, 6, 4);
  } else {
    sfx('rocket');
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa94d }));
    m.position.copy(muzzle);
    scene.add(m);
    rockets.push({ mesh: m, vel: dir.clone().multiplyScalar(w.speed), born: now, trail: 0 });
  }
}

function explode(pos, radius, dmg) {
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
    hurtPlayer(Math.round((1 - d / radius) * 12), false);
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
    if (wallD < len || hitEnemy || now - r.born > 4000) {
      r.mesh.position.addScaledVector(dir, Math.min(wallD, len));
      explode(r.mesh.position.clone(), WEAPONS[1].splash, WEAPONS[1].dmg);
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
const robotMats = {
  body: new THREE.MeshLambertMaterial({ color: 0x9ca3af }),
  eye: new THREE.MeshBasicMaterial({ color: 0xf87171 }),
  drone: new THREE.MeshLambertMaterial({ color: 0x60a5fa }),
};
const SPAWNS = [[-26, -26], [26, -26], [-26, 26], [26, 26], [0, -27], [0, 27], [-27, 0], [27, 0]];

function makeRobot(x, z, flying) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: flying ? 0x60a5fa : 0x9ca3af });
  if (flying) {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat); g.add(core);
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), mat); wing.position.x = s * 0.7; g.add(wing); }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), robotMats.eye); eye.position.set(0, 0, -0.5); g.add(eye);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), mat); body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.5), mat); head.position.y = 1.75; g.add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), robotMats.eye); eye.position.set(0, 1.78, -0.26); g.add(eye);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25), mat); leg.position.set(s * 0.22, 0.22, 0); g.add(leg); }
  }
  g.position.set(x, flying ? 3.5 + Math.random() * 2 : 0, z);
  scene.add(g);
  const e = {
    mesh: g, mat, flying, hp: flying ? 60 : 100, alive: true, r: flying ? 0.7 : 0.6,
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
    document.getElementById('score').textContent = score;
    const c = e.mesh.position.clone().add(e.center);
    burst(c, e.flying ? 0x60a5fa : 0x9ca3af, 22, 8, true);
    burst(c, 0xfde047, 10, 6);
    sfx('kill');
    scene.remove(e.mesh);
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
    // tir
    if (now > e.nextShot && dist < 40 && player.alive) {
      const from = e.headPos();
      const d = target.clone().sub(from).normalize();
      if (rayBoxes(from, d, dist) >= dist - 0.5) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
        m.position.copy(from);
        scene.add(m);
        enemyShots.push({ mesh: m, vel: d.multiplyScalar(13 + wave * 0.5), born: now });
      }
      e.nextShot = now + (e.flying ? 1800 : 2400) + Math.random() * 1200;
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
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
    banner('Étourdi ! R pour recommencer', '#f87171', 999999);
    sfx('down');
  }
}

function restart() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;
  for (const s of [...enemyShots, ...rockets]) scene.remove(s.mesh);
  enemyShots.length = 0; rockets.length = 0;
  Object.assign(player, { hp: 100, alive: true, dash: P.dashCharges, slamming: false, sliding: false, airJumps: 1, wallJumps: P.wallJumps });
  style = 0; styleFeed.length = 0;
  player.pos.set(0, 2.5, 10); player.vel.set(0, 0, 0); player.yaw = 0; player.pitch = 0;
  wave = 0; score = 0; waveTimer = 0;
  document.getElementById('score').textContent = '0';
  hideBanner();
  startWave();
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
function sfx(kind) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
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
  menu.classList.add('hidden');
  if (!started) { started = true; restart(); }
  requestLock();
  // sans pointer lock (navigateur qui refuse), on joue quand même au clavier
  setTimeout(() => { if (!locked) document.getElementById('menuHint').textContent = 'Souris non capturée : clique dans le jeu, ou joue au clavier (flèches + F).'; }, 400);
});
canvas.addEventListener('click', () => { if (started && !locked && menu.classList.contains('hidden')) requestLock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && started) {
    // Échap : pause
    menu.classList.remove('hidden');
    document.getElementById('play').textContent = 'Reprendre';
    mouseDown = false;
  }
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
const paused = () => !menu.classList.contains('hidden');
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
  if (e.code === 'KeyR' && !player.alive) restart();
  if (e.code === 'Escape' && !locked && started) { menu.classList.remove('hidden'); document.getElementById('play').textContent = 'Reprendre'; }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

// ------------------------------------------------------------------ boucle
let last = performance.now();
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
      if (mouseDown || keys.Enter || keys.NumpadEnter) fire(now);
    }
    updateGun(dt);
    updateRockets(dt, now);
    updateEnemies(dt, now);
    updateEnemyShots(dt, now);
    updateEffects(dt);
    updateHud(dt);
  } else if (!started) {
    // menu : la caméra tourne lentement au-dessus de l'arène
    camera.position.set(Math.sin(now / 6000) * 24, 14, Math.cos(now / 6000) * 24);
    camera.lookAt(0, 2, 0);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
