// WM5E Auto Masteries 2.2.0 for dnd5e 6.0.x on Foundry v14.
// 2.2.0: never grants masteries; caps follow the 2024 PHB; repair/undo for over-cap characters.
// Design for low load: no compendium document loads, no render hooks,
// changes applied in preCreate hooks (no second write), writes only on real diffs.

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

// Highest single class (features of the same name don't stack) + 1 per Weapon Master feat.
function masteryCap(actor) {
  if (actor?.type !== "character") return 0;
  let best = 0;
  for (const [id, cls] of Object.entries(actor.classes ?? {})) best = Math.max(best, CLASS_CAP[id]?.(cls.system?.levels ?? 0) ?? 0);
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

// New world or sidebar weapon: fix data before it is written. No extra database write.
function onPreCreateItem(item, data, options) {
  if (item.type !== "weapon" || options.pack) return;
  const { changes } = planItem(item._source);
  if (changes) item.updateSource(foundry.utils.expandObject(changes));
}

// New actor with weapons already on it (compendium drag, import, duplicate): fix weapon data in one pass.
function onPreCreateActor(actor, data, options) {
  if (options.pack) return;
  const items = actor._source.items ?? [];
  let touched = false;
  const next = items.map(src => {
    if (src.type !== "weapon") return src;
    const p = planItem(src);
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
    rows.push({ actor, cap, keep, remove });
    if (apply) {
      await actor.update({
        [KEY_PATH]: keep,
        [`flags.${MOD}.repair`]: { removed: remove, at: Date.now(), version: "2.2.0" }
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
  const def = game.settings.settings.get(`${WM5E}.autoMasteries`);
  if (!def) return;
  const mode = game.settings.get(MOD, "autoTrigger");
  def.config = mode === "players";
  if (mode === "players") return;
  const want = mode === "on";
  if (game.settings.get(WM5E, "autoMasteries") !== want) {
    try { await game.settings.set(WM5E, "autoMasteries", want); }
    catch (e) { console.error(`${MOD} | could not set auto-trigger`, e); }
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
});

Hooks.once("ready", () => {
  for (const key of ["desc", "infer", "warn"]) cfg[key] = game.settings.get(MOD, key);
  cfg.link = game.packs.has(PACK);
  game.modules.get(MOD).api = { sweep, processActor, planItem, masteryCap, repair, undoRepair };
  applyAutoTrigger();
});

Hooks.on("preCreateItem", onPreCreateItem);
Hooks.on("preCreateActor", onPreCreateActor);
Hooks.on("updateActor", onUpdateActor);
