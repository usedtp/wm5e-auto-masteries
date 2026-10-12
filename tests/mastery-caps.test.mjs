import fs from "node:fs";
const M = JSON.parse(fs.readFileSync(new URL("./fixtures/masteries.json", import.meta.url)));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function mergeObject(t, s) { for (const [k, v] of Object.entries(s)) { if (isObj(v) && isObj(t[k])) mergeObject(t[k], v); else t[k] = structuredClone(v); } return t; }
function expandObject(o) { const r = {}; for (const [k, v] of Object.entries(o)) { const p = k.split("."); let c = r; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; } return r; }
const setFlat = (o, k, v) => { const p = k.split("."); let c = o; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; };
const getFlat = (o, k) => k.split(".").reduce((c, x) => c?.[x], o);
const hooks = {}; let writes = 0; const chat = []; const notes = [];
globalThis.foundry = { utils: { expandObject, mergeObject, deepClone: structuredClone, hasProperty: (o, k) => getFlat(o, k) !== undefined || k in o, debounce: f => f } };
globalThis.CONFIG = { DND5E: { weaponMasteries: M } };
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f) };
const call = (n, ...a) => (hooks[n] ?? []).forEach(f => f(...a));
class Item { constructor(src, parent) { this._source = src; this.parent = parent; this.id = src._id ?? Math.random().toString(36).slice(2); this.type = src.type; this.name = src.name; }
  get system() { return this._source.system; } get identifier() { return this._source.system?.identifier; }
  get advancement() { return { byType: { Trait: (this._source.system?.advancement ?? []) } }; }
  updateSource(c) { mergeObject(this._source, c); } }
class Actor { constructor(src) { this._source = src; this.id = src.name; this.type = src.type; this.name = src.name; this.items = (src.items ?? []).map(i => new Item(i, this)); }
  get itemTypes() { return { weapon: this.items.filter(i => i.type === "weapon"), class: this.items.filter(i => i.type === "class") }; }
  get classes() { return Object.fromEntries(this.itemTypes.class.map(c => [c.identifier, c])); }
  getFlag(m, k) { return this._source.flags?.[m]?.[k]; }
  async unsetFlag(m, k) { writes++; delete this._source.flags?.[m]?.[k]; }
  updateSource(c) { mergeObject(this._source, c); this.items = (this._source.items ?? []).map(i => new Item(i, this)); }
  async updateEmbeddedDocuments(_, ups) { writes++; for (const u of ups) { const it = this.items.find(i => i.id === u._id); for (const [k, v] of Object.entries(u)) if (k !== "_id") setFlat(it._source, k, v); } }
  async update(c) { writes++; for (const [k, v] of Object.entries(c)) setFlat(this._source, k, v); call("updateActor", this, expandObject(c)); } }
const settings = { desc: true, infer: true, warn: true, autoTrigger: "players" };
const actors = [];
globalThis.Item = { implementation: { updateDocuments: async () => { writes++; } } };
globalThis.ChatMessage = { implementation: { create: async m => chat.push(m.content) }, getWhisperRecipients: () => [{ id: "gm" }] };
globalThis.ui = { notifications: { warn: m => notes.push(m) } };
const mod = {};
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { isSelf: true } }, settings: { register() {}, get: (_, k) => settings[k], settings: new Map() },
  packs: { has: () => true }, modules: { get: id => id === "wm5e" ? undefined : mod }, actors: { contents: actors, [Symbol.iterator]: () => actors[Symbol.iterator]() }, items: [], scenes: [] };
await import("../scripts/main.js");
call("init"); call("ready");
const api = mod.api;
let pass = 0, fail = 0; const ok = (c, m) => c ? pass++ : (fail++, console.log("FAIL:", m));
const w = (n, cat, base = "", m = "") => ({ name: n, type: "weapon", system: { type: { value: cat, baseItem: base }, mastery: m, description: { value: "" } } });
const cls = (id, lvl, chosen = []) => ({ name: id, type: "class", system: { identifier: id, levels: lvl, advancement: chosen.length ? [{ configuration: { mode: "mastery" }, value: { chosen: chosen.map(k => `weapon:mar:${k}`) } }] : [] } });
const feat = n => ({ name: n, type: "feat", system: {} });
const pc = (name, items, known = []) => new Actor({ name, type: "character", system: { traits: { weaponProf: { mastery: { value: known } } } }, items });

// Caps
const cap = items => api.masteryCap(pc("x", items));
ok(cap([cls("wizard", 1)]) === 0, "wizard 0");
ok(cap([cls("fighter", 1)]) === 3, "fighter 1 = 3");
ok(cap([cls("fighter", 4)]) === 4 && cap([cls("fighter", 10)]) === 5 && cap([cls("fighter", 16)]) === 6, "fighter scaling");
ok(cap([cls("barbarian", 3)]) === 2 && cap([cls("barbarian", 4)]) === 3 && cap([cls("barbarian", 10)]) === 4, "barbarian scaling");
ok(cap([cls("paladin", 20)]) === 2 && cap([cls("ranger", 5)]) === 2 && cap([cls("rogue", 9)]) === 2, "paladin/ranger/rogue 2");
ok(cap([cls("fighter", 1), cls("rogue", 3)]) === 3, "multiclass highest only");
ok(cap([cls("fighter", 4), feat("Weapon Master")]) === 5, "feat +1");
ok(cap([cls("wizard", 5), feat("Weapon Master")]) === 1, "wizard with feat = 1");
ok(api.masteryCap(new Actor({ name: "Ogre", type: "npc", items: [] })) === 0, "npc 0");

// No auto-grant on actor create
const created = new Actor({ name: "New", type: "character", system: {}, items: [w("Halberd", "martialM"), cls("fighter", 1)] });
call("preCreateActor", created, {}, {}, "gm");
ok(created._source.items[0].system.mastery === "cleave" && !created._source.system?.traits, "weapon data set, no keys granted");
ok(!hooks.createItem, "no createItem grant hook");

// Over-cap warning
const devlin = pc("Devlin", [cls("wizard", 1), w("Staff", "simpleM", "quarterstaff", "topple")], []);
await devlin.update({ "system.traits.weaponProf.mastery.value": ["quarterstaff"] });
ok(notes.some(n => n.includes("Devlin") && n.includes("allows 0")), "warns wizard over cap");
const n0 = notes.length; await devlin.update({ "system.traits.weaponProf.mastery.value": ["quarterstaff"] });
ok(notes.length === n0, "no duplicate warning for same state");

// Repair
const fighter = pc("Brakka", [cls("fighter", 1, ["longsword", "shortbow"])], ["dagger", "longsword", "handaxe", "shortbow", "rapier"]);
const fine = pc("Rook", [cls("rogue", 2)], ["dagger", "rapier"]);
actors.push(devlin, fighter, fine);
writes = 0;
const dry = await api.repair();
ok(writes === 0, "dry run writes nothing");
const fr = dry.find(r => r.name === "Brakka");
ok(fr && JSON.stringify(fr.keep) === '["longsword","shortbow","dagger"]' && JSON.stringify(fr.remove) === '["handaxe","rapier"]', `keeps level-up picks first ${JSON.stringify(fr)}`);
ok(dry.find(r => r.name === "Devlin")?.remove.join() === "quarterstaff", "wizard cleared");
ok(!dry.find(r => r.name === "Rook"), "within cap untouched");
await api.repair({ apply: true });
ok(JSON.stringify(fighter._source.system.traits.weaponProf.mastery.value) === '["longsword","shortbow","dagger"]', "applied fighter");
ok(devlin._source.system.traits.weaponProf.mastery.value.length === 0, "applied wizard");
ok(fighter.getFlag("wm5e-auto-masteries", "repair")?.removed.join() === "handaxe,rapier", "flag saved");
const again = await api.repair();
ok(again.length === 0, "second dry run clean");
await api.undoRepair();
ok(fighter._source.system.traits.weaponProf.mastery.value.length === 5 && !fighter.getFlag("wm5e-auto-masteries", "repair"), "undo restores and clears flag");
ok(devlin._source.system.traits.weaponProf.mastery.value.join() === "quarterstaff", "undo restores wizard");

// Sweep never touches known masteries
const before = JSON.stringify(fighter._source.system.traits);
await api.sweep();
ok(JSON.stringify(fighter._source.system.traits) === before, "sweep leaves known masteries alone");
console.log(`${pass} passed, ${fail} failed`);

if (fail) process.exitCode = 1;
