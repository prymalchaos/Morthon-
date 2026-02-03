export class BattleUI{
  constructor(){
    this.el = document.getElementById("encounter");
    this.enemyNameEl = document.getElementById("enemy-name");
    this.enemyHpEl = document.getElementById("enemy-hp");
    this.playerHpEl = document.getElementById("player-hp");
    this.rollOutEl = document.getElementById("roll-out");
    this.logEl = document.getElementById("battle-log");

    this.btnAttack = document.getElementById("btn-attack");
    this.btnTech = document.getElementById("btn-tech");
    this.btnDefend = document.getElementById("btn-defend");
    this.btnPanic = document.getElementById("btn-panic");
    this.btnExit = document.getElementById("btn-exit");

    this.isOpen = false;
    this.turn = "player"; // player | enemy | end
    this.enemy = null;
    this.playerStats = null;
    this.temp = { defendBonus: 0 };

    // callbacks set by Game
    this.onWin = null;   // (enemy) => void
    this.onLose = null;  // () => void
    this.onExit = null;  // () => void (only when battle ended, or for dev)

    this.btnAttack.addEventListener("click", () => this.playerAction("sword"));
    this.btnTech.addEventListener("click", () => this.playerAction("blaster"));
    this.btnDefend.addEventListener("click", () => this.playerAction("defend"));
    this.btnPanic.addEventListener("click", () => this.playerAction("panic"));

    this.btnExit.addEventListener("click", () => {
      // Exit only allowed when battle is over
      if (this.turn !== "end") return;
      this.close();
      if (this.onExit) this.onExit();
    });
  }

  open(enemy, playerStats){
    this.isOpen = true;
    // Clone enemy so battle modifies its own instance; Game will decide outcome
    this.enemy = JSON.parse(JSON.stringify(enemy));
    this.playerStats = playerStats;
    this.turn = "player";
    this.temp = { defendBonus: 0 };

    this.el.classList.remove("hidden");
    this.clearLog();
    this.syncUI();

    this.log(`Combat engaged. ${this.enemy.name} locks on.`);
    this.setButtonsEnabled(true);
  }

  close(){
    this.isOpen = false;
    this.el.classList.add("hidden");
    this.enemy = null;
    this.playerStats = null;
    this.turn = "end";
  }

  syncUI(lastRollText = "-"){
    this.enemyNameEl.textContent = this.enemy?.name ?? "-";
    this.enemyHpEl.textContent = this.enemy ? `${this.enemy.hp} / ${this.enemy.maxHp}` : "-";
    this.playerHpEl.textContent = this.playerStats ? `${this.playerStats.hp} / ${this.playerStats.maxHp}` : "-";
    this.rollOutEl.textContent = lastRollText;
  }

  clearLog(){
    this.logEl.innerHTML = "";
  }

  log(text){
    const div = document.createElement("div");
    div.textContent = text;
    this.logEl.prepend(div);
  }

  setButtonsEnabled(enabled){
    this.btnAttack.disabled = !enabled;
    this.btnTech.disabled = !enabled;
    this.btnDefend.disabled = !enabled;
    this.btnPanic.disabled = !enabled;
    // Exit only when battle ends
    this.btnExit.disabled = (this.turn !== "end");
  }

  // ---------- Dice ----------
  rollDie(sides){
    if (crypto?.getRandomValues){
      const buf = new Uint32Array(1);
      const max = 0xFFFFFFFF;
      const limit = max - (max % sides);
      while (true){
        crypto.getRandomValues(buf);
        const v = buf[0];
        if (v < limit) return (v % sides) + 1;
      }
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  rollDice(count, sides){
    let total = 0;
    const rolls = [];
    for (let i=0;i<count;i++){
      const r = this.rollDie(sides);
      rolls.push(r);
      total += r;
    }
    return { total, rolls };
  }

  // ---------- Combat ----------
  playerAction(kind){
    if (!this.isOpen || this.turn !== "player") return;

    this.setButtonsEnabled(false);

    if (kind === "defend"){
      this.temp.defendBonus = 2;
      this.syncUI("-");
      this.log("You brace. +2 AC against the next attack.");
      this.endPlayerTurn();
      return;
    }

    if (kind === "panic"){
      const cost = 3;
      if (this.playerStats.hp <= cost){
        this.syncUI("-");
        this.log("Panic failed. Not enough HP to trigger the overload.");
        this.endPlayerTurn();
        return;
      }
      this.playerStats.hp -= cost;

      // Panic blast: 2d6 true damage (ignores AC, feels like an emergency nuke)
      const dmg = this.rollDice(2, 6);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg.total);

      this.syncUI(`Panic: ${dmg.rolls.join("+")} = ${dmg.total}`);
      this.log(`PANIC OVERLOAD! You take ${cost} HP. Enemy takes ${dmg.total}.`);

      if (this.enemy.hp <= 0){
        this.win();
        return;
      }

      this.endPlayerTurn();
      return;
    }

    if (kind === "sword"){
      // Space Sword: hit = d20 + atk, damage = 1d8 + str
      const atkMod = this.playerStats.atk;
      const strMod = this.playerStats.str;
      const d20 = this.rollDie(20);

      const totalToHit = d20 + atkMod;
      const isCrit = (d20 === 20);
      const hit = isCrit || totalToHit >= this.enemy.ac;

      this.syncUI(`d20 ${d20} +${atkMod} = ${totalToHit}`);

      if (!hit){
        this.log(`Sword swing misses. (${totalToHit} vs AC ${this.enemy.ac})`);
        this.endPlayerTurn();
        return;
      }

      const base = this.rollDice(isCrit ? 2 : 1, 8); // crit doubles dice
      const dmg = Math.max(1, base.total + strMod);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg);

      this.log(`${isCrit ? "CRIT! " : ""}Sword hits for ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

      if (this.enemy.hp <= 0){
        this.win();
        return;
      }

      this.endPlayerTurn();
      return;
    }

    if (kind === "blaster"){
      // Blaster: slightly easier, smaller damage
      // hit = d20 + (atk-1), damage = 1d6 + int
      const atkMod = Math.max(0, this.playerStats.atk - 1);
      const intMod = this.playerStats.int;
      const d20 = this.rollDie(20);

      const totalToHit = d20 + atkMod;
      const isCrit = (d20 === 20);
      const hit = isCrit || totalToHit >= this.enemy.ac;

      this.syncUI(`d20 ${d20} +${atkMod} = ${totalToHit}`);

      if (!hit){
        this.log(`Blaster shot misses. (${totalToHit} vs AC ${this.enemy.ac})`);
        this.endPlayerTurn();
        return;
      }

      const base = this.rollDice(isCrit ? 2 : 1, 6);
      const dmg = Math.max(1, base.total + intMod);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg);

      this.log(`${isCrit ? "CRIT! " : ""}Blaster hits for ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

      if (this.enemy.hp <= 0){
        this.win();
        return;
      }

      this.endPlayerTurn();
      return;
    }
  }

  endPlayerTurn(){
    this.turn = "enemy";
    // tiny delay so it feels turn-based
    setTimeout(() => this.enemyTurn(), 300);
  }

  enemyTurn(){
    if (!this.isOpen || this.turn !== "enemy") return;

    const atkMod = this.enemy.atk;
    const d20 = this.rollDie(20);
    const totalToHit = d20 + atkMod;

    const playerAC = this.playerStats.ac + (this.temp.defendBonus || 0);
    const isCrit = (d20 === 20);
    const hit = isCrit || totalToHit >= playerAC;

    this.syncUI(`Enemy d20 ${d20} +${atkMod} = ${totalToHit}`);

    if (!hit){
      this.log(`${this.enemy.name} misses. (${totalToHit} vs AC ${playerAC})`);
      this.temp.defendBonus = 0;
      this.turn = "player";
      this.setButtonsEnabled(true);
      this.btnExit.disabled = true;
      return;
    }

    const base = this.rollDice(isCrit ? 2 : 1, this.enemy.dmgSides);
    const dmg = Math.max(1, base.total + this.enemy.dmgMod);

    this.playerStats.hp = Math.max(0, this.playerStats.hp - dmg);

    this.log(`${isCrit ? "CRIT! " : ""}${this.enemy.name} hits for ${dmg}. Your HP ${this.playerStats.hp}/${this.playerStats.maxHp}.`);

    this.temp.defendBonus = 0;

    if (this.playerStats.hp <= 0){
      this.lose();
      return;
    }

    this.turn = "player";
    this.setButtonsEnabled(true);
    this.btnExit.disabled = true;
    this.syncUI("-");
  }

  win(){
    this.turn = "end";
    this.setButtonsEnabled(false);
    this.btnExit.disabled = false;
    this.syncUI("-");
    this.log(`Enemy neutralized. Corridor secure.`);
    if (this.onWin) this.onWin(this.enemy);
  }

  lose(){
    this.turn = "end";
    this.setButtonsEnabled(false);
    this.btnExit.disabled = false;
    this.syncUI("-");
    this.log(`You collapse. Systems offline.`);
    if (this.onLose) this.onLose();
  }
}