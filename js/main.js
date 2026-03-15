/**
 * main.js — Core game logic for Dungeon
 * ───────────────────────────────────────
 * Depends on:
 *   • three.js        (global THREE)
 *   • scene-manager.js (global DungeonWorld)
 */

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const nameInput  = document.getElementById('name-input');
const enterBtn   = document.getElementById('enter-btn');
const loginScr   = document.getElementById('login-screen');
const gameScr    = document.getElementById('game-screen');
const statsScr   = document.getElementById('stats-screen');

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

// ─── INPUT ────────────────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault(); // stop page scroll on jump
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─── THREE.JS CORE ────────────────────────────────────────────────────────────
let renderer, scene, camera, playerGroup;
let animFrameId;

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

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6a5a40 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 12), bodyMat);
  body.position.y = 0.9;
  body.castShadow = true;
  playerGroup.add(body);                                    // index 0

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), bodyMat);
  head.position.y = 1.65;
  head.castShadow = true;
  playerGroup.add(head);                                    // index 1

  const cloakMat = new THREE.MeshLambertMaterial({ color: 0x3a2a18 });
  const cloak    = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.85, 10), cloakMat);
  cloak.position.y = 0.5;
  cloak.castShadow = true;
  playerGroup.add(cloak);                                   // index 2

  const legMat = new THREE.MeshLambertMaterial({ color: 0x4a3828 });
  [-0.12, 0.12].forEach(x => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8), legMat);
    leg.position.set(x, 0.25, 0);
    leg.castShadow = true;
    playerGroup.add(leg);                                   // index 3, 4
  });

  // Name label sprite
  const nameSprite = makeNameSprite(playerName);
  nameSprite.position.y = 2.2;
  playerGroup.add(nameSprite);                              // index 5

  scene.add(playerGroup);

  // ── HAND OFF TO SCENE MANAGER ──
  DungeonWorld.build(scene, playerGroup, playerName);

  window.addEventListener('resize', onResize);
}

function makeNameSprite(text) {
  const c   = document.createElement('canvas');
  c.width   = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font          = 'bold 26px "Crimson Pro", serif';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.shadowColor   = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur    = 8;
  ctx.fillStyle     = '#d4a86e';
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

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
let lastTime = 0;
let legAngle = 0;

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

    // Room wall clamp
    const B = ROOM_HALF - PLAYER_R - 0.05;
    nx = Math.max(-B, Math.min(B, nx));
    nz = Math.max(-B, Math.min(B, nz));

    const moved = Math.sqrt(
      (nx - playerGroup.position.x) ** 2 +
      (nz - playerGroup.position.z) ** 2
    );
    distanceTravelled += moved;
    if (moved > 0.015) steps++;

    playerGroup.position.x = nx;
    playerGroup.position.z = nz;
    playerGroup.rotation.y = Math.atan2(dx, dz) + Math.PI;

    // Leg animation
    legAngle += dt * 8;
    if (playerGroup.children[3]) playerGroup.children[3].rotation.x =  Math.sin(legAngle) * 0.45;
    if (playerGroup.children[4]) playerGroup.children[4].rotation.x = -Math.sin(legAngle) * 0.45;
  }

  // World update — handles jump, particles, flicker, drips, obstacle collision
  DungeonWorld.update(ts, dt, playerGroup, isMoving, keys);

  // Camera follows player, rises slightly during jump
  camera.position.x = playerGroup.position.x;
  camera.position.z = playerGroup.position.z + 9;
  camera.position.y = 10 + playerGroup.position.y * 0.3;
  camera.lookAt(playerGroup.position.x, playerGroup.position.y + 0.5, playerGroup.position.z);

  renderer.render(scene, camera);
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  startTime = Date.now();
  const el  = document.getElementById('timer-display');
  timerInterval = setInterval(() => {
    el.textContent = formatTime(Date.now() - startTime);
  }, 1000);
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

  // Fade controls hint after 6 s
  setTimeout(() => {
    document.getElementById('controls-hint').style.opacity = '0';
  }, 6000);

  document.getElementById('end-btn').addEventListener('click', endRun);
}

// ─── END ──────────────────────────────────────────────────────────────────────
function endRun() {
  cancelAnimationFrame(animFrameId);
  clearInterval(timerInterval);

  const elapsed = Date.now() - startTime;

  document.getElementById('s-name').textContent  = playerName;
  document.getElementById('s-time').textContent  = formatTime(elapsed);
  document.getElementById('s-steps').textContent = steps.toLocaleString();
  document.getElementById('s-dist').innerHTML    =
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
  steps             = 0;
  distanceTravelled = 0;

  statsScr.style.display = 'none';
  loginScr.style.display = 'flex';

  nameInput.value   = '';
  enterBtn.disabled = true;

  document.getElementById('timer-display').textContent    = '00:00';
  document.getElementById('controls-hint').style.opacity = '1';

  DungeonWorld.dispose();

  if (renderer) { renderer.dispose(); renderer = null; }
  window.removeEventListener('resize', onResize);
});
