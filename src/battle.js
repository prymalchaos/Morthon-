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

    // Button labels
    this.btnAttack.textContent = "Sword";
    this.btnTech.textContent = "Gun";
    this.btnDefend.textContent = "Shield";

    this.isOpen = false;
    this.turn = "player"; // player | enemy | end
    this.enemy = null;

    this.player = null; // { stats, gear }

    this.temp = {
      guarding: false,
      guardDR: 0
    };

    // ---- NEW: stance reveal only for the first exchange ----
    this.stanceKnown = true;       // true only at combat start
    this.firstActionTaken = false; // after first player action, stanceKnown becomes false

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

  open(enemy, player){
    this.isOpen = true;
    this.enemy = JSON.parse(JSON.stringify(enemy));
    this.player = player;
    this.turn = "player";

    this.temp.guarding = false;
    this.temp.guardDR = 0;

    this.stanceKnown = true;
    this.firstActionTaken = false;

    this.el.classList.remove("hidden");
    this.clearLog();
    this.syncUI();

    const ew = this.prettyWeapon(this.enemy.weaponType);
    const stanceLine = this.stanceLine(this.enemy.weaponType);

    if (this.subEl){
      const bossTag = this.enemy.isBoss ? ` | Boss Phase ${this.enemy.phase}/3` : "";
      this.subEl.textContent = `Enemy stance: ${ew}${bossTag}`;
    }

    this.log(`Combat engaged. ${this.enemy.name} ${stanceLine}`);
    this.setButtonsEnabled(true);
  }

  close(){
    this.isOpen = false;
    this.el.classList.add("hidden");
    this.enemy = null;
    this.player = null;
    this.turn = "end";
  }

  syncUI(lastRollText = "-"){
    this.enemyNameEl.textContent = this.enemy?.name ?? "-";
    this.enemyHpEl.textContent = this.enemy ? `${this.enemy.hp} / ${this.enemy.maxHp}` : "-";
    const ps = this.player?.stats;
    this.playerHpEl.textContent = ps ? `${ps.hp} / ${ps.maxHp}` : "-";
    this.rollOutEl.textContent = lastRollText;
  }

  clearLog(){ this.logEl.innerHTML = ""; }

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
  matchup(attackerWeapon, defenderWeapon){
    if (attackerWeapon === defenderWeapon) return "neutral";
    // Sword > Gun, Gun > Shield, Shield > Sword
    if (attackerWeapon === "sword" && defenderWeapon === "gun") return "adv";
    if (attackerWeapon === "gun" && defenderWeapon === "shield") return "adv";
    if (attackerWeapon === "shield" && defenderWeapon === "sword") return "adv";
    return "dis";
  }

  randomWeapon(){
    const r = this.rollDie(3);
    return r === 1 ? "sword" : (r === 2 ? "gun" : "shield");
  }

  prettyWeapon(w){
    if (w === "sword") return "Sword";
    if (w === "gun") return "Gun";
    if (w === "shield") return "Shield";
    return "Weapon";
  }

  stanceLine(w){
    if (w === "sword") return "draws a blade.";
    if (w === "gun") return "withdraws a gun.";
    if (w === "shield") return "raises a shield.";
    return "prepares.";
  }

  updateStanceUI(){
    if (!this.subEl) return;
    const bossTag = this.enemy?.isBoss ? ` | Boss Phase ${this.enemy.phase}/3` : "";
    if (this.stanceKnown){
      this.subEl.textContent = `Enemy stance: ${this.prettyWeapon(this.enemy.weaponType)}${bossTag}`;
    } else {
      this.subEl.textContent = `Enemy stance: ???${bossTag}`;
    }
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

  rollD20(mode){
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

  adjustDiceCount(baseCount, mode){
    if (mode === "adv") return baseCount + 1;
    if (mode === "dis") return Math.max(1, baseCount - 1);
    return baseCount;
  }

  weaponProfile(kind){
    const tier = this.player?.gear?.weaponTier ?? 1;

    if (tier === 1) return { count: 1, sides: (kind === "sword") ? 8 : 6, flat: 0 };
    if (tier === 2) return { count: 1, sides: (kind === "sword") ? 10 : 8, flat: 0 };

    const extra = Math.max(0, tier - 3);
    return {
      count: 2,
      sides: (kind === "sword") ? 8 : 6,
      flat: extra
    };
  }

  // ---------- Combat ----------
  playerAction(kind){
    if (!this.isOpen || this.turn !== "player") return;

    // First player action flips stance visibility OFF for the rest of the fight
    if (!this.firstActionTaken){
      this.firstActionTaken = true;
      this.stanceKnown = false;
      this.updateStanceUI();
    }

    // New action cancels guard
    this.temp.guarding = false;
    this.temp.guardDR = 0;

    this.setButtonsEnabled(false);

    const ps = this.player.stats;

    // After the first exchange, the enemy stance becomes unpredictable
    // We randomize enemy stance right before resolving THIS action.
    if (!this.stanceKnown){
      this.enemy.weaponType = this.randomWeapon();
    }

    if (kind === "shield"){
      this.temp.guarding = true;
      this.temp.guardDR = 2 + Math.floor((ps.str || 0) / 2);

      this.syncUI("-");
      this.log(`You raise your Shield. Guard active (DR ${this.temp.guardDR}).`);
      this.endPlayerTurn();
      return;
    }

    if (kind === "panic"){
      const cost = 3;
      if (ps.hp <= cost){
        this.syncUI("-");
        this.log("Panic failed. Not enough HP to trigger the overload.");
        this.endPlayerTurn();
        return;
      }
      ps.hp -= cost;

      const dmg = this.rollDice(2, 6);
      this.enemy.hp = Math.max(0, this.enemy.hp - dmg.total);

      this.syncUI(`Panic: ${dmg.rolls.join("+")} = ${dmg.total}`);
      this.log(`PANIC OVERLOAD! You take ${cost} HP. Enemy takes ${dmg.total}.`);

      if (this.enemy.hp <= 0){ this.win(); return; }
      this.endPlayerTurn();
      return;
    }

    // Sword / Gun attack
    const enemyW = this.enemy.weaponType || "sword";
    const playerW = kind;
    const mode = this.matchup(playerW, enemyW);

    const atkMod = (kind === "sword") ? (ps.atk || 0) : Math.max(0, (ps.atk || 0) - 1);
    const statMod = (kind === "sword") ? (ps.str || 0) : (ps.int || 0);

    const d20 = this.rollD20(mode);
    const totalToHit = d20.roll + atkMod;

    const isCrit = (d20.roll === 20);
    const hit = isCrit || totalToHit >= this.enemy.ac;

    // NOTE: we no longer tell the player what the enemy stance is after the first exchange.
    // We still log advantage/disadvantage outcome because that’s what you *feel* in the fight.
    const tag = (mode === "adv") ? "Advantage" : (mode === "dis") ? "Disadvantage" : "Neutral";
    this.syncUI(`${d20.text} +${atkMod} = ${totalToHit}`);
    this.log(`${this.prettyWeapon(playerW)} clash: ${tag}.`);

    if (!hit){
      this.log(`Miss. (${totalToHit} vs AC ${this.enemy.ac})`);
      this.endPlayerTurn();
      return;
    }

    const wp = this.weaponProfile(kind);
    let count = this.adjustDiceCount(wp.count, mode);
    if (isCrit) count *= 2;

    const base = this.rollDice(count, wp.sides);
    const dmg = Math.max(1, base.total + statMod + (wp.flat || 0));
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);

    this.log(`${isCrit ? "CRIT! " : ""}Hit for ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

    if (this.enemy.hp <= 0){ this.win(); return; }
    this.endPlayerTurn();
  }

  endPlayerTurn(){
    this.turn = "enemy";
    setTimeout(() => this.enemyTurn(), 320);
  }

  enemyTurn(){
    if (!this.isOpen || this.turn !== "enemy") return;

    const ps = this.player.stats;

    // After the first exchange, enemy stance randomizes each time it acts, too.
    if (!this.stanceKnown){
      this.enemy.weaponType = this.randomWeapon();
    }
    const enemyW = this.enemy.weaponType || "sword";

    const modeVsGuard = this.temp.guarding ? this.matchup(enemyW, "shield") : "neutral";

    if (this.temp.guarding){
      const tag = (modeVsGuard === "adv") ? "Advantage" : (modeVsGuard === "dis") ? "Disadvantage" : "Neutral";
      this.log(`${this.enemy.name} attacks into your Shield: ${tag}.`);
    } else {
      this.log(`${this.enemy.name} attacks.`);
    }

    const atkMod = this.enemy.atk || 0;
    const d20 = this.rollD20(this.temp.guarding ? modeVsGuard : "neutral");
    const totalToHit = d20.roll + atkMod;

    const guardACBonus = this.temp.guarding ? 1 : 0;
    const playerAC = (ps.ac || 10) + guardACBonus;

    const isCrit = (d20.roll === 20);
    const hit = isCrit || totalToHit >= playerAC;

    this.syncUI(`${d20.text} +${atkMod} = ${totalToHit}`);

    if (!hit){
      this.log(`Miss. (${totalToHit} vs AC ${playerAC})`);

      if (this.temp.guarding && enemyW === "sword"){
        this.counterBash();
      }

      this.endEnemyTurn();
      return;
    }

    const sides = this.enemy.dmgSides || 6;
    const baseCount = 1;

    let count = baseCount;
    if (this.temp.guarding){
      count = this.adjustDiceCount(baseCount, modeVsGuard);
    }
    if (isCrit) count *= 2;

    const base = this.rollDice(count, sides);
    let dmg = Math.max(1, base.total + (this.enemy.dmgMod || 0));

    if (this.temp.guarding){
      dmg = Math.max(0, dmg - (this.temp.guardDR || 0));
      this.log(`Guard absorbs ${this.temp.guardDR}.`);
    }

    ps.hp = Math.max(0, ps.hp - dmg);
    this.log(`${isCrit ? "CRIT! " : ""}Hit for ${dmg}. Your HP ${ps.hp}/${ps.maxHp}.`);

    if (this.temp.guarding && enemyW === "sword"){
      this.counterBash();
    }

    if (ps.hp <= 0){ this.lose(); return; }
    this.endEnemyTurn();
  }

  counterBash(){
    const ps = this.player.stats;
    const str = ps.str || 0;
    const dmgRoll = this.rollDice(1, 6);
    const dmg = Math.max(1, dmgRoll.total + str);

    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    this.log(`COUNTER BASH! ${dmgRoll.rolls[0]} +${str} = ${dmg}. Enemy HP ${this.enemy.hp}/${this.enemy.maxHp}.`);

    if (this.enemy.hp <= 0){
      this.win();
    }
  }

  endEnemyTurn(){
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

    if (this.enemy.isBoss){
      this.log(`Boss phase shattered.`);
    } else {
      this.log(`Enemy neutralized. Keycard recovered.`);
    }
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