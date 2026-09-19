const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 8890;
const HOST = '0.0.0.0';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Dungeon Grid Definition
// # = Wall
// . = Floor
// S = Spawn / Exit
// T = Treasure
// W = Weapon (Sword)
// B = Bandage
// K = Dungeon key
// D = Locked crypt gate
// Z = Normal Zombie
// J = Fast Baby Zombie
// G = Zombie King boss
const DUNGEON_MAP = [
  "########################",
  "#S.....#.......#.......#",
  "#......#...W...#...Z...#",
  "#......#.......#.......#",
  "####.#####.#########.###",
  "#......#.......#.......#",
  "#..B...#...Z...#...B...#",
  "#......#.......#.......#",
  "####.#####.#####.#######",
  "#......#.......#.......#",
  "#..Z...#...J...#...Z...#",
  "#......#.......#.......#",
  "######.#####.#####.#####",
  "#..........#...........#",
  "#....Z.....#.....Z.....#",
  "#..........#...........#",
  "######.#########.#######",
  "#..........#...........#",
  "#....W.....#.....J.....#",
  "#..........#...........#",
  "####.#############.#####",
  "#..........#...........#",
  "#....Z.....#.....Z.....#",
  "#..........#...........#",
  "######.#########.#######",
  "#..........#...........#",
  "#....K.....#.....B.....#",
  "#..........#...........#",
  "####D#############D#####",
  "#......................#",
  "#...Z.......G......Z...#",
  "#..........TT..........#",
  "#...J......TT......J...#",
  "#......................#",
  "########################"
];

const MAP_HEIGHT = DUNGEON_MAP.length;
const MAP_WIDTH = DUNGEON_MAP[0].length;
const CELL_SIZE = 2.0; // 2 meters per block

// Parse Map
function initWorldData() {
  const walls = [];
  const zombieSpawns = [];
  const itemSpawns = [];
  const gatePositions = [];
  // Room 1 (Spawn Room) is from Col 1 to 6, Row 1 to 3. Center is Col 3.5, Row 2.
  let spawnPos = { x: 7.0, z: 4.0 };
  let treasurePos = { x: 12 * CELL_SIZE, z: 31 * CELL_SIZE };

  for (let r = 0; r < MAP_HEIGHT; r++) {
    const row = [];
    for (let c = 0; c < MAP_WIDTH; c++) {
      const ch = DUNGEON_MAP[r][c];
      const worldX = (c + 0.5) * CELL_SIZE;
      const worldZ = (r + 0.5) * CELL_SIZE;

      if (ch === '#') {
        row.push(1);
      } else {
        row.push(0);
        if (ch === 'T') {
          treasurePos = { x: worldX, z: worldZ };
        } else if (ch === 'W') {
          itemSpawns.push({ id: `sword_${itemSpawns.length}`, type: 'sword', x: worldX, z: worldZ });
        } else if (ch === 'B') {
          itemSpawns.push({ id: `bandage_${itemSpawns.length}`, type: 'bandage', x: worldX, z: worldZ });
        } else if (ch === 'K') {
          itemSpawns.push({ id: 'crypt_key', type: 'key', x: worldX, z: worldZ });
        } else if (ch === 'D') {
          gatePositions.push({ x: worldX, z: worldZ });
        } else if (ch === 'Z') {
          zombieSpawns.push({ type: 'normal', x: worldX, z: worldZ });
        } else if (ch === 'J') {
          zombieSpawns.push({ type: 'baby', x: worldX, z: worldZ });
        } else if (ch === 'G') {
          zombieSpawns.push({ type: 'boss', x: worldX, z: worldZ });
        }
      }
    }
    walls.push(row);
  }

  return { walls, spawnPos, treasurePos, zombieSpawns, itemSpawns, gatePositions };
}

const worldBase = initWorldData();

// Game State
let players = {}; // socketId -> playerObj
let zombies = [];
let items = [];
let treasure = {
  x: worldBase.treasurePos.x,
  z: worldBase.treasurePos.z,
  collected: false,
  collectedBy: null
};
let gameState = 'playing'; // 'playing', 'treasure_found', 'victory', 'defeat'
let gateUnlocked = false;
let bossDefeated = false;
let zombieIdCounter = 1;

function resetGame() {
  gameState = 'playing';
  gateUnlocked = false;
  bossDefeated = false;
  treasure = {
    x: worldBase.treasurePos.x,
    z: worldBase.treasurePos.z,
    collected: false,
    collectedBy: null
  };

  // Reset items
  items = worldBase.itemSpawns.map(item => ({
    ...item,
    collected: false
  }));

  // Reset zombies
  zombieIdCounter = 1;
  zombies = worldBase.zombieSpawns.map(spawn => {
    const isBaby = spawn.type === 'baby';
    const isBoss = spawn.type === 'boss';
    const maxHp = isBoss ? 180 : (isBaby ? 20 : 35);
    return {
      id: `z_${zombieIdCounter++}`,
      type: spawn.type,
      x: spawn.x,
      z: spawn.z,
      hp: maxHp,
      maxHp,
      speed: isBoss ? 1.55 : (isBaby ? 3.1 : 1.75),
      damage: isBoss ? 18 : (isBaby ? 8 : 12),
      attackCooldown: isBoss ? 1050 : (isBaby ? 800 : 1200),
      lastAttackTime: 0,
      yaw: Math.random() * Math.PI * 2,
      hitCooldown: 0
    };
  });

  // Reset players
  let roles = ['Hero', 'Brian'];
  let idx = 0;
  for (let id in players) {
    players[id].hp = 100;
    players[id].weapon = 'fist';
    players[id].bandages = 1;
    players[id].hasKey = false;
    players[id].x = worldBase.spawnPos.x + (idx === 0 ? -0.8 : 0.8);
    players[id].z = worldBase.spawnPos.z;
    players[id].yaw = Math.PI;
    players[id].pitch = 0;
    players[id].isDead = false;
    idx++;
  }

  io.emit('game_reset', getFullState());
}

function getFullState() {
  return {
    gameState,
    players,
    zombies,
    items,
    treasure,
    gateUnlocked,
    bossDefeated,
    gatePositions: worldBase.gatePositions,
    spawnPos: worldBase.spawnPos,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    cellSize: CELL_SIZE,
    mapData: DUNGEON_MAP
  };
}

// Check Wall Collision
function isWall(x, z, radius = 0.35) {
  const minC = Math.floor((x - radius) / CELL_SIZE);
  const maxC = Math.floor((x + radius) / CELL_SIZE);
  const minR = Math.floor((z - radius) / CELL_SIZE);
  const maxR = Math.floor((z + radius) / CELL_SIZE);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (r < 0 || r >= MAP_HEIGHT || c < 0 || c >= MAP_WIDTH) return true;
      if (worldBase.walls[r][c] === 1) return true;
      if (!gateUnlocked && DUNGEON_MAP[r][c] === 'D') return true;
    }
  }
  return false;
}

// Distance helper
function distSq(x1, z1, x2, z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

// Initialize zombies and items on start
resetGame();

// Server Game Loop (20 FPS)
const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

setInterval(() => {
  if (gameState === 'victory' || gameState === 'defeat') return;

  const now = Date.now();
  const activePlayers = Object.values(players).filter(p => !p.isDead);

  // Check defeat
  if (Object.keys(players).length > 0 && activePlayers.length === 0) {
    gameState = 'defeat';
    io.emit('game_over', { result: 'defeat', message: 'All players were defeated by the zombies!' });
    return;
  }

  // Zombie AI
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.hp <= 0) continue;

    // Hit recovery cooldown
    if (z.hitCooldown > 0) {
      z.hitCooldown -= TICK_INTERVAL;
    }

    // Find nearest active player
    let nearestPlayer = null;
    let nearestDistSq = Infinity;

    for (const p of activePlayers) {
      const d2 = distSq(z.x, z.z, p.x, p.z);
      if (d2 < nearestDistSq) {
        nearestDistSq = d2;
        nearestPlayer = p;
      }
    }

    // Pursue player if in agro range (within ~16 meters)
    const agroRangeSq = 16 * 16;
    if (nearestPlayer && nearestDistSq < agroRangeSq) {
      const dist = Math.sqrt(nearestDistSq);
      const dx = (nearestPlayer.x - z.x) / dist;
      const dz = (nearestPlayer.z - z.z) / dist;

      // Three.js character models face +Z, so point their +Z toward the target.
      z.yaw = Math.atan2(dx, dz);

      // Attack if in range
      if (dist <= 1.2) {
        if (now - z.lastAttackTime > z.attackCooldown) {
          z.lastAttackTime = now;
          nearestPlayer.hp = Math.max(0, nearestPlayer.hp - z.damage);
          io.emit('player_hit', {
            playerId: nearestPlayer.id,
            damage: z.damage,
            hp: nearestPlayer.hp,
            attackerId: z.id
          });

          if (nearestPlayer.hp <= 0) {
            nearestPlayer.isDead = true;
            io.emit('player_died', { playerId: nearestPlayer.id, role: nearestPlayer.role });
          }
        }
      } else {
        // Move towards player
        const moveDist = (z.speed * TICK_INTERVAL) / 1000;
        const newX = z.x + dx * moveDist;
        const newZ = z.z + dz * moveDist;

        // Wall collision slide
        if (!isWall(newX, z.z, 0.35)) {
          z.x = newX;
        }
        if (!isWall(z.x, newZ, 0.35)) {
          z.z = newZ;
        }
      }
    }
  }

  // Check Treasure pickup. The Zombie King must be defeated first.
  if (!treasure.collected) {
    if (bossDefeated) {
      for (const p of activePlayers) {
        if (distSq(p.x, p.z, treasure.x, treasure.z) < 1.8 * 1.8) {
          treasure.collected = true;
          treasure.collectedBy = p.id;
          gameState = 'treasure_found';
          io.emit('treasure_collected', {
            collectedBy: p.id,
            playerName: p.role,
            message: `${p.role} found the Golden Treasure! Escape to the Entrance!`
          });
          break;
        }
      }
    }
  } else {
    // Check Victory (Exit to Entrance)
    for (const p of activePlayers) {
      if (distSq(p.x, p.z, worldBase.spawnPos.x, worldBase.spawnPos.z) < 2.5 * 2.5) {
        gameState = 'victory';
        io.emit('game_over', {
          result: 'victory',
          message: 'VICTORY! You escaped the dungeon with the legendary treasure!'
        });
        break;
      }
    }
  }

  // Check Item Pickups
  for (const item of items) {
    if (item.collected) continue;
    for (const p of activePlayers) {
      if (distSq(p.x, p.z, item.x, item.z) < 1.4 * 1.4) {
        item.collected = true;
        if (item.type === 'sword') {
          p.weapon = 'sword';
        } else if (item.type === 'bandage') {
          p.bandages = (p.bandages || 0) + 1;
        } else if (item.type === 'key') {
          p.hasKey = true;
          gateUnlocked = true;
          io.emit('gate_unlocked', { playerId: p.id });
        }
        io.emit('item_collected', {
          itemId: item.id,
          type: item.type,
          playerId: p.id,
          weapon: p.weapon,
          bandages: p.bandages,
          hasKey: p.hasKey || false
        });
        break;
      }
    }
  }

  // Broadcast sync state
  io.emit('world_sync', {
    zombies: zombies.map(z => ({
      id: z.id,
      x: z.x,
      z: z.z,
      yaw: z.yaw,
      hp: z.hp,
      maxHp: z.maxHp,
      type: z.type
    })),
    players,
    gateUnlocked,
    bossDefeated
  });
}, TICK_INTERVAL);

// Socket.IO Connections
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // A fresh classroom party always starts from a clean dungeon.
  if (Object.keys(players).length === 0) {
    resetGame();
  }

  // Assign Hero or Brian role
  const existingRoles = Object.values(players).map(p => p.role);
  let assignedRole = 'Hero';
  if (existingRoles.includes('Hero') && !existingRoles.includes('Brian')) {
    assignedRole = 'Brian';
  } else if (!existingRoles.includes('Hero')) {
    assignedRole = 'Hero';
  } else {
    assignedRole = `Explorer_${Object.keys(players).length + 1}`;
  }

  const spawnOffset = assignedRole === 'Hero' ? -1.0 : 1.0;
  const newPlayer = {
    id: socket.id,
    role: assignedRole,
    x: worldBase.spawnPos.x + spawnOffset,
    z: worldBase.spawnPos.z,
    yaw: Math.PI,
    pitch: 0,
    hp: 100,
    maxHp: 100,
    weapon: 'fist',
    bandages: 1,
    hasKey: false,
    isDead: false
  };

  players[socket.id] = newPlayer;

  // Send initial world configuration to this player
  socket.emit('init_game', {
    selfId: socket.id,
    ...getFullState()
  });

  // Notify others
  socket.broadcast.emit('player_joined', newPlayer);

  // Player position update from client
  socket.on('player_move', (data) => {
    const p = players[socket.id];
    if (!p || p.isDead) return;

    // Use generous collision bounds on server so client movement is smooth
    if (!isWall(data.x, data.z, 0.2)) {
      p.x = data.x;
      p.z = data.z;
    }
    p.yaw = data.yaw || 0;
    p.pitch = data.pitch || 0;

    socket.broadcast.emit('player_moved', {
      id: socket.id,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch
    });
  });

  // Player attack
  socket.on('player_attack', () => {
    const p = players[socket.id];
    if (!p || p.isDead) return;

    const range = p.weapon === 'sword' ? 3.2 : 2.2;
    const damage = p.weapon === 'sword' ? 30 : 12;

    // Broadcast swing animation to other players
    socket.broadcast.emit('player_swung', { playerId: socket.id, weapon: p.weapon });

    // Check hit zombies in front arc
    let hitCount = 0;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.hp <= 0) continue;

      const d = Math.sqrt(distSq(p.x, p.z, z.x, z.z));
      if (d <= range) {
        // Angle check: vector from player to zombie vs player forward vector
        const forwardX = -Math.sin(p.yaw);
        const forwardZ = -Math.cos(p.yaw);
        const toZX = (z.x - p.x) / d;
        const toZZ = (z.z - p.z) / d;
        const dot = forwardX * toZX + forwardZ * toZZ;

        if (dot > 0.4) { // within ~66 degree cone
          z.hp = Math.max(0, z.hp - damage);
          z.hitCooldown = 250;

          // Knockback
          const kbDist = 0.7;
          const kbX = z.x + forwardX * kbDist;
          const kbZ = z.z + forwardZ * kbDist;
          if (!isWall(kbX, kbZ, 0.35)) {
            z.x = kbX;
            z.z = kbZ;
          }

          io.emit('zombie_hit', {
            zombieId: z.id,
            damage,
            hp: z.hp,
            attackerId: p.id,
            x: z.x,
            z: z.z
          });

          // Zombie killed
          if (z.hp <= 0) {
            io.emit('zombie_killed', { zombieId: z.id, killerId: p.id });

            if (z.type === 'boss') {
              bossDefeated = true;
              io.emit('boss_defeated', { killerId: p.id });
            }

            // 45% chance to drop bandage
            if (z.type !== 'boss' && Math.random() < 0.45) {
              const droppedBandage = {
                id: `bandage_drop_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                type: 'bandage',
                x: z.x,
                z: z.z,
                collected: false
              };
              items.push(droppedBandage);
              io.emit('item_spawned', droppedBandage);
            }
          }

          hitCount++;
          if (hitCount >= 2) break; // Max 2 hits per swing
        }
      }
    }
  });

  // Player Heal / Bandage
  socket.on('player_heal', () => {
    const p = players[socket.id];
    if (!p || p.isDead) return;

    if (p.bandages > 0 && p.hp < p.maxHp) {
      p.bandages--;
      p.hp = Math.min(p.maxHp, p.hp + 40);
      io.emit('player_healed', {
        playerId: p.id,
        hp: p.hp,
        bandages: p.bandages
      });
    }
  });

  // Switch Role if requested
  socket.on('switch_role', (newRole) => {
    const p = players[socket.id];
    if (!p) return;
    p.role = newRole;
    io.emit('player_role_updated', { playerId: socket.id, role: newRole });
  });

  // Restart trigger
  socket.on('restart_game', () => {
    console.log(`[Game Restart Requested by ${players[socket.id]?.role || socket.id}]`);
    resetGame();
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_left', socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`===================================================`);
  console.log(`Minecraft Dungeon Co-op Server is RUNNING!`);
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`===================================================`);
});
