// src/game.js
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

    // Battle overlay + mode
    this.battleUI = new BattleUI();
    this.mode = "explore"; // "explore" | "battle"
    this.currentEnemyId = null;

    this.battleUI.onExit = () => {
      this.mode = "explore";
      // For now: remove the enemy you collided with (feels like a victory/escape)
      if (this.currentEnemyId != null) {
        this.enemies = this.enemies.filter((e) => e.id !== this.currentEnemyId);
        this.currentEnemyId = null;
      }
    };

    // World config
    this.cols = 21; // odd feels more Pac-ish
    this.rows = 27;

    this.resetRun();
  }

  resetRun() {
    const { grid, pellets, start } = generateMaze(this.cols, this.rows);

    this.grid = grid; // 0 = wall, 1 = floor
    this.pellets = pellets; // Set of "x,y"
    this.player = {
      x: start.x,
      y: start.y,
      px: start.x, // precise float position for smooth movement
      py: start.y,
      dir: { x: 0, y: 0 },
      nextDir: { x: 0, y: 0 },
      speed: 10.0, // tiles/sec
    };

    // Enemies
    this.enemyIdCounter = 1;
    this.enemies = this.spawnEnemies(4);
    this.currentEnemyId = null;

    // Ensure we're in explore mode on reset
    this.mode = "explore";
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

    // Input (mobile buttons / keyboard / swipe)
    const wanted = this.input.consumeDirection();
    if (wanted) this.player.nextDir = wanted;

    // Move player
    this.stepPlayer(dt);

    // Move enemies
    for (const e of this.enemies) {
      this.stepEnemy(e, dt);
    }

    // Pick up pellets
    const key = `${this.player.x},${this.player.y}`;
    if (this.pellets.has(key)) this.pellets.delete(key);

    // Collision -> battle
    const hit = this.checkEnemyCollision();
    if (hit) {
      this.mode = "battle";
      this.currentEnemyId = hit.id;
      this.battleUI.open(hit);
    }
  }

  render() {
    this.renderer.draw(this.grid, this.pellets, this.player, this.enemies);
  }

  // ---------- Movement helpers ----------

  isFloor(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.grid[y][x] === 1;
  }

  canMove(x, y, dx, dy) {
    if (dx === 0 && dy === 0) return false;
    return this.isFloor(x + dx, y + dy);
  }

  stepPlayer(dt) {
    const p = this.player;

    // Close to center means we can safely change direction
    const nearCenter =
      Math.abs(p.px - p.x) < 0.001 && Math.abs(p.py - p.y) < 0.001;

    if (nearCenter) {
      // Snap to center
      p.px = p.x;
      p.py = p.y;

      // Try apply queued direction if valid
      if (this.canMove(p.x, p.y, p.nextDir.x, p.nextDir.y)) {
        p.dir = { ...p.nextDir };
      } else if (!this.canMove(p.x, p.y, p.dir.x, p.dir.y)) {
        // Can't continue current direction -> stop
        p.dir = { x: 0, y: 0 };
      }
    }

    const vx = p.dir.x * p.speed;
    const vy = p.dir.y * p.speed;
    if (vx === 0 && vy === 0) return;

    p.px += vx * dt;
    p.py += vy * dt;

    // Move to nearest tile center if it's valid
    const tx = Math.round(p.px);
    const ty = Math.round(p.py);

    if (this.isFloor(tx, ty)) {
      p.x = tx;
      p.y = ty;
    } else {
      // hit wall -> clamp back
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

    while (enemies.length < n && tries < 2000) {
      tries++;

      const x = 1 + Math.floor(Math.random() * (this.cols - 2));
      const y = 1 + Math.floor(Math.random() * (this.rows - 2));

      if (!this.isFloor(x, y)) continue;

      // Don't spawn on player
      if (x === this.player.x && y === this.player.y) continue;

      // Don't spawn too close to player
      const dist = Math.abs(x - this.player.x) + Math.abs(y - this.player.y);
      if (dist < 6) continue;

      enemies.push({
        id: this.enemyIdCounter++,
        name: "Void Drone",
        x,
        y,
        px: x,
        py: y,
        dir: { x: 0, y: 0 },
        nextDir: { x: 0, y: 0 },
        speed: 7.0,
        hp: 10,
        maxHp: 10,
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
      // Greedy-ish chase with intentional imperfections
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

      // Sometimes choose a random option to avoid being too perfect
      if (Math.random() < 0.25) {
        return options[Math.floor(Math.random() * options.length)];
      }
      return best;
    }

    // Wanderer: avoid reversing unless necessary
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