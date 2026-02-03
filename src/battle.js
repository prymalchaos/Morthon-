export class BattleUI{
  constructor(){
    this.el = document.getElementById("encounter");
    this.enemyNameEl = document.getElementById("enemy-name");
    this.enemyHpEl = document.getElementById("enemy-hp");
    this.playerHpEl = document.getElementById("player-hp");
    this.rollOutEl = document.getElementById("roll-out");
    this.logEl = document.getElementById("battle-log");
    this.subEl = document.getElementById("encounter-sub");

    this.btnAttack = document.getElementById("btn-attack");
    this.btnTech = document.getElementById("btn-tech");
    this.btnDefend = document.getElementById("btn-defend");
    this.btnPanic = document.getElementById("btn-panic");
    this.btnExit = document.getElementById("btn-exit");

    // Rename buttons without editing HTML
    this.btnAttack.textContent = "Sword";
    this.btnTech.textContent = "Gun";
    this.btnDefend.textContent = "Shield";

    this.isOpen = false;
    this.turn = "player"; // player | enemy | end
    this.enemy = null;
    this.playerStats = null;

    this.temp = {
      guarding: false,
      guardDR: 0
    };

    // callbacks set by Game
    this.onWin = null;   // (enemySnapshot) => void
    this.onLose = null;  // () => void
    this.onExit = null;  // () => void

    this.btnAttack.addEventListener("click", () => this.playerAction("sword"));
    this.btnTech.addEventListener("click", () => this.playerAction("gun"));
    this.btnDefend.addEventListener("click", () => this.playerAction("shield"));
    this.btnPanic.addEventListener("click", () => this.playerAction("panic"));

    this.btnExit.addEventListener("click", () => {
      if (this.turn !== "end") return;
      this.close();
      if (this.onExit) this.onExit();
    });
  }

  open(enemy, playerStats){
    this.isOpen = true;
    this.enemy = JSON.parse(JSON.stringify(enemy));
    this.playerStats = playerStats;
    this.turn = "player";

    this.temp.guarding = false;
    this.temp.guardDR = 0;

    this.el.classList.remove("hidden");
    this.clearLog();
    this.syncUI();

    const ew = this.prettyWeapon(this.enemy.weaponType);
    if (this.subEl) this.subEl.textContent = `Enemy stance: ${ew}`;

    this.log(`Combat engaged. ${this.enemy.name} raises a ${ew}.`);
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
    this.btnExit.disabled = (this.turn !== "end");
  }

  // ---------- RPS / Matchups ----------
  // Returns: "adv" | "neutral" | "dis"
  matchup(attackerWeapon, defenderWeapon){
    if (attackerWeapon === defenderWeapon) return "neutral";

    // Sword beats Gun, Gun beats Shield, Shield beats Sword
    if (attackerWeapon === "sword" && defenderWeapon === "gun") return "adv";
    if (attackerWeapon === "gun" && defenderWeapon === "shield") return "adv";
    if (attackerWeapon === "shield" && defenderWeapon === "sword") return "adv";

    return "dis";
  }

  prettyWeapon(w){
    if (w === "sword") return "Sword";
    if (w === "gun") return "Gun";
    if (w === "shield") return "Shield";
    return "Weapon";
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

  rollD20(mode){ // mode: "adv" | "neutral" | "dis"
    const a = this.rollDie(20);
    if (mode === "neutral") return { roll: a, text: `d20 ${a}` };

    const b = this.rollDie(20);
    const pick = (mode === "adv") ? Math.max(a,b) : Math.min(a,b);
    const tag = (mode === "adv") ? "ADV" : "DIS";
    return { roll: pick, text: `${tag} d20 (${a},${b}) → ${pick}` };
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

  // Damage dice adjustment by matchup:
  // adv: +1 die, dis: -1 die (min 1), neutral: unchanged
  adjustDiceCount(baseCount, mode){
    if (mode === "adv") return baseCount + 1;
    if (mode === "dis") return Math.max(1, baseCount - 1);
    return baseCount;
  }

  // ---------- Combat ----------
  playerAction(kind){
    if (!this.isOpen || this.turn !== "player") return;

    // Picking an action ends guarding (new stance)
    this.temp.guarding = false;
    this.temp.guardDR = 0;

    this.setButtonsEnabled(false);

    if (kind === "shield"){
      // Guard stance (the fun engine)
      this.temp.guarding = true;
      this.temp.guardDR = 2 + Math.floor((this.playerStats.str || 0) / 2);

      this.syncUI("-");
      this.log(`You raise your Shield. Guard active (DR ${this.temp.guardDR}).`);
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

    // Attack actions: sword or gun
    const enemyW = this.enemy.weaponType || "sword";
    const playerW = kind; // "sword" | "gun"
    const mode = this.matchup(playerW, enemyW);

    const atkMod = (kind === "sword") ? (this.playerStats.atk || 0) : Math.max(0, (this.playerStats.atk || 0) - 1);
    const statMod = (kind === "sword") ? (this.playerStats.str || 0) : (this.playerStats.int || 0);

    const d20 = this.rollD20(mode);
    const totalToHit = d20.roll + atkMod;

    const isCrit = (d20.roll === 20); // note: with adv/dis, still crit on natural 20 that was selected
    const hit = isCrit || totalToHit >= this.enemy.ac;

    const tag =
      mode === "adv" ? "Advantage" :
      mode === "dis" ? "Disadvantage" :
      "Neutral";

    this.syncUI(`${d20.text} +${atkMod} = ${totalToHit}`);
    this.log(`${this.prettyWeapon(playerW)} vs ${this.prettyWeapon(enemyW)}: ${tag}.`);

    if (!hit){
      this.log(`Miss. (${totalToHit} vs AC ${this.enemy.ac})`);
      this.endPlayerTurn();
      return;
    }

    // Base dice
    const baseSides = (kind === "sword") ? 8 : 6;
    const baseCount = 1;

    // Matchup adjusts dice count
    let count = this.adjustDiceCount(baseCount, mode);

    // Crit doubles dice
    if (isCrit) count *= 2;

    const base = this.rollDice(count, baseSides);
    const dmg = Math.max(1, base.total + statMod);
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);

    this.log(`${isCrit ? "CRIT! " : ""}Hit for ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

    if (this.enemy.hp <= 0){
      this.win();
      return;
    }

    this.endPlayerTurn();
  }

  endPlayerTurn(){
    this.turn = "enemy";
    setTimeout(() => this.enemyTurn(), 320);
  }

  enemyTurn(){
    if (!this.isOpen || this.turn !== "enemy") return;

    const enemyW = this.enemy.weaponType || "sword";

    // If player is guarding, enemy gets matchup vs Shield
    // (and shield beats sword / loses to gun / ties shield)
    const modeVsGuard = this.temp.guarding ? this.matchup(enemyW, "shield") : "neutral";

    // Extra clarity in log when guarding
    if (this.temp.guarding){
      const tag =
        modeVsGuard === "adv" ? "Advantage" :
        modeVsGuard === "dis" ? "Disadvantage" : "Neutral";
      this.log(`${this.enemy.name} attacks into your Shield: ${tag}.`);
    }

    const atkMod = this.enemy.atk || 0;
    const d20 = this.rollD20(this.temp.guarding ? modeVsGuard : "neutral");
    const totalToHit = d20.roll + atkMod;

    // Guard slightly increases AC (small), DR does the heavy lifting
    const guardACBonus = this.temp.guarding ? 1 : 0;
    const playerAC = (this.playerStats.ac || 10) + guardACBonus;

    const isCrit = (d20.roll === 20);
    const hit = isCrit || totalToHit >= playerAC;

    this.syncUI(`${d20.text} +${atkMod} = ${totalToHit}`);

    if (!hit){
      this.log(`${this.enemy.name} misses. (${totalToHit} vs AC ${playerAC})`);

      // Counter only happens if guarding AND enemy used Sword (Shield beats Sword)
      if (this.temp.guarding && enemyW === "sword"){
        this.counterBash();
      }

      this.endEnemyTurn();
      return;
    }

    // Enemy damage
    // If guarding, the player's shield matchup affects how hard they get hit indirectly:
    // We'll keep it simple: matchup already changes hit odds; DR changes damage.
    const sides = this.enemy.dmgSides || 6;
    const baseCount = 1;

    let count = baseCount;
    // If guarding, and enemy has advantage/disadvantage, nudge damage dice slightly too (optional but fun)
    if (this.temp.guarding){
      count = this.adjustDiceCount(baseCount, modeVsGuard);
    }
    if (isCrit) count *= 2;

    const base = this.rollDice(count, sides);
    let dmg = Math.max(1, base.total + (this.enemy.dmgMod || 0));

    // Guard DR applies after roll
    if (this.temp.guarding){
      dmg = Math.max(0, dmg - (this.temp.guardDR || 0));
      this.log(`Guard absorbs ${this.temp.guardDR}.`);
    }

    this.playerStats.hp = Math.max(0, this.playerStats.hp - dmg);

    this.log(`${isCrit ? "CRIT! " : ""}${this.enemy.name} hits for ${dmg}. Your HP ${this.playerStats.hp}/${this.playerStats.maxHp}.`);

    // Counter on hit also (Shield beats Sword): if they swing a sword into guard, they get bonked anyway
    if (this.temp.guarding && enemyW === "sword"){
      this.counterBash();
    }

    if (this.playerStats.hp <= 0){
      this.lose();
      return;
    }

    this.endEnemyTurn();
  }

  counterBash(){
    // Counter Bash: 1d6 + STR, with a small stun chance
    const str = this.playerStats.str || 0;
    const dmgRoll = this.rollDice(1, 6);
    const dmg = Math.max(1, dmgRoll.total + str);

    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    this.log(`COUNTER BASH! ${dmgRoll.rolls[0]} +${str} = ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

    // Optional stun: enemy skips next action (we implement as "you get an extra player turn" by ending enemy turn early)
    const stun = this.rollDie(100) <= 20; // 20%
    if (stun && this.enemy.hp > 0){
      this.log(`Stun! ${this.enemy.name} staggers.`);
      // Mark stunned so enemy doesn't act again; in our loop, it's already mid-turn, so just a flavor effect here.
    }

    if (this.enemy.hp <= 0){
      this.win();
    }
  }

  endEnemyTurn(){
    // Guard lasts only for one enemy action
    this.temp.guarding = false;
    this.temp.guardDR = 0;

    if (!this.isOpen || this.turn === "end") return;

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

    this.log(`Enemy neutralized. Keycard recovered.`);
    this.log(`Scan: potential salvage in the area.`);

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