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
    this.mode = "explore"; // "explore" | "battle"
    this.currentEnemyId = null;

    this.cols = 21;
    this.rows = 27;

    this.floor = 1;

    this.medkits = new Set();
    this.keysHave = 0;
    this.keysNeed = 0;

    // boss state
    this.boss = null;
    this.bossPhase = 1;

    // toast
    this.toast = { text: "", t: 0 };

    // --- DEBUG: allow URL to force a starting floor ---
    // Use: ?floor=3 or ?level=3
    try {
      const qs = new URLSearchParams(window.location.search);
      const f = parseInt(qs.get("floor") || qs.get("level") || "0", 10);
      if (Number.isFinite(f) && f >= 1) this.floor = f;
    } catch (_) {}

    // --- DEBUG: Level selection panel ---
    this.initDebugPanel();

    this.battleUI.onWin = (enemySnapshot) => {
      const isBoss = !!enemySnapshot.isBoss;

      if (isBoss) {
        this.handleBossPhaseWin(enemySnapshot);
        return;
      }

      // normal enemy rewards
      const xpGain = enemySnapshot.xpValue ?? 5;
      this.player.stats.xp += xpGain;

      // KEYCARD (every enemy drops one)
      this.keysHave = Math.min(this.keysNeed, this.keysHave + 1);

      // small heal-on-kill
      this.healPlayer(2);

      // chance to drop medkit
      const dropChance = this.floor <= 2 ? 0.55 : 0.35;
      if (Math.random() < dropChance && enemySnapshot?.x != null && enemySnapshot?.y != null) {
        this.medkits.add(`${enemySnapshot.x},${enemySnapshot.y}`);
      }

      // remove defeated enemy
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
      this.toastMessage(`Reset to Floor 1`, 1.4);
    };

    this.battleUI.onExit = () => {
      this.mode = "explore";
    };

    this.resetRun(true);
  }

  // ---------- DEBUG UI ----------
  initDebugPanel() {
    // Toggle button
    const btn = document.createElement("button");
    btn.textContent = "DEV";
    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.top = "10px";
    btn.style.zIndex = "9999";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(255,255,255,0.25)";
    btn.style.background = "rgba(5,8,18,0.75)";
    btn.style.color = "rgba(231,240,255,0.95)";
    btn.style.fontFamily = "system-ui";
    btn.style.fontSize = "12px";

    // Panel
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.right = "10px";
    panel.style.top = "48px";
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
    hint.textContent = "Tip: You can also start at a floor via ?floor=3";

    panel.appendChild(title);
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(row3);
    panel.appendChild(hint);

    // wiring
    btn.addEventListener("click", () => {
      panel.style.display = (panel.style.display === "none") ? "block" : "none";
      input.value = String(this.floor);
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
      const nextBoss = cur + ((3 - (cur % 3)) % 3); // if already boss, stays
      input.value = String(nextBoss);
      this.setFloor(nextBoss, false);
      this.toastMessage(`Jumped to Boss Floor ${nextBoss}`, 1.6);
    });

    bReset.addEventListener("click", () => {
      // full reset of player/gear/stats but keep chosen floor
      this.resetRun(true);
      this.toastMessage(`Reset run on Floor ${this.floor}`, 1.6);
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // Small keyboard helper on desktop: `L` toggles panel
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "l") btn.click();
    });
  }

  setFloor(floor, fullReset = false) {
    this.floor = Math.max(1, floor | 0);
    // If a battle UI is open, close it to prevent weird state
    try { this.battleUI.close(); } catch (_) {}
    this.mode = "explore";
    this.currentEnemyId = null;
    this.resetRun(fullReset);
    this.toastMessage(`Loaded Floor ${this.floor}${this.isBossFloor(this.floor) ? " (Boss)" : ""}`, 1.4);
  }

  // ---------- Run / Floors ----------
  isBossFloor(floor) {
    return floor % 3 === 0;
  }

  resetRun(fullReset = false) {
    const { grid, pellets, start, exit } = generateMaze(this.cols, this.rows);

    this.grid = grid;
    this.pellets = pellets;
    this.exit = exit;

    this.medkits = new Set();
    this.currentEnemyId = null;

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
          _pellets: 0
        },
        gear: {
          weaponTier: 1,
          armorTier: 1
        }
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

    if (this.isBossFloor(this.floor)) {
      this.spawnBossFloor(start);
    } else {
      this.spawnNormalFloor(start);
    }

    this.mode = "explore";
    this.toastMessage(this.isBossFloor(this.floor) ? `BOSS FLOOR: Hunt the serpent.` : `Hunt keycards to unlock the exit.`);
  }

  spawnNormalFloor(start) {
    this.boss = null;
    this.bossPhase = 1;

    this.enemyIdCounter = 1;
    this.enemies = this.spawnEnemies(this.enemyCountForFloor(this.floor));
    this.keysNeed = this.enemies.length;
    this.keysHave = 0;

    this.seedOneMedkitFarFromStart(start);
  }

  spawnBossFloor(start) {
    this.enemies = [];
    this.keysNeed = 3;
    this.keysHave = 0;

    this.bossPhase = 1;
    this.boss = this.spawnBoss(start);
    this.enemies.push(this.boss);

    this.seedOneMedkitFarFromStart(start);
    this.seedOneMedkitFarFromStart(start);
  }

  nextFloor() {
    this.floor += 1;
    this.resetRun(false);
  }

  // ---------- Boss ----------
  spawnBoss(start) {
    const pos = this.findFarFloorTile(start, 14);
    const weaponCycle = ["sword", "gun", "shield"];
    const w = weaponCycle[this.bossPhase - 1] || "sword";

    const baseHp = 18 + Math.floor(this.floor * 1.5);
    const phaseHp = Math.floor(baseHp * (0.85 + 0.10 * (this.bossPhase - 1)));

    return {
      id: 999,
      isBoss: true,
      name: "Void Serpent",
      phase: this.bossPhase,
      weaponType: w,
      x: pos.x, y: pos.y,
      px: pos.x, py: pos.y,
      dir: { x: 0, y: 0 },
      speed: 6.2,
      hp: phaseHp,
      maxHp: phaseHp,
      ac: 13 + Math.floor(this.floor * 0.2),
      atk: 3 + Math.floor(this.floor * 0.15),
      dmgSides: 8,
      dmgMod: 1,
      xpValue: 20 + this.floor * 2,
      brain: "chaser",
      trail: []
    };
  }

  handleBossPhaseWin(enemySnapshot) {
    if (this.bossPhase < 3) {
      this.bossPhase += 1;
      this.keysHave = Math.min(this.keysNeed, this.keysHave + 1);

      this.toastMessage(`Boss retreats! Phase ${this.bossPhase}/3… hunt it down.`);

      const start = { x: this.player.x, y: this.player.y };
      this.boss = this.spawnBoss(start);
      this.boss.phase = this.bossPhase;

      this.enemies = [this.boss];

      const drop = this.findFarFloorTile(start, 8);
      this.medkits.add(`${drop.x},${drop.y}`);

      this.healPlayer(4);
      return;
    }

    this.keysHave = this.keysNeed;
    this.toastMessage(`Boss defeated! Loot acquired.`);
    this.applyBossLoot();
    this.enemies = [];
    this.boss = null;
    this.bossPhase = 1;

    this.healPlayer(8);
  }

  applyBossLoot() {
    const roll = Math.random();
    if (roll < 0.55) {
      this.player.gear.weaponTier = Math.min(6, (this.player.gear.weaponTier || 1) + 1);
      const t = this.player.gear.weaponTier;
      this.toastMessage(`Loot: Weapon upgraded to Tier ${t}.`);
      if (t % 2 === 0) this.player.stats.atk += 1;
    } else {
      this.player.gear.armorTier = Math.min(6, (this.player.gear.armorTier || 1) + 1);
      const t = this.player.gear.armorTier;
      this.toastMessage(`Loot: Armor upgraded to Tier ${t}.`);
      this.player.stats.ac += 1;
      this.player.stats.maxHp += 2;
      this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + 2);
    }
  }

  // ---------- Utilities ----------
  toastMessage(text, seconds = 2.2) {
    this.toast.text = text;
    this.toast.t = seconds;
  }

  healPlayer(amount) {
    this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + amount);
  }

  enemyCountForFloor(floor) {
    return Math.min(10, 4 + Math.floor((floor - 1) * 0.8));
  }

  seedOneMedkitFarFromStart(start) {
    let tries = 0;
    while (tries < 2000) {
      tries++;
      const x = 1 + Math.floor(Math.random() * (this.cols - 2));
      const y = 1 + Math.floor(Math.random() * (this.rows - 2));
      if (!this.isFloor(x, y)) continue;
      if (this.exit && x === this.exit.x && y === this.exit.y) continue;

      const dist = Math.abs(x - start.x) + Math.abs(y - start.y);
      if (dist < 10) continue;

      this.medkits.add(`${x},${y}`);
      return;
    }
  }

  findFarFloorTile(from, minDist) {
    let tries = 0;
    while (tries < 4000) {
      tries++;
      const x = 1 + Math.floor(Math.random() * (this.cols - 2));
      const y = 1 + Math.floor(Math.random() * (this.rows - 2));
      if (!this.isFloor(x, y)) continue;
      if (this.exit && x === this.exit.x && y === this.exit.y) continue;

      const dist = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (dist < minDist) continue;

      return { x, y };
    }
    return { x: from.x, y: from.y };
  }

  // ---------- Engine ----------
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

    if (this.mode === "battle") return;

    const wanted = this.input.consumeDirection();
    if (wanted) this.player.nextDir = wanted;

    this.stepPlayer(dt);

    for (const e of this.enemies) {
      this.stepEnemy(e, dt);
      if (e.isBoss) this.updateBossTrail(e);
    }

    const pkey = `${this.player.x},${this.player.y}`;

    if (this.pellets.has(pkey)) {
      this.pellets.delete(pkey);
      this.player.stats._pellets = (this.player.stats._pellets || 0) + 1;
      if (this.player.stats._pellets % 6 === 0) {
        this.healPlayer(1);
      }
    }

    if (this.medkits.has(pkey)) {
      this.medkits.delete(pkey);
      this.healPlayer(7);
      this.toastMessage(`+7 HP (Medkit)`, 1.2);
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
      this.battleUI.open(hit, this.player);
    }
  }

  updateBossTrail(boss) {
    const maxSeg = 12 + (boss.phase * 2);
    if (!boss.trail) boss.trail = [];

    const last = boss.trail[0];
    const dx = last ? Math.abs(last.px - boss.px) : 999;
    const dy = last ? Math.abs(last.py - boss.py) : 999;

    if (!last || (dx + dy) > 0.45) {
      boss.trail.unshift({ px: boss.px, py: boss.py });
      if (boss.trail.length > maxSeg) boss.trail.pop();
    }
  }

  render() {
    this.renderer.draw(
      this.grid,
      this.pellets,
      this.medkits,
      this.player,
      this.enemies,
      this.exit,
      this.floor,
      this.keysHave,
      this.keysNeed,
      this.toast
    );
  }

  // ---------- Grid helpers ----------
  isFloor(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.grid[y][x] === 1;
  }

  canMove(x, y, dx, dy) {
    if (dx === 0 && dy === 0) return false;
    return this.isFloor(x + dx, y + dy);
  }

  // ---------- Player movement ----------
  stepPlayer(dt) {
    const p = this.player;
    const nearCenter =
      Math.abs(p.px - p.x) < 0.001 && Math.abs(p.py - p.y) < 0.001;

    if (nearCenter) {
      p.px = p.x;
      p.py = p.y;

      if (this.canMove(p.x, p.y, p.nextDir.x, p.nextDir.y)) {
        p.dir = { ...p.nextDir };
      } else if (!this.canMove(p.x, p.y, p.dir.x, p.dir.y)) {
        p.dir = { x: 0, y: 0 };
      }
    }

    const vx = p.dir.x * p.speed;
    const vy = p.dir.y * p.speed;
    if (vx === 0 && vy === 0) return;

    p.px += vx * dt;
    p.py += vy * dt;

    const tx = Math.round(p.px);
    const ty = Math.round(p.py);

    if (this.isFloor(tx, ty)) {
      p.x = tx;
      p.y = ty;
    } else {
      p.px = p.x;
      p.py = p.y;
      p.dir = { x: 0, y: 0 };
    }
  }

  isAtCenter(ent) {
    return (
      Math.abs(ent.px - ent.x) < 0.001 && Math.abs(ent.py - ent.y) < 0.001
    );
  }

  // ---------- Enemies ----------
  spawnEnemies(n) {
    const enemies = [];
    let tries = 0;

    const templates = [
      { name: "Void Duelist", weaponType: "sword",  ac: 12, atk: 2, dmgSides: 8, dmgMod: 0, maxHp: 11, xpValue: 7, speed: 7.0 },
      { name: "Gunner Drone", weaponType: "gun",    ac: 11, atk: 3, dmgSides: 6, dmgMod: 1, maxHp: 9,  xpValue: 6, speed: 7.4 },
      { name: "Bulwark Unit", weaponType: "shield", ac: 13, atk: 2, dmgSides: 4, dmgMod: 0, maxHp: 13, xpValue: 8, speed: 6.6 },
    ];

    const hpBonus = Math.floor((this.floor - 1) * 0.6);
    const acBonus = Math.floor((this.floor - 1) * 0.25);

    while (enemies.length < n && tries < 4000) {
      tries++;

      const x = 1 + Math.floor(Math.random() * (this.cols - 2));
      const y = 1 + Math.floor(Math.random() * (this.rows - 2));

      if (!this.isFloor(x, y)) continue;
      if (x === this.player.x && y === this.player.y) continue;
      if (this.exit && x === this.exit.x && y === this.exit.y) continue;

      const dist = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
      if (dist < 6) continue;

      const t = templates[Math.floor(Math.random() * templates.length)];
      const maxHp = t.maxHp + hpBonus;

      enemies.push({
        id: this.enemyIdCounter++,
        name: t.name,
        weaponType: t.weaponType,
        x,
        y,
        px: x,
        py: y,
        dir: { x: 0, y: 0 },
        speed: t.speed,
        hp: maxHp,
        maxHp: maxHp,
        ac: t.ac + acBonus,
        atk: t.atk,
        dmgSides: t.dmgSides,
        dmgMod: t.dmgMod,
        xpValue: t.xpValue,
        brain: Math.random() < 0.35 ? "chaser" : "wander",
        trail: []
      });
    }

    return enemies;
  }

  enemyChooseDir(e) {
    const options = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ].filter((d) => this.canMove(e.x, e.y, d.x, d.y));

    if (options.length === 0) return { x: 0, y: 0 };

    if (e.brain === "chaser") {
      let best = options[0];
      let bestScore = Infinity;

      for (const d of options) {
        const nx = e.x + d.x;
        const ny = e.y + d.y;
        const score =
          Math.abs(nx - this.player.x) + Math.abs(ny - this.player.y);
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      }

      if (Math.random() < 0.25) {
        return options[Math.floor(Math.random() * options.length)];
      }
      return best;
    }

    const reverse = { x: -e.dir.x, y: -e.dir.y };
    const nonReverse = options.filter(
      (d) => !(d.x === reverse.x && d.y === reverse.y)
    );
    const pool = nonReverse.length ? nonReverse : options;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  stepEnemy(e, dt) {
    const nearCenter = this.isAtCenter(e);

    if (nearCenter) {
      e.px = e.x;
      e.py = e.y;
      e.dir = this.enemyChooseDir(e);
    }

    const vx = e.dir.x * e.speed;
    const vy = e.dir.y * e.speed;
    if (vx === 0 && vy === 0) return;

    e.px += vx * dt;
    e.py += vy * dt;

    const tx = Math.round(e.px);
    const ty = Math.round(e.py);

    if (this.isFloor(tx, ty)) {
      e.x = tx;
      e.y = ty;
    } else {
      e.px = e.x;
      e.py = e.y;
      e.dir = { x: 0, y: 0 };
    }
  }

  checkEnemyCollision() {
    for (const e of this.enemies) {
      if (e.x === this.player.x && e.y === this.player.y) return e;
    }
    return null;
  }
}