/**
 * dungeon-world.js  — Drop-in world module for Dungeon game
 * ─────────────────────────────────────────────────────────
 * HOW TO USE:
 *   1. Include this script AFTER three.js and BEFORE your main game script:
 *        <script src="dungeon-world.js"></script>
 *   2. Replace your buildScene() call with:
 *        DungeonWorld.build(scene, playerGroup, playerName);
 *   3. In your gameLoop, add:
 *        DungeonWorld.update(ts, dt, playerGroup, isMoving, keys);
 *   4. In your endRun / cleanup:
 *        DungeonWorld.dispose();
 *
 * Adds:
 *   • Held lantern with warm flickering light on the player
 *   • Realistic stone dungeon (layered tile floor, rough walls, ceiling beams)
 *   • Wall sconces (iron brackets + flame glow)
 *   • Jumpable obstacles: barrels, crates, stone blocks — with AABB collision
 *   • Jump mechanic (Space / ArrowUp double-tap disabled while mid-air)
 *   • Dust particle system
 *   • Hanging chains
 *   • Cobweb meshes in corners
 *   • Drip particles near ceiling cracks
 */

const DungeonWorld = (() => {

  /* ── CONSTANTS ─────────────────────────────────────────────────────────── */
  const ROOM_HALF   = 10;     // room extends from -10 to +10
  const WALL_H      = 4.5;
  const PLAYER_SPEED = 5;
  const PLAYER_R    = 0.35;
  const GRAVITY     = -18;
  const JUMP_V      = 7.5;
  const OBSTACLE_MARGIN = 0.55;

  /* ── STATE ──────────────────────────────────────────────────────────────── */
  let _scene, _player;
  let _lantern, _lanternLight, _lanternAmbient;
  let _obstacles   = [];   // { mesh, hw, hh, hd }  half-extents + world pos
  let _particles   = [];
  let _dripParticles = [];
  let _sconceLights = [];
  let _velY        = 0;
  let _onGround    = true;
  let _jumpPressed = false;
  let _dustClock   = 0;
  let _disposed    = false;

  /* ── MATERIALS (reused) ─────────────────────────────────────────────────── */
  const M = {
    stone     : () => new THREE.MeshLambertMaterial({ color: 0x2a2520 }),
    stoneDark : () => new THREE.MeshLambertMaterial({ color: 0x1c1916 }),
    stoneMoss : () => new THREE.MeshLambertMaterial({ color: 0x232d1a }),
    brick     : () => new THREE.MeshLambertMaterial({ color: 0x2e221a }),
    wood      : () => new THREE.MeshLambertMaterial({ color: 0x3a2a18 }),
    ironDark  : () => new THREE.MeshLambertMaterial({ color: 0x1a1a18 }),
    rust      : () => new THREE.MeshLambertMaterial({ color: 0x4a2810 }),
    lanternGlass: () => new THREE.MeshLambertMaterial({
      color: 0xffcc66, emissive: 0xdd8800, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.7
    }),
    lanternFrame: () => new THREE.MeshLambertMaterial({ color: 0x222018, emissive: 0x110e00, emissiveIntensity: 0.3 }),
    cobweb    : () => new THREE.MeshBasicMaterial({ color: 0x888880, wireframe: true, transparent: true, opacity: 0.25 }),
    chainLink : () => new THREE.MeshLambertMaterial({ color: 0x303028 }),
  };

  /* ── FLOOR TILES ────────────────────────────────────────────────────────── */
  function buildFloor() {
    const tileSize = 1.25;
    const count    = Math.ceil(ROOM_HALF * 2 / tileSize);
    const offset   = -ROOM_HALF + tileSize / 2;

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const variant = (row * 7 + col * 13) % 6;
        const col3 = [0x1e1b17, 0x232019, 0x1a1814, 0x28231c, 0x1c1a15, 0x211e18][variant];
        const mat  = new THREE.MeshLambertMaterial({ color: col3 });

        // Slight random height variation for uneven floor feel
        const yOff = (Math.random() - 0.5) * 0.015;
        const geo  = new THREE.BoxGeometry(tileSize - 0.04, 0.08 + yOff, tileSize - 0.04);
        const tile = new THREE.Mesh(geo, mat);
        tile.position.set(offset + col * tileSize, yOff * 0.5, offset + row * tileSize);
        tile.receiveShadow = true;
        _scene.add(tile);
      }
    }

    // Moss patches (flat quads scattered on floor)
    for (let i = 0; i < 18; i++) {
      const s  = 0.4 + Math.random() * 0.9;
      const mx = (Math.random() - 0.5) * (ROOM_HALF * 2 - 1);
      const mz = (Math.random() - 0.5) * (ROOM_HALF * 2 - 1);
      const geo = new THREE.PlaneGeometry(s, s * (0.6 + Math.random() * 0.8));
      const mat = M.stoneMoss();
      const m   = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * Math.PI;
      m.position.set(mx, 0.05, mz);
      _scene.add(m);
    }
  }

  /* ── WALLS ──────────────────────────────────────────────────────────────── */
  function buildWalls() {
    const brickW = 1.2, brickH = 0.45;
    const rowsNeeded = Math.ceil(WALL_H / brickH);
    const colsNeeded = Math.ceil(ROOM_HALF * 2 / brickW);

    const wallDefs = [
      { axis: 'z', side: -1 },  // north (REMOVED - open front for exit)
      // { axis: 'z', side:  1 },  // south
      { axis: 'x', side: -1 },  // west
      { axis: 'x', side:  1 },  // east
    ];

    wallDefs.forEach(({ axis, side }) => {
      for (let row = 0; row < rowsNeeded; row++) {
        const offset = (row % 2 === 0) ? 0 : brickW * 0.5;
        for (let col = 0; col < colsNeeded + 1; col++) {
          const bx = col * brickW - ROOM_HALF + offset - brickW * 0.5;
          if (Math.abs(bx) > ROOM_HALF + brickW) continue;

          const variant = (row * 3 + col * 5) % 4;
          const bCol = [0x2a2218, 0x241e16, 0x2e261c, 0x201c14][variant];
          const mat  = new THREE.MeshLambertMaterial({ color: bCol });
          const geo  = new THREE.BoxGeometry(brickW - 0.03, brickH - 0.02, 0.22);
          const brick = new THREE.Mesh(geo, mat);

          brick.receiveShadow = true;
          brick.castShadow    = true;

          const y = row * brickH + brickH / 2;

          if (axis === 'z') {
            brick.position.set(bx, y, side * ROOM_HALF);
          } else {
            brick.rotation.y = Math.PI / 2;
            brick.position.set(side * ROOM_HALF, y, bx);
          }
          _scene.add(brick);
        }
      }
    });
  }

  /* ── CORNER PILLARS ─────────────────────────────────────────────────────── */
  function buildPillars() {
    const pillarMat = M.stone();
    const cornerOffsets = [
      [-ROOM_HALF, -ROOM_HALF], [ROOM_HALF, -ROOM_HALF],
      [-ROOM_HALF,  ROOM_HALF], [ROOM_HALF,  ROOM_HALF],
    ];
    const midOffsets = [
      [0, -ROOM_HALF], [0, ROOM_HALF],
      [-ROOM_HALF, 0], [ROOM_HALF, 0],
    ];

    [...cornerOffsets, ...midOffsets].forEach(([x, z]) => {
      const geo  = new THREE.BoxGeometry(0.7, WALL_H, 0.7);
      const p    = new THREE.Mesh(geo, pillarMat);
      p.position.set(x, WALL_H / 2, z);
      p.castShadow = true;
      _scene.add(p);

      // Capital (decorative top block)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.9), M.stoneDark());
      cap.position.set(x, WALL_H - 0.1, z);
      _scene.add(cap);

      // Base block
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.9), M.stoneDark());
      base.position.set(x, 0.075, z);
      _scene.add(base);
    });
  }

  /* ── WALL SCONCES ───────────────────────────────────────────────────────── */
  function buildSconces() {
    const sconcePositions = [
      { pos: [0, 2.5, -(ROOM_HALF - 0.15)],  ry: 0 },
      { pos: [0, 2.5,  (ROOM_HALF - 0.15)],  ry: Math.PI },
      { pos: [-(ROOM_HALF - 0.15), 2.5, 0],  ry: Math.PI / 2 },
      { pos: [ (ROOM_HALF - 0.15), 2.5, 0],  ry: -Math.PI / 2 },
      { pos: [-5, 2.5, -(ROOM_HALF - 0.15)], ry: 0 },
      { pos: [ 5, 2.5, -(ROOM_HALF - 0.15)], ry: 0 },
      { pos: [-5, 2.5,  (ROOM_HALF - 0.15)], ry: Math.PI },
      { pos: [ 5, 2.5,  (ROOM_HALF - 0.15)], ry: Math.PI },
    ];

    sconcePositions.forEach(({ pos, ry }) => {
      const group = new THREE.Group();
      group.position.set(...pos);
      group.rotation.y = ry;

      // Iron bracket arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.3), M.ironDark());
      arm.position.set(0, 0, 0.15);
      group.add(arm);

      // Bowl
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.12, 8), M.rust());
      bowl.position.set(0, 0, 0.3);
      group.add(bowl);

      // Flame glow mesh (emissive)
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 2.5 })
      );
      flame.position.set(0, 0.1, 0.3);
      group.add(flame);

      _scene.add(group);

      // Point light per sconce
      const light = new THREE.PointLight(0xff9933, 0.9, 7);
      light.position.set(...pos).add ? null : null;
      light.position.set(pos[0], pos[1] + 0.1, pos[2]);
      _scene.add(light);
      _sconceLights.push({ light, baseIntensity: 0.9, phase: Math.random() * Math.PI * 2 });
    });
  }
  /* ── OBSTACLES ──────────────────────────────────────────────────────────── */
  function buildObstacles() {
    const defs = [
      // Wooden barrels
      { type: 'barrel', x:  3.5, z: -3,   scale: 1    },
      { type: 'barrel', x:  3.9, z: -2.3, scale: 0.85 },
      { type: 'barrel', x: -4,   z:  5,   scale: 1    },
      { type: 'barrel', x: -4.5, z:  4.3, scale: 0.9  },
      // Crates
      { type: 'crate',  x:  6,   z:  2,   scale: 1    },
      { type: 'crate',  x:  6.6, z:  2.6, scale: 0.8  },
      { type: 'crate',  x: -6,   z: -4,   scale: 1    },
      // Stone blocks
      { type: 'stone',  x: -1,   z:  7,   scale: 1    },
      { type: 'stone',  x:  1.2, z:  7.3, scale: 1.2  },
      { type: 'stone',  x:  0,   z: -7,   scale: 0.9  },
      // Sarcophagus-like big block
      { type: 'sarcoph', x: -7,  z: -7,   scale: 1    },
      { type: 'sarcoph', x:  7,  z:  7,   scale: 1    },
    ];

    defs.forEach(def => {
      let mesh, hw, hh, hd;
      switch (def.type) {
        case 'barrel': {
          const g = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38 * def.scale, 0.34 * def.scale, 0.75 * def.scale, 12),
            M.wood()
          );
          body.castShadow = body.receiveShadow = true;
          g.add(body);
          // Hoop rings
          [0.1, -0.1, 0.27, -0.27].forEach(yo => {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.38 * def.scale, 0.025, 6, 14),
              M.ironDark()
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = yo * def.scale;
            g.add(ring);
          });
          g.position.set(def.x, (0.75 * def.scale) / 2, def.z);
          hw = 0.4 * def.scale; hh = (0.75 * def.scale) / 2; hd = 0.4 * def.scale;
          _scene.add(g);
          mesh = g;
          break;
        }
        case 'crate': {
          const s = 0.65 * def.scale;
          const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), M.wood());
          crate.castShadow = crate.receiveShadow = true;
          // Plank lines via edges
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)),
            new THREE.LineBasicMaterial({ color: 0x1a1208 })
          );
          const g = new THREE.Group();
          g.add(crate); g.add(edges);
          g.position.set(def.x, s / 2, def.z);
          hw = s / 2 + 0.05; hh = s / 2; hd = s / 2 + 0.05;
          _scene.add(g);
          mesh = g;
          break;
        }
        case 'stone': {
          const w = (0.5 + Math.random() * 0.4) * def.scale;
          const h = (0.3 + Math.random() * 0.25) * def.scale;
          const d = (0.4 + Math.random() * 0.4) * def.scale;
          const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.stone());
          block.castShadow = block.receiveShadow = true;
          block.position.set(def.x, h / 2, def.z);
          hw = w / 2 + 0.05; hh = h / 2; hd = d / 2 + 0.05;
          _scene.add(block);
          mesh = block;
          break;
        }
        case 'sarcoph': {
          const g = new THREE.Group();
          // Base
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.9), M.stone());
          base.castShadow = base.receiveShadow = true;
          g.add(base);
          // Lid (slightly elevated, trapezoid-like via scaled box)
          const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.8), M.stoneDark());
          lid.position.y = 0.42;
          lid.castShadow = true;
          g.add(lid);
          // Decorative cross engraving placeholder (line)
          const crossGeo = new THREE.BoxGeometry(0.06, 0.02, 0.7);
          const cross    = new THREE.Mesh(crossGeo, M.ironDark());
          cross.position.set(0, 0.79, 0);
          g.add(cross);
          g.position.set(def.x, 0.25, def.z);
          hw = 0.55; hh = 0.77 / 2; hd = 1.0;
          _scene.add(g);
          mesh = g;
          break;
        }
      }
      _obstacles.push({ mesh, hw, hh, hd, x: def.x, z: def.z });
    });
  }

  /* ── LANTERN (held by player) ─────────────────────────────────────────────── */
  function buildLantern(playerGroup) {
    const group = new THREE.Group();

    // Handle rod
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8),
      M.lanternFrame()
    );
    rod.position.y = 0.15;
    group.add(rod);

    // Lantern frame box
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, 0.18),
      M.lanternFrame()
    );
    frame.position.y = -0.05;
    group.add(frame);

    // Glass panels (4 sides)
    const glassGeo = new THREE.PlaneGeometry(0.14, 0.18);
    const glassMat = M.lanternGlass();
    const offsets  = [[0, 0, 0.09, 0], [0, 0, -0.09, Math.PI], [0.09, 0, 0, Math.PI / 2], [-0.09, 0, 0, -Math.PI / 2]];
    offsets.forEach(([x, y, z, ry]) => {
      const panel = new THREE.Mesh(glassGeo, glassMat);
      panel.position.set(x, -0.05, z);
      panel.rotation.y = ry;
      group.add(panel);
    });

    // Flame core
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0xff9900, emissiveIntensity: 3 })
    );
    flame.position.y = -0.05;
    group.add(flame);

    // Position lantern in right hand
    group.position.set(0.45, 1.3, -0.35);
    group.name = 'lantern';
    playerGroup.add(group);
    _lantern = group;

    // Main lantern light — warm, tight radius
    _lanternLight = new THREE.PointLight(0xff9944, 2.0, 8);
    _lanternLight.castShadow = true;
    _lanternLight.shadow.mapSize.width  = 512;
    _lanternLight.shadow.mapSize.height = 512;
    _lanternLight.position.set(0.45, 1.3, -0.35);
    playerGroup.add(_lanternLight);

    // Subtle ambient fill (so player itself is lit)
    _lanternAmbient = new THREE.PointLight(0xdd8833, 0.5, 4);
    _lanternAmbient.position.set(0, 1.2, 0);
    playerGroup.add(_lanternAmbient);
  }

  /* ── DUST PARTICLES ─────────────────────────────────────────────────────── */
  function spawnDust(x, y, z) {
    const geo = new THREE.SphereGeometry(0.015, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9a8060, transparent: true, opacity: 0.5 });
    const p   = new THREE.Mesh(geo, mat);
    p.position.set(
      x + (Math.random() - 0.5) * 0.4,
      y + Math.random() * 0.3,
      z + (Math.random() - 0.5) * 0.4
    );
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      0.3 + Math.random() * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    _scene.add(p);
    _particles.push({ mesh: p, vel, life: 1.0, maxLife: 1.0 });
  }

  /* ── DRIP PARTICLES ─────────────────────────────────────────────────────── */
  function initDrips() {
    const dripPositions = [[-3, WALL_H - 0.05, -8], [5, WALL_H - 0.05, 3], [-7, WALL_H - 0.05, 6]];
    dripPositions.forEach(([x, y, z]) => {
      const geo = new THREE.SphereGeometry(0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x445566, transparent: true, opacity: 0.7 });
      const drip = new THREE.Mesh(geo, mat);
      drip.position.set(x, y, z);
      _scene.add(drip);
      _dripParticles.push({ mesh: drip, startY: y, speed: 1.5 + Math.random(), phase: Math.random() * 10 });
    });
  }

  /* ── LIGHTING ────────────────────────────────────────────────────────────── */
  function buildLighting() {
    // Very low ambient — lantern should be the main source
    _scene.add(new THREE.AmbientLight(0x1a1208, 0.25));

    // One faint overhead fill so far walls aren't fully black
    const fill = new THREE.PointLight(0x221a0e, 0.3, 25);
    fill.position.set(0, WALL_H - 0.5, 0);
    _scene.add(fill);
  }

  /* ── OBSTACLE COLLISION ─────────────────────────────────────────────────── */
  function resolveObstacleCollision(px, pz, playerR) {
    let x = px, z = pz;
    _obstacles.forEach(ob => {
      const ox = ob.mesh.position ? ob.mesh.position.x : ob.x;
      const oz = ob.mesh.position ? ob.mesh.position.z : ob.z;
      const dx = x - ox;
      const dz = z - oz;
      const overlapX = ob.hw + playerR - Math.abs(dx);
      const overlapZ = ob.hd + playerR - Math.abs(dz);

      if (overlapX > 0 && overlapZ > 0) {
        // Push out on the smaller overlap axis
        if (overlapX < overlapZ) {
          x += dx < 0 ? -overlapX : overlapX;
        } else {
          z += dz < 0 ? -overlapZ : overlapZ;
        }
      }
    });
    return { x, z };
  }

  function getObstacleTopAt(px, pz, playerR) {
    // Returns highest obstacle top if player is standing on one
    let maxTop = 0;
    _obstacles.forEach(ob => {
      const ox = ob.mesh.position ? ob.mesh.position.x : ob.x;
      const oz = ob.mesh.position ? ob.mesh.position.z : ob.z;
      const dx = Math.abs(px - ox);
      const dz = Math.abs(pz - oz);
      if (dx < ob.hw + playerR * 0.7 && dz < ob.hd + playerR * 0.7) {
        const top = (ob.mesh.position ? ob.mesh.position.y : 0) + ob.hh * 2;
        if (top > maxTop) maxTop = top;
      }
    });
    return maxTop;
  }

  /* ── PUBLIC API ─────────────────────────────────────────────────────────── */

  /**
   * Build the full dungeon world.
   * @param {THREE.Scene} scene
   * @param {THREE.Group} playerGroup
   * @param {string}      playerName
   */
  function build(scene, playerGroup, playerName) {
    _scene    = scene;
    _player   = playerGroup;
    _disposed = false;

    scene.background = new THREE.Color(0x070504);
    scene.fog = new THREE.FogExp2(0x070504, 0.07);

    buildLighting();
    buildFloor();
    buildWalls();
    buildPillars();
    buildSconces();
    buildObstacles();
    buildLantern(playerGroup);
    initDrips();
  }

  /**
   * Call every frame from your gameLoop.
   * @param {number}       ts         - timestamp from requestAnimationFrame
   * @param {number}       dt         - delta time in seconds
   * @param {THREE.Group}  playerGroup
   * @param {boolean}      isMoving   - true if WASD pressed
   * @param {object}       keys       - your keys{} map
   */
  function update(ts, dt, playerGroup, isMoving, keys) {
    if (_disposed) return;

    /* ── JUMP PHYSICS ── */
    const groundLevel   = getObstacleTopAt(playerGroup.position.x, playerGroup.position.z, PLAYER_R);
    const wantsJump     = keys['Space'] || keys['KeyJ'];

    if (wantsJump && !_jumpPressed && _onGround) {
      _velY      = JUMP_V;
      _onGround  = false;
      _jumpPressed = true;
      // Dust burst on jump
      for (let i = 0; i < 5; i++) spawnDust(playerGroup.position.x, 0.05, playerGroup.position.z);
    }
    if (!wantsJump) _jumpPressed = false;

    if (!_onGround) {
      _velY += GRAVITY * dt;
      playerGroup.position.y += _velY * dt;

      if (playerGroup.position.y <= groundLevel) {
        playerGroup.position.y = groundLevel;
        _velY   = 0;
        _onGround = true;
        // Dust burst on landing
        for (let i = 0; i < 8; i++) spawnDust(playerGroup.position.x, groundLevel + 0.05, playerGroup.position.z);
      }
    } else {
      playerGroup.position.y = groundLevel;
    }

    /* ── OBSTACLE HORIZONTAL COLLISION ── */
    const { x, z } = resolveObstacleCollision(
      playerGroup.position.x, playerGroup.position.z, OBSTACLE_MARGIN
    );
    playerGroup.position.x = x;
    playerGroup.position.z = z;

    /* ── LANTERN BOB ── */
    if (_lantern) {
      const bob = isMoving ? Math.sin(ts * 0.006) * 0.06 : Math.sin(ts * 0.002) * 0.02;
      _lantern.position.y = 1.3 + bob;
      _lanternLight.position.y = 1.3 + bob;
    }

    /* ── LANTERN FLICKER ── */
    if (_lanternLight) {
      const flicker =
        1.8 +
        Math.sin(ts * 0.004) * 0.25 +
        Math.sin(ts * 0.0091) * 0.12 +
        Math.sin(ts * 0.021) * 0.06;
      _lanternLight.intensity  = flicker;
      _lanternAmbient.intensity = flicker * 0.28;
    }

    /* ── SCONCE FLICKER ── */
    _sconceLights.forEach(s => {
      s.light.intensity = s.baseIntensity +
        Math.sin(ts * 0.003 + s.phase) * 0.25 +
        Math.sin(ts * 0.0077 + s.phase) * 0.1;
    });

    /* ── DUST PARTICLES ── */
    _dustClock += dt;
    if (isMoving && _dustClock > 0.12) {
      _dustClock = 0;
      spawnDust(playerGroup.position.x, playerGroup.position.y + 0.05, playerGroup.position.z);
    }

    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.life -= dt * 0.8;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 2 * dt;
      p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.5);
      if (p.life <= 0) {
        _scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        _particles.splice(i, 1);
      }
    }

    /* ── DRIP PARTICLES ── */
    _dripParticles.forEach(d => {
      d.mesh.position.y -= d.speed * dt;
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = d.startY;
        // Small splash
        for (let i = 0; i < 3; i++) spawnDust(d.mesh.position.x, 0.05, d.mesh.position.z);
      }
    });
  }

  /** Clean up all world objects */
  function dispose() {
    _disposed = true;
    _obstacles    = [];
    _particles    = [];
    _dripParticles = [];
    _sconceLights = [];
    _lantern      = null;
    _lanternLight = null;
    _lanternAmbient = null;
  }

  function getGroundLevelAt(px, pz) {
    let groundLevel = 0;
    _obstacles.forEach(ob => {
      const ox = ob.mesh.position ? ob.mesh.position.x : ob.x;
      const oz = ob.mesh.position ? ob.mesh.position.z : ob.z;
      const dx = Math.abs(px - ox);
      const dz = Math.abs(pz - oz);
      if (dx < ob.hw + 0.25 && dz < ob.hd + 0.25) {
        const top = (ob.mesh.position ? ob.mesh.position.y : 0) + ob.hh * 2;
        if (top > groundLevel) groundLevel = top;
      }
    });
    return groundLevel;
  }

  return { build, update, dispose, getGroundLevelAt };

})();
