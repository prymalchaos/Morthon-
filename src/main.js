import { Game } from "./game.js";

const canvas = document.getElementById("game");
const game = new Game(canvas);

function onResize(){
  game.resize();
}
window.addEventListener("resize", onResize, { passive:true });
onResize();

let last = performance.now();
function frame(now){
  const dt = Math.min(0.033, (now - last) / 1000); // clamp
  last = now;

  game.update(dt);
  game.render();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);