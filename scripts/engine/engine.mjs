import { log } from "../diag.mjs";
import { TIMING, BUILT, attackOutcome, eligibleMastery, sourceExpires, lineText, toppleDC, grazeDamage } from "./rules.mjs";

/*
 * Mastery engine: applies weapon masteries per the 2024 PHB (see SPEC-masteries.md).
 * - Runs only while Automated Masteries 5e is off, only in a started combat.
 * - The active GM's browser decides and writes everything. Other browsers forward events by query.
 * - Each result is a line on the attack card. The GM approves or rejects it until the attacker's next turn starts.
 * - Effects carry their own expiry ("sources"), cleared on combat turn changes.
 */

const MOD = "wm5e-auto-masteries";
const WM5E = "wm5e";
export const QUERY = `${MOD}.run`;
const NAME = { sap: "Sap (weapon mastery)", vex: "Vex (weapon mastery)", slow: "Slow (weapon mastery)" };
const IMG = { sap: "icons/svg/downgrade.svg", vex: "icons/svg/target.svg", slow: "icons/svg/net.svg" };
const RECENT = 200;

const CLIENT = Math.random().toString(36).slice(2, 10);
const CLAIM_MS = 400;
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * One browser acts, even when the same GM user is logged in twice (both count as the active GM).
 * Each writes its token to the document, waits for the writes to settle, and only the token that stuck proceeds.
 */
export async function claim(doc, key) {
  if (!doc?.setFlag) return true;
  await doc.setFlag(MOD, `claims.${key}`, CLIENT);
  await wait(CLAIM_MS);
  return doc.flags?.[MOD]?.claims?.[key] === CLIENT;
}

const setting = (key, fallback) => { try { return game.settings.get(MOD, key); } catch (err) { return fallback; } };
export const engineActive = () => !game.modules?.get(WM5E)?.active;
const flag = (doc, key) => doc?.flags?.[MOD]?.[key];

/* ---------- Settings ---------- */

export function registerEngineSettings() {
  game.settings.register(MOD, "homebrew", {
    name: "WM5EAM.homebrew.name", hint: "WM5EAM.homebrew.hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(MOD, "npcMasteries", {
    name: "WM5EAM.npcMasteries.name", hint: "WM5EAM.npcMasteries.hint",
    scope: "world", config: true, type: String, default: "off",
    choices: { off: "WM5EAM.npcMasteries.off", feature: "WM5EAM.npcMasteries.feature", all: "WM5EAM.npcMasteries.all" }
  });
}

/* ---------- Lookups ---------- */

/** Combat position of an actor right now, or null when it is not in a started combat. */
export function turnStamp(actor) {
  if (!actor) return null;
  for (const combat of game.combats?.contents ?? []) {
    if (!combat.started) continue;
    const combatant = combat.combatants.find(c => c.actor?.uuid === actor.uuid || c.actorId === actor.id);
    if (combatant) return { combatId: combat.id, round: combat.round, turn: combat.turn, combatantId: combatant.id };
  }
  return null;
}

function npcHasFeature(actor) {
  return !!actor?.items?.some(i => i.type === "feat" && /weapon master/i.test(i.name));
}

/** The mastery this attack message uses, or null. */
export function masteryFor(message) {
  const item = message.getAssociatedItem?.();
  const actor = message.getAssociatedActor?.() ?? item?.parent;
  if (item?.type !== "weapon" || !actor) return null;
  return eligibleMastery({
    actorType: actor.type,
    messageMastery: message.system?.mastery,
    itemMastery: item.system?.mastery,
    homebrew: !!setting("homebrew", false),
    npcMode: setting("npcMasteries", "off"),
    npcHasFeature: npcHasFeature(actor)
  });
}

/** The attack a damage card belongs to: the latest attack from the same use, made before the damage. */
export function findAttack(damageMessage) {
  if (!damageMessage) return null;
  const origin = damageMessage.getOriginatingMessage?.();
  if (origin?.type === "attack") return origin;
  const activity = damageMessage._source?.system?.activity?.uuid;
  const attacks = (origin?.getAssociatedRolls?.("attack") ?? [])
    .filter(m => m.timestamp <= damageMessage.timestamp)
    .filter(m => !activity || m._source?.system?.activity?.uuid === activity);
  return attacks.at(-1) ?? null;
}

function singleTarget(message) {
  const targets = message.system?.targets ?? [];
  return targets.length === 1 ? targets[0] : null;
}

function sameTarget(target, actor) {
  if (!target || !actor) return false;
  return target.actor === actor.uuid || (!!actor.token && target.token === actor.token.uuid);
}

/* ---------- Running on the active GM ---------- */

/** Run a job on the active GM's browser. */
export async function runOnGM(job) {
  if (game.user?.isActiveGM) return handle(job);
  const gm = game.users?.activeGM;
  if (!gm) { log().warn("no GM online: weapon mastery skipped", job); return null; }
  return gm.query(QUERY, job, { timeout: 15000 });
}

/** Query handler on the GM. Registered as CONFIG.queries[QUERY]. */
export async function handle(job) {
  if (!engineActive() || !game.user?.isGM) return null;
  switch (job?.kind) {
    case "damage": return onDamageLanded(job);
    case "consume": return consumeEffect(job.effectUuid);
    default: log().warn("unknown mastery job", job); return null;
  }
}

/* ---------- Effects with sources ---------- */

/**
 * Add a source to the mastery effect on an actor, creating the effect if needed.
 * One effect per mastery per actor (Vex: per target), so Slow and Sap never stack.
 */
async function addSource(holder, mastery, source, { item, targetUuid } = {}) {
  const existing = holder.effects.find(e => flag(e, "mastery") === mastery && (mastery !== "vex" || flag(e, "targetUuid") === targetUuid));
  if (existing) {
    await existing.setFlag(MOD, "sources", [...(flag(existing, "sources") ?? []), source]);
    return existing;
  }
  const data = {
    name: NAME[mastery],
    img: IMG[mastery],
    origin: item?.uuid ?? null,
    disabled: false,
    transfer: false,
    flags: { [MOD]: { mastery, sources: [source], targetUuid: targetUuid ?? null } }
  };
  if (mastery === "slow") data.system = { changes: [{ key: "system.attributes.movement.bonus", type: "add", value: "-10" }] };
  const [effect] = await holder.createEmbeddedDocuments("ActiveEffect", [data]);
  return effect;
}

async function removeSource(effectUuid, sourceId) {
  const effect = await fromUuid(effectUuid);
  if (!effect) return false;
  const left = (flag(effect, "sources") ?? []).filter(s => s.id !== sourceId);
  if (left.length) await effect.setFlag(MOD, "sources", left);
  else await effect.delete();
  return true;
}

async function consumeEffect(effectUuid) {
  const effect = await fromUuid(effectUuid);
  if (effect) await effect.delete();
  return true;
}

/* ---------- Lines on the attack card ---------- */

async function addLine(attackMessage, line) {
  const lines = [...(flag(attackMessage, "lines") ?? []), line];
  await attackMessage.setFlag(MOD, "lines", lines);
}

/** One decision per attack per mastery: a rejected line is not re-applied by later damage. */
const hasLine = (message, mastery) => (flag(message, "lines") ?? []).some(l => l.mastery === mastery);

export async function setLineStatus(message, lineId, status) {
  const lines = (flag(message, "lines") ?? []).map(l => l.id === lineId ? { ...l, status } : l);
  await message.setFlag(MOD, "lines", lines);
}

export async function updateLine(message, lineId, patch) {
  const lines = (flag(message, "lines") ?? []).map(l => l.id === lineId ? { ...l, ...patch } : l);
  await message.setFlag(MOD, "lines", lines);
}

/** Reverse what a line did: an effect source, a status, a posted card, or a moved token. */
async function undo(line) {
  if (line.effectUuid) await removeSource(line.effectUuid, line.id);
  const u = line.undo;
  if (u?.type === "status") {
    const actor = await fromUuid(u.actorUuid);
    if (actor?.statuses?.has(u.status)) await actor.toggleStatusEffect(u.status, { active: false });
  } else if (u?.type === "message") {
    await game.messages.get(u.messageId)?.delete();
  } else if (u?.type === "move") {
    const token = await fromUuid(u.tokenUuid);
    if (token) await token.update({ x: u.x, y: u.y }, { animate: false });
  }
}

/** GM Reject: reverse the line's effect, then mark it rejected. */
export async function rejectLine(message, lineId) {
  const line = (flag(message, "lines") ?? []).find(l => l.id === lineId);
  if (!line || line.status !== "applied") return;
  await undo(line);
  await updateLine(message, lineId, { status: "rejected", actions: [] });
}

/** GM-only action buttons on a line (Topple: Roll save). */
export async function runLineAction(message, lineId, actionId) {
  const line = (flag(message, "lines") ?? []).find(l => l.id === lineId);
  if (!line || line.status !== "applied") return null;
  if (actionId === "rollSave") return rollToppleSave(message, line);
  log().warn("unknown line action", { messageId: message.id, lineId, actionId });
  return null;
}

/** Topple: roll the target's Constitution save against the stored DC. Prone on a failure. */
async function rollToppleSave(message, line) {
  const target = await fromUuid(line.save?.targetUuid);
  if (!target) { log().warn("Topple target is gone", { messageId: message.id }); return null; }
  const rolls = await target.rollSavingThrow({ ability: "con", target: line.save.dc }, { configure: false }, {});
  const roll = rolls?.[0];
  if (!roll) return null;
  const failed = roll.total < line.save.dc;
  let undoData = null;
  if (failed && !target.statuses?.has("prone")) {
    await target.toggleStatusEffect("prone", { active: true });
    undoData = { type: "status", actorUuid: target.uuid, status: "prone" };
  }
  await updateLine(message, line.id, {
    text: lineText("topple", { target: target.name, dc: line.save.dc, total: roll.total, failed }),
    actions: [], undo: undoData
  });
  return failed;
}

/* ---------- Applying masteries ---------- */

async function applyMastery(mastery, { attackMessage, attacker, target, targetActor, item, stamp }) {
  const id = foundry.utils.randomID();
  let effect;
  if (mastery === "sap") {
    effect = await addSource(targetActor, "sap", { id, edge: "start", applied: stamp, messageId: attackMessage.id }, { item });
  } else if (mastery === "slow") {
    effect = await addSource(targetActor, "slow", { id, edge: "start", applied: stamp, messageId: attackMessage.id }, { item });
  } else if (mastery === "vex") {
    effect = await addSource(attacker, "vex", { id, edge: "end", applied: stamp, messageId: attackMessage.id }, { item, targetUuid: targetActor.uuid });
  } else if (mastery === "topple") {
    return applyTopple({ id, attackMessage, attacker, target, targetActor, stamp });
  } else if (mastery === "graze") {
    return applyGraze({ id, attackMessage, attacker, target, targetActor, item, stamp });
  } else return null;
  await addLine(attackMessage, {
    id, mastery, status: "applied", applied: stamp,
    text: lineText(mastery, { target: target?.name ?? targetActor.name }),
    effectUuid: effect?.uuid ?? null
  });
  log().info(`${mastery} applied`, { messageId: attackMessage.id, weapon: item?.name, target: targetActor.name });
  return effect;
}

/** The ability modifier the attack used (dnd5e records the ability on the attack card). */
function attackAbilityMod(attackMessage, attacker, item) {
  const ability = attackMessage.system?.ability
    ?? item?.system?.activities?.find?.(a => a.type === "attack")?.ability
    ?? "str";
  return { ability, mod: attacker.system?.abilities?.[ability]?.mod ?? 0 };
}

/** Topple: line with the DC and a GM Roll save button. */
async function applyTopple({ id, attackMessage, attacker, target, targetActor, stamp }) {
  const name = target?.name ?? targetActor.name;
  if (targetActor.statuses?.has("prone")) {
    await addLine(attackMessage, { id, mastery: "topple", status: "applied", applied: stamp, text: lineText("topple", { target: name, already: true }) });
    return null;
  }
  const { mod } = attackAbilityMod(attackMessage, attacker, attackMessage.getAssociatedItem());
  const dc = toppleDC(mod, attacker.system?.attributes?.prof);
  await addLine(attackMessage, {
    id, mastery: "topple", status: "applied", applied: stamp,
    text: lineText("topple", { target: name, dc }),
    save: { dc, targetUuid: targetActor.uuid },
    actions: [{ id: "rollSave", label: `${game.i18n?.localize?.("WM5EAM.lines.rollSave") ?? "Roll save"} (DC ${dc})` }]
  });
  ui.notifications?.info(game.i18n?.format?.("WM5EAM.lines.toppleNotice", { target: name, dc }) ?? `Topple: roll ${name}'s DC ${dc} Constitution save on the attack card.`);
  log().info("topple save pending", { messageId: attackMessage.id, dc, target: name });
  return null;
}

/** Graze: post a damage card for the attack's ability modifier, in the weapon's damage type. */
async function applyGraze({ id, attackMessage, attacker, target, targetActor, item, stamp }) {
  const { mod } = attackAbilityMod(attackMessage, attacker, item);
  const amount = grazeDamage(mod);
  if (!amount) return null;
  const type = [...(item.system?.damage?.base?.types ?? [])][0] ?? null;
  const roll = new CONFIG.Dice.DamageRoll(String(amount), {}, { type, properties: [] });
  await roll.evaluate();
  const src = attackMessage._source?.system ?? {};
  const card = await ChatMessage.implementation.create({
    type: "damage",
    rolls: [roll],
    speaker: attackMessage.speaker,
    flavor: game.i18n?.localize?.("WM5EAM.lines.grazeFlavor") ?? "Graze (weapon mastery)",
    whisper: attackMessage.whisper ?? [],
    blind: !!attackMessage.blind,
    system: { activity: src.activity, item: src.item, origin: src.origin ?? null, targets: src.targets ?? [] },
    flags: { [MOD]: { extra: "graze", attackId: attackMessage.id } }
  });
  const typeLabel = type ? (CONFIG.DND5E?.damageTypes?.[type]?.label ?? type).toLowerCase() : null;
  await addLine(attackMessage, {
    id, mastery: "graze", status: "applied", applied: stamp,
    text: lineText("graze", { target: target?.name ?? targetActor.name, damage: amount, type: typeLabel }),
    undo: { type: "message", messageId: card?.id }
  });
  log().info("graze damage posted", { messageId: attackMessage.id, amount, type });
  return card;
}

/** Context shared by attack- and damage-time decisions. Null when nothing should happen. */
async function attackContext(attackMessage) {
  if (attackMessage?.type !== "attack") return null;
  const mastery = masteryFor(attackMessage);
  if (!mastery || !BUILT.has(mastery)) return null;
  const item = attackMessage.getAssociatedItem();
  const attacker = attackMessage.getAssociatedActor?.() ?? item.parent;
  const stamp = turnStamp(attacker);
  if (!stamp) return null; // masteries run in combat only
  const target = singleTarget(attackMessage);
  if (!target) {
    if ((attackMessage.system?.targets ?? []).length > 1) log().unclear(`multi-target:${attackMessage.id}`, "Attack has more than one target, so no weapon mastery was applied.", { messageId: attackMessage.id, mastery });
    return null;
  }
  const outcome = attackOutcome(attackMessage.rolls?.[0], target.ac);
  if (!outcome) return null;
  const targetActor = (await fromUuid(target.token))?.actor ?? await fromUuid(target.actor);
  if (!targetActor) return null;
  return { mastery, item, attacker, stamp, target, targetActor, outcome, attackMessage };
}

/** Active GM: a new attack card was created. Applies masteries decided at attack time. */
export async function onAttackCreated(message) {
  if (!engineActive() || !game.user?.isActiveGM || message?.type !== "attack") return;
  const ctx = await attackContext(message);
  if (!ctx || TIMING[ctx.mastery]?.on !== "attack") return;
  if (TIMING[ctx.mastery].needs === "hit" && !ctx.outcome.hit) return;
  if (TIMING[ctx.mastery].needs === "miss" && !ctx.outcome.miss) return;
  if (hasLine(message, ctx.mastery)) return;
  if (!(await claim(message, `${ctx.mastery}`))) return;
  if (hasLine(message, ctx.mastery)) return;
  await applyMastery(ctx.mastery, ctx);
}

/** Active GM: damage was applied to an actor (or the GM pressed Apply weapon mastery). */
export async function onDamageLanded({ messageId, targetUuid, manual = false }) {
  const damage = game.messages.get(messageId);
  if (damage?.type !== "damage") return null;
  const attack = findAttack(damage);
  const ctx = await attackContext(attack);
  if (!ctx || TIMING[ctx.mastery]?.on !== "damage" || !ctx.outcome.hit) return null;
  if (!manual) {
    const hurt = await fromUuid(targetUuid);
    if (!sameTarget(ctx.target, hurt)) return null;
  }
  if (hasLine(attack, ctx.mastery)) return null;
  if (!(await claim(attack, `${ctx.mastery}`))) return null;
  if (hasLine(attack, ctx.mastery)) return null;
  return applyMastery(ctx.mastery, ctx);
}

/* ---------- Advantage and Disadvantage on later attacks ---------- */

function currentTargetActors() {
  return [...(game.user?.targets ?? [])].map(t => t.actor).filter(Boolean);
}

/** dnd5e.preRollAttackV2: Sap gives Disadvantage; Vex gives Advantage against its target. */
export function onPreRollAttack(config) {
  if (!engineActive()) return;
  const actor = config?.subject?.actor;
  if (!actor) return;
  const sap = actor.effects.find(e => flag(e, "mastery") === "sap");
  if (sap) config.disadvantage = true;
  const targets = currentTargetActors();
  const vex = targets.length === 1 ? actor.effects.find(e => flag(e, "mastery") === "vex" && flag(e, "targetUuid") === targets[0].uuid) : null;
  if (vex) config.advantage = true;
}

/** dnd5e.rollAttackV2: the next attack roll used the Sap or Vex, so remove it. */
export async function onRolledAttack(rolls, { subject } = {}) {
  if (!engineActive()) return;
  const actor = subject?.actor;
  if (!actor) return;
  const used = [];
  const sap = actor.effects.find(e => flag(e, "mastery") === "sap");
  if (sap) used.push(sap);
  const targets = currentTargetActors();
  const vex = targets.length === 1 ? actor.effects.find(e => flag(e, "mastery") === "vex" && flag(e, "targetUuid") === targets[0].uuid) : null;
  if (vex) used.push(vex);
  for (const effect of used) {
    if (effect.isOwner) await effect.delete();
    else await runOnGM({ kind: "consume", effectUuid: effect.uuid });
  }
}

/* ---------- Turn changes: expire sources, auto-approve lines ---------- */

/** combatTurnChange on the active GM. */
export async function onTurnChange(combat, prior, current) {
  if (!engineActive() || !game.user?.isActiveGM || !combat) return;
  const events = [];
  if (prior?.combatantId) events.push({ kind: "end", combatId: combat.id, round: prior.round, turn: prior.turn, combatantId: prior.combatantId });
  if (current?.combatantId) events.push({ kind: "start", combatId: combat.id, round: current.round, turn: current.turn, combatantId: current.combatantId });
  if (!events.length) return;
  if (!(await claim(combat, `turn-${current?.round ?? 0}-${current?.turn ?? 0}`))) return;

  const actors = new Map();
  for (const c of combat.combatants) if (c.actor) actors.set(c.actor.uuid, c.actor);
  for (const actor of actors.values()) {
    for (const effect of actor.effects.filter(e => flag(e, "sources"))) {
      const sources = flag(effect, "sources");
      const left = sources.filter(s => !events.some(ev => sourceExpires(s, ev)));
      if (left.length === sources.length) continue;
      if (left.length) await effect.setFlag(MOD, "sources", left);
      else await effect.delete();
    }
  }

  const start = events.find(e => e.kind === "start");
  if (!start) return;
  for (const message of game.messages.contents.slice(-RECENT)) {
    const lines = flag(message, "lines");
    if (!lines?.some(l => l.status === "applied" && sourceExpires({ edge: "start", applied: l.applied }, start))) continue;
    await message.setFlag(MOD, "lines", lines.map(l => (l.status === "applied" && sourceExpires({ edge: "start", applied: l.applied }, start)) ? { ...l, status: "approved" } : l));
  }
}

/* ---------- Chat card rendering ---------- */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const loc = key => game.i18n.localize(`WM5EAM.lines.${key}`);

function button(label, cls, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    log().guard(cls, onClick);
  });
  return b;
}

/** Mastery lines on attack cards; GM Apply weapon mastery button on damage cards. */
export function renderMasteryUI(message, html) {
  const root = html?.querySelector?.(".message-content") ?? html;
  if (!root) return;

  const lines = flag(message, "lines");
  if (message.type === "attack" && lines?.length && !root.querySelector?.(".wm5eam-lines")) {
    const box = document.createElement("div");
    box.className = "wm5eam-lines";
    for (const line of lines) {
      const row = document.createElement("div");
      row.className = `wm5eam-line wm5eam-${line.status}`;
      const text = document.createElement("span");
      text.className = "wm5eam-line-text";
      text.textContent = line.text;
      row.append(text);
      if (line.status === "applied" && game.user?.isGM) {
        for (const a of line.actions ?? []) row.append(button(a.label, `wm5eam-action-${a.id}`, () => runLineAction(message, line.id, a.id)));
        row.append(
          button(loc("approve"), "wm5eam-approve", () => setLineStatus(message, line.id, "approved")),
          button(loc("reject"), "wm5eam-reject", () => rejectLine(message, line.id))
        );
      } else if (line.status !== "applied") {
        const tag = document.createElement("span");
        tag.className = "wm5eam-line-status";
        tag.textContent = loc(line.status);
        row.append(tag);
      }
      box.append(row);
    }
    root.append(box);
  }

  if (message.type === "damage" && game.user?.isGM && engineActive() && !root.querySelector?.(".wm5eam-apply")) {
    const attack = findAttack(message);
    const mastery = attack ? masteryFor(attack) : null;
    if (attack && BUILT.has(mastery) && TIMING[mastery]?.on === "damage" && !hasLine(attack, mastery)) {
      const row = document.createElement("div");
      row.className = "wm5eam-apply";
      row.append(button(loc("applyMastery"), "wm5eam-apply-button", () => onDamageLanded({ messageId: message.id, manual: true })));
      const tray = root.querySelector?.("damage-application");
      if (tray?.after) tray.after(row); else root.append(row);
    }
  }
}

/* ---------- Switch-over ---------- */

let warned = false;
/** GM notice while Automated Masteries 5e is active. */
export function warnIfOtherEngine() {
  if (warned || !game.user?.isGM || engineActive()) return;
  warned = true;
  ui.notifications?.warn(game.i18n?.localize("WM5EAM.engine.otherActive") ?? "WM5EAM.engine.otherActive", { permanent: true });
  log().info("mastery engine idle: Automated Masteries 5e is active");
}

export const _test = { esc };
