import { rejectLine, runLineAction } from "./engine/engine.mjs";
import { reportContext } from "./report.mjs";

/*
 * Live self-test for the PHB mastery engine, run by usedtp Logger once per new version (see its README).
 * A test fighter and a test goblin fight in a hidden sandbox; every roll goes through dnd5e's own attack, damage
 * and Apply Damage flow. Dice are fixed (every d20 lands on 11), so results never vary.
 */

const MOD = "wm5e-auto-masteries";
const PACK = "dnd5e.equipment24";

const effect = (actor, mastery) => actor.effects.find(e => e.flags?.[MOD]?.mastery === mastery);
const attackActivity = (actor, name) => actor.items.getName(name)?.system.activities.find(a => a.type === "attack");
const latest = (type, item) => game.messages.contents.findLast(m => m.type === type && m.getAssociatedItem?.()?.id === item.id);

export async function masterySuite(t) {
  if (game.modules.get("wm5e")?.active) return t.skip("Automated Masteries 5e is active, so the PHB engine is idle");

  await t.scene();
  const fighter = await t.actor({
    name: "Test Fighter", type: "character",
    prototypeToken: { actorLink: true },
    system: {
      abilities: { str: { value: 16 }, dex: { value: 10 }, con: { value: 14 } },
      traits: { weaponProf: { mastery: { value: ["mace", "shortsword", "club", "quarterstaff", "greatsword"] } } }
    }
  });
  const goblin = await t.actor({
    name: "Test Goblin", type: "npc",
    prototypeToken: { actorLink: true },
    system: { attributes: { ac: { calc: "flat", flat: 5 }, hp: { value: 200, max: 200 }, movement: { speeds: { walk: 30 } } } }
  });
  await t.items(fighter, PACK, ["Mace", "Shortsword", "Club", "Quarterstaff", "Greatsword"]);
  await t.items(goblin, PACK, ["Club"]);
  const fighterTok = await t.token(fighter, { x: 200, y: 200 });
  const goblinTok = await t.token(goblin, { x: 300, y: 200 });
  const combat = await t.combat([fighterTok, goblinTok]);
  t.fixDice(0.53);

  /** Use the weapon and roll its attack, as a player clicking the card would. Returns the attack card. */
  async function attack(actor, weapon, targetTok) {
    t.target(targetTok);
    const activity = attackActivity(actor, weapon);
    t.ok(activity, `${weapon} has an attack activity`);
    const used = await activity.use({ subsequentActions: false, consume: false }, { configure: false }, {});
    await activity.rollAttack({}, { configure: false }, { data: { system: { origin: used?.message?.id } } });
    return t.waitFor(() => latest("attack", activity.item), { message: `${weapon} attack card` });
  }

  /** Roll damage from the same use and apply it to the target with dnd5e's Apply Damage. Returns the damage card. */
  async function damage(attackCard, targetActor) {
    const activity = attackCard.getAssociatedActivity?.() ?? attackActivity(attackCard.getAssociatedActor(), attackCard.getAssociatedItem().name);
    const originId = attackCard._source?.system?.origin ?? attackCard.getOriginatingMessage?.()?.id;
    await activity.rollDamage({}, { configure: false }, { data: { system: { origin: originId } } });
    const card = await t.waitFor(() => latest("damage", activity.item), { message: "damage card" });
    const damages = card.rolls.map(r => ({ value: r.total, type: r.options.type, properties: new Set(r.options.properties ?? []) }));
    await targetActor.applyDamage(damages, { isDelta: true, origin: card });
    return card;
  }

  const line = (card, mastery) => card.flags?.[MOD]?.lines?.find(l => l.mastery === mastery);

  let sapCard;
  await t.step("Sap: a hit puts Sap on the target and a line on the card", async () => {
    sapCard = await attack(fighter, "Mace", goblinTok);
    t.equal(sapCard.system.mastery, "sap", "dnd5e recorded the Sap mastery");
    await t.waitFor(() => effect(goblin, "sap"), { message: "Sap effect" });
    await t.waitFor(() => line(sapCard, "sap")?.status === "applied", { message: "Sap line" });
  });

  await t.step("Sap: the target's next attack has Disadvantage, then Sap is gone", async () => {
    const card = await attack(goblin, "Club", fighterTok);
    t.ok(card.rolls[0].hasDisadvantage, "goblin attack rolled with Disadvantage");
    await t.waitFor(() => !effect(goblin, "sap"), { message: "Sap used up" });
  });

  let vexCard;
  await t.step("Vex: nothing on the hit alone; applies when damage lands", async () => {
    vexCard = await attack(fighter, "Shortsword", goblinTok);
    t.ok(!effect(fighter, "vex"), "no Vex before damage");
    await damage(vexCard, goblin);
    await t.waitFor(() => effect(fighter, "vex"), { message: "Vex effect after damage" });
  });

  await t.step("Vex: next attack against that creature has Advantage, then Vex is gone", async () => {
    const card = await attack(fighter, "Shortsword", goblinTok);
    t.ok(card.rolls[0].hasAdvantage, "attack rolled with Advantage");
    await t.waitFor(() => !effect(fighter, "vex"), { message: "Vex used up" });
  });

  let slowCard;
  await t.step("Slow: damage lands, every speed drops 10 ft", async () => {
    slowCard = await attack(fighter, "Club", goblinTok);
    await damage(slowCard, goblin);
    await t.waitFor(() => effect(goblin, "slow"), { message: "Slow effect" });
    await t.waitFor(() => line(slowCard, "slow"), { message: "Slow line" });
    t.equal(goblin.system.attributes.movement.speeds.walk, 20, "walk speed");
  });

  await t.step("Reject: the GM's Reject button removes the Slow", async () => {
    const id = line(slowCard, "slow")?.id;
    t.ok(id, "Slow line exists");
    const button = document.querySelector(`[data-message-id="${slowCard.id}"] .wm5eam-reject`);
    if (button) button.click(); else await rejectLine(slowCard, id);
    await t.waitFor(() => !effect(goblin, "slow"), { message: "Slow removed" });
    await t.waitFor(() => line(slowCard, "slow")?.status === "rejected", { message: "line marked rejected" });
    t.equal(goblin.system.attributes.movement.speeds.walk, 30, "walk speed restored");
  });

  await t.step("Turn change: Sap ends at the start of the attacker's next turn; its line counts as approved", async () => {
    const card = await attack(fighter, "Mace", goblinTok);
    await t.waitFor(() => effect(goblin, "sap"), { message: "Sap effect" });
    await combat.nextTurn();
    t.ok(effect(goblin, "sap"), "still on during the goblin's turn");
    await combat.nextTurn();
    await t.waitFor(() => !effect(goblin, "sap"), { message: "Sap expired" });
    await t.waitFor(() => line(card, "sap")?.status === "approved", { message: "line approved" });
  });

  /** Click a GM button on a card line, or call the engine if the card is not drawn in this browser. */
  async function press(card, cls, fallback) {
    const button = document.querySelector(`[data-message-id="${card.id}"] .${cls}`);
    if (button) button.click(); else await fallback();
  }

  await t.step("Topple: hit gives the GM a Roll save button at DC 8 + Str + PB", async () => {
    const card = await attack(fighter, "Quarterstaff", goblinTok);
    const l = await t.waitFor(() => line(card, "topple"), { message: "Topple line" });
    const dc = 8 + fighter.system.abilities.str.mod + fighter.system.attributes.prof;
    t.equal(l.save?.dc, dc, "Topple DC");
    t.ok(l.actions?.some(a => a.id === "rollSave"), "Roll save button");
    await press(card, "wm5eam-action-rollSave", () => runLineAction(card, l.id, "rollSave"));
    await t.waitFor(() => goblin.statuses.has("prone"), { message: "goblin Prone after failed save" });
    await t.waitFor(() => /failed/.test(line(card, "topple")?.text ?? ""), { message: "line shows the failed save" });
    await press(card, "wm5eam-reject", () => rejectLine(card, l.id));
    await t.waitFor(() => !goblin.statuses.has("prone"), { message: "Reject removes Prone" });
  });

  await t.step("Graze: a miss posts a damage card equal to the Str modifier; Reject deletes it", async () => {
    // dnd5e 6 recalculates NPC AC from the whole object; a flat-only update is ignored.
    await goblin.update({ "system.attributes.ac": { calc: "flat", flat: 30 } });
    await t.waitFor(() => goblin.system.attributes.ac.value === 30, { message: "goblin AC 30" });
    const card = await attack(fighter, "Greatsword", goblinTok);
    const l = await t.waitFor(() => line(card, "graze"), { message: "Graze line" });
    const graze = await t.waitFor(() => game.messages.contents.find(m => m.flags?.[MOD]?.extra === "graze" && m.flags[MOD].attackId === card.id), { message: "Graze damage card" });
    t.equal(graze.rolls[0].total, fighter.system.abilities.str.mod, "Graze damage");
    await press(card, "wm5eam-reject", () => rejectLine(card, l.id));
    await t.waitFor(() => !game.messages.get(graze.id), { message: "Graze card deleted" });
    await goblin.update({ "system.attributes.ac": { calc: "flat", flat: 5 } });
  });

  await t.step("Report: Error/Unclear context carries the engine and its lines", async () => {
    const ctx = reportContext(slowCard);
    t.ok(ctx.lines.some(l => l.mastery === "slow" && l.status === "rejected"), "rejected Slow line in report");
    t.ok(/PHB/.test(ctx.engine), "engine named");
  });
}
