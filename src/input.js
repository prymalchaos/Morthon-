export class Input {
  constructor() {
    this.dir = null;
    this.queue = null;

    // Keyboard support (desktop)
    window.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") this.queueDir(0, -1);
      if (k === "ArrowDown" || k === "s" || k === "S") this.queueDir(0, 1);
      if (k === "ArrowLeft" || k === "a" || k === "A") this.queueDir(-1, 0);
      if (k === "ArrowRight" || k === "d" || k === "D") this.queueDir(1, 0);
    });

    // Build a proper symmetrical D-pad (cross)
    this.buildDpad();
  }

  queueDir(x, y) {
    this.queue = { x, y };
  }

  consumeDirection() {
    if (!this.queue) return null;
    const d = this.queue;
    this.queue = null;
    return d;
  }

  buildDpad() {
    // Container
    const wrap = document.createElement("div");
    wrap.id = "dpad-wrap";
    wrap.style.position = "fixed";
    wrap.style.left = "12px";
    wrap.style.bottom = "12px";
    wrap.style.zIndex = "9999";
    wrap.style.width = "156px";
    wrap.style.height = "156px";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "repeat(3, 1fr)";
    wrap.style.gridTemplateRows = "repeat(3, 1fr)";
    wrap.style.gap = "10px";
    wrap.style.touchAction = "none";
    wrap.style.userSelect = "none";

    // Button factory
    const mk = (label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.width = "100%";
      b.style.height = "100%";
      b.style.borderRadius = "16px";
      b.style.border = "1px solid rgba(255,255,255,0.18)";
      b.style.background = "rgba(231,240,255,0.08)";
      b.style.color = "rgba(231,240,255,0.92)";
      b.style.fontFamily = "system-ui";
      b.style.fontSize = "20px";
      b.style.backdropFilter = "blur(6px)";
      b.style.webkitBackdropFilter = "blur(6px)";
      b.style.padding = "0";
      b.style.margin = "0";
      b.style.touchAction = "none";
      b.style.userSelect = "none";
      return b;
    };

    // Create the 3x3 cross (only cardinal buttons + center nub)
    const empty = () => {
      const d = document.createElement("div");
      d.style.width = "100%";
      d.style.height = "100%";
      return d;
    };

    const up = mk("▲");
    const left = mk("◀");
    const center = mk("●");
    const right = mk("▶");
    const down = mk("▼");

    // Center nub is just decorative but feels better under thumb
    center.style.opacity = "0.55";
    center.disabled = true;

    // Placement:
    // [ ][ U ][ ]
    // [ L][ C ][ R]
    // [ ][ D ][ ]
    wrap.appendChild(empty());
    wrap.appendChild(up);
    wrap.appendChild(empty());

    wrap.appendChild(left);
    wrap.appendChild(center);
    wrap.appendChild(right);

    wrap.appendChild(empty());
    wrap.appendChild(down);
    wrap.appendChild(empty());

    // Pointer handlers: tap or hold repeat direction (mobile friendliness)
    const bind = (btn, x, y) => {
      let held = false;
      let raf = null;

      const tick = () => {
        if (!held) return;
        this.queueDir(x, y);
        raf = requestAnimationFrame(tick);
      };

      const start = (e) => {
        e.preventDefault();
        held = true;
        this.queueDir(x, y);
        raf = requestAnimationFrame(tick);
      };

      const stop = (e) => {
        e.preventDefault();
        held = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      };

      btn.addEventListener("pointerdown", start, { passive: false });
      btn.addEventListener("pointerup", stop, { passive: false });
      btn.addEventListener("pointercancel", stop, { passive: false });
      btn.addEventListener("pointerleave", stop, { passive: false });
    };

    bind(up, 0, -1);
    bind(down, 0, 1);
    bind(left, -1, 0);
    bind(right, 1, 0);

    document.body.appendChild(wrap);
  }
}