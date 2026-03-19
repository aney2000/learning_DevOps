/**
 * main.js — Core game logic for Dungeon with Multi-Level Enemy System
 * ───────────────────────────────────────────────────────────────────
 * Controls:
 *   WASD / Arrows  — move
 *   Space          — jump
 *   F              — fire magic bolt in facing direction
 *
 * Level Types:
 *   1. Object Collection — Move object to red button
 *   2. Monster Slayer — Defeat N enemies
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
let currentLevel      = 0;
let levelsCompleted   = 0;
let enemiesKilledTotal= 0;

// ─── LEVEL CONFIGURATION ──────────────────────────────────────────────────────
const LEVEL_CONFIG = {
  collection: {
    name: 'Object Collection',
    description: 'Push the object to the red button',
    duration: 120, // seconds
  },
  slayer: {
    name: 'Monster Slayer',
    description: 'Defeat all enemies',
    duration: 180, // seconds
  }
};

// ─── PROGRESSION SYSTEM ───────────────────────────────────────────────────────
const PROGRESSION = {
  levelSettings: [
    // Level 1: Easy - 2 enemies to kill
    { type: 'slayer', enemiesToKill: 2, roomSize: 10, enemyDifficulty: 'easy' },
    // Level 2: Easy-Medium - 3 enemies
    { type: 'slayer', enemiesToKill: 3, roomSize: 11, enemyDifficulty: 'easy' },
    // Level 3: Medium - 4 enemies
    { type: 'slayer', enemiesToKill: 4, roomSize: 12, enemyDifficulty: 'medium' },
    // Level 4: Medium - 5 enemies
    { type: 'slayer', enemiesToKill: 5, roomSize: 13, enemyDifficulty: 'medium' },
    // Level 5: Hard - 6 enemies
    { type: 'slayer', enemiesToKill: 6, roomSize: 14, enemyDifficulty: 'hard' },
    // Level 6: Hard - 7 enemies
    { type: 'slayer', enemiesToKill: 7, roomSize: 15, enemyDifficulty: 'hard' },
  ]
};

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
let lastTime = 0;

// Magic bolt state
const _bolts          = [];
const BOLT_SPEED      = 14;
const BOLT_LIFETIME   = 2.2;
const BOLT_COOLDOWN   = 0; // INFINITE BOLTS - NO COOLDOWN
let   _boltCooldown   = 0;
let   _castArm        = null;
let   _castArmAngle   = 0;
const _burstParticles = [];

const ROOM_HALF    = 10;
const PLAYER_SPEED = 5;
const PLAYER_R     = 0.35;

// Level-specific state
let _levelState = {
  type: null,
  enemiesToKill: 0,
  enemiesKilled: 0,
  enemies: [],
  levelStartTime: 0,
  levelComplete: false,
  doorMesh: null,
};

let _playerDirection = 0; // Current facing direction

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
  playerGroup.add(robe);

  // Torso
  const torsoMat = new THREE.MeshLambertMaterial({ color: 0x22186a });
  const torso    = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), torsoMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  playerGroup.add(torso);

  // Head
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc8a880 });
  const head    = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), skinMat);
  head.position.y = 1.65;
  head.castShadow = true;
  playerGroup.add(head);

  // Beard
  const beardMat = new THREE.MeshLambertMaterial({ color: 0xc8c0a0 });
  const beard    = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 8), beardMat);
  beard.position.set(0, 1.46, 0.1);
  beard.rotation.x = 0.3;
  playerGroup.add(beard);

  // Hat brim
  const hatMat  = new THREE.MeshLambertMaterial({ color: 0x0e0a40 });
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16), hatMat);
  hatBrim.position.y = 1.88;
  hatBrim.castShadow = true;
  playerGroup.add(hatBrim);

  // Hat cone
  const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.72, 12), hatMat);
  hatCone.position.y = 2.28;
  hatCone.castShadow = true;
  playerGroup.add(hatCone);

  // Gold hat band
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xd4a820, emissive: 0x664400, emissiveIntensity: 0.4 });
  const band    = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.065, 16), bandMat);
  band.position.y = 1.95;
  playerGroup.add(band);

  // Star on hat tip
  const starMat = new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 1.5 });
  const star    = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), starMat);
  star.position.y = 2.66;
  playerGroup.add(star);

  // Right arm (lantern side)
  const armMat = new THREE.MeshLambertMaterial({ color: 0x22186a });
  const armR   = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), armMat);
  armR.position.set(0.35, 1.1, 0);
  armR.rotation.z = -0.45;
  armR.castShadow = true;
  playerGroup.add(armR);

  // Left arm (casting side) — keep ref for swing animation
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), armMat);
  armL.position.set(-0.35, 1.1, 0);
  armL.rotation.z = 0.45;
  armL.castShadow = true;
  playerGroup.add(armL);
  _castArm = armL;

  // Casting orb on left hand
  const orbMat = new THREE.MeshLambertMaterial({
    color: 0x2299ff, emissive: 0x0044cc, emissiveIntensity: 1.2,
    transparent: true, opacity: 0.85
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), orbMat);
  orb.position.set(-0.52, 0.95, 0);
  orb.name = 'castOrb';
  playerGroup.add(orb);

  // Name label
  const nameSprite = makeNameSprite(playerName);
  nameSprite.position.y = 2.9;
  playerGroup.add(nameSprite);

  scene.add(playerGroup);

  DungeonWorld.build(scene, playerGroup, playerName);
  
  // Generate first level
  generateLevel();

  window.addEventListener('resize', onResize);
}

function generateLevel() {
  // Get level settings based on progression
  const levelIndex = levelsCompleted % PROGRESSION.levelSettings.length;
  const settings = PROGRESSION.levelSettings[levelIndex];
  
  currentLevel = levelsCompleted + 1;
  
  console.log("=== LEVEL", currentLevel, "STARTED ===");
  console.log("Enemy target:", settings.enemiesToKill);
  console.log("Difficulty:", settings.enemyDifficulty);
  
  // Reset level state
  _levelState = {
    type: settings.type,
    enemiesToKill: settings.enemiesToKill,
    enemiesKilled: 0,
    enemies: [],
    levelStartTime: Date.now(),
    levelComplete: false,
    doorMesh: null,
  };

  // Update UI
  document.getElementById('level-phase').textContent = `Level ${currentLevel}`;
  document.getElementById('level-type').textContent = `${_levelState.enemiesToKill} Enemies`;
  document.getElementById('topbar-title').textContent = `Dungeon · Level ${currentLevel}`;
  
  // Spawn enemies
  spawnEnemies(settings.enemiesToKill, settings.enemyDifficulty);
  
  updateEnemyCounter();
}

function spawnEnemies(count, difficulty) {
  const enemies = [];
  
  for (let i = 0; i < count; i++) {
    // Random position in room, avoiding player start position
    let x, z, dist;
    do {
      x = (Math.random() - 0.5) * 16;
      z = (Math.random() - 0.5) * 16;
      dist = Math.sqrt(x * x + z * z);
    } while (dist < 3); // Minimum distance from center
    
    const enemy = createEnemy(x, 0.5, z, difficulty);
    enemies.push(enemy);
    scene.add(enemy.mesh);
  }
  
  _levelState.enemies = enemies;
  console.log("🎮 Spawned", count, "enemies. Total enemies:", _levelState.enemies.length);
}

function createEnemy(x, y, z, difficulty) {
  const enemy = {
    mesh: new THREE.Group(),
    position: new THREE.Vector3(x, y, z),
    health: difficulty === 'easy' ? 1 : (difficulty === 'medium' ? 2 : 3),
    maxHealth: difficulty === 'easy' ? 1 : (difficulty === 'medium' ? 2 : 3),
    difficulty: difficulty,
    speed: difficulty === 'easy' ? 2 : (difficulty === 'medium' ? 2.5 : 3),
    damage: difficulty === 'easy' ? 1 : (difficulty === 'medium' ? 1.5 : 2),
    attackCooldown: 0,
    attackRange: 1.5,
    aggroRange: 8,
    velocity: new THREE.Vector3(0, 0, 0),
    lastAttackTime: 0,
  };

  // Enemy body - a dark red cube
  const color = difficulty === 'easy' ? 0x8B0000 : (difficulty === 'medium' ? 0xCC0000 : 0xFF0000);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), bodyMat);
  body.position.y = 0.35;
  body.castShadow = true;
  body.receiveShadow = true;
  enemy.mesh.add(body);
  enemy.bodyMesh = body;

  // Enemy eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
  eyeL.position.set(-0.1, 0.65, 0.3);
  enemy.mesh.add(eyeL);
  
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
  eyeR.position.set(0.1, 0.65, 0.3);
  enemy.mesh.add(eyeR);

  // Health bar above enemy
  const healthBarGeo = new THREE.PlaneGeometry(0.6, 0.1);
  const healthBarMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const healthBar = new THREE.Mesh(healthBarGeo, healthBarMat);
  healthBar.position.set(0, 1.2, 0);
  healthBar.receiveShadow = false;
  enemy.mesh.add(healthBar);
  enemy.healthBar = healthBar;

  enemy.mesh.position.copy(enemy.position);

  return enemy;
}

function updateEnemies(dt, playerPos) {
  for (let i = _levelState.enemies.length - 1; i >= 0; i--) {
    const enemy = _levelState.enemies[i];

    // Simple AI: Move towards player if in range
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPos, enemy.position);
    const distToPlayer = toPlayer.length();

    // Update health bar
    const healthPercent = enemy.health / enemy.maxHealth;
    const healthBarScale = Math.max(0, healthPercent);
    enemy.healthBar.scale.x = healthBarScale;
    const healthColor = healthPercent > 0.5 ? 0x00ff00 : (healthPercent > 0.25 ? 0xffff00 : 0xff0000);
    enemy.healthBar.material.color.setHex(healthColor);

    if (distToPlayer < enemy.aggroRange) {
      // Chase player
      if (distToPlayer > enemy.attackRange) {
        toPlayer.normalize();
        enemy.position.addScaledVector(toPlayer, enemy.speed * dt);
      } else {
        // Attack player if in range (we'll keep this simple for now)
        // Just face the player
      }
    } else {
      // Wander randomly
      if (!enemy.wanderTarget || enemy.wanderTimer <= 0) {
        enemy.wanderTarget = new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          0,
          (Math.random() - 0.5) * 14
        );
        enemy.wanderTimer = 3 + Math.random() * 3;
      }
      enemy.wanderTimer -= dt;
      
      const toWander = new THREE.Vector3()
        .subVectors(enemy.wanderTarget, enemy.position);
      
      if (toWander.length() > 0.5) {
        toWander.normalize();
        enemy.position.addScaledVector(toWander, enemy.speed * 0.5 * dt);
      }
    }

    // Keep in bounds
    const bound = 9;
    enemy.position.x = Math.max(-bound, Math.min(bound, enemy.position.x));
    enemy.position.z = Math.max(-bound, Math.min(bound, enemy.position.z));

    // Update mesh position
    enemy.mesh.position.copy(enemy.position);
  }
}

function damageEnemy(enemyIndex, damage) {
  // This is now handled by killEnemy() in checkBoltCollisions
  killEnemy(enemyIndex);
}

function updateEnemyCounter() {
  document.getElementById('level-type').textContent = 
    `${_levelState.enemiesToKill - _levelState.enemiesKilled} / ${_levelState.enemiesToKill}`;
}

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '32px Crimson Pro';
  ctx.fillStyle = '#c8a96e';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 40);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const geo = new THREE.PlaneGeometry(1.2, 0.3);
  const m   = new THREE.Mesh(geo, mat);
  m.renderOrder = 100;
  return m;
}

// ─── COLLISION & MAGIC ─────────────────────────────────────────────────────────

function fireMagicBolt() {
  if (_boltCooldown > 0 || !playerGroup) return;
  _boltCooldown = BOLT_COOLDOWN;
  spellsFired++;

  const armPos = _castArm.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(0, 0, -1);
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), _castArmAngle);

  console.log("🔮 BOLT FIRED! Total bolts:", spellsFired, "Bolt position:", armPos.x.toFixed(1), armPos.y.toFixed(1), armPos.z.toFixed(1));

  // ── BOLT MESH ──
  const boltMat  = new THREE.MeshBasicMaterial({ color: 0x2299ff });
  const boltGeo  = new THREE.SphereGeometry(0.08, 6, 6);
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  boltMesh.position.copy(armPos);
  boltMesh.castShadow = true;
  scene.add(boltMesh);

  // Rings around bolt
  const ringGeo = new THREE.BufferGeometry();
  const ringVerts = [];
  const ringIdx = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ringVerts.push(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
  }
  for (let i = 0; i < n; i++) {
    ringIdx.push(i, (i + 1) % n);
  }
  ringGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ringVerts), 3));
  ringGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(ringIdx), 1));
  const ringMat = new THREE.LineBasicMaterial({ color: 0x88ccff, linewidth: 1 });
  const ring1 = new THREE.LineSegments(ringGeo.clone(), ringMat);
  ring1.position.copy(boltMesh.position);
  ring1.rotation.y = 0;
  scene.add(ring1);

  const ring2 = new THREE.LineSegments(ringGeo.clone(), ringMat);
  ring2.position.copy(boltMesh.position);
  ring2.rotation.x = Math.PI / 2;
  scene.add(ring2);

  const bolt = {
    mesh: boltMesh, ring1, ring2, dir, vel: dir.clone().multiplyScalar(BOLT_SPEED),
    life: BOLT_LIFETIME, position: boltMesh.position.clone(), speed: BOLT_SPEED, light: null
  };

  // Light
  const light = new THREE.PointLight(0x2299ff, 2, 25);
  light.position.copy(boltMesh.position);
  scene.add(light);
  bolt.light = light;

  _bolts.push(bolt);
}
function checkBoltCollisions() {
  for (let i = _bolts.length - 1; i >= 0; i--) {
    const bolt = _bolts[i];
    
    for (let j = _levelState.enemies.length - 1; j >= 0; j--) {
      const enemy = _levelState.enemies[j];
      
      const dist = bolt.position.distanceTo(enemy.position);
      
      if (dist < 1.2) { // Slightly larger hitbox for better feel
        // Reduce health instead of instant kill
        enemy.health -= 1; 
        
        spawnBoltBurst(bolt.position.x, bolt.position.y, bolt.position.z);
        removeBolt(i); 
        
        if (enemy.health <= 0) {
          killEnemy(j);
        }
        break; // Stop checking this bolt, it's gone
      }
    }
  }
}
function killEnemy(enemyIndex) {
  const enemy = _levelState.enemies[enemyIndex];
  if (!enemy) return;

  // 1. Remove the mesh from the 3D scene
  scene.remove(enemy.mesh);
  
  // 2. Clean up memory (geometries/materials)
  enemy.mesh.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) node.material.dispose();
  });

  // 3. Remove from the logical tracking array
  _levelState.enemies.splice(enemyIndex, 1);
  
  _levelState.enemiesKilled++;
  enemiesKilledTotal++;
  
  updateEnemyCounter();
  
  if (_levelState.enemiesKilled >= _levelState.enemiesToKill) {
    spawnLevelDoor();
  }
}
function removeBolt(boltIndex) {
  if (boltIndex < 0 || boltIndex >= _bolts.length) return;
  
  const bolt = _bolts[boltIndex];
  
  // Remove from scene
  if (bolt.mesh) scene.remove(bolt.mesh);
  if (bolt.ring1) scene.remove(bolt.ring1);
  if (bolt.ring2) scene.remove(bolt.ring2);
  if (bolt.light) scene.remove(bolt.light);
  
  // Remove from array
  _bolts.splice(boltIndex, 1);
  console.log("💨 Bolt removed");
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────

function gameLoop(ts) {
  animFrameId = requestAnimationFrame(gameLoop);
  if (lastTime === 0) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (!scene || !playerGroup) return;

  // Input & movement
  const input = new THREE.Vector3(0, 0, 0);
  if (keys['KeyW'] || keys['ArrowUp']) input.z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) input.z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) input.x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) input.x += 1;
  
  if (input.length() > 0) {
    input.normalize();
    
    // Update player rotation to face movement direction
    _playerDirection = Math.atan2(input.x, input.z);
    playerGroup.rotation.y = _playerDirection;
    
    // Cast arm angle follows player direction
    _castArmAngle = _playerDirection;
    
    const movement = input.multiplyScalar(PLAYER_SPEED * dt);
    playerGroup.position.add(movement);
    
    // Boundary
    const bound = 9.5;
    playerGroup.position.x = Math.max(-bound, Math.min(bound, playerGroup.position.x));
    playerGroup.position.z = Math.max(-bound, Math.min(bound, playerGroup.position.z));
    
    steps++;
    distanceTravelled += movement.length();
  }

  const isMoving = input.length() > 0;
  DungeonWorld.update(ts, dt, playerGroup, isMoving, keys);

  // Update bolts
  for (let i = 0; i < _bolts.length; i++) {
    const b = _bolts[i];
    b.life -= dt;
    b.position.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.position);
    b.ring1.position.copy(b.position);
    b.ring2.position.copy(b.position);
    if (b.light) b.light.position.copy(b.position);
  }

  checkBoltCollisions();

  // Remove expired bolts
  for (let i = _bolts.length - 1; i >= 0; i--) {
    const b = _bolts[i];
    if (b.life <= 0) {
      scene.remove(b.mesh);
      scene.remove(b.ring1);
      scene.remove(b.ring2);
      scene.remove(b.light);
      if (b.mesh.geometry) b.mesh.geometry.dispose();
      if (b.mesh.material) b.mesh.material.dispose();
      if (b.ring1.geometry) b.ring1.geometry.dispose();
      if (b.ring1.material) b.ring1.material.dispose();
      if (b.ring2.geometry) b.ring2.geometry.dispose();
      if (b.ring2.material) b.ring2.material.dispose();
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

  // Update enemies
  if (_levelState.type === 'slayer') {
    updateEnemies(dt, playerGroup.position);
    checkDoorCollision(playerGroup.position);
  }

  // Camera
  camera.position.x = playerGroup.position.x;
  camera.position.z = playerGroup.position.z + 9;
  camera.position.y = 10 + playerGroup.position.y * 0.3;
  camera.lookAt(playerGroup.position.x, playerGroup.position.y + 0.5, playerGroup.position.z);

  renderer.render(scene, camera);
}

function spawnLevelDoor() {
  if (_levelState.doorMesh) return; // Already spawned

  // Create door frame
  const doorGroup = new THREE.Group();
  
  // Door frame border
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  
  // Vertical left
  const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), frameMat);
  leftFrame.position.set(-0.6, 1.25, 0);
  doorGroup.add(leftFrame);
  
  // Vertical right
  const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), frameMat);
  rightFrame.position.set(0.6, 1.25, 0);
  doorGroup.add(rightFrame);
  
  // Horizontal top
  const topFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.2), frameMat);
  topFrame.position.set(0, 2.45, 0);
  doorGroup.add(topFrame);
  
  // Door itself - glowing portal
  const doorMat = new THREE.MeshLambertMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85
  });
  const doorPortal = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.1), doorMat);
  doorPortal.position.z = 0.05;
  doorGroup.add(doorPortal);
  
  // Glowing light
  const doorLight = new THREE.PointLight(0x00ff00, 3, 15);
  doorLight.position.set(0, 1.2, 1);
  doorGroup.add(doorLight);
  
  // Position door at far end of room
  doorGroup.position.set(0, 0, -8);
  doorGroup.castShadow = true;
  
  scene.add(doorGroup);
  _levelState.doorMesh = doorGroup;
  
  // Add floating animation
  let floatTime = 0;
  const floatInterval = setInterval(() => {
    if (!_levelState.doorMesh) {
      clearInterval(floatInterval);
      return;
    }
    floatTime += 0.016;
    doorGroup.position.y = Math.sin(floatTime * 2) * 0.3;
  }, 16);
}

function checkDoorCollision(playerPos) {
  if (!_levelState.doorMesh) return;
  
  const doorPos = _levelState.doorMesh.position;
  const dist = Math.sqrt(
    Math.pow(playerPos.x - doorPos.x, 2) + 
    Math.pow(playerPos.z - doorPos.z, 2)
  );
  
  // If player gets close to door, advance to next level
  if (dist < 1.5) {
    completeLevel();
  }
}

function completeLevel() {
  if (_levelState.levelComplete) return;
  
  _levelState.levelComplete = true;
  levelsCompleted++;

  // Flash screen with golden glow
  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.top = '0';
  flash.style.left = '0';
  flash.style.width = '100%';
  flash.style.height = '100%';
  flash.style.background = 'rgba(255, 200, 50, 0.5)';
  flash.style.pointerEvents = 'none';
  flash.style.zIndex = '10';
  document.body.appendChild(flash);

  // Show level complete message
  const message = document.createElement('div');
  message.style.position = 'fixed';
  message.style.top = '50%';
  message.style.left = '50%';
  message.style.transform = 'translate(-50%, -50%)';
  message.style.fontSize = '3rem';
  message.style.color = '#ffcc00';
  message.style.textShadow = '0 0 20px rgba(255, 200, 50, 1)';
  message.style.zIndex = '11';
  message.style.fontFamily = "'Crimson Pro', serif";
  message.style.fontWeight = 'bold';
  message.style.pointerEvents = 'none';
  
  message.textContent = 'LEVEL COMPLETE!';
  
  document.body.appendChild(message);

  // Remove all enemies
  _levelState.enemies.forEach(enemy => {
    if (enemy && enemy.mesh) {
      scene.remove(enemy.mesh);
    }
  });
  
  // Remove door
  if (_levelState.doorMesh) {
    scene.remove(_levelState.doorMesh);
    _levelState.doorMesh = null;
  }

  setTimeout(() => {
    flash.remove();
    message.remove();
    // Start next level
    generateLevel();
  }, 1200);
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

// ─── RESIZE HANDLER ───────────────────────────────────────────────────────────
function onResize() {
  const canvas = document.getElementById('three-canvas');
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ─── START ────────────────────────────────────────────────────────────────────
function startGame() {
  playerName = nameInput.value.trim() || 'Wanderer';
  loginScr.style.display = 'none';
  gameScr.style.display  = 'block';
  buildScene();
  startTimer();
  lastTime = 0;
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
  document.getElementById('s-levels').textContent = levelsCompleted.toLocaleString();

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
  steps = 0; 
  distanceTravelled = 0; 
  spellsFired = 0; 
  levelsCompleted = 0; 
  currentLevel = 0;
  enemiesKilledTotal = 0;
  _bolts.length = 0; 
  _burstParticles.length = 0;
  _boltCooldown = 0; 
  _castArmAngle = 0;
  
  _levelState = {
    type: null,
    enemiesToKill: 0,
    enemiesKilled: 0,
    enemies: [],
    levelStartTime: 0,
    levelComplete: false,
    doorMesh: null,
  };

  statsScr.style.display = 'none';
  loginScr.style.display = 'flex';
  nameInput.value = ''; 
  enterBtn.disabled = true;
  document.getElementById('timer-display').textContent    = '00:00';
  document.getElementById('controls-hint').style.opacity = '1';

  DungeonWorld.dispose();
  if (renderer) { renderer.dispose(); renderer = null; }
  window.removeEventListener('resize', onResize);
});
