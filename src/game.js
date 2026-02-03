import { generateMaze } from "./maze.js";
import { Input } from "./input.js";
import { Renderer } from "./render.js";

export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha:false });

    this.input = new Input();
    this.renderer = new Renderer(this.ctx);

    // World config
    this.cols = 21; // odd feels more Pac-ish
    this.rows = 27;

    this.resetRun();
  }

  resetRun(){
    const { grid, pellets, start } = generateMaze(this.cols, this.rows);

    this.grid = grid;         // 0 = wall, 1 = floor
    this.pellets = pellets;   // Set of "x,y" keys
    this.player = {
      x: start.x,
      y: start.y,
      px: start.x, // precise position for smooth tweening
      py: start.y,
      dir: {x:0,y:0},
      nextDir: {x:0,y:0},
      speed: 10.0, // tiles per second
    };
  }

  resize(){
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.renderer.setViewport(this.canvas.width, this.canvas.height, dpr);
  }

  update(dt){
    // Read input
    const wanted = this.input.consumeDirection(); // {x,y} or null
    if (wanted) this.player.nextDir = wanted;

    // Movement: Pac-Man style, but smooth between tile centers
    this.stepPlayer(dt);

    // Pickup
    const key = `${this.player.x},${this.player.y}`;
    if (this.pellets.has(key)) this.pellets.delete(key);
  }

  stepPlayer(dt){
    const p = this.player;

    // If we're close to a tile center, we can change direction
    const nearCenter = (Math.abs(p.px - p.x) < 0.001) && (Math.abs(p.py - p.y) < 0.001);
    if (nearCenter){
      // Snap cleanly
      p.px = p.x; p.py = p.y;

      // Try apply nextDir if valid
      if (this.canMove(p.x, p.y, p.nextDir.x, p.nextDir.y)){
        p.dir = { ...p.nextDir };
      } else if (!this.canMove(p.x, p.y, p.dir.x, p.dir.y)){
        p.dir = {x:0,y:0};
      }
    }

    // Move smoothly toward next tile
    const vx = p.dir.x * p.speed;
    const vy = p.dir.y * p.speed;

    if (vx === 0 && vy === 0) return;

    p.px += vx * dt;
    p.py += vy * dt;

    // Determine which tile we are heading into
    const tx = Math.round(p.px);
    const ty = Math.round(p.py);

    // If we crossed into a new tile center, update integer coords
    if (this.isFloor(tx, ty)){
      p.x = tx; p.y = ty;
    } else {
      // Hit wall, clamp back to center
      p.px = p.x; p.py = p.y;
      p.dir = {x:0,y:0};
    }
  }

  isFloor(x,y){
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.grid[y][x] === 1;
  }

  canMove(x,y,dx,dy){
    if (dx === 0 && dy === 0) return false;
    return this.isFloor(x + dx, y + dy);
  }

  render(){
    this.renderer.draw(this.grid, this.pellets, this.player);
  }
}