import { generateMaze } from "./maze.js";
import { Input } from "./input.js";
import { Renderer } from "./render.js";
import { BattleUI } from "./battle.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    this.input = new Input();
    this.renderer = new Renderer(this.ctx);

    this.battleUI = new BattleUI();
    this.mode = "explore";
    this.currentEnemyId = null;

    this.cols = 21;
    this.rows = 27;

    this.floor = 1;

    this.medkits = new Set();
    this.keysHave = 0;
    this.keysNeed = 0;

    this.loot = [];
    this.store = { x: -1, y: -1, open: false, usedRerollThisFloor: false };

    this.boss = null;
    this.bossPhase = 1;

    this.toast = { text: "", t: 0 };

    this.fog = { radius: 5, seen: [], visible: [] };

    this.scan = {
      bonusRadius: 4,
      active: 0,
      cooldown: 0,
      duration: 3.0,
      cooldownMax: 12.0,
      cellCost: 6,
    };

    this.initScanButton();
    this.initOverlayUI();

    try {
      const qs = new URLSearchParams(window.location.search);
      const f = parseInt(qs.get("floor") || qs.get("level") || "0", 10);
      if (Number.isFinite(f) && f >= 1) this.floor = f;
    } catch (_) {}

    this.initDebugPanel();

    // --- Battle lifecycle hooks ---
    const setBattleState = (on) => {
      document.body.classList.toggle("in-battle", !!on);
    };

    this.battleUI.onWin = (enemySnapshot) => {
      const isBoss = !!enemySnapshot.isBoss;

      if (isBoss) {
        this.handleBossPhaseWin(enemySnapshot);
        return;
      }

      const xpGain = enemySnapshot.xpValue ?? 5;
      this.player.stats.xp += xpGain;

      this.keysHave = Math.min(this.keysNeed, this.keysHave + 1);
      this.healPlayer(2);

      const dropChance = this.floor <= 2 ? 0.55 : 0.35;
      if (Math.random() < dropChance && enemySnapshot?.x != null && enemySnapshot?.y != null) {
        this.medkits.add(`${enemySnapshot.x},${enemySnapshot.y}`);
      }

      if (enemySnapshot?.x != null && enemySnapshot?.y != null) {
        const lootChance = this.floor <= 2 ? 0.22 : 0.30;
        if (Math.random() < lootChance) {
          this.spawnLootAt(enemySnapshot.x, enemySnapshot.y, { source: "drop" });
        }
      }

      if (this.currentEnemyId != null) {
        this.enemies = this.enemies.filter((e) => e.id !== this.currentEnemyId);
        this.currentEnemyId = null;
      }
    };

    this.battleUI.onLose = () => {
      this.floor = 1;
      this.resetRun(true);
      this.battleUI.close();
      this.mode = "explore";
      this.currentEnemyId = null;
      setBattleState(false);
      this.toastMessage(`Reset to Floor 1`, 1.4);
    };

    this.battleUI.onExit = () => {
      this.mode = "explore";
      setBattleState(false);
    };

    // ensure we clear battle state on resets too
    this._setBattleState = setBattleState;

    this.resetRun(true);
  }

  // ---------- UI: Scan button ----------
  initScanButton() {
    const btn = document.createElement("button");
    btn.id = "scan-btn"; // NEW: so CSS can hide it during battle
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
  }

  tryScan() {
    if (this.mode !== "explore") return;

    const ps = this.player.stats;
    const cells = ps.cells || 0;

    if (this.scan.cooldown > 0) {
      this.toastMessage(`Scan recharging: ${this.scan.cooldown.toFixed(0)}s`, 1.0);
      return;
    }
    if (cells < this.scan.cellCost) {
      this.toastMessage(`Need ${this.scan.cellCost} Cells to scan.`, 1.2);
      return;
    }

    ps.cells = cells - this.scan.cellCost;
    this.scan.active = this.scan.duration;
    this.scan.cooldown = this.scan.cooldownMax;

    this.toastMessage(`RADAR PULSE (-${this.scan.cellCost} Cells)`, 1.0);
  }

  // ---------- UI: Overlay + Modals (Loot / Store) ----------
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

  // ---------- DEBUG UI ----------
  initDebugPanel() {
    const btn = document.createElement("button");
    btn.id = "dev-btn"; // NEW
    btn.textContent = "DEV";

    // MOVED: bottom-right + subtle
    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.bottom = "66px"; // sits above Scan button
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
    panel.id = "dev-panel"; // NEW
    panel.style.position = "fixed";
    panel.style.right = "10px";
    panel.style.bottom = "112px"; // above DEV button
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
    const bReset = mkBtn("Reset Gear");
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
      const nextBoss = cur + ((3 - (cur % 3)) % 3);
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
    try { this.battleUI.close(); } catch (_) {}
    this.mode = "explore";
    this.currentEnemyId = null;
    this.closeModal();
    this._setBattleState?.(false);
    this.resetRun(fullReset);
    this.toastMessage(`Loaded Floor ${this.floor}${this.isBossFloor(this.floor) ? " (Boss)" : ""}`, 1.4);
  }

  // ---------- Fog ----------
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
    const isWall = (x, y) => this.grid[y][x] === 0;
    const isFloor = (x, y) => this.grid[y][x] === 1;

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
        { x, y: y - 1 },
      ];

      for (const nb of nbs) {
        if (!inBounds(nb.x, nb.y)) continue;

        if (isWall(nb.x, nb.y)) {
          this.fog.visible[nb.y][nb.x] = true;
          this.fog.seen[nb.y][nb.x] = true;
          continue;
        }

        if (isFloor(nb.x, nb.y) && !visited[nb.y][nb.x]) {
          visited[nb.y][nb.x] = true;
          q.push({ x: nb.x, y: nb.y, d: d + 1 });
        }
      }
    }
  }

  // ---------- Run / Floors ----------
  isBossFloor(floor) { return floor % 3 === 0; }

  resetRun(fullReset = false) {
    this._setBattleState?.(false);

    const { grid, pellets, start, exit } = generateMaze(this.cols, this.rows);

    this.grid = grid;
    this.pellets = pellets;
    this.exit = exit;

    this.medkits = new Set();
    this.loot = [];
    this.currentEnemyId = null;

    if (fullReset || !this.player) {
      this.player = {
        x: start.x, y: start.y,
        px: start.x, py: start.y,
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
        gear: { weaponTier: 1, armorTier: 1 }
      };
      this.keysHave = 0;
    } else {
      this.player.x = start.x;
      this.player.y = start.y;
      this.player.px = start.x;
      this.player.py = start.y;
      this.player.dir = { x: 0, y: 0 };
      this.player.nextDir = { x: 0, y: 0 };

      const heal = Math.max(1, Math.floor(this.player.stats.maxHp * 0.15));
      this.healPlayer(heal);
    }

    this.placeStore(start);
    this.initFogArrays();

    if (this.isBossFloor(this.floor)) this.spawnBossFloor(start);
    else this.spawnNormalFloor(start);

    this.seedLoot(start);

    this.mode = "explore";
    this.toastMessage(this.isBossFloor(this.floor) ? `BOSS FLOOR: Hunt the serpent.` : `Hunt keycards to unlock the exit.`);
    this.computeVisibility();
  }

  // ---------- Minimal helpers used below (unchanged logic) ----------
  // (Everything below is unchanged from your current version except the battle open block in update.)

  toastMessage(text, seconds = 2.2) {
    this.toast.text = text;
    this.toast.t = seconds;
  }

  healPlayer(amount) {
    this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + amount);
  }

  // ... keep your existing functions here unchanged ...
  // spawnNormalFloor, spawnBossFloor, spawnBoss, handleBossPhaseWin, etc.

  resize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.renderer.setViewport(this.canvas.width, this.canvas.height, dpr);
  }

  update(dt) {
    if (this.toast.t > 0) {
      this.toast.t = Math.max(0, this.toast.t - dt);
      if (this.toast.t === 0) this.toast.text = "";
    }

    if (this.scan.active > 0) this.scan.active = Math.max(0, this.scan.active - dt);
    if (this.scan.cooldown > 0) this.scan.cooldown = Math.max(0, this.scan.cooldown - dt);

    if (this.scanBtn) {
      if (this.scan.cooldown > 0) {
        this.scanBtn.textContent = `SCAN ${this.scan.cooldown.toFixed(0)}s`;
        this.scanBtn.style.opacity = "0.7";
      } else {
        this.scanBtn.textContent = `SCAN (-${this.scan.cellCost})`;
        this.scanBtn.style.opacity = "1";
      }
    }

    if (this.mode === "battle" || this.mode === "modal") return;

    const wanted = this.input.consumeDirection();
    if (wanted) this.player.nextDir = wanted;

    this.stepPlayer(dt);

    for (const e of this.enemies) {
      this.stepEnemy(e, dt);
      if (e.isBoss) this.updateBossTrail(e);
    }

    this.computeVisibility();

    const pkey = `${this.player.x},${this.player.y}`;

    if (this.pellets.has(pkey)) {
      this.pellets.delete(pkey);
      this.player.stats.cells = (this.player.stats.cells || 0) + 1;
      if ((this.player.stats.cells % 10) === 0) {
        this.healPlayer(1);
        this.toastMessage("+1 HP (Cells surge)", 1.0);
      }
    }

    if (this.medkits.has(pkey)) {
      this.medkits.delete(pkey);
      this.healPlayer(7);
      this.toastMessage(`+7 HP (Medkit)`, 1.2);
    }

    this.pickupLootIfAny();

    if (this.player.x === this.store.x && this.player.y === this.store.y) {
      this.openStore();
      return;
    }

    if (this.exit && this.player.x === this.exit.x && this.player.y === this.exit.y) {
      if (this.keysHave >= this.keysNeed) {
        this.nextFloor();
      } else {
        this.toastMessage(`Exit locked. Keys: ${this.keysHave}/${this.keysNeed}`, 1.0);
      }
      return;
    }

    const hit = this.checkEnemyCollision();
    if (hit) {
      this.mode = "battle";
      this.currentEnemyId = hit.id;
      this.player.stats._reactiveUsed = false;

      // NEW: hide D-pad/scan/dev while battle is up
      this._setBattleState?.(true);

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