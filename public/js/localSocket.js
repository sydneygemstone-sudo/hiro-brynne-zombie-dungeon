(() => {
  window.__SINGLEPLAYER__ = true;

  const MAP = [
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

  const CELL_SIZE = 2;
  const MAP_HEIGHT = MAP.length;
  const MAP_WIDTH = MAP[0].length;
  const SELF_ID = 'local-player';

  class LocalSocket {
    constructor() {
      this.handlers = new Map();
      this.started = false;
      this.players = {};
      this.zombies = [];
      this.items = [];
      this.spawnPos = { x: 7, z: 4 };
      this.treasurePos = { x: 24, z: 62 };
      this.gatePositions = [];
      this.gateUnlocked = false;
      this.bossDefeated = false;
      this.treasure = null;
      this.gameState = 'playing';
      this.zombieId = 1;
      this.loop = null;
      this.parseWorld();
    }

    on(event, handler) {
      if (!this.handlers.has(event)) this.handlers.set(event, []);
      this.handlers.get(event).push(handler);
      if (event === 'init_game' && !this.started) {
        this.started = true;
        queueMicrotask(() => {
          this.reset(false);
          this.clientEmit('init_game', {
            selfId: SELF_ID,
            ...this.fullState()
          });
          this.loop = setInterval(() => this.tick(), 50);
        });
      }
      return this;
    }

    emit(event, data) {
      const p = this.players[SELF_ID];
      if (!p && event !== 'restart_game') return;

      if (event === 'player_move') {
        if (!p.isDead && !this.isWall(data.x, data.z, 0.2)) {
          p.x = data.x;
          p.z = data.z;
        }
        p.yaw = data.yaw || 0;
        p.pitch = data.pitch || 0;
      } else if (event === 'player_attack') {
        this.playerAttack();
      } else if (event === 'player_heal') {
        if (!p.isDead && p.bandages > 0 && p.hp < p.maxHp) {
          p.bandages -= 1;
          p.hp = Math.min(p.maxHp, p.hp + 40);
          this.clientEmit('player_healed', {
            playerId: SELF_ID,
            hp: p.hp,
            bandages: p.bandages
          });
        }
      } else if (event === 'switch_role') {
        p.role = data;
        this.clientEmit('player_role_updated', { playerId: SELF_ID, role: data });
      } else if (event === 'restart_game') {
        this.reset(true);
      }
    }

    clientEmit(event, payload) {
      const list = this.handlers.get(event) || [];
      for (const handler of list) handler(payload);
    }

    parseWorld() {
      this.baseZombieSpawns = [];
      this.baseItems = [];
      this.gatePositions = [];

      for (let r = 0; r < MAP_HEIGHT; r++) {
        for (let c = 0; c < MAP_WIDTH; c++) {
          const ch = MAP[r][c];
          const x = (c + 0.5) * CELL_SIZE;
          const z = (r + 0.5) * CELL_SIZE;

          if (ch === 'T') {
            this.treasurePos = { x, z };
          } else if (ch === 'W') {
            this.baseItems.push({ id: `sword_${this.baseItems.length}`, type: 'sword', x, z });
          } else if (ch === 'B') {
            this.baseItems.push({ id: `bandage_${this.baseItems.length}`, type: 'bandage', x, z });
          } else if (ch === 'K') {
            this.baseItems.push({ id: 'crypt_key', type: 'key', x, z });
          } else if (ch === 'D') {
            this.gatePositions.push({ x, z });
          } else if (ch === 'Z') {
            this.baseZombieSpawns.push({ type: 'normal', x, z });
          } else if (ch === 'J') {
            this.baseZombieSpawns.push({ type: 'baby', x, z });
          } else if (ch === 'G') {
            this.baseZombieSpawns.push({ type: 'boss', x, z });
          }
        }
      }
    }

    reset(emitReset) {
      this.gameState = 'playing';
      this.gateUnlocked = false;
      this.bossDefeated = false;
      this.zombieId = 1;

      this.players = {
        [SELF_ID]: {
          id: SELF_ID,
          role: 'Hero',
          x: this.spawnPos.x,
          z: this.spawnPos.z,
          yaw: Math.PI,
          pitch: 0,
          hp: 100,
          maxHp: 100,
          weapon: 'fist',
          bandages: 1,
          hasKey: false,
          isDead: false
        }
      };

      this.items = this.baseItems.map(item => ({ ...item, collected: false }));
      this.zombies = this.baseZombieSpawns.map(spawn => {
        const isBaby = spawn.type === 'baby';
        const isBoss = spawn.type === 'boss';
        const maxHp = isBoss ? 180 : (isBaby ? 20 : 35);
        return {
          id: `z_${this.zombieId++}`,
          type: spawn.type,
          x: spawn.x,
          z: spawn.z,
          hp: maxHp,
          maxHp,
          speed: isBoss ? 1.55 : (isBaby ? 3.1 : 1.75),
          damage: isBoss ? 18 : (isBaby ? 8 : 12),
          attackCooldown: isBoss ? 1050 : (isBaby ? 800 : 1200),
          lastAttackTime: 0,
          yaw: 0,
          hitCooldown: 0
        };
      });

      this.treasure = {
        x: this.treasurePos.x,
        z: this.treasurePos.z,
        collected: false,
        collectedBy: null
      };

      if (emitReset) this.clientEmit('game_reset', this.fullState());
    }

    fullState() {
      return {
        gameState: this.gameState,
        players: this.players,
        zombies: this.publicZombies(),
        items: this.items,
        treasure: this.treasure,
        gateUnlocked: this.gateUnlocked,
        bossDefeated: this.bossDefeated,
        gatePositions: this.gatePositions,
        spawnPos: this.spawnPos,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        cellSize: CELL_SIZE,
        mapData: MAP
      };
    }

    publicZombies() {
      return this.zombies.map(z => ({
        id: z.id,
        x: z.x,
        z: z.z,
        yaw: z.yaw,
        hp: z.hp,
        maxHp: z.maxHp,
        type: z.type
      }));
    }

    distSq(x1, z1, x2, z2) {
      const dx = x1 - x2;
      const dz = z1 - z2;
      return dx * dx + dz * dz;
    }

    isWall(x, z, radius = 0.35) {
      const minC = Math.floor((x - radius) / CELL_SIZE);
      const maxC = Math.floor((x + radius) / CELL_SIZE);
      const minR = Math.floor((z - radius) / CELL_SIZE);
      const maxR = Math.floor((z + radius) / CELL_SIZE);

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (r < 0 || r >= MAP_HEIGHT || c < 0 || c >= MAP_WIDTH) return true;
          if (MAP[r][c] === '#') return true;
          if (!this.gateUnlocked && MAP[r][c] === 'D') return true;
        }
      }
      return false;
    }

    playerAttack() {
      const p = this.players[SELF_ID];
      if (!p || p.isDead || this.gameState === 'victory' || this.gameState === 'defeat') return;

      const range = p.weapon === 'sword' ? 3.2 : 2.2;
      const damage = p.weapon === 'sword' ? 30 : 12;
      const forwardX = -Math.sin(p.yaw);
      const forwardZ = -Math.cos(p.yaw);
      let hitCount = 0;

      for (const z of this.zombies) {
        if (z.hp <= 0) continue;
        const d = Math.sqrt(this.distSq(p.x, p.z, z.x, z.z));
        if (d <= 0.001 || d > range) continue;

        const toZX = (z.x - p.x) / d;
        const toZZ = (z.z - p.z) / d;
        const dot = forwardX * toZX + forwardZ * toZZ;
        if (dot <= 0.4) continue;

        z.hp = Math.max(0, z.hp - damage);
        z.hitCooldown = 250;
        const kbX = z.x + forwardX * 0.7;
        const kbZ = z.z + forwardZ * 0.7;
        if (!this.isWall(kbX, kbZ, 0.35)) {
          z.x = kbX;
          z.z = kbZ;
        }

        this.clientEmit('zombie_hit', {
          zombieId: z.id,
          damage,
          hp: z.hp,
          attackerId: SELF_ID,
          x: z.x,
          z: z.z
        });

        if (z.hp <= 0) {
          this.clientEmit('zombie_killed', { zombieId: z.id, killerId: SELF_ID });
          if (z.type === 'boss') {
            this.bossDefeated = true;
            this.clientEmit('boss_defeated', { killerId: SELF_ID });
          } else if (Math.random() < 0.45) {
            const drop = {
              id: `bandage_drop_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              type: 'bandage',
              x: z.x,
              z: z.z,
              collected: false
            };
            this.items.push(drop);
            this.clientEmit('item_spawned', drop);
          }
        }

        hitCount += 1;
        if (hitCount >= 2) break;
      }
    }

    tick() {
      if (this.gameState === 'victory' || this.gameState === 'defeat') return;

      const p = this.players[SELF_ID];
      if (!p) return;
      const now = Date.now();

      if (!p.isDead) {
        for (const z of this.zombies) {
          if (z.hp <= 0) continue;
          if (z.hitCooldown > 0) z.hitCooldown -= 50;

          const d2 = this.distSq(z.x, z.z, p.x, p.z);
          if (d2 >= 16 * 16) continue;

          const d = Math.sqrt(d2) || 0.001;
          const dx = (p.x - z.x) / d;
          const dz = (p.z - z.z) / d;
          z.yaw = Math.atan2(dx, dz);

          if (d <= 1.2) {
            if (now - z.lastAttackTime > z.attackCooldown) {
              z.lastAttackTime = now;
              p.hp = Math.max(0, p.hp - z.damage);
              this.clientEmit('player_hit', {
                playerId: SELF_ID,
                damage: z.damage,
                hp: p.hp,
                attackerId: z.id
              });
              if (p.hp <= 0) {
                p.isDead = true;
                this.gameState = 'defeat';
                this.clientEmit('game_over', {
                  result: 'defeat',
                  message: 'The dungeon claimed you. Try again and use the key, sword and bandages wisely!'
                });
              }
            }
          } else {
            const step = z.speed * 0.05;
            const nx = z.x + dx * step;
            const nz = z.z + dz * step;
            if (!this.isWall(nx, z.z, 0.35)) z.x = nx;
            if (!this.isWall(z.x, nz, 0.35)) z.z = nz;
          }
        }

        for (const item of this.items) {
          if (item.collected) continue;
          if (this.distSq(p.x, p.z, item.x, item.z) >= 1.4 * 1.4) continue;

          item.collected = true;
          if (item.type === 'sword') {
            p.weapon = 'sword';
          } else if (item.type === 'bandage') {
            p.bandages += 1;
          } else if (item.type === 'key') {
            p.hasKey = true;
            this.gateUnlocked = true;
            this.clientEmit('gate_unlocked', { playerId: SELF_ID });
          }

          this.clientEmit('item_collected', {
            itemId: item.id,
            type: item.type,
            playerId: SELF_ID,
            weapon: p.weapon,
            bandages: p.bandages,
            hasKey: p.hasKey
          });
        }

        if (!this.treasure.collected && this.bossDefeated &&
            this.distSq(p.x, p.z, this.treasure.x, this.treasure.z) < 1.8 * 1.8) {
          this.treasure.collected = true;
          this.treasure.collectedBy = SELF_ID;
          this.gameState = 'treasure_found';
          this.clientEmit('treasure_collected', {
            collectedBy: SELF_ID,
            playerName: p.role,
            message: `${p.role} found the Golden Treasure! Escape to the Entrance!`
          });
        }

        if (this.treasure.collected &&
            this.distSq(p.x, p.z, this.spawnPos.x, this.spawnPos.z) < 2.5 * 2.5) {
          this.gameState = 'victory';
          this.clientEmit('game_over', {
            result: 'victory',
            message: 'VICTORY! You defeated the Zombie King and escaped with the legendary treasure!'
          });
        }
      }

      this.clientEmit('world_sync', {
        zombies: this.publicZombies(),
        players: this.players,
        gateUnlocked: this.gateUnlocked,
        bossDefeated: this.bossDefeated
      });
    }
  }

  const localSocket = new LocalSocket();
  window.io = () => localSocket;
})();