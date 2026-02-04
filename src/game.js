import { generateMaze } from "./maze.js";
import { Input } from "./input.js";
import { Renderer } from "./render.js";
import { BattleUI } from "./battle.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function keyOf(x, y) {
  return `${x},${y}`;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.input = new Input();
    this.renderer = new Renderer(this.ctx);
    this.battleUI = new BattleUI();

    // Maze dimensions
    this.cols = 21;
    this.rows = 27;

    // State
    this.floor = 1;
    this.mode = "explore"; // explore | battle | modal
    this.currentEnemyId = null;

    // World objects
    this.grid = null;             // 0 wall, 1 floor
    this.pellets = new Set();     // Cells
    this.medkits = new Set();     // Set<"x,y">
    this.loot = [];               // [{x,y,type,rarity,tier,source}]
    this.enemies = [];            // [{...}]
    this.exit = null;             // {x,y}
    this.store = { x: -1, y: -1, open: false, usedRerollThisFloor: false };

    // Keys gate exit
    this.keysHave = 0;
    this.keysNeed = 0;

    // Boss phase tracking
    this.bossPhase = 1;

    // Toast
    this.toast = { text: "", t: 0 };

    // Fog of war
    this.fog = {
      radius: 5,
      seen: [],
      visible: []
    };

    // Scan pulse
    this.scan = {
      bonusRadius: 4,
      active: 0,
      cooldown: 0,
      duration: 3.0,
      cooldownMax: 12.0,
      cellCost: 6
    };

    // UI
    this.initScanButton();
    this.initOverlayUI();
    this.initDebugPanel();

    // URL override
    try {
      const qs = new URLSearchParams(window.location.search);
      const f = parseInt(qs.get("floor") || qs.get("level") || "0", 10);
      if (Number.isFinite(f) && f >= 1) this.floor = f;
    } catch (_) {}

    // Toggle “in battle” CSS state so controls hide
    this._setBattleState = (on) => {
      document.body.classList.toggle("in-battle", !!on);
    };

    // Battle callbacks
    this.battleUI.onWin = (enemySnapshot) => {
      const isBoss = !!enemySnapshot.isBoss;

      if (isBoss) {
        this.handleBossPhaseWin(enemySnapshot);
        return;
      }

      // Win vs normal enemy
      const xpGain = enemySnapshot.xpValue ?? 5;
      this.player.stats.xp += xpGain;

      // Keys: each enemy grants one key
      this.keysHave = Math.min(this.keysNeed, this.keysHave + 1);

      // small heal on win
      this.healPlayer(2);

      // chance to drop a medkit
      const dropChance = this.floor <= 2 ? 0.55 : 0.35;
      if (Math.random() < dropChance && enemySnapshot?.x != null && enemySnapshot?.y != null) {
        this.medkits.add(keyOf(enemySnapshot.x, enemySnapshot.y));
      }

      // chance to drop loot
      const lootChance = this.floor <= 2 ? 0.22 : 0.30;
      if (Math.random() < lootChance && enemySnapshot?.x != null && enemySnapshot?.y != null) {
        this.spawnLootAt(enemySnapshot.x, enemySnapshot.y, { source: "drop" });
      }

      // remove enemy from world
      if (this.currentEnemyId != null) {
        this.enemies = this.enemies.filter((e) => e.id !== this.currentEnemyId);
        this.currentEnemyId = null;
      }
    };

    this.battleUI.onLose = () => {
      // Full reset
      this.floor = 1;
      this.resetRun(true);
      this.battleUI.close();
      this.mode = "explore";
      this.currentEnemyId = null;
      this._setBattleState(false);
      this.toastMessage("Reset to Floor 1", 1.4);
    };

    this.battleUI.onExit = () => {
      // Exit battle UI back to explore
      this.mode = "explore";
      this._setBattleState(false);
    };

    // Start game
    this.resetRun(true);
  }

  // ----------------------------
  // UI: Scan button
  // ----------------------------
  initScanButton() {
    const btn = document.createElement("button");
    btn.id = "scan-btn";
    btn.textContent = "SCAN";
    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.bottom = "14px";
    btn.style.zIndex = "9999";
    btn.style.padding = "10px 12px";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid rgba(255,255,255,0.20)";
    btn.style.background = "rgba(30,60,110,0.55)";
    btn.style.color = "rgba(231,240,255,0.95)";
    btn.style.fontFamily = "system-ui";
    btn.style.fontSize = "12px";
    btn.style.letterSpacing = "0.5px";

    btn.addEventListener("click", () => this.tryScan());
    document.body.appendChild(btn);
    this.scanBtn = btn;

    this.updateScanButtonText();
  }

  updateScanButtonText() {
    if (!this.scanBtn) return;

    if (this.scan.cooldown > 0) {
      this.scanBtn.textContent = `SCAN ${this.scan.cooldown.toFixed(0)}s`;
      this.scanBtn.style.opacity = "0.7";
    } else {
      this.scanBtn.textContent = `SCAN (-${this.scan.cellCost})`;
      this.scanBtn.style.opacity = "1";
    }
  }

  tryScan() {
    if (this.mode !== "explore") return;

    const cells = this.player.stats.cells || 0;

    if (this.scan.cooldown > 0) {
      this.toastMessage(`Scan recharging: ${this.scan.cooldown.toFixed(0)}s`, 1.0);
      return;
    }
    if (cells < this.scan.cellCost) {
      this.toastMessage(`Need ${this.scan.cellCost} Cells to scan.`, 1.2);
      return;
    }

    this.player.stats.cells = cells - this.scan.cellCost;
    this.scan.active = this.scan.duration;
    this.scan.cooldown = this.scan.cooldownMax;

    this.toastMessage(`RADAR PULSE (-${this.scan.cellCost} Cells)`, 1.0);
  }

  // ----------------------------
  // UI: Modal overlay (store etc.)
  // ----------------------------
  initOverlayUI() {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.zIndex = "10000";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "14px";

    const modal = document.createElement("div");
    modal.style.width = "min(520px, 92vw)";
    modal.style.borderRadius = "14px";
    modal.style.border = "1px solid rgba(255,255,255,0.18)";
    modal.style.background = "rgba(5,8,18,0.92)";
    modal.style.color = "rgba(231,240,255,0.92)";
    modal.style.fontFamily = "system-ui";
    modal.style.padding = "14px";

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.ui = { overlay, modal };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeModal();
    });
  }

  openModal(renderFn) {
    if (!this.ui?.overlay || !this.ui?.modal) return;
    this.mode = "modal";
    this.ui.modal.innerHTML = "";
    renderFn(this.ui.modal);
    this.ui.overlay.style.display = "flex";
  }

  closeModal() {
    if (!this.ui?.overlay) return;
    this.ui.overlay.style.display = "none";
    this.ui.modal.innerHTML = "";
    if (this.mode === "modal") this.mode = "explore";
  }

  // ----------------------------
  // UI: Debug panel
  // ----------------------------
  initDebugPanel() {
    const btn = document.createElement("button");
    btn.id = "dev-btn";
    btn.textContent = "DEV";

    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.bottom = "66px"; // above scan
    btn.style.zIndex = "9999";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(255,255,255,0.25)";
    btn.style.background = "rgba(5,8,18,0.65)";
    btn.style.color = "rgba(231,240,255,0.90)";
    btn.style.fontFamily = "system-ui";
    btn.style.fontSize = "12px";
    btn.style.opacity = "0.35";
    btn.style.transition = "opacity 140ms ease";

    btn.addEventListener("pointerdown", () => (btn.style.opacity = "1"));
    btn.addEventListener("pointerup", () => (btn.style.opacity = "0.35"));

    const panel = document.createElement("div");
    panel.id = "dev-panel";
    panel.style.position = "fixed";
    panel.style.right = "10px";
    panel.style.bottom = "112px";
    panel.style.zIndex = "9999";
    panel.style.padding = "10px";
    panel.style.borderRadius = "12px";
    panel.style.border = "1px solid rgba(255,255,255,0.18)";
    panel.style.background = "rgba(5,8,18,0.85)";
    panel.style.color = "rgba(231,240,255,0.92)";
    panel.style.fontFamily = "system-ui";
    panel.style.fontSize = "12px";
    panel.style.width = "220px";
    panel.style.display = "none";

    const title = document.createElement("div");
    title.textContent = "Debug: Level Select";
    title.style.marginBottom = "8px";
    title.style.fontWeight = "600";

    const row1 = document.createElement("div");
    row1.style.display = "flex";
    row1.style.gap = "8px";
    row1.style.alignItems = "center";
    row1.style.marginBottom = "8px";

    const label = document.createElement("div");
    label.textContent = "Floor:";
    label.style.width = "44px";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = String(this.floor);
    input.style.flex = "1";
    input.style.padding = "6px 8px";
    input.style.borderRadius = "10px";
    input.style.border = "1px solid rgba(255,255,255,0.18)";
    input.style.background = "rgba(231,240,255,0.07)";
    input.style.color = "rgba(231,240,255,0.92)";
    input.style.outline = "none";

    row1.appendChild(label);
    row1.appendChild(input);

    const mkBtn = (txt) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.padding = "6px 8px";
      b.style.borderRadius = "10px";
      b.style.border = "1px solid rgba(255,255,255,0.18)";
      b.style.background = "rgba(231,240,255,0.08)";
      b.style.color = "rgba(231,240,255,0.92)";
      b.style.fontFamily = "system-ui";
      b.style.fontSize = "12px";
      return b;
    };

    const row2 = document.createElement("div");
    row2.style.display = "flex";
    row2.style.gap = "6px";
    row2.style.marginBottom = "8px";

    const bMinus = mkBtn("−1");
    const bPlus = mkBtn("+1");
    const bGo = mkBtn("Go");
    row2.appendChild(bMinus);
    row2.appendChild(bPlus);
    row2.appendChild(bGo);

    const row3 = document.createElement("div");
    row3.style.display = "flex";
    row3.style.gap = "6px";
    row3.style.marginBottom = "8px";

    const bBoss = mkBtn("Next Boss");
    const bReset = mkBtn("Reset Run");
    row3.appendChild(bBoss);
    row3.appendChild(bReset);

    const hint = document.createElement("div");
    hint.style.opacity = "0.75";
    hint.style.lineHeight = "1.25";
    hint.textContent = "Tip: start at a floor via ?floor=3";

    panel.appendChild(title);
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(row3);
    panel.appendChild(hint);

    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      input.value = String(this.floor);
      btn.style.opacity = panel.style.display === "none" ? "0.35" : "1";
    });

    bMinus.addEventListener("click", () => {
      const f = Math.max(1, (parseInt(input.value || "1", 10) || 1) - 1);
      input.value = String(f);
      this.setFloor(f, false);
    });

    bPlus.addEventListener("click", () => {
      const f = Math.max(1, (parseInt(input.value || "1", 10) || 1) + 1);
      input.value = String(f);
      this.setFloor(f, false);
    });

    bGo.addEventListener("click", () => {
      const f = Math.max(1, parseInt(input.value || "1", 10) || 1);
      input.value = String(f);
      this.setFloor(f, false);
    });

    bBoss.addEventListener("click", () => {
      const cur = Math.max(1, parseInt(input.value || "1", 10) || 1);
      const nextBoss = cur + ((3 - (cur % 3)) % 3); // next multiple of 3
      input.value = String(nextBoss);
      this.setFloor(nextBoss, false);
      this.toastMessage(`Jumped to Boss Floor ${nextBoss}`, 1.6);
    });

    bReset.addEventListener("click", () => {
      this.resetRun(true);
      this.toastMessage(`Reset run on Floor ${this.floor}`, 1.6);
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }

  setFloor(floor, fullReset = false) {
    this.floor = Math.max(1, floor | 0);

    // close any UI state
    try { this.battleUI.close(); } catch (_) {}
    this._setBattleState(false);

    this.mode = "explore";
    this.currentEnemyId = null;
    this.closeModal();

    this.resetRun(fullReset);
    this.toastMessage(
      `Loaded Floor ${this.floor}${this.isBossFloor(this.floor) ? " (Boss)" : ""}`,
      1.4
    );
  }

  // ----------------------------
  // Utility
  // ----------------------------
  toastMessage(text, seconds = 2.2) {
    this.toast.text = text;
    this.toast.t = seconds;
  }

  healPlayer(amount) {
    this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + amount);
  }

  isWall(x, y) {
    if (!this.grid) return true;
    if (y < 0 || y >= this.grid.length) return true;
    if (x < 0 || x >= this.grid[0].length) return true;
    return this.grid[y][x] === 0;
  }

  isFloor(x, y) {
    return !this.isWall(x, y);
  }

  isBossFloor(floor) {
    return floor % 3 === 0;
  }

  // ----------------------------
  // Fog of war
  // ----------------------------
  initFogArrays() {
    const rows = this.grid.length;
    const cols = this.grid[0].length;
    this.fog.seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    this.fog.visible = Array.from({ length: rows }, () => Array(cols).fill(false));
  }

  computeVisibility() {
    const rows = this.grid.length;
    const cols = this.grid[0].length;

    for (let y = 0; y < rows; y++) this.fog.visible[y].fill(false);

    const bonus = this.scan.active > 0 ? this.scan.bonusRadius : 0;
    const r = (this.fog.radius + bonus) | 0;

    const sx = this.player.x | 0;
    const sy = this.player.y | 0;

    const inBounds = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

    const q = [];
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));

    q.push({ x: sx, y: sy, d: 0 });
    visited[sy][sx] = true;

    while (q.length) {
      const cur = q.shift();
      const { x, y, d } = cur;

      this.fog.visible[y][x] = true;
      this.fog.seen[y][x] = true;

      if (d >= r) continue;

      const nbs = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 }
      ];

      for (const nb of nbs) {
        if (!inBounds(nb.x, nb.y)) continue;

        // walls are “visible” but we don't traverse through
        if (this.grid[nb.y][nb.x] === 0) {
          this.fog.visible[nb.y][nb.x] = true;
          this.fog.seen[nb.y][nb.x] = true;
          continue;
        }

        if (!visited[nb.y][nb.x]) {
          visited[nb.y][nb.x] = true;
          q.push({ x: nb.x, y: nb.y, d: d + 1 });
        }
      }
    }
  }

  // ----------------------------
  // Floor generation / reset
  // ----------------------------
  resetRun(fullReset = false) {
    this._setBattleState(false);

    const { grid, pellets, start, exit } = generateMaze(this.cols, this.rows);
    this.grid = grid;
    this.pellets = pellets;
    this.exit = exit;

    this.medkits = new Set();
    this.loot = [];
    this.enemies = [];
    this.currentEnemyId = null;

    this.store = { x: -1, y: -1, open: false, usedRerollThisFloor: false };

    if (fullReset || !this.player) {
      this.player = {
        x: start.x,
        y: start.y,
        px: start.x,
        py: start.y,
        dir: { x: 0, y: 0 },
        nextDir: { x: 0, y: 0 },
        speed: 10.0,
        stats: {
          hp: 20,
          maxHp: 20,
          ac: 12,
          atk: 3,
          str: 2,
          int: 1,
          xp: 0,
          scrap: 0,
          panicCharges: 0,
          cells: 0,
          passives: {}
        },
        gear: {
          weaponTier: 1,
          armorTier: 1
        }
      };
      this.keysHave = 0;
    } else {
      // carry stats/gear, reposition
      this.player.x = start.x;
      this.player.y = start.y;
      this.player.px = start.x;
      this.player.py = start.y;
      this.player.dir = { x: 0, y: 0 };
      this.player.nextDir = { x: 0, y: 0 };

      // gentle between-floor heal
      const heal = Math.max(1, Math.floor(this.player.stats.maxHp * 0.15));
      this.healPlayer(heal);

      this.keysHave = 0;
    }

    // place store tile
    this.placeStore(start);

    // fog arrays
    this.initFogArrays();

    // spawn content
    if (this.isBossFloor(this.floor)) {
      this.keysNeed = 1; // boss unlocks exit
      this.bossPhase = 1;
      this.spawnBossFloor(start);
      this.toastMessage("BOSS FLOOR: Hunt the serpent.", 2.2);
    } else {
      this.spawnNormalFloor(start);
      this.toastMessage("Hunt keycards to unlock the exit.", 2.2);
    }

    // seed loot
    this.seedLoot(start);

    this.computeVisibility();
    this.updateScanButtonText();

    this.mode = "explore";
  }

  placeStore(start) {
    const candidates = [];
    for (let y = 1; y < this.grid.length - 1; y++) {
      for (let x = 1; x < this.grid[0].length - 1; x++) {
        if (this.grid[y][x] !== 1) continue;
        if (x === start.x && y === start.y) continue;

        const dStart = Math.abs(x - start.x) + Math.abs(y - start.y);
        const dExit = this.exit ? Math.abs(x - this.exit.x) + Math.abs(y - this.exit.y) : 999;
        if (dStart < 6) continue;
        if (dExit < 6) continue;

        candidates.push({ x, y });
      }
    }
    const pick = candidates.length ? choice(candidates) : { x: start.x + 2, y: start.y + 2 };
    this.store.x = pick.x;
    this.store.y = pick.y;
    this.store.open = false;
    this.store.usedRerollThisFloor = false;
  }

  getAllFloorTiles() {
    const tiles = [];
    for (let y = 1; y < this.grid.length - 1; y++) {
      for (let x = 1; x < this.grid[0].length - 1; x++) {
        if (this.grid[y][x] === 1) tiles.push({ x, y });
      }
    }
    return tiles;
  }

  getFloorTilesFarFrom(pos, dist) {
    return this.getAllFloorTiles().filter(
      (t) => (Math.abs(t.x - pos.x) + Math.abs(t.y - pos.y)) >= dist
    );
  }

  spawnNormalFloor(start) {
    const count = clamp(3 + Math.floor((this.floor - 1) * 0.7), 3, 9);
    this.keysNeed = count;

    const tiles = this.getFloorTilesFarFrom(start, 7);
    for (let i = 0; i < count; i++) {
      const t = tiles.length
        ? tiles.splice(randInt(0, tiles.length - 1), 1)[0]
        : { x: start.x + 3 + i, y: start.y };
      this.enemies.push(this.makeEnemy(t.x, t.y, i));
    }

    const medCount = clamp(1 + Math.floor(this.floor / 2), 1, 4);
    const mt = this.getFloorTilesFarFrom(start, 5);
    for (let i = 0; i < medCount; i++) {
      if (!mt.length) break;
      const t = mt.splice(randInt(0, mt.length - 1), 1)[0];
      this.medkits.add(keyOf(t.x, t.y));
    }
  }

  spawnBossFloor(start) {
    const tiles = this.getFloorTilesFarFrom(start, 9);

    const bt = tiles.length
      ? tiles.splice(randInt(0, tiles.length - 1), 1)[0]
      : { x: start.x + 7, y: start.y + 7 };

    const boss = this.makeBoss(bt.x, bt.y);
    this.enemies.push(boss);

    const addCount = 2;
    for (let i = 0; i < addCount; i++) {
      if (!tiles.length) break;
      const t = tiles.splice(randInt(0, tiles.length - 1), 1)[0];
      this.enemies.push(this.makeEnemy(t.x, t.y, 100 + i));
    }

    // some medkits
    const medCount = 2;
    const mt = this.getFloorTilesFarFrom(start, 5);
    for (let i = 0; i < medCount; i++) {
      if (!mt.length) break;
      const t = mt.splice(randInt(0, mt.length - 1), 1)[0];
      this.medkits.add(keyOf(t.x, t.y));
    }
  }

  nextFloor() {
    this.floor += 1;
    this.resetRun(false);
  }

  // ----------------------------
  // Enemies / boss
  // ----------------------------
  makeEnemy(x, y, idx = 0) {
    const id = ((Date.now() + Math.random() * 1e9) | 0) ^ (idx * 2654435761);
    const level = clamp(1 + Math.floor(this.floor * 0.6), 1, 99);

    const hp = clamp(8 + level * 2, 8, 42);
    const atk = clamp(2 + Math.floor(level / 2), 2, 10);

    const names = ["Raidling", "Bulwark Unit", "Drift Stalker", "Void Pup", "Grinder Drone"];
    const name = choice(names);

    return {
      id,
      name,
      isBoss: false,
      x, y,
      px: x, py: y,
      speed: 6.0,
      hp,
      maxHp: hp,
      atk,
      ac: 10 + Math.floor(level / 2),
      xpValue: 6 + level,
      stance: choice(["Sword", "Gun", "Shield"]),
      ai: { t: 0 },
      dir: { x: 0, y: 0 }
    };
  }

  makeBoss(x, y) {
    const id = ((Date.now() + Math.random() * 1e9) | 0) ^ 0xB055;
    const level = clamp(1 + Math.floor(this.floor * 0.7), 1, 99);

    const hp = clamp(24 + level * 4, 40, 180);
    const atk = clamp(4 + Math.floor(level / 2), 5, 16);

    return {
      id,
      name: "Serpent Engine",
      isBoss: true,
      x, y,
      px: x, py: y,
      speed: 7.0,
      hp,
      maxHp: hp,
      atk,
      ac: 12 + Math.floor(level / 2),
      xpValue: 20 + level * 2,
      stance: choice(["Sword", "Gun", "Shield"]),
      ai: { t: 0, phase: 1 },
      dir: { x: 0, y: 0 },
      trail: []
    };
  }

  updateBossTrail(boss) {
    if (!boss.trail) boss.trail = [];
    boss.trail.unshift({ px: boss.px, py: boss.py });

    const maxLen = 18 + (this.bossPhase - 1) * 6;
    if (boss.trail.length > maxLen) boss.trail.length = maxLen;
  }

  handleBossPhaseWin(bossSnapshot) {
    const wasPhase = this.bossPhase;

    if (wasPhase < 3) {
      this.bossPhase += 1;

      // loot each phase
      this.spawnLootAt(bossSnapshot.x, bossSnapshot.y, {
        source: "boss",
        guaranteed: true
      });

      // relocate boss & refresh partial HP
      const boss = this.enemies.find((e) => e.isBoss && e.id === bossSnapshot.id);
      if (boss) {
        const tiles = this.getFloorTilesFarFrom({ x: this.player.x, y: this.player.y }, 10);
        if (tiles.length) {
          const t = choice(tiles);
          boss.x = t.x; boss.y = t.y;
          boss.px = t.x; boss.py = t.y;
          boss.trail = [];
        }
        boss.hp = clamp(Math.floor(boss.maxHp * 0.55), 12, boss.maxHp);
        boss.ai.phase = this.bossPhase;
      }

      this.keysHave = 0;
      this.toastMessage(`Boss retreats... Phase ${this.bossPhase}/3`, 2.0);
    } else {
      // final phase
      this.enemies = this.enemies.filter((e) => e.id !== bossSnapshot.id);

      // unlock exit
      this.keysHave = this.keysNeed;

      this.toastMessage("Boss defeated! Exit unlocked.", 2.2);

      // bigger drop
      this.spawnLootAt(bossSnapshot.x, bossSnapshot.y, {
        source: "boss",
        guaranteed: true,
        epicBias: true
      });

      this.healPlayer(6);
    }
  }

  // ----------------------------
  // Loot
  // ----------------------------
  seedLoot(start) {
    const base = this.floor <= 2 ? 1 : 2;
    const count = clamp(base + (Math.random() < 0.25 ? 1 : 0), 1, 3);

    const tiles = this.getFloorTilesFarFrom(start, 6);
    for (let i = 0; i < count; i++) {
      if (!tiles.length) break;
      const t = tiles.splice(randInt(0, tiles.length - 1), 1)[0];
      this.spawnLootAt(t.x, t.y, { source: "seed" });
    }
  }

  spawnLootAt(x, y, opts = {}) {
    if (this.loot.some((L) => L.x === x && L.y === y)) return;

    const type = Math.random() < 0.5 ? "weapon" : "armor";
    let rarity = "common";

    const r = Math.random();
    const bossBonus = opts.source === "boss";
    const epicBias = !!opts.epicBias;

    if (opts.guaranteed && bossBonus) {
      rarity = epicBias ? "epic" : (r < 0.6 ? "rare" : "epic");
    } else {
      if (r < 0.70) rarity = "common";
      else if (r < 0.93) rarity = "rare";
      else rarity = "epic";
      if (bossBonus && r < 0.65) rarity = "rare";
    }

    const floorTier = 1 + Math.floor((this.floor - 1) / 2);
    const bump = rarity === "common" ? 1 : (rarity === "rare" ? 2 : 3);
    const tier = clamp(floorTier + (Math.random() < 0.6 ? 0 : 1) + bump - 1, 1, 99);

    this.loot.push({ x, y, type, rarity, tier, source: opts.source || "drop" });
  }

  pickupLootIfAny() {
    const px = this.player.x | 0;
    const py = this.player.y | 0;

    const idx = this.loot.findIndex((L) => L.x === px && L.y === py);
    if (idx === -1) return;

    const item = this.loot[idx];
    this.loot.splice(idx, 1);

    if (item.type === "weapon") {
      const old = this.player.gear.weaponTier || 1;
      const nt = Math.max(old, item.tier);
      this.player.gear.weaponTier = nt;
      this.toastMessage(`Weapon upgraded to T${nt} (${item.rarity})`, 1.6);
    } else {
      const old = this.player.gear.armorTier || 1;
      const nt = Math.max(old, item.tier);
      this.player.gear.armorTier = nt;
      this.toastMessage(`Armor upgraded to T${nt} (${item.rarity})`, 1.6);
    }

    this.player.stats.scrap += (item.rarity === "epic" ? 6 : item.rarity === "rare" ? 3 : 1);
  }

  // ----------------------------
  // Store
  // ----------------------------
  openStore() {
    if (this.mode !== "explore") return;
    if (this.store.open) return;

    this.store.open = true;

    this.openModal((root) => {
      const h = document.createElement("div");
      h.style.fontWeight = "700";
      h.style.marginBottom = "8px";
      h.textContent = "Supply Node";

      const p = document.createElement("div");
      p.style.opacity = "0.85";
      p.style.marginBottom = "12px";
      p.textContent = "Spend Scrap on quick upgrades (simple for now).";

      const info = document.createElement("div");
      info.style.marginBottom = "12px";
      info.style.opacity = "0.9";
      info.textContent =
        `Scrap: ${this.player.stats.scrap} | Weapon T${this.player.gear.weaponTier} | Armor T${this.player.gear.armorTier}`;

      const mk = (label, cost, fn) => {
        const b = document.createElement("button");
        b.textContent = `${label} (${cost} scrap)`;
        b.style.width = "100%";
        b.style.padding = "10px 12px";
        b.style.borderRadius = "12px";
        b.style.border = "1px solid rgba(255,255,255,0.18)";
        b.style.background = "rgba(231,240,255,0.08)";
        b.style.color = "rgba(231,240,255,0.92)";
        b.style.fontFamily = "system-ui";
        b.style.fontSize = "14px";
        b.style.marginBottom = "10px";

        b.addEventListener("click", () => {
          if (this.player.stats.scrap < cost) {
            this.toastMessage("Not enough scrap.", 1.2);
            return;
          }
          this.player.stats.scrap -= cost;
          fn();
          this.closeModal();
          this.store.open = false;
        });

        return b;
      };

      const healBtn = mk("Heal +8", 3, () => {
        this.healPlayer(8);
        this.toastMessage("+8 HP", 1.2);
      });

      const wBtn = mk("Upgrade Weapon +1 tier", 5, () => {
        this.player.gear.weaponTier = (this.player.gear.weaponTier || 1) + 1;
        this.toastMessage(`Weapon now T${this.player.gear.weaponTier}`, 1.3);
      });

      const aBtn = mk("Upgrade Armor +1 tier", 5, () => {
        this.player.gear.armorTier = (this.player.gear.armorTier || 1) + 1;
        this.toastMessage(`Armor now T${this.player.gear.armorTier}`, 1.3);
      });

      const close = document.createElement("button");
      close.textContent = "Close";
      close.style.width = "100%";
      close.style.padding = "10px 12px";
      close.style.borderRadius = "12px";
      close.style.border = "1px solid rgba(255,255,255,0.18)";
      close.style.background = "rgba(231,240,255,0.05)";
      close.style.color = "rgba(231,240,255,0.92)";
      close.style.fontFamily = "system-ui";
      close.style.fontSize = "14px";

      close.addEventListener("click", () => {
        this.closeModal();
        this.store.open = false;
      });

      root.appendChild(h);
      root.appendChild(p);
      root.appendChild(info);
      root.appendChild(healBtn);
      root.appendChild(wBtn);
      root.appendChild(aBtn);
      root.appendChild(close);
    });
  }

  // ----------------------------
  // Movement
  // ----------------------------
  stepPlayer(dt) {
    const p = this.player;

    const cx = Math.round(p.px);
    const cy = Math.round(p.py);
    const nearCenter = (Math.abs(p.px - cx) < 0.12) && (Math.abs(p.py - cy) < 0.12);

    if (nearCenter) {
      p.px = cx;
      p.py = cy;
      p.x = cx;
      p.y = cy;

      const nd = p.nextDir;
      if (nd && (nd.x !== 0 || nd.y !== 0)) {
        const nx = p.x + nd.x;
        const ny = p.y + nd.y;
        if (this.isFloor(nx, ny)) {
          p.dir = { x: nd.x, y: nd.y };
        }
      }

      // stop if blocked
      const nx = p.x + p.dir.x;
      const ny = p.y + p.dir.y;
      if (!this.isFloor(nx, ny)) {
        p.dir = { x: 0, y: 0 };
      }
    }

    p.px += p.dir.x * p.speed * dt;
    p.py += p.dir.y * p.speed * dt;
  }

  stepEnemy(e, dt) {
    e.ai.t += dt;

    const snapX = Math.round(e.px);
    const snapY = Math.round(e.py);
    const nearCenter = (Math.abs(e.px - snapX) < 0.12) && (Math.abs(e.py - snapY) < 0.12);

    const px = this.player.x | 0;
    const py = this.player.y | 0;
    const exT = Math.round(e.px);
    const eyT = Math.round(e.py);

    const playerVisibleToEnemy =
      (Math.abs(exT - px) + Math.abs(eyT - py)) <= 9 && this.isFloor(px, py);

    if (nearCenter) {
      e.px = snapX; e.py = snapY;
      e.x = snapX; e.y = snapY;

      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
      ];

      const options = dirs.filter((d) => this.isFloor(e.x + d.x, e.y + d.y));
      let pick = null;

      if (playerVisibleToEnemy && options.length) {
        let bestD = 1e9;
        const best = [];
        for (const d of options) {
          const nx = e.x + d.x;
          const ny = e.y + d.y;
          const md = Math.abs(nx - px) + Math.abs(ny - py);
          if (md < bestD) {
            bestD = md;
            best.length = 0;
            best.push(d);
          } else if (md === bestD) {
            best.push(d);
          }
        }
        pick = choice(best);
      } else if (options.length) {
        pick = choice(options);
      }

      e.dir = pick || { x: 0, y: 0 };
    }

    e.px += (e.dir?.x || 0) * e.speed * dt;
    e.py += (e.dir?.y || 0) * e.speed * dt;

    if (e.isBoss) this.updateBossTrail(e);
  }

  // ----------------------------
  // Collision to enter battle
  // ----------------------------
  checkEnemyCollision() {
    const px = this.player.x | 0;
    const py = this.player.y | 0;

    for (const e of this.enemies) {
      const ex = Math.round(e.px);
      const ey = Math.round(e.py);
      if (ex === px && ey === py) return e;
    }
    return null;
  }

  // ----------------------------
  // Resize / loop
  // ----------------------------
  resize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.renderer.setViewport(this.canvas.width, this.canvas.height, dpr);
  }

  update(dt) {
    // toast
    if (this.toast.t > 0) {
      this.toast.t = Math.max(0, this.toast.t - dt);
      if (this.toast.t === 0) this.toast.text = "";
    }

    // scan timers
    if (this.scan.active > 0) this.scan.active = Math.max(0, this.scan.active - dt);
    if (this.scan.cooldown > 0) this.scan.cooldown = Math.max(0, this.scan.cooldown - dt);
    this.updateScanButtonText();

    // pause world during battle/modal
    if (this.mode === "battle" || this.mode === "modal") return;

    // input
    const wanted = this.input.consumeDirection();
    if (wanted) this.player.nextDir = wanted;

    // move
    this.stepPlayer(dt);
    this.player.x = Math.round(this.player.px);
    this.player.y = Math.round(this.player.py);

    for (const e of this.enemies) this.stepEnemy(e, dt);
    for (const e of this.enemies) {
      e.x = Math.round(e.px);
      e.y = Math.round(e.py);
    }

    // fog
    this.computeVisibility();

    // pickups
    const pkey = keyOf(this.player.x, this.player.y);

    // pellets => cells (power scan + small sustain)
    if (this.pellets.has(pkey)) {
      this.pellets.delete(pkey);
      this.player.stats.cells = (this.player.stats.cells || 0) + 1;

      // every 10 cells -> +1 HP
      if ((this.player.stats.cells % 10) === 0) {
        this.healPlayer(1);
        this.toastMessage("+1 HP (Cells surge)", 1.0);
      }
    }

    if (this.medkits.has(pkey)) {
      this.medkits.delete(pkey);
      this.healPlayer(7);
      this.toastMessage("+7 HP (Medkit)", 1.2);
    }

    this.pickupLootIfAny();

    // store
    if (this.player.x === this.store.x && this.player.y === this.store.y) {
      this.openStore();
      return;
    }

    // exit
    if (this.exit && this.player.x === this.exit.x && this.player.y === this.exit.y) {
      if (this.keysHave >= this.keysNeed) {
        this.nextFloor();
      } else {
        this.toastMessage(`Exit locked. Keys: ${this.keysHave}/${this.keysNeed}`, 1.0);
      }
      return;
    }

    // battle engage
    const hit = this.checkEnemyCollision();
    if (hit) {
      this.mode = "battle";
      this.currentEnemyId = hit.id;
      this._setBattleState(true);

      hit.stance = hit.stance || choice(["Sword", "Gun", "Shield"]);
      this.battleUI.open(hit, this.player);
    }
  }

  render() {
    this.renderer.draw(
      this.grid,
      this.pellets,
      this.medkits,
      this.loot,
      this.store,
      this.player,
      this.enemies,
      this.exit,
      this.floor,
      this.keysHave,
      this.keysNeed,
      this.toast,
      this.fog,
      this.scan
    );
  }
}