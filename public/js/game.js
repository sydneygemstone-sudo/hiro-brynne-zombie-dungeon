import * as THREE from './three.module.js';
import {
  cobblestoneTexture,
  mossyStoneTexture,
  floorTexture,
  ceilingTexture
} from './textures.js';
import {
  createPlayerModel,
  createZombieModel,
  createSwordMesh,
  createSwordPickup,
  createBandagePickup,
  createKeyPickup,
  createTreasureChest,
  createTorch
} from './models.js';
import * as Sound from './audio.js';

// Socket setup
const socket = io();

// DOM elements
const container = document.getElementById('canvas-container');
const damageOverlay = document.getElementById('damage-overlay');
const healOverlay = document.getElementById('heal-overlay');
const hudRoleName = document.getElementById('hud-role-name');
const hudRoleBadge = document.getElementById('hud-role-badge');
const hudHpFill = document.getElementById('hud-hp-fill');
const hudHpText = document.getElementById('hud-hp-text');
const hudWeapon = document.getElementById('hud-weapon');
const hudBandages = document.getElementById('hud-bandages');
const hudKey = document.getElementById('hud-key');
const hudObjectiveText = document.getElementById('hud-objective-text');
const hudObjectiveCard = document.getElementById('hud-objective-card');
const hudTeammate = document.getElementById('hud-teammate');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnRestart = document.getElementById('btn-restart');
const btnAttack = document.getElementById('btn-attack');
const btnHeal = document.getElementById('btn-heal');
const btnHealLabel = document.getElementById('btn-heal-label');
const btnSwitchRole = document.getElementById('btn-switch-role');
const gameoverModal = document.getElementById('gameover-modal');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverDesc = document.getElementById('gameover-desc');
const btnModalRestart = document.getElementById('btn-modal-restart');
const joystickContainer = document.getElementById('joystick-container');
const joystickKnob = document.getElementById('joystick-knob');

// Three.js Core Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0d14, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 80);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Clean, high-performance ambient & directional lighting (NO heavy point light spam)
const ambientLight = new THREE.AmbientLight(0x555566, 1.2);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x222233, 0.8);
scene.add(hemiLight);

// Headlight (1 single light attached to player camera)
const headLight = new THREE.PointLight(0xffeedd, 1.2, 8.0);
camera.add(headLight);
scene.add(camera);

// First-person viewmodel
const viewmodelGroup = new THREE.Group();
camera.add(viewmodelGroup);

const fistGeo = new THREE.BoxGeometry(0.12, 0.12, 0.28);
const fistMat = new THREE.MeshLambertMaterial({ color: 0xc68642 });
const viewmodelFist = new THREE.Mesh(fistGeo, fistMat);
viewmodelFist.position.set(0.32, -0.26, -0.5);
viewmodelGroup.add(viewmodelFist);

const viewmodelSword = createSwordMesh();
viewmodelSword.scale.set(0.8, 0.8, 0.8);
viewmodelSword.position.set(0.32, -0.22, -0.5);
viewmodelSword.rotation.set(-0.2, 0.3, -0.2);
viewmodelSword.visible = false;
viewmodelGroup.add(viewmodelSword);

let isSwinging = false;
function playSwingAnimation() {
  if (isSwinging) return;
  isSwinging = true;
  let progress = 0;
  const startY = viewmodelFist.position.y;
  const startZ = viewmodelFist.position.z;

  const swingTimer = setInterval(() => {
    progress += 0.15;
    const offset = Math.sin(progress * Math.PI);
    viewmodelFist.position.y = startY - offset * 0.15;
    viewmodelFist.position.z = startZ - offset * 0.25;
    viewmodelFist.rotation.x = -offset * 0.8;

    viewmodelSword.position.y = startY - offset * 0.15;
    viewmodelSword.position.z = startZ - offset * 0.25;
    viewmodelSword.rotation.x = -0.2 - offset * 0.9;

    if (progress >= 1.0) {
      viewmodelFist.position.set(0.32, -0.26, -0.5);
      viewmodelFist.rotation.set(0, 0, 0);
      viewmodelSword.position.set(0.32, -0.22, -0.5);
      viewmodelSword.rotation.set(-0.2, 0.3, -0.2);
      isSwinging = false;
      clearInterval(swingTimer);
    }
  }, 16);
}

// Player state
let myId = null;
let myRole = 'Hero';
let myX = 7.0;
let myZ = 4.0;
let myYaw = Math.PI;
let myPitch = 0;
let myHp = 100;
let myWeapon = 'fist';
let myBandages = 1;
let myHasKey = false;
let gateUnlocked = false;
let bossDefeated = false;
let isDead = false;

let dungeonMap = [];
let mapWidth = 24;
let mapHeight = 35;
let cellSize = 2.0;
let spawnPos = { x: 7.0, z: 4.0 };

const otherPlayers = {};
const zombieMeshes = {};
const itemMeshes = {};
let treasureMesh = null;
let exitBeaconMesh = null;
const gateMeshes = [];

// Movement & Input state
const keys = { forward: false, backward: false, left: false, right: false };
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
let joystickVector = { x: 0, z: 0 };

let lookTouchId = null;
let lookLastPos = { x: 0, y: 0 };
const TOUCH_LOOK_SENSITIVITY = 0.005;
const MOUSE_SENSITIVITY = 0.0024;

// Build Dungeon Mesh with shared materials (Fast & Smooth)
function buildDungeon(mapData) {
  dungeonMap = mapData;
  mapHeight = mapData.length;
  mapWidth = mapData[0].length;

  const wallGeo = new THREE.BoxGeometry(cellSize, 2.8, cellSize);
  const sharedCobbleMat = new THREE.MeshLambertMaterial({ map: cobblestoneTexture });
  const sharedMossyMat = new THREE.MeshLambertMaterial({ map: mossyStoneTexture });
  const wallGroup = new THREE.Group();

  // Floor plane
  const floorGeo = new THREE.PlaneGeometry(mapWidth * cellSize, mapHeight * cellSize);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshLambertMaterial({
    map: floorTexture,
    side: THREE.DoubleSide
  });
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(mapWidth, mapHeight);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set((mapWidth * cellSize) / 2, 0, (mapHeight * cellSize) / 2);
  scene.add(floorMesh);

  // Ceiling plane
  const ceilGeo = new THREE.PlaneGeometry(mapWidth * cellSize, mapHeight * cellSize);
  ceilGeo.rotateX(Math.PI / 2);
  const ceilMat = new THREE.MeshLambertMaterial({
    map: ceilingTexture,
    side: THREE.DoubleSide
  });
  ceilingTexture.wrapS = THREE.RepeatWrapping;
  ceilingTexture.wrapT = THREE.RepeatWrapping;
  ceilingTexture.repeat.set(mapWidth, mapHeight);
  const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
  ceilMesh.position.set((mapWidth * cellSize) / 2, 2.8, (mapHeight * cellSize) / 2);
  scene.add(ceilMesh);

  // Wall cubes
  for (let r = 0; r < mapHeight; r++) {
    for (let c = 0; c < mapWidth; c++) {
      const ch = mapData[r][c];
      const wx = (c + 0.5) * cellSize;
      const wz = (r + 0.5) * cellSize;

      if (ch === '#') {
        const isMossy = (r + c) % 5 === 0;
        const cube = new THREE.Mesh(wallGeo, isMossy ? sharedMossyMat : sharedCobbleMat);
        cube.position.set(wx, 1.4, wz);
        wallGroup.add(cube);
      } else if (ch === 'D') {
        const gate = new THREE.Group();
        const barMat = new THREE.MeshLambertMaterial({ color: 0x5a3217 });
        for (let i = -2; i <= 2; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), barMat);
          bar.position.set(i * 0.38, 1.2, 0);
          gate.add(bar);
        }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.22), barMat);
        cross.position.y = 1.35;
        gate.add(cross);
        gate.position.set(wx, 0, wz);
        gate.visible = !gateUnlocked;
        gateMeshes.push(gate);
        scene.add(gate);
      } else {
        if ((r % 4 === 1 && c % 4 === 1) || ch === 'S' || ch === 'T' || ch === 'G') {
          const torch = createTorch();
          torch.root.position.set(wx, 1.5, wz);
          scene.add(torch.root);
        }
      }
    }
  }
  scene.add(wallGroup);

  buildExitBeacon();
}

// Exit Portal at Spawn
function buildExitBeacon() {
  const group = new THREE.Group();
  group.position.set(spawnPos.x, 0, spawnPos.z);

  const pillarGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x181028 });
  [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([ox, oz]) => {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(ox, 0.6, oz);
    group.add(p);
  });

  const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x2ecc71,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.75;
  beam.visible = false;
  group.add(beam);

  scene.add(group);
  exitBeaconMesh = { root: group, beam };
}

// Robust collision check (radius 0.22m gives smooth movement in corridors)
function isColliding(x, z, radius = 0.22) {
  if (!dungeonMap.length) return false;
  const minC = Math.floor((x - radius) / cellSize);
  const maxC = Math.floor((x + radius) / cellSize);
  const minR = Math.floor((z - radius) / cellSize);
  const maxR = Math.floor((z + radius) / cellSize);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (r < 0 || r >= mapHeight || c < 0 || c >= mapWidth) return true;
      if (dungeonMap[r][c] === '#') return true;
      if (!gateUnlocked && dungeonMap[r][c] === 'D') return true;
    }
  }
  return false;
}

// Fail-safe movement solver: tries full move, then single-axis slide, then unstuck nudge
function tryMove(curX, curZ, dx, dz, radius = 0.22) {
  // 1. Both axes together
  if (!isColliding(curX + dx, curZ + dz, radius)) {
    return { x: curX + dx, z: curZ + dz };
  }
  // 2. Slide X alone
  let nx = curX;
  if (!isColliding(curX + dx, curZ, radius)) {
    nx = curX + dx;
  }
  // 3. Slide Z alone
  let nz = curZ;
  if (!isColliding(curX, curZ + dz, radius)) {
    nz = curZ + dz;
  }
  // 4. Unstuck protection if already penetrating
  if (nx === curX && nz === curZ && isColliding(curX, curZ, radius)) {
    const toOpenX = spawnPos.x - curX;
    const toOpenZ = spawnPos.z - curZ;
    const dist = Math.sqrt(toOpenX * toOpenX + toOpenZ * toOpenZ) || 1;
    nx += (toOpenX / dist) * 0.06;
    nz += (toOpenZ / dist) * 0.06;
  }
  return { x: nx, z: nz };
}

// Update HUD
function updateHUD() {
  hudHpFill.style.width = `${Math.max(0, myHp)}%`;
  hudHpText.textContent = `${Math.max(0, myHp)}/100`;

  hudRoleName.textContent = myRole.toUpperCase();
  hudRoleBadge.className = `role-badge ${myRole === 'Hero' ? 'role-hero' : 'role-brian'}`;

  hudWeapon.textContent = myWeapon === 'sword' ? '🗡️ Diamond Sword (30)' : '👊 Fist (12)';
  hudBandages.textContent = `🩹 x${myBandages}`;
  if (hudKey) hudKey.textContent = myHasKey ? '🗝️ Crypt Key' : '🔒 Key';
  btnHealLabel.textContent = `HEAL (${myBandages})`;

  viewmodelSword.visible = myWeapon === 'sword';
  viewmodelFist.visible = myWeapon !== 'sword';
}

function flashScreen(type) {
  const el = type === 'damage' ? damageOverlay : healOverlay;
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
  }, 180);
}

// Actions
function triggerAttack() {
  if (isDead) return;
  Sound.playSwing();
  playSwingAnimation();
  socket.emit('player_attack');
}

function triggerHeal() {
  if (isDead || myBandages <= 0 || myHp >= 100) return;
  Sound.playHeal();
  socket.emit('player_heal');
}

function triggerRestart() {
  socket.emit('restart_game');
  gameoverModal.style.display = 'none';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

// Action Button Listeners
btnAttack.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); triggerAttack(); }, { passive: false });
btnAttack.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); triggerAttack(); });

btnHeal.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); triggerHeal(); }, { passive: false });
btnHeal.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); triggerHeal(); });

btnRestart.addEventListener('click', triggerRestart);
btnModalRestart.addEventListener('click', triggerRestart);
btnFullscreen.addEventListener('click', toggleFullscreen);

if (btnSwitchRole) {
  const handleRoleSwap = (e) => {
    e.preventDefault();
    e.stopPropagation();
    myRole = myRole === 'Hero' ? 'Brian' : 'Hero';
    socket.emit('switch_role', myRole);
    updateHUD();
  };
  btnSwitchRole.addEventListener('touchstart', handleRoleSwap, { passive: false });
  btnSwitchRole.addEventListener('click', handleRoleSwap);
}

// Desktop Keyboard Controls (With IME Pinyin and Caps tolerance)
window.addEventListener('keydown', (e) => {
  const k = e.key ? e.key.toLowerCase() : '';
  if (e.code === 'KeyW' || k === 'w' || e.code === 'ArrowUp') keys.forward = true;
  if (e.code === 'KeyS' || k === 's' || e.code === 'ArrowDown') keys.backward = true;
  if (e.code === 'KeyA' || k === 'a' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || k === 'd' || e.code === 'ArrowRight') keys.right = true;

  if (e.code === 'Space' || e.code === 'KeyF' || k === 'f') {
    triggerAttack();
  } else if (e.code === 'KeyE' || k === 'e' || e.code === 'KeyQ' || k === 'q' || k === 'h') {
    triggerHeal();
  } else if (e.code === 'KeyR' || k === 'r') {
    triggerRestart();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key ? e.key.toLowerCase() : '';
  if (e.code === 'KeyW' || k === 'w' || e.code === 'ArrowUp') keys.forward = false;
  if (e.code === 'KeyS' || k === 's' || e.code === 'ArrowDown') keys.backward = false;
  if (e.code === 'KeyA' || k === 'a' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || k === 'd' || e.code === 'ArrowRight') keys.right = false;
});

// Desktop Mouse Controls: Bind directly to window
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener('mousedown', (e) => {
  if (e.target.closest('button') || e.target.closest('#hud')) return;
  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  document.body.requestPointerLock?.();
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
});

window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement) {
    myYaw -= e.movementX * MOUSE_SENSITIVITY;
    myPitch -= e.movementY * MOUSE_SENSITIVITY;
    myPitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, myPitch));
  } else if (isMouseDown) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    myYaw -= dx * MOUSE_SENSITIVITY;
    myPitch -= dy * MOUSE_SENSITIVITY;
    myPitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, myPitch));
  }
});

// Multi-Touch Screen Handling for iPad Safari
window.addEventListener('touchstart', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    if (touch.target.closest('button') || touch.target.closest('#hud')) {
      continue;
    }

    const midX = window.innerWidth * 0.48;
    if (touch.clientX < midX) {
      // Left side: Joystick
      if (joystickTouchId === null) {
        joystickTouchId = touch.identifier;
        joystickCenter = { x: touch.clientX, y: touch.clientY };
        joystickContainer.style.left = `${touch.clientX - 70}px`;
        joystickContainer.style.bottom = 'auto';
        joystickContainer.style.top = `${touch.clientY - 70}px`;
        joystickContainer.style.display = 'block';
        joystickKnob.style.transform = 'translate(-50%, -50%)';
        joystickVector = { x: 0, z: 0 };
      }
    } else {
      // Right side: Look
      if (lookTouchId === null) {
        lookTouchId = touch.identifier;
        lookLastPos = { x: touch.clientX, y: touch.clientY };
      }
    }
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];

    if (touch.identifier === joystickTouchId) {
      const dx = touch.clientX - joystickCenter.x;
      const dy = touch.clientY - joystickCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = 45;

      let nx = dx;
      let ny = dy;
      if (dist > maxRadius) {
        nx = (dx / dist) * maxRadius;
        ny = (dy / dist) * maxRadius;
      }

      joystickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      joystickVector.x = nx / maxRadius;
      joystickVector.z = ny / maxRadius;
    } else if (touch.identifier === lookTouchId) {
      const dx = touch.clientX - lookLastPos.x;
      const dy = touch.clientY - lookLastPos.y;
      lookLastPos = { x: touch.clientX, y: touch.clientY };

      myYaw -= dx * TOUCH_LOOK_SENSITIVITY;
      myPitch -= dy * TOUCH_LOOK_SENSITIVITY;
      myPitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, myPitch));
    }
  }
}, { passive: false });

const handleTouchEnd = (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    if (touch.identifier === joystickTouchId) {
      joystickTouchId = null;
      joystickVector = { x: 0, z: 0 };
      joystickKnob.style.transform = 'translate(-50%, -50%)';
      joystickContainer.style.left = '40px';
      joystickContainer.style.top = 'auto';
      joystickContainer.style.bottom = '40px';
    }
    if (touch.identifier === lookTouchId) {
      lookTouchId = null;
    }
  }
};

window.addEventListener('touchend', handleTouchEnd, { passive: false });
window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Socket Events
socket.on('init_game', (data) => {
  myId = data.selfId;
  spawnPos = data.spawnPos;
  cellSize = data.cellSize;
  mapWidth = data.mapWidth;
  mapHeight = data.mapHeight;
  gateUnlocked = Boolean(data.gateUnlocked);
  bossDefeated = Boolean(data.bossDefeated);

  buildDungeon(data.mapData);

  const me = data.players[myId];
  if (me) {
    myRole = me.role;
    myX = me.x;
    myZ = me.z;
    myHp = me.hp;
    myWeapon = me.weapon;
    myBandages = me.bandages;
    myHasKey = Boolean(me.hasKey);
    isDead = me.isDead;
    updateHUD();
  }

  syncItems(data.items);
  syncTreasure(data.treasure);

  for (const pid in data.players) {
    if (pid !== myId) {
      spawnOtherPlayer(data.players[pid]);
    }
  }

  syncZombies(data.zombies);
});

socket.on('player_joined', (player) => {
  if (player.id !== myId) {
    spawnOtherPlayer(player);
  }
});

socket.on('player_moved', (data) => {
  const other = otherPlayers[data.id];
  if (other) {
    other.targetX = data.x;
    other.targetZ = data.z;
    other.targetYaw = data.yaw;
  }
});

socket.on('player_swung', (data) => {
  const other = otherPlayers[data.playerId];
  if (other) {
    other.model.triggerSwing();
  }
});

socket.on('player_left', (pid) => {
  const other = otherPlayers[pid];
  if (other) {
    scene.remove(other.model.root);
    delete otherPlayers[pid];
    updateTeammateHUD();
  }
});

socket.on('player_role_updated', (data) => {
  if (data.playerId === myId) {
    myRole = data.role;
    updateHUD();
  } else {
    const other = otherPlayers[data.playerId];
    if (other) {
      scene.remove(other.model.root);
      delete otherPlayers[data.playerId];
      data.x = other.targetX;
      data.z = other.targetZ;
      spawnOtherPlayer(data);
    }
  }
});

socket.on('world_sync', (data) => {
  syncZombies(data.zombies);
  gateUnlocked = Boolean(data.gateUnlocked);
  bossDefeated = Boolean(data.bossDefeated);
  gateMeshes.forEach(g => { g.visible = !gateUnlocked; });

  for (const pid in data.players) {
    const p = data.players[pid];
    if (pid === myId) {
      myHp = p.hp;
      isDead = p.isDead;
      updateHUD();
    } else {
      const other = otherPlayers[pid];
      if (other) {
        other.hp = p.hp;
        other.model.nameSprite.userData.render(p.hp);
        other.model.sword.visible = p.weapon === 'sword';
      }
    }
  }
  updateTeammateHUD();
});

socket.on('player_hit', (data) => {
  if (data.playerId === myId) {
    myHp = data.hp;
    Sound.playHurt();
    flashScreen('damage');
    updateHUD();
  }
});

socket.on('player_healed', (data) => {
  if (data.playerId === myId) {
    myHp = data.hp;
    myBandages = data.bandages;
    flashScreen('heal');
    updateHUD();
  }
});

socket.on('zombie_hit', (data) => {
  Sound.playHit();
  const z = zombieMeshes[data.zombieId];
  if (z) {
    z.model.flashHit();
  }
});

socket.on('zombie_killed', (data) => {
  const z = zombieMeshes[data.zombieId];
  if (z) {
    scene.remove(z.model.root);
    delete zombieMeshes[data.zombieId];
  }
});

socket.on('item_collected', (data) => {
  Sound.playPickup();
  const it = itemMeshes[data.itemId];
  if (it) {
    scene.remove(it.group);
    delete itemMeshes[data.itemId];
  }
  if (data.playerId === myId) {
    myWeapon = data.weapon;
    myBandages = data.bandages;
    myHasKey = Boolean(data.hasKey);
    updateHUD();
  }
});

socket.on('gate_unlocked', () => {
  gateUnlocked = true;
  gateMeshes.forEach(g => { g.visible = false; });
  hudObjectiveText.textContent = '⚔️ CRYPT OPEN! DEFEAT THE ZOMBIE KING!';
});

socket.on('boss_defeated', () => {
  bossDefeated = true;
  hudObjectiveText.textContent = '👑 ZOMBIE KING DEFEATED! CLAIM THE TREASURE!';
});

socket.on('item_spawned', (item) => {
  spawnItem(item);
});

socket.on('treasure_collected', (data) => {
  Sound.playTreasure();
  if (treasureMesh) {
    scene.remove(treasureMesh.root);
    treasureMesh = null;
  }
  if (exitBeaconMesh) {
    exitBeaconMesh.beam.visible = true;
  }
  hudObjectiveText.textContent = '🏃 TREASURE SECURED! ESCAPE TO ENTRANCE!';
  hudObjectiveCard.classList.add('objective-escape');
});

socket.on('game_over', (data) => {
  if (data.result === 'victory') {
    Sound.playVictory();
    gameoverTitle.textContent = '🏆 VICTORY!';
    gameoverTitle.className = 'modal-title victory-title';
    gameoverDesc.textContent = data.message;
  } else {
    Sound.playDefeat();
    gameoverTitle.textContent = '💀 DEFEAT';
    gameoverTitle.className = 'modal-title defeat-title';
    gameoverDesc.textContent = data.message;
  }
  gameoverModal.style.display = 'flex';
});

socket.on('game_reset', (state) => {
  for (const zid in zombieMeshes) {
    scene.remove(zombieMeshes[zid].model.root);
    delete zombieMeshes[zid];
  }
  for (const iid in itemMeshes) {
    scene.remove(itemMeshes[iid].group);
    delete itemMeshes[iid];
  }
  if (treasureMesh) {
    scene.remove(treasureMesh.root);
    treasureMesh = null;
  }
  if (exitBeaconMesh) {
    exitBeaconMesh.beam.visible = false;
  }

  const me = state.players[myId];
  if (me) {
    myX = me.x;
    myZ = me.z;
    myHp = me.hp;
    myWeapon = me.weapon;
    myBandages = me.bandages;
    myHasKey = Boolean(me.hasKey);
    isDead = me.isDead;
  }

  gateUnlocked = Boolean(state.gateUnlocked);
  bossDefeated = Boolean(state.bossDefeated);
  gateMeshes.forEach(g => { g.visible = !gateUnlocked; });
  hudObjectiveText.textContent = '🗝️ Find the Crypt Key!';
  hudObjectiveCard.classList.remove('objective-escape');
  gameoverModal.style.display = 'none';
  updateHUD();

  syncItems(state.items);
  syncTreasure(state.treasure);
  syncZombies(state.zombies);
});

function spawnOtherPlayer(p) {
  if (otherPlayers[p.id]) {
    scene.remove(otherPlayers[p.id].model.root);
  }
  const model = createPlayerModel(p.role);
  model.root.position.set(p.x, 0, p.z);
  scene.add(model.root);

  otherPlayers[p.id] = {
    model,
    targetX: p.x,
    targetZ: p.z,
    targetYaw: p.yaw || 0,
    hp: p.hp || 100,
    role: p.role
  };
  updateTeammateHUD();
}

function updateTeammateHUD() {
  const others = Object.values(otherPlayers);
  if (others.length === 0) {
    hudTeammate.textContent = window.__SINGLEPLAYER__ ? '🎮 Single Player' : '👤 Solo (Waiting for P2...)';
    hudTeammate.style.color = window.__SINGLEPLAYER__ ? '#70e1c1' : '#bdc3c7';
  } else {
    const t = others[0];
    const dead = t.hp <= 0;
    const dx = myX - (t.targetX || 0);
    const dz = myZ - (t.targetZ || 0);
    const dist = Math.sqrt(dx * dx + dz * dz).toFixed(1);
    hudTeammate.textContent = `👥 ${t.role} (${dist}m): ${dead ? '💀 DOWNED' : `💚 ${t.hp}%`}`;
    hudTeammate.style.color = dead ? '#e74c3c' : '#2ecc71';
  }
}

function syncItems(itemsList) {
  itemsList.forEach(item => {
    if (!item.collected && !itemMeshes[item.id]) {
      spawnItem(item);
    }
  });
}

function spawnItem(item) {
  let pickup = null;
  if (item.type === 'sword') {
    pickup = createSwordPickup();
  } else if (item.type === 'key') {
    pickup = createKeyPickup();
  } else {
    pickup = createBandagePickup();
  }
  pickup.root.position.set(item.x, 0, item.z);
  scene.add(pickup.root);
  itemMeshes[item.id] = {
    group: pickup.root,
    type: item.type,
    update: pickup.update
  };
}

function syncTreasure(treasureData) {
  if (!treasureData.collected && !treasureMesh) {
    treasureMesh = createTreasureChest();
    treasureMesh.root.position.set(treasureData.x, 0, treasureData.z);
    scene.add(treasureMesh.root);
  }
}

function syncZombies(zombiesList) {
  const currentIds = new Set(zombiesList.map(z => z.id));

  for (const id in zombieMeshes) {
    if (!currentIds.has(id)) {
      scene.remove(zombieMeshes[id].model.root);
      delete zombieMeshes[id];
    }
  }

  zombiesList.forEach(z => {
    if (z.hp <= 0) return;
    let zm = zombieMeshes[z.id];
    if (!zm) {
      const isBaby = z.type === 'baby';
      const isBoss = z.type === 'boss';
      const model = createZombieModel(isBaby, isBoss);
      model.root.position.set(z.x, 0, z.z);
      scene.add(model.root);
      zm = {
        model,
        targetX: z.x,
        targetZ: z.z,
        targetYaw: z.yaw,
        type: z.type
      };
      zombieMeshes[z.id] = zm;
    } else {
      zm.targetX = z.x;
      zm.targetZ = z.z;
      zm.targetYaw = z.yaw;
    }
  });
}

// Main Animation & Movement Loop
let lastTime = performance.now();
let lastMoveEmit = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  const time = now * 0.001;

  if (!isDead) {
    let moveForward = 0;
    let moveRight = 0;

    if (keys.forward) moveForward += 1;
    if (keys.backward) moveForward -= 1;
    if (keys.left) moveRight -= 1;
    if (keys.right) moveRight += 1;

    if (joystickVector.x !== 0 || joystickVector.z !== 0) {
      moveRight += joystickVector.x;
      moveForward -= joystickVector.z;
    }

    const moveLen = Math.sqrt(moveForward * moveForward + moveRight * moveRight);
    if (moveLen > 0.05) {
      const normLen = Math.min(1.0, moveLen);
      const nx = (moveRight / moveLen) * normLen;
      const nz = (moveForward / moveLen) * normLen;

      const speed = 3.35; // meters/sec: slower, more controllable dungeon pacing
      const forwardX = -Math.sin(myYaw);
      const forwardZ = -Math.cos(myYaw);
      const rightX = Math.cos(myYaw);
      const rightZ = -Math.sin(myYaw);

      const vx = (forwardX * nz + rightX * nx) * speed * dt;
      const vz = (forwardZ * nz + rightZ * nx) * speed * dt;

      // Fail-safe move solver
      const pos = tryMove(myX, myZ, vx, vz, 0.22);
      myX = pos.x;
      myZ = pos.z;

      const bob = Math.sin(time * 10) * 0.04;
      camera.position.y = 1.6 + bob;

      if (now - lastMoveEmit > 33) {
        lastMoveEmit = now;
        socket.emit('player_move', {
          x: myX,
          z: myZ,
          yaw: myYaw,
          pitch: myPitch
        });
      }
    } else {
      camera.position.y = 1.6;
    }
  }

  // Camera Position & Rotation
  camera.position.x = myX;
  camera.position.z = myZ;
  camera.rotation.y = myYaw;
  camera.rotation.x = myPitch;

  // Sync other player visuals
  for (const pid in otherPlayers) {
    const p = otherPlayers[pid];
    const dx = p.targetX - p.model.root.position.x;
    const dz = p.targetZ - p.model.root.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    p.model.root.position.x += dx * 0.3;
    p.model.root.position.z += dz * 0.3;
    // Camera forward is -Z while character models face +Z.
    p.model.root.rotation.y = p.targetYaw + Math.PI;
    p.model.updateAnim(dist > 0.02 ? 1.0 : 0.0, time);
  }

  // Sync zombie visuals
  for (const zid in zombieMeshes) {
    const z = zombieMeshes[zid];
    const dx = z.targetX - z.model.root.position.x;
    const dz = z.targetZ - z.model.root.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    z.model.root.position.x += dx * 0.25;
    z.model.root.position.z += dz * 0.25;
    z.model.root.rotation.y = z.targetYaw;
    z.model.updateAnim(time, dist > 0.02);
  }

  // Animate items
  for (const iid in itemMeshes) {
    itemMeshes[iid].update(time);
  }

  if (treasureMesh) {
    treasureMesh.update(time);
  }
  if (exitBeaconMesh && exitBeaconMesh.beam.visible) {
    exitBeaconMesh.beam.rotation.y = time * 2;
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
