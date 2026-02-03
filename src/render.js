export class Renderer{
  constructor(ctx){
    this.ctx = ctx;
    this.vw = 0; this.vh = 0; this.dpr = 1;
  }

  setViewport(w,h,dpr){
    this.vw = w; this.vh = h; this.dpr = dpr;
  }

  // fog: { seen[y][x], visible[y][x] }
  draw(grid, pellets, medkits, player, enemies, exit, floor, keysHave, keysNeed, toast, fog){
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.vw,this.vh);

    const rows = grid.length;
    const cols = grid[0].length;

    const pad = 20 * this.dpr;
    const cell = Math.floor(Math.min((this.vw - pad*2) / cols, (this.vh - pad*2) / rows));
    const ox = Math.floor((this.vw - cell*cols) / 2);
    const oy = Math.floor((this.vh - cell*rows) / 2);

    ctx.fillStyle = "#050812";
    ctx.fillRect(0,0,this.vw,this.vh);

    const isVisible = (x,y) => !!(fog?.visible?.[y]?.[x]);
    const isSeen = (x,y) => !!(fog?.seen?.[y]?.[x]);

    // Walls (base)
    ctx.fillStyle = "rgba(80,150,255,0.18)";
    for (let y=0;y<rows;y++){
      for (let x=0;x<cols;x++){
        if (grid[y][x] === 0){
          ctx.fillRect(ox + x*cell, oy + y*cell, cell, cell);
        }
      }
    }

    // Exit portal (only if visible OR previously seen)
    if (exit && (isVisible(exit.x, exit.y) || isSeen(exit.x, exit.y))){
      const ex = ox + exit.x*cell + cell/2;
      const ey = oy + exit.y*cell + cell/2;

      const unlocked = (keysHave >= keysNeed);

      ctx.fillStyle = unlocked ? "rgba(180,120,255,0.28)" : "rgba(180,120,255,0.12)";
      ctx.beginPath();
      ctx.arc(ex, ey, Math.floor(cell*0.44), 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = unlocked ? "rgba(220,190,255,0.95)" : "rgba(220,190,255,0.45)";
      ctx.lineWidth = Math.max(1, Math.floor(2*this.dpr));
      ctx.beginPath();
      ctx.arc(ex, ey, Math.floor(cell*0.32), 0, Math.PI*2);
      ctx.stroke();

      ctx.fillStyle = unlocked ? "rgba(220,190,255,0.95)" : "rgba(220,190,255,0.60)";
      ctx.font = `${Math.floor(cell*0.55)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unlocked ? "⟡" : "🔒", ex, ey);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Pellets (only when currently visible)
    ctx.fillStyle = "rgba(231,240,255,0.9)";
    const r = Math.max(2*this.dpr, Math.floor(cell*0.14));
    for (const key of pellets){
      const [x,y] = key.split(",").map(Number);
      if (!isVisible(x,y)) continue;
      const cx = ox + x*cell + cell/2;
      const cy = oy + y*cell + cell/2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
    }

    // Medkits (only when currently visible)
    for (const key of medkits){
      const [x,y] = key.split(",").map(Number);
      if (!isVisible(x,y)) continue;

      const cx = ox + x*cell + cell/2;
      const cy = oy + y*cell + cell/2;

      ctx.fillStyle = "rgba(120,255,160,0.20)";
      ctx.beginPath();
      ctx.arc(cx, cy, Math.floor(cell*0.28), 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = "rgba(120,255,160,0.95)";
      ctx.lineWidth = Math.max(1, Math.floor(2*this.dpr));
      ctx.beginPath();
      ctx.moveTo(cx - cell*0.12, cy);
      ctx.lineTo(cx + cell*0.12, cy);
      ctx.moveTo(cx, cy - cell*0.12);
      ctx.lineTo(cx, cy + cell*0.12);
      ctx.stroke();
    }

    // Enemies (only when visible)
    for (const e of enemies){
      if (e.isBoss){
        // draw boss trail segments only if visible
        if (Array.isArray(e.trail)){
          for (let i=e.trail.length-1;i>=0;i--){
            const seg = e.trail[i];
            const tx = seg.px;
            const ty = seg.py;
            if (!isVisible(Math.round(tx), Math.round(ty))) continue;

            const sx = ox + seg.px*cell + cell/2;
            const sy = oy + seg.py*cell + cell/2;
            const t = (i+1) / (e.trail.length+1);
            ctx.fillStyle = `rgba(140,255,180,${0.10 + 0.25*t})`;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.floor(cell*(0.18 + 0.08*t)), 0, Math.PI*2);
            ctx.fill();
          }
        }

        // boss head only if visible
        if (!isVisible(e.x, e.y)) continue;

        const ex = ox + e.px*cell + cell/2;
        const ey = oy + e.py*cell + cell/2;

        ctx.fillStyle = "rgba(140,255,180,0.88)";
        ctx.beginPath();
        ctx.arc(ex, ey, Math.floor(cell*0.50), 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = "rgba(5,8,18,0.75)";
        ctx.lineWidth = Math.max(1, Math.floor(2*this.dpr));
        ctx.beginPath();
        ctx.moveTo(ex - cell*0.18, ey - cell*0.06);
        ctx.lineTo(ex - cell*0.05, ey - cell*0.10);
        ctx.moveTo(ex + cell*0.05, ey - cell*0.10);
        ctx.lineTo(ex + cell*0.18, ey - cell*0.06);
        ctx.stroke();

        ctx.strokeStyle = "rgba(220,255,230,0.55)";
        ctx.beginPath();
        ctx.arc(ex, ey, Math.floor(cell*0.62), 0, Math.PI*2);
        ctx.stroke();

        continue;
      }

      // normal enemy
      if (!isVisible(e.x, e.y)) continue;

      const ex = ox + e.px*cell + cell/2;
      const ey = oy + e.py*cell + cell/2;

      ctx.fillStyle = "rgba(255,120,170,0.92)";
      ctx.beginPath();
      ctx.arc(ex, ey, Math.floor(cell*0.30), 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = "rgba(5,8,18,0.75)";
      ctx.lineWidth = Math.max(1, Math.floor(2*this.dpr));
      ctx.beginPath();
      ctx.moveTo(ex - cell*0.14, ey);
      ctx.lineTo(ex + cell*0.14, ey);
      ctx.stroke();
    }

    // Player (always visible)
    const px = ox + player.px*cell + cell/2;
    const py = oy + player.py*cell + cell/2;
    ctx.fillStyle = "rgba(120,255,220,0.95)";
    ctx.beginPath();
    ctx.arc(px, py, Math.floor(cell*0.32), 0, Math.PI*2);
    ctx.fill();

    // --- Soft fog overlay: unseen very dark, seen-but-not-visible dim ---
    if (fog?.seen && fog?.visible){
      for (let y=0;y<rows;y++){
        for (let x=0;x<cols;x++){
          const vis = isVisible(x,y);
          if (vis) continue;

          const seen = isSeen(x,y);
          // Soft fog values
          ctx.fillStyle = seen ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.82)";
          ctx.fillRect(ox + x*cell, oy + y*cell, cell, cell);
        }
      }
    }

    // HUD
    ctx.fillStyle = "rgba(231,240,255,0.88)";
    ctx.font = `${14*this.dpr}px system-ui`;
    ctx.fillText(`Floor: ${floor}`, 12*this.dpr, 18*this.dpr);
    ctx.fillText(`HP: ${player.stats.hp}/${player.stats.maxHp}  XP: ${player.stats.xp}`, 12*this.dpr, 38*this.dpr);
    ctx.fillText(`Keys: ${keysHave}/${keysNeed}`, 12*this.dpr, 58*this.dpr);

    const wt = player.gear?.weaponTier ?? 1;
    const at = player.gear?.armorTier ?? 1;
    ctx.fillStyle = "rgba(220,190,255,0.78)";
    ctx.font = `${12*this.dpr}px system-ui`;
    ctx.fillText(`Gear: Weapon T${wt}  Armor T${at}`, 12*this.dpr, 78*this.dpr);

    // Toast message
    if (toast?.text){
      ctx.fillStyle = "rgba(5,8,18,0.55)";
      const tw = Math.min(this.vw - 24*this.dpr, 520*this.dpr);
      const th = 30*this.dpr;
      const tx = 12*this.dpr;
      const ty = 92*this.dpr;
      ctx.fillRect(tx, ty, tw, th);

      ctx.fillStyle = "rgba(231,240,255,0.92)";
      ctx.font = `${12*this.dpr}px system-ui`;
      ctx.fillText(toast.text, tx + 10*this.dpr, ty + 20*this.dpr);
    }
  }
}