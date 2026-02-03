export class BattleUI{
  constructor(){
    this.el = document.getElementById("encounter");
    this.enemyName = document.getElementById("enemy-name");
    this.enemyHp = document.getElementById("enemy-hp");
    this.rollOut = document.getElementById("roll-out");

    this.btnRoll = document.getElementById("btn-roll");
    this.btnExit = document.getElementById("btn-exit");

    this.isOpen = false;
    this.onExit = null;

    this.btnRoll.addEventListener("click", () => {
      // true uniform 1..20
      const roll = this.rollD20();
      this.rollOut.textContent = `${roll}`;
    });

    this.btnExit.addEventListener("click", () => {
      this.close();
      if (this.onExit) this.onExit();
    });
  }

  open(enemy){
    this.isOpen = true;
    this.enemyName.textContent = enemy.name;
    this.enemyHp.textContent = `${enemy.hp} / ${enemy.maxHp}`;
    this.rollOut.textContent = "-";
    this.el.classList.remove("hidden");
  }

  close(){
    this.isOpen = false;
    this.el.classList.add("hidden");
  }

  // Uses crypto when available (better RNG than Math.random)
  rollD20(){
    if (crypto?.getRandomValues){
      const buf = new Uint32Array(1);
      // rejection sampling to avoid modulo bias
      const max = 0xFFFFFFFF;
      const limit = max - (max % 20);
      while (true){
        crypto.getRandomValues(buf);
        const v = buf[0];
        if (v < limit) return (v % 20) + 1;
      }
    }
    return Math.floor(Math.random() * 20) + 1;
  }
}