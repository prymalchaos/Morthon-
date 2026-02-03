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

    // loot pickups
    this.loot = [];

    // store terminal (one per floor)
    this.store = {
      x: -1,
      y: -1,
      open: false,
      usedRerollThisFloor: false
    };

    // boss state
    this.boss = null;
    this.bossPhase = 1;

    // toast
    this.toast = { text: "", t: 0 };

    // fog of war (soft)
    this.fog = {
      radius: 5,
      seen: [],
      visible: []
    };

    // scan (radar pulse)
    this.scan = {
      bonusRadius: 4,
      active: 0,
      cooldown: 0,
      duration: 3.0,
      cooldownMax: 12.0
    };
    this.initScanButton();

    // UI overlays (loot choice + store)
    this.ui = {
      overlay: null,
      modal: null
    };
    this.initOverlayUI();

    // debug: allow URL to force starting floor
    try {
      const qs = new URLSearchParams(window.location.search);
      const f = parseInt(qs.get("floor") || qs.get("level") || "0", 10);
      if (Number.isFinite(f) && f >= 1) this.floor = f;
    } catch (_) {}

    this.initDebugPanel();

    this.battleUI.onWin = (enemySnapshot) => {
      const isBoss = !!enemySnapshot.isBoss;

      if (isBoss) {
        this.handleBossPhaseWin(enemySnapshot);
        return;
      }

      const xpGain = enemySnapshot.xpValue ?? 5;
      this.player.stats.xp += xpGain;

      // every enemy drops a keycard
      this.keysHave = Math.min(this.keysNeed, this.keysHave + 1);

      // small heal-on-kill
      this.healPlayer(2);

      // chance to drop medkit
      const dropChance = this.floor <= 2 ? 0.55 : 0.35;
      if (Math.random() < dropChance && enemySnapshot?.x != null && enemySnapshot?.y != null) {
        this.medkits.add(`${enemySnapshot.x},${enemySnapshot.y}`);
      }

      // chance to drop loot pickup
      if (enemySnapshot?.x != null && enemySnapshot?.y != null) {
        const lootChance = this.floor <= 2 ? 0.22 : 0.30;
        if (Math.random() < lootChance) {
          this.spawnLootAt(enemySnapshot.x, enemySnapshot.y, { source: "drop" });
        }
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

  // ---------- UI: Scan button ----------
  initScanButton() {
    const btn = document.createElement("button");
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
    if (this.scan.cooldown > 0) {
      this.toastMessage(`Scan recharging: ${this.scan.cooldown.toFixed(0)}s`, 1.0);
      return;
    }
    this.scan.active = this.scan.duration;
    this.scan.cooldown = this.scan.cooldownMax;
    this.toastMessage(`RADAR PULSE`, 1.0);
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

    this.ui.overlay = overlay;
    this.ui.modal = modal;

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.closeModal();
    });
  }

  openModal(renderFn) {
    if (!this.ui.overlay || !this.ui.modal) return;
    this.mode = "modal";
    this.ui.modal.innerHTML = "";
    renderFn(this.ui.modal);
    this.ui.overlay.style.display = "flex";
  }

  closeModal() {
    if (!this.ui.overlay) return;
    this.ui.overlay.style.display = "none";
    this.ui.modal.innerHTML = "";
    if (this.mode === "modal") this.mode = "explore";
  }

  // ---------- DEBUG UI ----------
  initDebugPanel() {
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
    hint.textContent = "Tip: start at a floor via ?floor=3";

    panel.appendChild(title);
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(row3);
    panel.appendChild(hint);

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

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "l") btn.click();
    });
  }

  setFloor(floor, fullReset = false) {
    this.floor = Math.max(1, floor | 0);
    try { this.battleUI.close(); } catch (_) {}
    this.mode = "explore";
    this.currentEnemyId = null;
    this.closeModal();
    this.resetRun(fullReset);
    this.toastMessage(`Loaded Floor ${this.floor}${this.isBossFloor(this.floor) ? " (Boss)" : ""}`, 1.4);
  }

  // ---------- Fog of war ----------
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

    const bonus = (this.scan.active > 0) ? this.scan.bonusRadius : 0;
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
        { x, y: y - 1 }
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

  // ---------- Loot ----------
  rollLootRarity({ source = "floor" } = {}) {
    // Tune: drops are slightly juicier than floor spawns
    const r = Math.random();
    if (source === "boss") return "epic";

    const epicChance = source === "drop" ? 0.05 : 0.03;
    const rareChance = source === "drop" ? 0.22 : 0.18;

    if (r < epicChance) return "epic";
    if (r < epicChance + rareChance) return "rare";
    return "common";
  }

  spawnLootAt(x, y, { source = "floor" } = {}) {
    if (this.loot.some(l => l.x === x && l.y === y)) return;

    const type = (Math.random() < 0.55) ? "weapon" : "armor";
    const rarity = this.rollLootRarity({ source });

    const item = {
      x, y,
      type,
      rarity,
      // effects are resolved on pickup (so we can scale to current stats/gear)
      seed: Math.floor(Math.random() * 999999)
    };

    this.loot.push(item);
  }

  seedLoot(start) {
    const isBoss = this.isBossFloor(this.floor);

    // floor loot count
    const count = isBoss ? 1 : (Math.random() < 0.55 ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const p = this.findFarFloorTile(start, 10 + i * 2);
      this.spawnLootAt(p.x, p.y, { source: "floor" });
    }
  }

  rerollLoot() {
    // Replace all existing loot on the floor with new loot at same positions
    if (!this.loot.length) return;
    const positions = this.loot.map(l => ({ x: l.x, y: l.y }));
    this.loot = [];
    for (const p of positions) {
      this.spawnLootAt(p.x, p.y, { source: "floor" });
    }
    this.toastMessage("Loot rerolled.", 1.2);
  }

  lootScrapValue(item) {
    if (item.rarity === "epic") return 18;
    if (item.rarity === "rare") return 9;
    return 4;
  }

  describeLoot(item) {
    const rarityName = item.rarity.toUpperCase();
    const typeName = item.type === "weapon" ? "Weapon Cache" : "Armor Cache";

    const lines = [];
    lines.push(`${rarityName} ${typeName}`);

    if (item.rarity === "common") {
      lines.push(item.type === "weapon" ? "+1 Weapon Tier" : "+1 Armor Tier");
    } else if (item.rarity === "rare") {
      if (item.type === "weapon") lines.push("+1 Weapon Tier, +1 ATK (burst)");
      else lines.push("+1 Armor Tier, +2 Max HP");
    } else {
      // epic
      if (item.type === "weapon") lines.push("+1 Weapon Tier, Passive: Overclock (chance for +1 die)");
      else lines.push("+1 Armor Tier, Passive: Reactive Plating (-1 dmg once per battle)");
    }

    return lines;
  }

  applyLoot(item) {
    const ps = this.player.stats;

    if (item.type === "weapon") {
      this.player.gear.weaponTier = Math.min(6, (this.player.gear.weaponTier || 1) + 1);

      // Rare: immediate ATK bump
      if (item.rarity === "rare") {
        ps.atk += 1;
      }

      // Epic passive: Overclock (chance to add 1 damage die on your attacks)
      if (item.rarity === "epic") {
        ps.passives = ps.passives || {};
        ps.passives.overclock = true;
      }

      this.toastMessage(`Weapon upgraded (${item.rarity}).`, 1.4);
      return;
    }

    if (item.type === "armor") {
      this.player.gear.armorTier = Math.min(6, (this.player.gear.armorTier || 1) + 1);

      // baseline armor effect
      ps.ac += 1;

      // Rare: max HP bump
      if (item.rarity === "rare") {
        ps.maxHp += 2;
        ps.hp = Math.min(ps.maxHp, ps.hp + 2);
      }

      // Epic passive: Reactive Plating (once per battle reduce damage by 1)
      if (item.rarity === "epic") {
        ps.passives = ps.passives || {};
        ps.passives.reactivePlating = true;
      }

      this.toastMessage(`Armor upgraded (${item.rarity}).`, 1.4);
    }
  }

  pickupLootIfAny() {
    const px = this.player.x;
    const py = this.player.y;

    const idx = this.loot.findIndex(l => l.x === px && l.y === py);
    if (idx === -1) return;

    const item = this.loot[idx];
    // remove from floor immediately so you can’t re-trigger
    this.loot.splice(idx, 1);

    this.openLootChoice(item);
  }

  openLootChoice(item) {
    const scrapValue = this.lootScrapValue(item);
    const lines = this.describeLoot(item);

    const mkBtn = (txt) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.padding = "10px 10px";
      b.style.borderRadius = "12px";
      b.style.border = "1px solid rgba(255,255,255,0.18)";
      b.style.background = "rgba(231,240,255,0.08)";
      b.style.color = "rgba(231,240,255,0.92)";
      b.style.fontFamily = "system-ui";
      b.style.fontSize = "14px";
      b.style.width = "100%";
      b.style.marginTop = "10px";
      return b;
    };

    this.openModal((root) => {
      const h = document.createElement("div");
      h.textContent = "SALVAGE";
      h.style.fontSize = "14px";
      h.style.fontWeight = "700";
      h.style.letterSpacing = "0.8px";
      h.style.opacity = "0.95";

      const body = document.createElement("div");
      body.style.marginTop = "10px";
      body.style.lineHeight = "1.35";

      const card = document.createElement("div");
      card.style.padding = "12px";
      card.style.borderRadius = "12px";
      card.style.border = "1px solid rgba(255,255,255,0.14)";
      card.style.background = "rgba(231,240,255,0.05)";

      const t = document.createElement("div");
      t.textContent = lines[0];
      t.style.fontWeight = "700";
      t.style.marginBottom = "6px";

      card.appendChild(t);

      for (let i = 1; i < lines.length; i++) {
        const li = document.createElement("div");
        li.textContent = `• ${lines[i]}`;
        li.style.opacity = "0.9";
        card.appendChild(li);
      }

      const sub = document.createElement("div");
      sub.style.marginTop = "10px";
      sub.style.opacity = "0.8";
      sub.textContent = `Scrap value: +${scrapValue} SCRAP`;

      const bTake = mkBtn("TAKE");
      bTake.style.background = "rgba(120,255,220,0.10)";
      bTake.addEventListener("click", () => {
        this.applyLoot(item);
        this.closeModal();
      });

      const bScrap = mkBtn(`SCRAP (+${scrapValue})`);
      bScrap.style.background = "rgba(255,210,120,0.10)";
      bScrap.addEventListener("click", () => {
        this.player.stats.scrap = (this.player.stats.scrap || 0) + scrapValue;
        this.toastMessage(`Scrapped for +${scrapValue} scrap.`, 1.2);
        this.closeModal();
      });

      const bClose = mkBtn("CLOSE");
      bClose.style.background = "rgba(231,240,255,0.05)";
      bClose.addEventListener("click", () => this.closeModal());

      body.appendChild(card);
      body.appendChild(sub);
      body.appendChild(bTake);
      body.appendChild(bScrap);
      body.appendChild(bClose);

      root.appendChild(h);
      root.appendChild(body);
    });
  }

  // ---------- Store ----------
  placeStore(start) {
    const p = this.findFarFloorTile(start, 11);
    this.store.x = p.x;
    this.store.y = p.y;
    this.store.open = false;
    this.store.usedRerollThisFloor = false;
  }

  openStore() {
    this.store.open = true;

    const mkBtn = (txt) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.padding = "10px 10px";
      b.style.borderRadius = "12px";
      b.style.border = "1px solid rgba(255,255,255,0.18)";
      b.style.background = "rgba(231,240,255,0.08)";
      b.style.color = "rgba(231,240,255,0.92)";
      b.style.fontFamily = "system-ui";
      b.style.fontSize = "14px";
      b.style.width = "100%";
      b.style.marginTop = "10px";
      return b;
    };

    const costMedkit = 8;
    const costHeal = 6;
    const costScan = 10;
    const costReroll = 12;
    const costPanic = 9;

    const buy = (cost, fn, failMsg) => {
      const scrap = this.player.stats.scrap || 0;
      if (scrap < cost) {
        this.toastMessage(failMsg || `Not enough scrap.`, 1.2);
        return false;
      }
      this.player.stats.scrap = scrap - cost;
      fn();
      return true;
    };

    this.openModal((root) => {
      const h = document.createElement("div");
      h.textContent = "STORE TERMINAL";
      h.style.fontSize = "14px";
      h.style.fontWeight = "700";
      h.style.letterSpacing = "0.8px";

      const s = document.createElement("div");
      s.style.marginTop = "8px";
      s.style.opacity = "0.85";
      s.textContent = `Scrap: ${this.player.stats.scrap || 0}`;

      const card = document.createElement("div");
      card.style.marginTop = "10px";
      card.style.padding = "12px";
      card.style.borderRadius = "12px";
      card.style.border = "1px solid rgba(255,255,255,0.14)";
      card.style.background = "rgba(231,240,255,0.05)";
      card.style.lineHeight = "1.35";
      card.innerHTML =
        `<div style="font-weight:700;margin-bottom:6px;">Available</div>
         <div style="opacity:0.9;">• Buy sustain, tune Scan, or gamble a reroll.</div>
         <div style="opacity:0.9;">• Spend scrap (from scrapping loot).</div>`;

      const bMed = mkBtn(`Buy Medkit (+7 HP pickup)  [${costMedkit} scrap]`);
      bMed.addEventListener("click", () => {
        buy(costMedkit, () => {
          // spawn medkit on the terminal tile (so you pick it up immediately by stepping back on it)
          this.medkits.add(`${this.store.x},${this.store.y}`);
          this.toastMessage("Medkit delivered.", 1.2);
          this.closeModal();
        }, `Need ${costMedkit} scrap.`);
      });

      const bHeal = mkBtn(`Repair (+6 HP now)  [${costHeal} scrap]`);
      bHeal.addEventListener("click", () => {
        buy(costHeal, () => {
          this.healPlayer(6);
          this.toastMessage("+6 HP", 1.0);
          this.closeModal();
        }, `Need ${costHeal} scrap.`);
      });

      const bScan = mkBtn(`Scan Cooler (−2s cooldown this run)  [${costScan} scrap]`);
      bScan.addEventListener("click", () => {
        buy(costScan, () => {
          this.scan.cooldownMax = Math.max(6, this.scan.cooldownMax - 2);
          this.toastMessage(`Scan cooldown now ${this.scan.cooldownMax.toFixed(0)}s`, 1.4);
          this.closeModal();
        }, `Need ${costScan} scrap.`);
      });

      const bPanic = mkBtn(`Panic Battery (+1 free Panic)  [${costPanic} scrap]`);
      bPanic.addEventListener("click", () => {
        buy(costPanic, () => {
          this.player.stats.panicCharges = (this.player.stats.panicCharges || 0) + 1;
          this.toastMessage("Panic charge acquired.", 1.2);
          this.closeModal();
        }, `Need ${costPanic} scrap.`);
      });

      const bReroll = mkBtn(
        this.store.usedRerollThisFloor
          ? `Reroll Loot (used)  [${costReroll} scrap]`
          : `Reroll Loot (1x per floor)  [${costReroll} scrap]`
      );
      bReroll.style.opacity = this.store.usedRerollThisFloor ? "0.55" : "1";
      bReroll.disabled = this.store.usedRerollThisFloor;

      bReroll.addEventListener("click", () => {
        if (this.store.usedRerollThisFloor) return;
        buy(costReroll, () => {
          this.rerollLoot();
          this.store.usedRerollThisFloor = true;
          this.closeModal();
        }, `Need ${costReroll} scrap.`);
      });

      const bClose = mkBtn("CLOSE");
      bClose.style.background = "rgba(231,240,255,0.05)";
      bClose.addEventListener("click", () => this.closeModal());

      root.appendChild(h);
      root.appendChild(s);
      root.appendChild(card);
      root.appendChild(bMed);
      root.appendChild(bHeal);
      root.appendChild(bScan);
      root.appendChild(bPanic);
      root.appendChild(bReroll);
      root.appendChild(bClose);
    });
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
    this.loot = [];
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
          _pellets: 0,
          scrap: 0,
          panicCharges: 0,
          passives: {}
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

    // reset per-floor store state
    this.placeStore(start);

    // init fog per floor
    this.initFogArrays();

    if (this.isBossFloor(this.floor)) {
      this.spawnBossFloor(start);
    } else {
      this.spawnNormalFloor(start);
    }

    // seed floor loot after spawns
    this.seedLoot(start);

    this.mode = "explore";
    this.toastMessage(this.isBossFloor(this.floor) ? `BOSS FLOOR: Hunt the serpent.` : `Hunt keycards to unlock the exit.`);

    this.computeVisibility();
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

      // boss phase drops a guaranteed floor loot (rare/epic skew)
      const lp = this.findFarFloorTile(start, 9);
      this.spawnLootAt(lp.x, lp.y, { source: "drop" });

      this.healPlayer(4);
      return;
    }

    this.keysHave = this.keysNeed;
    this.toastMessage(`Boss defeated! Loot cache dropped.`, 1.4);

    // Boss drops a guaranteed EPIC loot pickup (choice-based like everything else)
    const start = { x: this.player.x, y: this.player.y };
    const p = this.findFarFloorTile(start, 6);
    // Force epic by passing source boss
    const type = (Math.random() < 0.5) ? "weapon" : "armor";
    this.loot.push({ x: p.x, y: p.y, type, rarity: "epic", seed: Math.floor(Math.random() * 999999) });

    this.enemies = [];
    this.boss = null;
    this.bossPhase = 1;

    this.healPlayer(8);
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
      if (x === this.store.x && y === this.store.y) continue;

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

    // scan timers
    if (this.scan.active > 0) this.scan.active = Math.max(0, this.scan.active - dt);
    if (this.scan.cooldown > 0) this.scan.cooldown = Math.max(0, this.scan.cooldown - dt);

    // update scan button label
    if (this.scanBtn) {
      if (this.scan.cooldown > 0) {
        this.scanBtn.textContent = `SCAN ${this.scan.cooldown.toFixed(0)}s`;
        this.scanBtn.style.opacity = "0.7";
      } else {
        this.scanBtn.textContent = "SCAN";
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

    // loot pickup -> opens choice modal
    this.pickupLootIfAny();

    // store terminal interaction
    if (this.player.x === this.store.x && this.player.y === this.store.y) {
      // only open if not already open and if no modal currently
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

      // reset per-battle reactive plating usage flag
      this.player.stats._reactiveUsed = false;

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
      if (x === this.store.x && y === this.store.y) continue;

      const dist = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
      if (dist < 6) continue;

      const t = templates[Math.floor(Math.random() * templates.length)];
      const maxHp = t.maxHp + hpBonus;

      enemies.push({
        id: this.enemyIdCounter++,
        name: t.name,
        weaponType: t.weaponType, // first stance (revealed once)
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
        const score = Math.abs(nx - this.player.x) + Math.abs(ny - this.player.y);
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
    const nonReverse = options.filter((d) => !(d.x === reverse.x && d.y === reverse.y));
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