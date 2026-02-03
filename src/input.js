export class Input {
  constructor(){
    this.queue = null;

    // Buttons
    document.querySelectorAll("#controls button[data-dir]").forEach(btn => {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const dir = btn.dataset.dir;
        this.queue = this.mapDir(dir);
      }, { passive:false });
    });

    // Keyboard (desktop testing)
    window.addEventListener("keydown", (e) => {
      const m = ({
        ArrowUp:"up", ArrowDown:"down", ArrowLeft:"left", ArrowRight:"right",
        w:"up", s:"down", a:"left", d:"right"
      })[e.key];
      if (m) this.queue = this.mapDir(m);
    });

    // Swipe
    let sx=0, sy=0;
    window.addEventListener("pointerdown", (e) => { sx=e.clientX; sy=e.clientY; }, { passive:true });
    window.addEventListener("pointerup", (e) => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (Math.max(adx, ady) < 30) return;

      if (adx > ady) this.queue = { x: dx>0 ? 1 : -1, y:0 };
      else this.queue = { x:0, y: dy>0 ? 1 : -1 };
    }, { passive:true });
  }

  mapDir(dir){
    if (dir === "up") return {x:0,y:-1};
    if (dir === "down") return {x:0,y:1};
    if (dir === "left") return {x:-1,y:0};
    if (dir === "right") return {x:1,y:0};
    return null;
  }

  consumeDirection(){
    const v = this.queue;
    this.queue = null;
    return v;
  }
}