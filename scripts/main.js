// WM5E Auto Masteries 2.5.2 for dnd5e 6.0.x on Foundry v14.
// 2.2.0: never grants masteries; caps follow the 2024 PHB; repair/undo for over-cap characters.
// 2.3.0: diagnostics go through usedtp Logger (scripts/diag.mjs).
// 2.4.0: Error and Unclear buttons on weapon attack and damage cards (scripts/report.mjs).
// 2.5.0: mastery engine per the 2024 PHB (scripts/engine/): Sap, Vex, Slow; GM Approve/Reject lines.
// Design for low load: no compendium document loads, light chat and combat hooks,
// changes applied in preCreate hooks (no second write), writes only on real diffs.

import { log } from "./diag.mjs";
import { onRenderChatMessage } from "./report.mjs";
import * as engine from "./engine/engine.mjs";

const MOD = "wm5e-auto-masteries";
const PACK = "dnd5e.content24";
const WM5E = "wm5e";

// 2024 PHB Mastery column, keyed by dnd5e 6.0.6 CONFIG.DND5E.weaponIds keys.
const PHB = Object.freeze({
  club: "slow", dagger: "nick", greatclub: "push", handaxe: "vex", javelin: "slow",
  lighthammer: "nick", mace: "sap", quarterstaff: "topple", sickle: "nick", spear: "sap",
  dart: "vex", lightcrossbow: "slow", shortbow: "vex", sling: "slow",
  battleaxe: "topple", flail: "sap", glaive: "graze", greataxe: "cleave", greatsword: "graze",
  halberd: "cleave", lance: "topple", longsword: "sap", maul: "topple", morningstar: "sap",
  pike: "push", rapier: "vex", scimitar: "nick", shortsword: "vex", trident: "topple",
  warhammer: "push", warpick: "sap", whip: "slow",
  blowgun: "vex", handcrossbow: "vex", heavycrossbow: "push", longbow: "slow", musket: "slow", pistol: "vex"
});
const NAME_KEYS = Object.keys(PHB).sort((a, b) => b.length - a.length);
const WEAPON_CATS = new Set(["simpleM", "simpleR", "martialM", "martialR"]);
const BLOCK = /<section data-wm5e-mastery[^>]*>[\s\S]*?<\/section>/g;

// Fallback text, paraphrased from the PHB. Used only if the system's rules pack is missing.
const TEXT = {
  cleave: "After a melee hit, you can attack a second creature within 5 ft of the first and within your reach. Its damage leaves out your ability modifier unless that modifier is negative. Once per turn.",
  graze: "On a miss, the target still takes damage equal to the ability modifier you attacked with, in the weapon's damage type.",
  nick: "The extra attack from the Light property can be made as part of the Attack action instead of as a Bonus Action. Once per turn.",
  push: "On a hit, you can push a Large or smaller target up to 10 ft straight away from you.",
  sap: "On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.",
  slow: "On a hit that deals damage, the target's Speed drops by 10 ft until the start of your next turn. Multiple Slow hits do not stack past 10 ft.",
  topple: "On a hit, the target makes a Constitution save (DC 8 + your attack ability modifier + your Proficiency Bonus) or falls Prone.",
  vex: "On a hit that deals damage, you have Advantage on your next attack roll against that target before the end of your next turn."
};

// Settings cached in memory; read once at ready and on change.
const cfg = { desc: true, infer: true, warn: true, link: true };

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function nameKey(name) {
  const n = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return n ? (NAME_KEYS.find(k => n.includes(k)) ?? null) : null;
}

function blockFor(m) {
  const ref = cfg.link ? CONFIG.DND5E.weaponMasteries[m]?.reference : null;
  const body = ref ? `Mastery: @UUID[${ref}]{${cap(m)}}` : `<strong>Mastery: ${cap(m)}.</strong> ${TEXT[m] ?? ""}`;
  return `<section data-wm5e-mastery="${m}"><p>${body}</p></section>`;
}

// Returns the new description, or null when no change is needed.
// Compares by content, not exact string, so HTML normalization on save never causes rewrites.
function nextDescription(html, m) {
  html ??= "";
  const blocks = html.match(BLOCK) ?? [];
  if (!m) return blocks.length ? html.replace(BLOCK, "").trimEnd() : null;
  if (blocks.length === 1 && blocks[0].includes(`data-wm5e-mastery="${m}"`)) {
    const ref = CONFIG.DND5E.weaponMasteries[m]?.reference;
    const linked = blocks[0].includes("@UUID[");
    if (cfg.link ? (ref && blocks[0].includes(ref)) : !linked) return null;
  }
  return `${html.replace(BLOCK, "").trimEnd()}${blockFor(m)}`;
}

// Pure planner over item source data. Returns flat changes (or null), the base key and mastery.
function planItem(src) {
  const sys = src?.system ?? {};
  const cat = sys.type?.value;
  let base = sys.type?.baseItem || "";
  let mastery = sys.mastery || "";
  if (!base && !WEAPON_CATS.has(cat)) return { changes: null, base, mastery, weapon: false };

  const changes = {};
  const guess = base ? null : nameKey(src.name);
  if (!base && guess && cfg.infer) { base = guess; changes["system.type.baseItem"] = guess; }
  if (!mastery) {
    const m = PHB[base] ?? PHB[guess];
    if (m && CONFIG.DND5E.weaponMasteries[m]) { mastery = m; changes["system.mastery"] = m; }
  }
  if (cfg.desc) {
    const d = nextDescription(sys.description?.value, mastery);
    if (d !== null) changes["system.description.value"] = d;
  }
  for (const _ in changes) return { changes, base, mastery, weapon: true };
  return { changes: null, base, mastery, weapon: true };
}


// 2024 PHB Weapon Mastery counts by class level (matches dnd5e 6.0.6 class advancements).
const CLASS_CAP = {
  barbarian: l => (l >= 10 ? 4 : l >= 4 ? 3 : 2),
  fighter: l => (l >= 16 ? 6 : l >= 10 ? 5 : l >= 4 ? 4 : 3),
  paladin: () => 2, ranger: () => 2, rogue: () => 2
};

// 2024 PHB classes. A class outside this list gets cap 0, which the GM has to confirm.
const PHB_CLASSES = new Set(["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]);

// Highest single class (features of the same name don't stack) + 1 per Weapon Master feat.
function masteryCap(actor) {
  if (actor?.type !== "character") return 0;
  let best = 0;
  for (const [id, cls] of Object.entries(actor.classes ?? {})) {
    if (!PHB_CLASSES.has(id)) {
      log().unclear(`unknown-class:${actor.id}:${id}`, `${actor.name}'s class "${id}" is not a 2024 PHB class; its weapon mastery count is taken as 0. The GM sets masteries by hand.`,
        { actor: actor.name, actorUuid: actor.uuid, class: id, weapon: null, mastery: null });
    }
    best = Math.max(best, CLASS_CAP[id]?.(cls.system?.levels ?? 0) ?? 0);
  }
  const feats = actor.items.filter(i => i.type === "feat" && i.name.trim().toLowerCase() === "weapon master").length;
  return best + feats;
}

// Masteries the player picked through dnd5e level-up (stored on the class item).
function levelUpPicks(actor) {
  const picks = [];
  for (const cls of Object.values(actor.classes ?? {})) {
    for (const adv of cls.advancement?.byType?.Trait ?? []) {
      if (adv.configuration?.mode !== "mastery") continue;
      for (const k of adv.value?.chosen ?? []) picks.push(String(k).split(":").pop());
    }
  }
  return [...new Set(picks)];
}

const sourceKeys = actor => actor._source?.system?.traits?.weaponProf?.mastery?.value ?? [];

/**
 * A weapon the module cannot finish on its own: no PHB mastery for it (homebrew), or a player character's weapon
 * with no base item, which dnd5e needs before the mastery can be used. The GM or player sets it by hand.
 */
function noteManual(src, p, actor) {
  if (!p.weapon) return;
  const data = { weapon: src?.name, mastery: p.mastery || null, actor: actor?.name ?? null, actorUuid: actor?.uuid ?? null, baseItem: p.base || null };
  if (!p.mastery) {
    log().unclear(`no-mastery:${actor?.id ?? "world"}:${src?.name}`,
      `${src?.name} has no 2024 PHB mastery to apply (no matching base item or name). The GM sets Mastery on the item by hand.`, data);
  } else if (!p.base && actor?.type === "character") {
    log().unclear(`no-base:${actor.id}:${src?.name}`,
      `${actor.name}'s ${src?.name} has mastery ${p.mastery} but no base item, so dnd5e will not offer it. The GM sets Base Item on the weapon.`, data);
  }
}

// New world or sidebar weapon: fix data before it is written. No extra database write.
function onPreCreateItem(item, data, options) {
  if (item.type !== "weapon" || options.pack) return;
  const p = planItem(item._source);
  if (p.changes) item.updateSource(foundry.utils.expandObject(p.changes));
  noteManual(item._source, p, item.parent);
}

// New actor with weapons already on it (compendium drag, import, duplicate): fix weapon data in one pass.
function onPreCreateActor(actor, data, options) {
  if (options.pack) return;
  const items = actor._source.items ?? [];
  let touched = false;
  const next = items.map(src => {
    if (src.type !== "weapon") return src;
    const p = planItem(src);
    noteManual(src, p, actor);
    if (!p.changes) return src;
    touched = true;
    return foundry.utils.mergeObject(foundry.utils.deepClone(src), foundry.utils.expandObject(p.changes));
  });
  if (touched) actor.updateSource({ items: next });
}

// Over-cap warning: tell the GM when a character knows more weapon masteries than the PHB allows.
// Warns only; never changes data (level-up can update levels and picks in separate writes).
const KEY_PATH = "system.traits.weaponProf.mastery.value";
function overCap(actor) {
  if (actor?.type !== "character") return null;
  const known = sourceKeys(actor);
  const cap = masteryCap(actor);
  return known.length > cap ? { known: known.length, cap } : null;
}
const warned = new Map();
function warnIfOverCap(actor) {
  if (!cfg.warn || !game.users.activeGM?.isSelf) return;
  const o = overCap(actor);
  const sig = o ? `${o.known}/${o.cap}` : null;
  if (!o || warned.get(actor.id) === sig) return;
  warned.set(actor.id, sig);
  const msg = `${actor.name} knows ${o.known} weapon masteries; the PHB allows ${o.cap}. Fix it in Configure Weapons, or run the repair.`;
  log().unclear(`over-cap:${actor.id}:${sig}`, msg, { actor: actor.name, actorUuid: actor.uuid, weapon: null, mastery: sourceKeys(actor), cap: o.cap });
  ui.notifications.warn(`WM5E Auto Masteries: ${msg}`);
  ChatMessage.implementation.create({ content: `<b>WM5E Auto Masteries</b><br>${msg}`, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
}
function onUpdateActor(actor, changes) {
  if (foundry.utils.hasProperty(changes, KEY_PATH)) warnIfOverCap(actor);
}

// Repair: trim each over-cap character to their PHB cap. Dry run unless apply is true.
// Keeps level-up picks first, then the remaining known masteries in their current order.
// Removed picks are saved in a flag so undoRepair() can put them back.
async function repair({ apply = false, actors = null } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("WM5E Auto Masteries: repair is GM only.");
  const list = (actors ?? game.actors.contents).filter(a => a.type === "character");
  const rows = [];
  for (const actor of list) {
    const known = sourceKeys(actor);
    const cap = masteryCap(actor);
    if (known.length <= cap) continue;
    const picks = levelUpPicks(actor).filter(k => known.includes(k));
    const keep = [...new Set([...picks, ...known])].slice(0, cap);
    const remove = known.filter(k => !keep.includes(k));
    if (picks.length < keep.length) {
      log().unclear(`repair-order:${actor.id}`,
        `${actor.name} has no level-up picks for ${keep.length - picks.length} of the ${cap} masteries kept, so the first ones in the list were kept. The GM or player confirms the choice in Configure Weapons.`,
        { actor: actor.name, actorUuid: actor.uuid, weapon: null, mastery: keep, removed: remove, levelUpPicks: picks });
    }
    rows.push({ actor, cap, keep, remove });
    if (apply) {
      await actor.update({
        [KEY_PATH]: keep,
        [`flags.${MOD}.repair`]: { removed: remove, at: Date.now(), version: game.modules.get(MOD)?.version }
      });
    }
  }
  const lines = rows.map(r => `${r.actor.name} (cap ${r.cap}): ${apply ? "removed" : "would remove"} ${r.remove.join(", ")}${r.keep.length ? ` | keeps ${r.keep.join(", ")}` : ""}`);
  await ChatMessage.implementation.create({
    whisper: [game.user.id],
    content: `<b>WM5E repair: ${apply ? "APPLIED" : "DRY RUN, nothing changed"}</b><br>`
      + (lines.length ? lines.join("<br>") : "Every character is within their PHB cap.")
      + (!apply && lines.length ? `<br>To apply: <code>await game.modules.get("${MOD}").api.repair({ apply: true })</code>` : "")
  });
  return rows.map(r => ({ name: r.actor.name, cap: r.cap, keep: r.keep, remove: r.remove }));
}

// Undo: restore masteries a repair removed.
async function undoRepair({ actors = null } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("WM5E Auto Masteries: undo is GM only.");
  const restored = [];
  for (const actor of (actors ?? game.actors.contents)) {
    const rec = actor.getFlag(MOD, "repair");
    if (!rec?.removed?.length) continue;
    const keys = [...new Set([...sourceKeys(actor), ...rec.removed])];
    await actor.update({ [KEY_PATH]: keys });
    await actor.unsetFlag(MOD, "repair");
    restored.push(`${actor.name}: ${rec.removed.join(", ")}`);
  }
  await ChatMessage.implementation.create({
    whisper: [game.user.id],
    content: `<b>WM5E undo repair</b><br>${restored.length ? restored.join("<br>") : "Nothing to restore."}`
  });
  return restored;
}

// One actor: write only what differs. Never changes known masteries.
async function processActor(actor, report) {
  const weapons = actor.itemTypes?.weapon;
  if (!weapons?.length) return;
  const updates = [];
  for (const item of weapons) {
    const p = planItem(item._source);
    if (p.changes) updates.push({ _id: item.id, ...p.changes });
    if (p.weapon && !p.mastery) report?.manual.push(`${actor.name}: ${item.name}`);
    noteManual(item._source, p, actor);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (report && updates.length) {
    report.actors++;
    report.items += updates.length;
  }
}

// GM sweep. Base actors and world items by default; unlinked scene tokens on request.
async function sweep({ scenes = false } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("WM5E Auto Masteries: the sweep is GM only.");
  const report = { actors: 0, items: 0, world: 0, manual: [] };
  for (const actor of game.actors) await processActor(actor, report);
  if (scenes) {
    for (const scene of game.scenes) {
      for (const t of scene.tokens) if (!t.actorLink && t.actor) await processActor(t.actor, report);
    }
  }
  const worldUpdates = [];
  for (const item of game.items) {
    if (item.type !== "weapon") continue;
    const { changes } = planItem(item._source);
    if (changes) worldUpdates.push({ _id: item.id, ...changes });
  }
  if (worldUpdates.length) await Item.implementation.updateDocuments(worldUpdates);
  report.world = worldUpdates.length;

  const manual = report.manual.length
    ? `<details><summary>${report.manual.length} weapon${report.manual.length === 1 ? "" : "s"} need${report.manual.length === 1 ? "s" : ""} manual setup</summary>${report.manual.join("<br>")}</details>`
    : "No weapons need manual setup.";
  await ChatMessage.implementation.create({
    content: `<b>WM5E Auto Masteries sweep</b><br>Actors changed: ${report.actors}<br>`
      + `Actor weapons changed: ${report.items}<br>World items changed: ${report.world}<br>${manual}`,
    whisper: [game.user.id]
  });
  return report;
}

// GM control of Automated Masteries 5e's per-user "Automatically Trigger Masteries" (wm5e.autoMasteries).
// Each client syncs its own user setting to the GM's choice once at login and on change; no writes when already in sync.
async function applyAutoTrigger() {
  if (!game.modules.get(WM5E)?.active) return;
  const mode = game.settings.get(MOD, "autoTrigger");
  const def = game.settings.settings.get(`${WM5E}.autoMasteries`);
  if (!def) {
    log().unclear("autotrigger-setting-missing",
      `Automated Masteries 5e has no "autoMasteries" setting, so auto-trigger cannot be set to "${mode}". Each player sets it in Automated Masteries 5e.`,
      { weapon: null, mastery: null, actor: null, mode, wm5eVersion: game.modules.get(WM5E)?.version });
    return;
  }
  def.config = mode === "players";
  if (mode === "players") return;
  const want = mode === "on";
  if (game.settings.get(WM5E, "autoMasteries") !== want) {
    await log().guard("set auto-trigger", () => game.settings.set(WM5E, "autoMasteries", want), { weapon: null, mastery: null, actor: null, mode, want });
  }
}

Hooks.once("init", () => {
  for (const key of ["desc", "infer", "warn"]) {
    game.settings.register(MOD, key, {
      name: `WM5EAM.${key}.name`, hint: `WM5EAM.${key}.hint`,
      scope: "world", config: true, type: Boolean, default: true,
      onChange: v => { cfg[key] = v; }
    });
  }
  game.settings.register(MOD, "autoTrigger", {
    name: "WM5EAM.autoTrigger.name", hint: "WM5EAM.autoTrigger.hint",
    scope: "world", config: true, type: String, default: "on",
    choices: { on: "WM5EAM.autoTrigger.on", off: "WM5EAM.autoTrigger.off", players: "WM5EAM.autoTrigger.players" },
    onChange: () => applyAutoTrigger()
  });
  game.settings.register(MOD, "reportButtons", {
    name: "WM5EAM.reportButtons.name", hint: "WM5EAM.reportButtons.hint",
    scope: "world", config: true, type: Boolean, default: true
  });
});

// Mastery lines and Error/Unclear buttons on weapon cards. A failure here never breaks the chat card.
Hooks.on("renderChatMessageHTML", (message, html) => {
  try { engine.renderMasteryUI(message, html); } catch (err) { log().error("mastery lines failed", err, { messageId: message?.id }); }
  try { onRenderChatMessage(message, html); } catch (err) { log().error("report buttons failed", err, { messageId: message?.id }); }
});

// Mastery engine (2024 PHB). Idle while Automated Masteries 5e is active. See SPEC-masteries.md.
Hooks.once("init", () => {
  engine.registerEngineSettings();
  (CONFIG.queries ??= {})[engine.QUERY] = data => log().guard("mastery query", () => engine.handle(data), { job: data });
});
Hooks.once("ready", () => log().guard("mastery engine check", () => engine.warnIfOtherEngine()));
Hooks.on("createChatMessage", message => {
  if (message?.type !== "attack") return;
  return log().guard("mastery on attack", () => engine.onAttackCreated(message), { messageId: message.id });
});
// Must stay synchronous: it changes the roll config before the roll.
Hooks.on("dnd5e.preRollAttackV2", config => {
  try { engine.onPreRollAttack(config); } catch (err) { log().error("mastery advantage check", err, { actor: config?.subject?.actor?.name ?? null }); }
});
Hooks.on("dnd5e.rollAttackV2", (rolls, data) => log().guard("mastery after attack", () => engine.onRolledAttack(rolls, data), { actor: data?.subject?.actor?.name ?? null }));
Hooks.on("dnd5e.applyDamage", (actor, amount, options) => {
  if (!(amount > 0) || !options?.origin?.id || !engine.engineActive()) return;
  return log().guard("mastery on damage", () => engine.runOnGM({ kind: "damage", messageId: options.origin.id, targetUuid: actor.uuid }), { messageId: options.origin.id, target: actor.name });
});
Hooks.on("combatTurnChange", (combat, prior, current) => log().guard("mastery turn change", () => engine.onTurnChange(combat, prior, current), { combatId: combat?.id }));

Hooks.once("ready", () => {
  for (const key of ["desc", "infer", "warn"]) cfg[key] = game.settings.get(MOD, key);
  cfg.link = game.packs.has(PACK);
  game.modules.get(MOD).api = {
    sweep: o => log().guard("sweep", () => sweep(o)),
    repair: o => log().guard("repair", () => repair(o)),
    undoRepair: o => log().guard("undo repair", () => undoRepair(o)),
    processActor, planItem, masteryCap, log
  };
  log().info("ready");
  applyAutoTrigger();
});

// Each mastery hook runs inside log().guard: a failure is logged with the weapon, mastery and actor, and Foundry
// carries on. guard calls the handler synchronously, so preCreate changes still land before the document is saved.
Hooks.on("preCreateItem", (item, data, options) => {
  if (item.type !== "weapon") return;
  return log().guard("preCreateItem", () => onPreCreateItem(item, data, options),
    { weapon: item.name, mastery: item._source?.system?.mastery || null, actor: item.parent?.name ?? null, actorUuid: item.parent?.uuid ?? null });
});
Hooks.on("preCreateActor", (actor, data, options) => {
  const weapons = (actor._source?.items ?? []).filter(i => i.type === "weapon");
  if (!weapons.length) return;
  return log().guard("preCreateActor", () => onPreCreateActor(actor, data, options),
    { weapon: weapons.map(i => i.name), mastery: weapons.map(i => i.system?.mastery || null), actor: actor.name });
});
Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, KEY_PATH)) return;
  return log().guard("updateActor", () => onUpdateActor(actor, changes),
    { weapon: null, mastery: sourceKeys(actor), actor: actor.name, actorUuid: actor.uuid });
});
