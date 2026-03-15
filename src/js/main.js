/**
 * main.js — Core game logic for Dungeon
 * ───────────────────────────────────────
 * Controls:
 *   WASD / Arrows  — move
 *   Space          — jump
 *   F              — fire magic bolt in facing direction
 */

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const nameInput = document.getElementById('name-input');
const enterBtn  = document.getElementById('enter-btn');
const loginScr  = document.getElementById('login-screen');
const gameScr   = document.getElementById('game-screen');
const statsScr  = document.getElementById('stats-screen');

// ─── LOGIN ────────────────────────────────────────────────────────────────────
nameInput.addEventListener('input', () => {
  enterBtn.disabled = nameInput.value.trim().length < 2;
});
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !enterBtn.disabled) startGame();
});
enterBtn.addEventListener('click', startGame);

// ─── GAME STATE ───────────────────────────────────────────────────────────────
let playerName        = '';
let startTime, timerInterval;
let steps             = 0;
let distanceTravelled = 0;
let spellsFired       = 0;

// ─── INPUT ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyF' && scene) fireMagicBolt();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── THREE.JS CORE ────────────────────────────────────────────────────────────
let renderer, scene, camera, playerGroup;
let animFrameId;

// Magic bolt state
const _bolts          = [];
const BOLT_SPEED      = 14;
const BOLT_LIFETIME   = 2.2;
const BOLT_COOLDOWN   = 0.35;
let   _boltCooldown   = 0;
let   _castArm        = null;
let   _castArmAngle   = 0;
const _burstParticles = [];

const ROOM_HALF    = 10;
const PLAYER_SPEED = 5;
const PLAYER_R     = 0.35;

function buildScene() {
  const canvas = document.getElementById('three-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  scene  = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(52, canvas.offsetWidth / canvas.offsetHeight, 0.1, 60);
  camera.position.set(0, 10, 9);
  camera.lookAt(0, 0, 0);

  // ── PLAYER MESH ──
  playerGroup = new THREE.Group();
  playerGroup.position.set(0, 0, 0);

  // Robe (flowing cone)
  const robeMat = new THREE.MeshLambertMaterial({ color: 0x1a1060 });
  const robe    = new THREE.Mesh(new THREE.ConeGeometry(0.44, 1.05, 10), robeMat);
  robe.position.y = 0.52;
  robe.castShadow = true;
  playerGroup.add(robe);                    // 0

  // Torso
  const torsoMat = new THREE.MeshLambertMaterial({ color: 0x22186a });
  const torso    = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), torsoMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  playerGroup.add(torso);                   // 1

  // Head
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc8a880 });
  const head    = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), skinMat);
  head.position.y = 1.65;
  head.castShadow = true;
  playerGroup.add(head);                    // 2

  // Beard
  const beardMat = new THREE.MeshLambertMaterial({ color: 0xc8c0a0 });
  const beard    = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8), beardMat);
  beard.position.set(0, 1.46, 0.1);
  beard.rotation.x = 0.3;
  playerGroup.add(beard);                   // 3

  // Hat brim
  const hatMat  = new THREE.MeshLambertMaterial({ color: 0x0e0a40 });
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), hatMat);
  hatBrim.position.y = 1.88;
  hatBrim.castShadow = true;
  playerGroup.add(hatBrim);                 // 4

  // Hat cone
  const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, 12), hatMat);
  hatCone.position.y = 2.28;
  hatCone.castShadow = true;
  playerGroup.add(hatCone);                 // 5

  // Gold hat band
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xd4a820, emissive: 0x664400, emissiveIntensity: 0.4 });
  const band    = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.065, 16), bandMat);
  band.position.y = 1.95;
  playerGroup.add(band);                    // 6

  // Star on hat tip
  const starMat = new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 1.5 });
  const star    = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), starMat);
  star.position.y = 2.66;
  playerGroup.add(star);                    // 7

  // Right arm (lantern side)
  const armMat = new THREE.MeshLambertMaterial({ color: 0x22186a });
  const armR   = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), armMat);
  armR.position.set(0.35, 1.1, 0);
  armR.rotation.z = -0.45;
  armR.castShadow = true;
  playerGroup.add(armR);                    // 8

  // Left arm (casting side) — keep ref for swing animation
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), armMat);
  armL.position.set(-0.35, 1.1, 0);
  armL.rotation.z = 0.45;
  armL.castShadow = true;
  playerGroup.add(armL);                    // 9
  _castArm = armL;

  // Casting orb on left hand
  const orbMat = new THREE.MeshLambertMaterial({
    color: 0x2299ff, emissive: 0x0044cc, emissiveIntensity: 1.2,
    transparent: true, opacity: 0.85
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), orbMat);
  orb.position.set(-0.52, 0.95, 0);
  orb.name = 'castOrb';
  playerGroup.add(orb);                     // 10

  // Name label
  const nameSprite = makeNameSprite(playerName);
  nameSprite.position.y = 2.9;
  playerGroup.add(nameSprite);              // 11

  scene.add(playerGroup);

  DungeonWorld.build(scene, playerGroup, playerName);

  window.addEventListener('resize', onResize);
}

function makeNameSprite(text) {
  const c   = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 26px "Crimson Pro", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#b090ff';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s   = new THREE.Sprite(mat);
  s.scale.set(2.2, 0.55, 1);
  return s;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── MAGIC BOLT ───────────────────────────────────────────────────────────────
function fireMagicBolt() {
  if (_boltCooldown > 0 || !scene) return;
  _boltCooldown = BOLT_COOLDOWN;
  spellsFired++;

  // Facing direction — player.rotation.y is set as atan2(dx,dz)+PI
  // so the forward vector is simply -sin(ry) on X and -cos(ry) on Z
  const ry  = playerGroup.rotation.y;
  const dir = new THREE.Vector3(-Math.sin(ry), 0, -Math.cos(ry)).normalize();

  // Spawn at left-hand orb in world space
  const spawnLocal = new THREE.Vector3(-0.52, 0.95, 0);
  const spawnWorld = spawnLocal.clone()
    .applyQuaternion(playerGroup.quaternion)
    .add(new THREE.Vector3(
      playerGroup.position.x,
      playerGroup.position.y,
      playerGroup.position.z
    ));

  const boltMat = new THREE.MeshLambertMaterial({
    color: 0x2299ff, emissive: 0x0055ff, emissiveIntensity: 3.5,
    transparent: true, opacity: 0.95
  });
  const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), boltMat);
  bolt.position.copy(spawnWorld);

  // Spinning trail rings around bolt
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.45, wireframe: true
  });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 4, 10), trailMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 4, 10), trailMat);
  bolt.add(ring1);
  bolt.add(ring2);
  scene.add(bolt);

  const bLight = new THREE.PointLight(0x3399ff, 3.2, 7);
  bLight.position.copy(spawnWorld);
  scene.add(bLight);

  _bolts.push({ mesh: bolt, light: bLight, vel: dir.multiplyScalar(BOLT_SPEED), life: BOLT_LIFETIME, ring1, ring2 });

  // Arm kick
  _castArmAngle = 1.1;

  // Orb flash
  const orb = playerGroup.children[10];
  if (orb && orb.material) {
    orb.material.emissiveIntensity = 5;
    setTimeout(() => { if (orb.material) orb.material.emissiveIntensity = 1.2; }, 110);
  }
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
let lastTime = 0;
let legAngle = 0;
let starSpin = 0;

function gameLoop(ts) {
  animFrameId = requestAnimationFrame(gameLoop);
  const dt    = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime    = ts;

  // Horizontal movement
  let dx = 0, dz = 0;
  if (keys['KeyW'] || keys['ArrowUp'])    dz -= 1;
  if (keys['KeyS'] || keys['ArrowDown'])  dz += 1;
  if (keys['KeyA'] || keys['ArrowLeft'])  dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

  const isMoving = dx !== 0 || dz !== 0;

  if (isMoving) {
    const len = Math.sqrt(dx * dx + dz * dz);
    dx /= len; dz /= len;

    let nx = playerGroup.position.x + dx * PLAYER_SPEED * dt;
    let nz = playerGroup.position.z + dz * PLAYER_SPEED * dt;

    const B = ROOM_HALF - PLAYER_R - 0.05;
    nx = Math.max(-B, Math.min(B, nx));
    nz = Math.max(-B, Math.min(B, nz));

    const moved = Math.sqrt((nx - playerGroup.position.x) ** 2 + (nz - playerGroup.position.z) ** 2);
    distanceTravelled += moved;
    if (moved > 0.015) steps++;

    playerGroup.position.x = nx;
    playerGroup.position.z = nz;
    playerGroup.rotation.y = Math.atan2(dx, dz) + Math.PI;

    // Robe sway
    legAngle += dt * 7;
    if (playerGroup.children[0]) playerGroup.children[0].rotation.z = Math.sin(legAngle) * 0.06;
  }

  // Star spin on hat tip
  starSpin += dt * 1.5;
  if (playerGroup.children[7]) {
    playerGroup.children[7].rotation.y = starSpin;
    playerGroup.children[7].rotation.x = starSpin * 0.6;
  }

  // Cast arm return spring
  if (_castArmAngle > 0) {
    _castArmAngle = Math.max(0, _castArmAngle - dt * 6);
    if (_castArm) {
      _castArm.rotation.x  = -_castArmAngle;
      _castArm.rotation.z  = 0.45 - _castArmAngle * 0.3;
    }
  }

  // Bolt cooldown
  if (_boltCooldown > 0) _boltCooldown -= dt;

  // Update bolts
  for (let i = _bolts.length - 1; i >= 0; i--) {
    const b  = _bolts[i];
    b.life  -= dt;

    b.mesh.position.addScaledVector(b.vel, dt);
    b.light.position.copy(b.mesh.position);

    b.ring1.rotation.x += dt * 9;
    b.ring2.rotation.y += dt * 12;

    const alpha          = Math.min(1, b.life / 0.4);
    b.mesh.material.opacity = alpha;
    b.light.intensity    = 2.8 * alpha;

    const p = b.mesh.position;
    const W = ROOM_HALF - 0.2;
    const wallHit = p.x < -W || p.x > W || p.z < -W || p.z > W;
    const dead    = b.life <= 0 || p.y < 0;

    if (wallHit || dead) {
      if (wallHit) spawnBoltBurst(p.x, p.y, p.z);
      scene.remove(b.mesh);
      scene.remove(b.light);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      _bolts.splice(i, 1);
    }
  }

  // Burst particles
  for (let i = _burstParticles.length - 1; i >= 0; i--) {
    const p = _burstParticles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 8 * dt;
    p.mesh.material.opacity = Math.max(0, p.life * 2);
    p.mesh.scale.setScalar(Math.max(0.01, p.life * 3));
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      _burstParticles.splice(i, 1);
    }
  }

  // World (physics, flicker, drips, obstacles)
  DungeonWorld.update(ts, dt, playerGroup, isMoving, keys);

  // Camera
  camera.position.x = playerGroup.position.x;
  camera.position.z = playerGroup.position.z + 9;
  camera.position.y = 10 + playerGroup.position.y * 0.3;
  camera.lookAt(playerGroup.position.x, playerGroup.position.y + 0.5, playerGroup.position.z);

  renderer.render(scene, camera);
}

function spawnBoltBurst(x, y, z) {
  const colors = [0x2299ff, 0x88ccff, 0xffffff, 0x0044ff];
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.SphereGeometry(0.055, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true, opacity: 1
    });
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    const spd = 2 + Math.random() * 3;
    const ang = Math.random() * Math.PI * 2;
    const vel = new THREE.Vector3(Math.cos(ang) * spd, (Math.random() - 0.3) * spd, Math.sin(ang) * spd);
    scene.add(m);
    _burstParticles.push({ mesh: m, vel, life: 0.45 + Math.random() * 0.3 });
  }
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  startTime = Date.now();
  const el  = document.getElementById('timer-display');
  timerInterval = setInterval(() => { el.textContent = formatTime(Date.now() - startTime); }, 1000);
}

// ─── START ────────────────────────────────────────────────────────────────────
function startGame() {
  playerName = nameInput.value.trim() || 'Wanderer';
  loginScr.style.display = 'none';
  gameScr.style.display  = 'block';
  buildScene();
  startTimer();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
  setTimeout(() => { document.getElementById('controls-hint').style.opacity = '0'; }, 7000);
  document.getElementById('end-btn').addEventListener('click', endRun);
}

// ─── END ──────────────────────────────────────────────────────────────────────
function endRun() {
  cancelAnimationFrame(animFrameId);
  clearInterval(timerInterval);
  const elapsed = Date.now() - startTime;

  document.getElementById('s-name').textContent   = playerName;
  document.getElementById('s-time').textContent   = formatTime(elapsed);
  document.getElementById('s-steps').textContent  = steps.toLocaleString();
  document.getElementById('s-spells').textContent = spellsFired.toLocaleString();
  document.getElementById('s-dist').innerHTML     =
    `${(distanceTravelled * 0.5).toFixed(1)}<span class="stat-unit">m</span>`;

  const t = Math.floor(elapsed / 1000);
  let farewell = 'The dungeon remembers you.';
  if      (t < 10)  farewell = 'You barely set foot inside...';
  else if (t < 30)  farewell = 'A brief visit. The stones are not impressed.';
  else if (t < 120) farewell = 'The walls have memorised your footsteps.';
  else if (t < 300) farewell = 'Few wander this long and remain sane.';
  else              farewell = 'The dungeon has claimed a part of you.';
  document.getElementById('s-farewell').textContent = farewell;

  gameScr.style.display  = 'none';
  statsScr.style.display = 'flex';
}

// ─── PLAY AGAIN ───────────────────────────────────────────────────────────────
document.getElementById('play-again-btn').addEventListener('click', () => {
  steps = 0; distanceTravelled = 0; spellsFired = 0;
  _bolts.length = 0; _burstParticles.length = 0;
  _boltCooldown = 0; _castArmAngle = 0;

  statsScr.style.display = 'none';
  loginScr.style.display = 'flex';
  nameInput.value = ''; enterBtn.disabled = true;
  document.getElementById('timer-display').textContent    = '00:00';
  document.getElementById('controls-hint').style.opacity = '1';

  DungeonWorld.dispose();
  if (renderer) { renderer.dispose(); renderer = null; }
  window.removeEventListener('resize', onResize);
});
