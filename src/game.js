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

    // Persistent run state
    this.floor = 1;

    // Wire battle callbacks
    this.battleUI.onWin = (enemySnapshot) => {
      const xpGain = enemySnapshot.xpValue ?? 5;
      this.player.stats.xp += xpGain;

      if (this.currentEnemyId != null) {
        this.enemies = this.enemies.filter((e) => e.id !== this.currentEnemyId);
        this.currentEnemyId = null;
      }
      // Exit button becomes available in battle UI when it ends
    };

    this.battleUI.onLose = () => {
      // Hard reset
      this.floor = 1;
      this.resetRun(true);
      this.battleUI.close();
      this.mode = "explore";
      this.currentEnemyId = null;
    };

    this.battleUI.onExit = () => {
      this.mode = "explore";
    };

    this.resetRun(true);
  }

  // If fullReset=true, we reset stats too. Otherwise we keep stats/loadout across floors.
  resetRun(fullReset = false) {
    const { grid, pellets, start, exit } = generateMaze(this.cols, this.rows);

    this.grid = grid;
    this.pellets = pellets;
    this.exit = exit;

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
        },
        loadout: {
          melee: { name: "Space Sword", dmgDice: { count: 1, sides: 8 } },
          ranged: { name: "Blaster", dmgDice: { count: 1, sides: 6 } },
        },
      };
    } else {
      // carry stats, just reposition
      this.player.x = start.x;
      this.player.y = start.y;
      this.player.px = start.x;
      this.player.py = start.y;
      this.player.dir = { x: 0, y: 0 };
      this.player.nextDir = { x: 0, y: 0 };

      // tiny heal between floors (feels good)
      const heal = Math.max(1, Math.floor(this.player.stats.maxHp * 0.2));
      this.player.stats.hp = Math.min(this.player.stats.maxHp, this.player.stats.hp + heal);
    }

    this.enemyIdCounter = 1;
    this.enemies = this.spawnEnemies(this.enemyCountForFloor(this.floor));
    this.currentEnemyId = null;

    this.mode = "explore";
  }

  enemyCountForFloor(floor){
    // scales gently
    return Math.min(10, 4 + Math.floor((floor - 1) * 0.8));
  }

  nextFloor(){
    this.floor += 1;
    this.resetRun(false);
  }

  resize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.renderer.setViewport(this.canvas.width, this.canvas.height, dpr);
  }

  update(dt) {
    if (this.mode === "battle") return;

    const wanted = this.input.consumeDirection();
    if (wanted) this.player.nextDir = wanted;

    this.stepPlayer(dt);

    for (const e of this.enemies) {
      this.stepEnemy(e, dt);
    }

    const key = `${this.player.x},${this.player.y}`;
    if (this.pellets.has(key)) this.pellets.delete(key);

    // Step onto portal to go next floor
    if (this.exit && this.player.x === this.exit.x && this.player.y === this.exit.y) {
      this.nextFloor();
      return;
    }

    const hit = this.checkEnemyCollision();
    if (hit) {
      this.mode = "battle";
      this.currentEnemyId = hit.id;
      this.battleUI.open(hit, this.player.stats);
    }
  }

  render() {
    this.renderer.draw(this.grid, this.pellets, this.player, this.enemies, this.exit, this.floor);
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
      { name: "Void Drone", ac: 12, atk: 2, dmgSides: 6, dmgMod: 1, maxHp: 10, xpValue: 6, speed: 7.0 },
      { name: "Corridor Wisp", ac: 11, atk: 3, dmgSides: 4, dmgMod: 2, maxHp: 8,  xpValue: 5, speed: 7.4 },
      { name: "Rust Reaper",  ac: 13, atk: 2, dmgSides: 8, dmgMod: 0, maxHp: 12, xpValue: 8, speed: 6.6 },
    ];

    // difficulty nudge per floor
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