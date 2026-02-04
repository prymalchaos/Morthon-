export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.vw = 0; this.vh = 0; this.dpr = 1;
  }

  setViewport(w, h, dpr) {
    this.vw = w; this.vh = h; this.dpr = dpr;
  }

  draw(grid, pellets, medkits, loot, store, player, enemies, exit, floor, keysHave, keysNeed, toast, fog, scan) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.vw, this.vh);

    const rows = grid.length;
    const cols = grid[0].length;

    const pad = 18 * this.dpr;

    // Give the map almost full height now (HUD is compact boxes)
    const usableH = this.vh;
    const cell = Math.floor(Math.min((this.vw - pad * 2) / cols, (usableH - pad * 2) / rows));

    const ox = Math.floor((this.vw - cell * cols) / 2);
    const oy = Math.floor((usableH - cell * rows) / 2);

    ctx.fillStyle = "#050812";
    ctx.fillRect(0, 0, this.vw, this.vh);

    const isVisible = (x, y) => !!(fog?.visible?.[y]?.[x]);
    const isSeen = (x, y) => !!(fog?.seen?.[y]?.[x]);

    // Walls
    ctx.fillStyle = "rgba(80,150,255,0.18)";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] === 0) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }

    // Store
    if (store && store.x >= 0 && (isVisible(store.x, store.y) || isSeen(store.x, store.y))) {
      const cx = ox + store.x * cell + cell / 2;
      const cy = oy + store.y * cell + cell / 2;

      ctx.fillStyle = "rgba(255,210,120,0.12)";
      ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.44), 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "rgba(255,210,120,0.70)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.30), 0, Math.PI * 2); ctx.stroke();

      ctx.fillStyle = "rgba(231,240,255,0.92)";
      ctx.font = `${Math.floor(cell * 0.52)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⌬", cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Exit
    if (exit && (isVisible(exit.x, exit.y) || isSeen(exit.x, exit.y))) {
      const ex = ox + exit.x * cell + cell / 2;
      const ey = oy + exit.y * cell + cell / 2;
      const unlocked = (keysHave >= keysNeed);

      ctx.fillStyle = unlocked ? "rgba(180,120,255,0.28)" : "rgba(180,120,255,0.12)";
      ctx.beginPath(); ctx.arc(ex, ey, Math.floor(cell * 0.44), 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = unlocked ? "rgba(220,190,255,0.95)" : "rgba(220,190,255,0.45)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.beginPath(); ctx.arc(ex, ey, Math.floor(cell * 0.32), 0, Math.PI * 2); ctx.stroke();

      ctx.fillStyle = unlocked ? "rgba(220,190,255,0.95)" : "rgba(220,190,255,0.60)";
      ctx.font = `${Math.floor(cell * 0.55)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unlocked ? "⟡" : "🔒", ex, ey);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Pellets (Cells)
    ctx.fillStyle = "rgba(231,240,255,0.9)";
    const pr = Math.max(2 * this.dpr, Math.floor(cell * 0.14));
    for (const key of pellets) {
      const [x, y] = key.split(",").map(Number);
      if (!isVisible(x, y)) continue;
      const cx = ox + x * cell + cell / 2;
      const cy = oy + y * cell + cell / 2;
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
    }

    // Medkits
    for (const key of medkits) {
      const [x, y] = key.split(",").map(Number);
      if (!isVisible(x, y)) continue;

      const cx = ox + x * cell + cell / 2;
      const cy = oy + y * cell + cell / 2;

      ctx.fillStyle = "rgba(120,255,160,0.20)";
      ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.28), 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "rgba(120,255,160,0.95)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.12, cy); ctx.lineTo(cx + cell * 0.12, cy);
      ctx.moveTo(cx, cy - cell * 0.12); ctx.lineTo(cx, cy + cell * 0.12);
      ctx.stroke();
    }

    // Loot
    for (const item of loot || []) {
      if (!isVisible(item.x, item.y)) continue;

      const cx = ox + item.x * cell + cell / 2;
      const cy = oy + item.y * cell + cell / 2;

      const ringA = (item.rarity === "epic") ? 0.95 : (item.rarity === "rare" ? 0.80 : 0.62);
      const fillA = (item.rarity === "epic") ? 0.18 : (item.rarity === "rare" ? 0.14 : 0.10);

      ctx.fillStyle = item.type === "weapon" ? `rgba(255,210,120,${fillA})` : `rgba(180,200,255,${fillA})`;
      ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.30), 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = item.type === "weapon" ? `rgba(255,210,120,${ringA})` : `rgba(180,200,255,${ringA})`;
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.22), 0, Math.PI * 2); ctx.stroke();

      if (item.rarity !== "common") {
        ctx.strokeStyle = item.rarity === "epic" ? "rgba(220,190,255,0.80)" : "rgba(231,240,255,0.55)";
        ctx.beginPath(); ctx.arc(cx, cy, Math.floor(cell * 0.36), 0, Math.PI * 2); ctx.stroke();
      }

      ctx.fillStyle = "rgba(231,240,255,0.92)";
      ctx.font = `${Math.floor(cell * 0.50)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.type === "weapon" ? "⬆" : "⬒", cx, cy);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Enemies
    for (const e of enemies) {
      if (e.isBoss) {
        if (Array.isArray(e.trail)) {
          for (let i = e.trail.length - 1; i >= 0; i--) {
            const seg = e.trail[i];
            const tx = Math.round(seg.px);
            const ty = Math.round(seg.py);
            if (!isVisible(tx, ty)) continue;

            const sx = ox + seg.px * cell + cell / 2;
            const sy = oy + seg.py * cell + cell / 2;
            const t = (i + 1) / (e.trail.length + 1);
            ctx.fillStyle = `rgba(140,255,180,${0.10 + 0.25 * t})`;
            ctx.beginPath(); ctx.arc(sx, sy, Math.floor(cell * (0.18 + 0.08 * t)), 0, Math.PI * 2); ctx.fill();
          }
        }

        if (!isVisible(e.x, e.y)) continue;

        const ex = ox + e.px * cell + cell / 2;
        const ey = oy + e.py * cell + cell / 2;

        ctx.fillStyle = "rgba(140,255,180,0.88)";
        ctx.beginPath(); ctx.arc(ex, ey, Math.floor(cell * 0.50), 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = "rgba(5,8,18,0.75)";
        ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
        ctx.beginPath();
        ctx.moveTo(ex - cell * 0.18, ey - cell * 0.06); ctx.lineTo(ex - cell * 0.05, ey - cell * 0.10);
        ctx.moveTo(ex + cell * 0.05, ey - cell * 0.10); ctx.lineTo(ex + cell * 0.18, ey - cell * 0.06);
        ctx.stroke();

        ctx.strokeStyle = "rgba(220,255,230,0.55)";
        ctx.beginPath(); ctx.arc(ex, ey, Math.floor(cell * 0.62), 0, Math.PI * 2); ctx.stroke();
        continue;
      }

      if (!isVisible(e.x, e.y)) continue;

      const ex = ox + e.px * cell + cell / 2;
      const ey = oy + e.py * cell + cell / 2;

      ctx.fillStyle = "rgba(255,120,170,0.92)";
      ctx.beginPath(); ctx.arc(ex, ey, Math.floor(cell * 0.30), 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "rgba(5,8,18,0.75)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.beginPath(); ctx.moveTo(ex - cell * 0.14, ey); ctx.lineTo(ex + cell * 0.14, ey); ctx.stroke();
    }

    // Player
    const px = ox + player.px * cell + cell / 2;
    const py = oy + player.py * cell + cell / 2;
    ctx.fillStyle = "rgba(120,255,220,0.95)";
    ctx.beginPath(); ctx.arc(px, py, Math.floor(cell * 0.32), 0, Math.PI * 2); ctx.fill();

    // Fog overlay
    if (fog?.seen && fog?.visible) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const vis = isVisible(x, y);
          if (vis) continue;

          const seen = isSeen(x, y);
          ctx.fillStyle = seen ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.82)";
          ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
        }
      }
    }

    // --- Compact HUD: 2 boxes ---
    const wt = player.gear?.weaponTier ?? 1;
    const at = player.gear?.armorTier ?? 1;
    const hp = player.stats.hp;
    const maxHp = player.stats.maxHp;
    const xp = player.stats.xp || 0;
    const scrap = player.stats.scrap || 0;
    const cells = player.stats.cells || 0;
    const panic = player.stats.panicCharges || 0;

    const scanText =
      scan.cooldown > 0 ? `Scan ${scan.cooldown.toFixed(0)}s` :
      (scan.active > 0 ? `Scan ACTIVE` : `Scan READY`);

    const boxPad = 10 * this.dpr;
    const font = `${12 * this.dpr}px system-ui`;
    ctx.font = font;

    const drawBox = (x, y, lines, alignRight = false) => {
      const lh = 16 * this.dpr;
      const w = Math.floor(240 * this.dpr);
      const h = Math.floor(lines.length * lh + boxPad * 1.2);

      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = Math.max(1, Math.floor(2 * this.dpr));
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "rgba(231,240,255,0.92)";
      ctx.textBaseline = "top";
      ctx.textAlign = alignRight ? "right" : "left";

      const tx = alignRight ? (x + w - boxPad) : (x + boxPad);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], tx, y + boxPad * 0.6 + i * lh);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };

    drawBox(
      10 * this.dpr,
      10 * this.dpr,
      [
        `Floor ${floor}`,
        `HP ${hp}/${maxHp}  Keys ${keysHave}/${keysNeed}`,
        `Gear W${wt} A${at}`,
      ],
      false
    );

    drawBox(
      this.vw - (10 * this.dpr) - Math.floor(240 * this.dpr),
      10 * this.dpr,
      [
        `XP ${xp}`,
        `Scrap ${scrap}  Cells ${cells}`,
        `Panic ${panic}  ${scanText}`,
      ],
      true
    );

    // Toast (near bottom, not blocking top)
    if (toast?.text) {
      const tw = Math.min(this.vw - 24 * this.dpr, 600 * this.dpr);
      const th = 28 * this.dpr;
      const tx = 12 * this.dpr;
      const ty = this.vh - 12 * this.dpr - th;

      ctx.fillStyle = "rgba(5,8,18,0.55)";
      ctx.fillRect(tx, ty, tw, th);

      ctx.fillStyle = "rgba(231,240,255,0.92)";
      ctx.font = `${12 * this.dpr}px system-ui`;
      ctx.textBaseline = "middle";
      ctx.fillText(toast.text, tx + 10 * this.dpr, ty + th / 2);
      ctx.textBaseline = "alphabetic";
    }
  }
}