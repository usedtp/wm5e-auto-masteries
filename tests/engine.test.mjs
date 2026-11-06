// Mastery engine: PHB rules and the Sap, Vex, Slow flows, with a mocked Foundry.
import assert from "node:assert/strict";

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log("ok  ", m); pass++; };

/* ---------- Mock Foundry ---------- */
const MOD = "wm5e-auto-masteries";
let n = 0;
const docs = new Map();
const logs = [];

class Effect {
  constructor(parent, data) { this.parent = parent; Object.assign(this, structuredClone(data)); this.id = `e${n++}`; this.uuid = `${parent.uuid}.ActiveEffect.${this.id}`; this.flags ??= {}; docs.set(this.uuid, this); }
  get isOwner() { return true; }
  async setFlag(m, k, v) { const o = (this.flags[m] ??= {}); const p = k.split("."); let c = o; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = structuredClone(v); }
  async delete() { this.parent.effects = this.parent.effects.filter(e => e !== this); docs.delete(this.uuid); }
}
let saveTotal = 5;
class Actor {
  constructor(id, type, name) {
    this.id = id; this.type = type; this.name = name; this.uuid = `Actor.${id}`; this.effects = []; this.items = []; this.statuses = new Set();
    this.system = { abilities: { str: { mod: 3 }, dex: { mod: 1 } }, attributes: { prof: 2 } };
    docs.set(this.uuid, this);
  }
  async toggleStatusEffect(id, { active }) { if (active) this.statuses.add(id); else this.statuses.delete(id); }
  async rollSavingThrow(config) { this.lastSave = config; return [{ total: saveTotal }]; }
  async createEmbeddedDocuments(t, list) { const made = list.map(d => new Effect(this, d)); this.effects.push(...made); return made; }
}
class Message {
  constructor(data) { Object.assign(this, data); this.flags ??= {}; this._source = { system: { activity: { uuid: data.activityUuid ?? "Act.1" }, origin: "u0", targets: data.system?.targets ?? [] } }; this.timestamp ??= n++; this.whisper ??= []; }
  async delete() { const i = messages.indexOf(this); if (i >= 0) messages.splice(i, 1); }
  async setFlag(m, k, v) { const o = (this.flags[m] ??= {}); const p = k.split("."); let c = o; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = structuredClone(v); }
  getAssociatedItem() { return this.item; }
  getAssociatedActor() { return this.actor; }
  getOriginatingMessage() { return this.origin ?? this; }
  getAssociatedRolls(type) { return this.rolls_?.filter(m => m.type === type) ?? []; }
}

const attacker = new Actor("pc1", "character", "Test Fighter");
const goblin = new Actor("npc1", "npc", "Goblin");
const ogre = new Actor("npc2", "npc", "Ogre");
const weapon = mastery => ({ type: "weapon", name: "Test Weapon", uuid: "Item.w1", parent: attacker, system: { mastery, damage: { base: { types: new Set(["slashing"]) } } } });

const combat = {
  id: "c1", started: true, round: 1, turn: 0,
  combatants: [{ id: "cbPC", actor: attacker, actorId: attacker.id }, { id: "cbG", actor: goblin, actorId: goblin.id }, { id: "cbO", actor: ogre, actorId: ogre.id }]
};
const messages = [];
let wm5eActive = false;
const settings = { homebrew: false, npcMasteries: "off" };

globalThis.game = {
  user: { id: "gm", isGM: true, isActiveGM: true, targets: new Set() },
  users: { activeGM: { id: "gm" } },
  modules: { get: id => id === "wm5e" ? { active: wm5eActive } : id === "usedtp-logger" ? { api: { register: () => logger } } : null },
  settings: { get: (m, k) => settings[k], register() {} },
  combats: { contents: [combat] },
  messages: { get: id => messages.find(m => m.id === id), contents: messages },
  i18n: { localize: k => k }
};
const logger = {
  info: (m, d) => logs.push(["info", m, d]), warn: (m, d) => logs.push(["warn", m, d]), debug() {},
  error: (m, e, d) => logs.push(["error", m, e, d]), unclear: (k, m, d) => logs.push(["unclear", k, m, d]),
  async guard(l, fn) { try { return await fn(); } catch (err) { logs.push(["error", l, err]); return undefined; } }
};
globalThis.foundry = { utils: { randomID: () => `r${n++}` } };
globalThis.CONFIG = { Dice: { DamageRoll: class { constructor(f, d, o) { this.formula = f; this.options = o; } async evaluate() { this.total = Number(this.formula); return this; } } }, DND5E: { damageTypes: { slashing: { label: "Slashing" } } } };
globalThis.ChatMessage = { implementation: { create: async data => { const m = new Message({ id: `g${n++}`, ...data }); messages.push(m); return m; } } };
globalThis.fromUuid = async u => docs.get(u) ?? null;
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };

const rules = await import("../scripts/engine/rules.mjs");
const E = await import("../scripts/engine/engine.mjs");

/* ---------- Rules ---------- */
ok(rules.attackOutcome({ total: 5, isCritical: true }, 20).hit, "natural 20 always hits");
ok(rules.attackOutcome({ total: 30, isFumble: true }, 10).miss, "natural 1 always misses");
ok(rules.attackOutcome({ total: 15 }, 15).hit && rules.attackOutcome({ total: 14 }, 15).miss, "meets AC hits, below misses");
ok(rules.attackOutcome({ total: 15 }, undefined) === null, "unknown AC gives no outcome");
ok(rules.eligibleMastery({ actorType: "character", messageMastery: "sap" }) === "sap", "PC uses the mastery dnd5e recorded");
ok(rules.eligibleMastery({ actorType: "character", messageMastery: undefined, itemMastery: "sap" }) === null, "PC without the mastery gets none");
ok(rules.eligibleMastery({ actorType: "npc", itemMastery: "sap", homebrew: false, npcMode: "all" }) === null, "NPC: no masteries without homebrew");
ok(rules.eligibleMastery({ actorType: "npc", itemMastery: "sap", homebrew: true, npcMode: "all" }) === "sap", "NPC house rule: all");
ok(rules.eligibleMastery({ actorType: "npc", itemMastery: "sap", homebrew: true, npcMode: "feature", npcHasFeature: false }) === null, "NPC house rule: feature required");
const applied = { combatId: "c1", round: 1, turn: 0, combatantId: "cbPC" };
ok(!rules.sourceExpires({ edge: "start", applied }, { kind: "start", combatId: "c1", round: 1, turn: 0, combatantId: "cbPC" }), "not expired in the turn it was applied");
ok(rules.sourceExpires({ edge: "start", applied }, { kind: "start", combatId: "c1", round: 2, turn: 0, combatantId: "cbPC" }), "start edge: expires at attacker's next turn start");
ok(!rules.sourceExpires({ edge: "end", applied }, { kind: "end", combatId: "c1", round: 1, turn: 0, combatantId: "cbPC" }), "end edge: survives the end of the current turn");
ok(rules.sourceExpires({ edge: "end", applied }, { kind: "end", combatId: "c1", round: 2, turn: 0, combatantId: "cbPC" }), "end edge: expires at the end of the next turn");
ok(!rules.sourceExpires({ edge: "start", applied }, { kind: "start", combatId: "c1", round: 2, turn: 1, combatantId: "cbG" }), "other combatant's turn does not expire it");

/* ---------- Flows ---------- */
const target = (actor, ac = 12) => ({ actor: actor.uuid, token: null, ac, name: actor.name });
function attackMsg(mastery, total, tgt = goblin, extra = {}) {
  const m = new Message({ id: `m${n++}`, type: "attack", item: weapon(mastery), actor: attacker, system: { mastery, targets: [target(tgt)] }, rolls: [{ total }], ...extra });
  messages.push(m);
  return m;
}
function damageMsg(attack) {
  const usage = new Message({ id: `u${n++}`, type: "usage" });
  usage.rolls_ = [attack];
  attack.origin = undefined;
  const d = new Message({ id: `d${n++}`, type: "damage", origin: usage, system: {} });
  messages.push(d);
  return d;
}
const fx = (actor, mastery) => actor.effects.find(e => e.flags[MOD]?.mastery === mastery);

// Sap on hit
const a1 = attackMsg("sap", 18);
await E.onAttackCreated(a1);
ok(fx(goblin, "sap"), "Sap: effect on target after a hit");
ok(a1.flags[MOD].lines[0].mastery === "sap" && a1.flags[MOD].lines[0].status === "applied", "Sap: line on the attack card");

// Sap on miss: nothing
const a2 = attackMsg("sap", 3, ogre);
await E.onAttackCreated(a2);
ok(!fx(ogre, "sap") && !a2.flags[MOD]?.lines, "Sap: nothing on a miss");

// Disadvantage on the sapped creature's next attack, then consumed
const cfg = { subject: { actor: goblin } };
E.onPreRollAttack(cfg);
ok(cfg.disadvantage === true, "Sap: target's next attack has Disadvantage");
await E.onRolledAttack([], { subject: { actor: goblin } });
ok(!fx(goblin, "sap"), "Sap: used up by that attack");

// Out of combat: nothing
combat.started = false;
const a3 = attackMsg("sap", 18);
await E.onAttackCreated(a3);
ok(!fx(goblin, "sap"), "No mastery outside combat");
combat.started = true;

// Automated Masteries 5e active: engine idle
wm5eActive = true;
const a4 = attackMsg("sap", 18);
await E.onAttackCreated(a4);
ok(!fx(goblin, "sap"), "Engine idle while Automated Masteries 5e is active");
wm5eActive = false;

// Vex and Slow only when damage lands on the attack's target
const v1 = attackMsg("vex", 18);
const dv = damageMsg(v1);
await E.onDamageLanded({ messageId: dv.id, targetUuid: ogre.uuid });
ok(!attacker.effects.some(e => e.flags[MOD]?.mastery === "vex"), "Vex: damage to a different creature does not count");
await E.onDamageLanded({ messageId: dv.id, targetUuid: goblin.uuid });
const vex = attacker.effects.find(e => e.flags[MOD]?.mastery === "vex");
ok(vex && vex.flags[MOD].targetUuid === goblin.uuid, "Vex: effect on attacker, tied to the target");
await E.onDamageLanded({ messageId: dv.id, targetUuid: goblin.uuid });
ok(v1.flags[MOD].lines.length === 1, "Vex: applying damage twice adds one line");

game.user.targets = new Set([{ actor: ogre }]);
const c2 = { subject: { actor: attacker } };
E.onPreRollAttack(c2);
ok(!c2.advantage, "Vex: no Advantage against another creature");
game.user.targets = new Set([{ actor: goblin }]);
const c3 = { subject: { actor: attacker } };
E.onPreRollAttack(c3);
ok(c3.advantage === true, "Vex: Advantage against that creature");
await E.onRolledAttack([], { subject: { actor: attacker } });
ok(!attacker.effects.some(e => e.flags[MOD]?.mastery === "vex"), "Vex: used up by that attack");
game.user.targets = new Set();

const s1 = attackMsg("slow", 18);
await E.onDamageLanded({ messageId: damageMsg(s1).id, targetUuid: goblin.uuid });
const slow = fx(goblin, "slow");
ok(slow?.system?.changes?.[0]?.key === "system.attributes.movement.bonus" && slow.system.changes[0].value === "-10", "Slow: -10 ft to every speed");
const s2 = attackMsg("slow", 18);
await E.onDamageLanded({ messageId: damageMsg(s2).id, targetUuid: goblin.uuid });
ok(goblin.effects.filter(e => e.flags[MOD]?.mastery === "slow").length === 1 && fx(goblin, "slow").flags[MOD].sources.length === 2, "Slow: second hit adds a source, never a second -10");

// Slow missing the attack: nothing
const s3 = attackMsg("slow", 2, ogre);
await E.onDamageLanded({ messageId: damageMsg(s3).id, targetUuid: ogre.uuid });
ok(!fx(ogre, "slow"), "Slow: nothing when the attack missed");

// GM Reject removes only that line's source
const rejectId = s2.flags[MOD].lines[0].id;
await E.rejectLine(s2, rejectId);
ok(s2.flags[MOD].lines[0].status === "rejected" && fx(goblin, "slow").flags[MOD].sources.length === 1, "Reject: removes that hit's Slow only");
await E.rejectLine(s1, s1.flags[MOD].lines[0].id);
ok(!fx(goblin, "slow"), "Reject: last source removed deletes the effect");

// Turn change: expiry and auto-approve
const s4 = attackMsg("slow", 18);
await E.onDamageLanded({ messageId: damageMsg(s4).id, targetUuid: goblin.uuid });
await E.onTurnChange(combat, { round: 1, turn: 0, combatantId: "cbPC" }, { round: 1, turn: 1, combatantId: "cbG" });
ok(fx(goblin, "slow") && s4.flags[MOD].lines[0].status === "applied", "Turn change: still active on the target's turn");
await E.onTurnChange(combat, { round: 1, turn: 2, combatantId: "cbO" }, { round: 2, turn: 0, combatantId: "cbPC" });
ok(!fx(goblin, "slow"), "Turn change: Slow ends at the start of the attacker's next turn");
ok(s4.flags[MOD].lines[0].status === "approved", "Turn change: pending line counts as approved");

// Manual GM button when HP was changed by hand
const s5 = attackMsg("slow", 18);
await E.onDamageLanded({ messageId: damageMsg(s5).id, manual: true });
ok(fx(goblin, "slow"), "Apply weapon mastery button applies Slow without damage application");

// Multiple targets: no mastery, logged as unclear
const mt = new Message({ id: `m${n++}`, type: "attack", item: weapon("sap"), actor: attacker, system: { mastery: "sap", targets: [target(goblin), target(ogre)] }, rolls: [{ total: 18 }] });
messages.push(mt);
await E.onAttackCreated(mt);
ok(logs.some(l => l[0] === "unclear" && String(l[1]).startsWith("multi-target:")), "Multiple targets: no mastery, reported as unclear");

// Rejected line is not re-applied by later damage
const s6 = attackMsg("slow", 18, ogre);
const d6 = damageMsg(s6);
await E.onDamageLanded({ messageId: d6.id, targetUuid: ogre.uuid });
await E.rejectLine(s6, s6.flags[MOD].lines[0].id);
await E.onDamageLanded({ messageId: d6.id, targetUuid: ogre.uuid });
ok(!fx(ogre, "slow") && s6.flags[MOD].lines.length === 1, "Rejected mastery stays rejected on later damage");

// Two browsers of the same GM: only the one whose claim sticks acts
const doc = { flags: {}, async setFlag(m, k, v) { const p = k.split("."); let c = (this.flags[m] ??= {}); p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; } };
const first = E.claim(doc, "x");
await doc.setFlag(MOD, "claims.x", "other-browser");
ok(await first === false, "Claim lost to another browser: does nothing");
ok(await E.claim(doc, "y") === true, "Claim won: acts");

// Topple: hit adds a line with the DC and a Roll save action; a failed save makes the target Prone; Reject removes it
const t1 = attackMsg("topple", 18, ogre, { system: { mastery: "topple", ability: "str", targets: [target(ogre)] } });
await E.onAttackCreated(t1);
const tl = t1.flags[MOD].lines[0];
ok(tl.mastery === "topple" && tl.save.dc === 13 && tl.actions[0].id === "rollSave", "Topple: DC 8 + 3 Str + 2 PB = 13, GM Roll save action");
saveTotal = 9;
await E.runLineAction(t1, tl.id, "rollSave");
ok(ogre.lastSave.ability === "con" && ogre.lastSave.target === 13, "Topple: Constitution save against the DC");
ok(ogre.statuses.has("prone") && /failed/.test(t1.flags[MOD].lines[0].text), "Topple: failed save, Prone");
await E.rejectLine(t1, tl.id);
ok(!ogre.statuses.has("prone"), "Topple: Reject removes the Prone it added");
saveTotal = 15;
const t2 = attackMsg("topple", 18, ogre, { system: { mastery: "topple", ability: "dex", targets: [target(ogre)] } });
await E.onAttackCreated(t2);
ok(t2.flags[MOD].lines[0].save.dc === 11, "Topple: DC uses the ability the attack used (Dex +1)");
await E.runLineAction(t2, t2.flags[MOD].lines[0].id, "rollSave");
ok(!ogre.statuses.has("prone") && /made/.test(t2.flags[MOD].lines[0].text), "Topple: made save, no Prone");
ogre.statuses.add("prone");
const t3 = attackMsg("topple", 18, ogre, { system: { mastery: "topple", ability: "str", targets: [target(ogre)] } });
await E.onAttackCreated(t3);
ok(/already Prone/.test(t3.flags[MOD].lines[0].text) && !t3.flags[MOD].lines[0].actions, "Topple: already Prone, no save");
ogre.statuses.delete("prone");

// Graze: miss posts a damage card for the ability modifier; hit does nothing; Reject deletes the card
const g1 = attackMsg("graze", 2, ogre, { system: { mastery: "graze", ability: "str", targets: [target(ogre)] } });
await E.onAttackCreated(g1);
const card = messages.find(m => m.flags?.[MOD]?.extra === "graze");
ok(card?.type === "damage" && card.rolls[0].total === 3 && card.rolls[0].options.type === "slashing", "Graze: 3 slashing damage card on a miss");
ok(/Graze: 3 slashing damage/.test(g1.flags[MOD].lines[0].text), "Graze: line on the attack card");
await E.rejectLine(g1, g1.flags[MOD].lines[0].id);
ok(!messages.includes(card), "Graze: Reject deletes the damage card");
const g2 = attackMsg("graze", 18, ogre, { system: { mastery: "graze", ability: "str", targets: [target(ogre)] } });
await E.onAttackCreated(g2);
ok(!g2.flags[MOD]?.lines, "Graze: nothing on a hit");
attacker.system.abilities.str.mod = 0;
const g3 = attackMsg("graze", 2, ogre, { system: { mastery: "graze", ability: "str", targets: [target(ogre)] } });
await E.onAttackCreated(g3);
ok(!g3.flags[MOD]?.lines, "Graze: nothing when the modifier is 0");
attacker.system.abilities.str.mod = 3;

// No GM online: the job is skipped and logged to usedtp Logger
game.user.isActiveGM = false; const gm = game.users.activeGM; game.users.activeGM = null;
await E.runOnGM({ kind: "damage", messageId: "x" });
ok(logs.some(l => l[0] === "warn" && /no GM online/.test(l[1])), "No GM online: logged to usedtp Logger");
game.user.isActiveGM = true; game.users.activeGM = gm;

console.log(`engine tests: ${pass} passed`);
