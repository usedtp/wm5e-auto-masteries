/*
 * Mastery rules from the 2024 Player's Handbook, as pure functions. No Foundry globals here, so they are tested
 * directly. engine.mjs feeds them data from Foundry and acts on the result.
 */

/** When each mastery is decided: on the attack roll, or when damage lands. */
export const TIMING = Object.freeze({
  sap: { on: "attack", needs: "hit" },
  topple: { on: "attack", needs: "hit" },
  push: { on: "attack", needs: "hit" },
  graze: { on: "attack", needs: "miss" },
  vex: { on: "damage" },
  slow: { on: "damage" },
  cleave: { on: "damage" },
  nick: { on: "attack", needs: "any" }
});

/** Masteries built so far. Others are left alone until their phase ships. */
export const BUILT = new Set(["sap", "vex", "slow"]);

/**
 * Hit or miss against one target. 2024 PHB: a natural 20 always hits, a natural 1 always misses.
 * @param {{total:number, isCritical?:boolean, isFumble?:boolean}} roll
 * @param {number|undefined} ac
 * @returns {{hit:boolean, miss:boolean, crit:boolean}|null}  null when the AC is unknown.
 */
export function attackOutcome(roll, ac) {
  if (!roll) return null;
  if (roll.isCritical) return { hit: true, miss: false, crit: true };
  if (roll.isFumble) return { hit: false, miss: true, crit: false };
  if (!Number.isFinite(ac)) return null;
  const hit = roll.total >= ac;
  return { hit, miss: !hit, crit: false };
}

/**
 * Which mastery applies to this attack, or null.
 * Player characters: the mastery dnd5e recorded on the attack (it only records one the character knows).
 * NPCs: house rule only.
 */
export function eligibleMastery({ actorType, messageMastery, itemMastery, homebrew, npcMode, npcHasFeature }) {
  if (actorType === "character") return messageMastery || null;
  if (actorType !== "npc" || !homebrew) return null;
  if (npcMode === "all") return itemMastery || null;
  if (npcMode === "feature" && npcHasFeature) return itemMastery || null;
  return null;
}

/**
 * Turn position of an application: which combat, round, turn and combatant it happened in.
 * @typedef {{combatId:string, round:number, turn:number, combatantId:string}} TurnStamp
 */

/**
 * Is an effect source due to expire at this turn event?
 * "start": at the start of the attacker's next turn. "end": at the end of the attacker's next turn.
 * The turn it was applied in never counts as "next".
 * @param {{edge:"start"|"end", applied:TurnStamp}} source
 * @param {{kind:"start"|"end", combatId:string, round:number, turn:number, combatantId:string}} event
 */
export function sourceExpires(source, event) {
  if (!source?.applied || source.edge !== event.kind) return false;
  const a = source.applied;
  if (a.combatId !== event.combatId || a.combatantId !== event.combatantId) return false;
  return !(a.round === event.round && a.turn === event.turn);
}

/** Line text for the attack card. Kept short; the GM approves or rejects it. */
export function lineText(mastery, data = {}) {
  const who = data.target ? `${data.target}` : "Target";
  switch (mastery) {
    case "sap": return `Sap: ${who} has Disadvantage on its next attack roll before the start of your next turn.`;
    case "vex": return `Vex: Advantage on your next attack roll against ${who} before the end of your next turn.`;
    case "slow": return `Slow: ${who}'s Speed drops 10 ft until the start of your next turn.`;
    default: return `${mastery}: applied.`;
  }
}
