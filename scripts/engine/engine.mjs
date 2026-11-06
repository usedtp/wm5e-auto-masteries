import { log } from "../diag.mjs";
import { TIMING, BUILT, attackOutcome, eligibleMastery, sourceExpires, lineText } from "./rules.mjs";

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

const hasLine = (message, mastery) => (flag(message, "lines") ?? []).some(l => l.mastery === mastery && l.status !== "rejected");

export async function setLineStatus(message, lineId, status) {
  const lines = (flag(message, "lines") ?? []).map(l => l.id === lineId ? { ...l, status } : l);
  await message.setFlag(MOD, "lines", lines);
}

/** GM Reject: reverse the line's effect, then mark it rejected. */
export async function rejectLine(message, lineId) {
  const line = (flag(message, "lines") ?? []).find(l => l.id === lineId);
  if (!line || line.status !== "applied") return;
  if (line.effectUuid) await removeSource(line.effectUuid, line.id);
  await setLineStatus(message, lineId, "rejected");
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
  } else return null;
  await addLine(attackMessage, {
    id, mastery, status: "applied", applied: stamp,
    text: lineText(mastery, { target: target?.name ?? targetActor.name }),
    effectUuid: effect?.uuid ?? null
  });
  log().info(`${mastery} applied`, { messageId: attackMessage.id, weapon: item?.name, target: targetActor.name });
  return effect;
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
