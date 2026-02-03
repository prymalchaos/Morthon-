export class Renderer{
  constructor(ctx){
    this.ctx = ctx;
    this.vw = 0; this.vh = 0; this.dpr = 1;
  }

  setViewport(w,h,dpr){
    this.vw = w; this.vh = h; this.dpr = dpr;
  }

  draw(grid, pellets, player, enemies){
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.vw,this.vh);

    const rows = grid.length;
    const cols = grid[0].length;

    // Fit grid to canvas with padding
    const pad = 20 * this.dpr;
    const cell = Math.floor(Math.min((this.vw - pad*2) / cols, (this.vh - pad*2) / rows));
    const ox = Math.floor((this.vw - cell*cols) / 2);
    const oy = Math.floor((this.vh - cell*rows) / 2);

    // Background
    ctx.fillStyle = "#050812";
    ctx.fillRect(0,0,this.vw,this.vh);

    // Walls
    ctx.fillStyle = "rgba(80,150,255,0.18)";
    for (let y=0;y<rows;y++){
      for (let x=0;x<cols;x++){
        if (grid[y][x] === 0){
          ctx.fillRect(ox + x*cell, oy + y*cell, cell, cell);
        }
      }
    }

    // Pellets
    ctx.fillStyle = "rgba(231,240,255,0.9)";
    const r = Math.max(2*this.dpr, Math.floor(cell*0.14));
    for (const key of pellets){
      const [x,y] = key.split(",").map(Number);
      const cx = ox + x*cell + cell/2;
      const cy = oy + y*cell + cell/2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
    }

    // Player (smooth position)
    const px = ox + player.px*cell + cell/2;
    const py = oy + player.py*cell + cell/2;
    ctx.fillStyle = "rgba(120,255,220,0.95)";
    ctx.beginPath();
    ctx.arc(px, py, Math.floor(cell*0.32), 0, Math.PI*2);
    ctx.fill();
    
        // Enemies
    for (const e of enemies){
      const ex = ox + e.px*cell + cell/2;
      const ey = oy + e.py*cell + cell/2;

      ctx.fillStyle = "rgba(255,120,170,0.92)";
      ctx.beginPath();
      ctx.arc(ex, ey, Math.floor(cell*0.30), 0, Math.PI*2);
      ctx.fill();

      // little “visor” line for vibe
      ctx.strokeStyle = "rgba(5,8,18,0.75)";
      ctx.lineWidth = Math.max(1, Math.floor(2*this.dpr));
      ctx.beginPath();
      ctx.moveTo(ex - cell*0.14, ey);
      ctx.lineTo(ex + cell*0.14, ey);
      ctx.stroke();
    }

    // Tiny HUD
    ctx.fillStyle = "rgba(231,240,255,0.85)";
    ctx.font = `${14*this.dpr}px system-ui`;
    ctx.fillText(`Loot: ${pellets.size}`, 12*this.dpr, 18*this.dpr);
  }
}