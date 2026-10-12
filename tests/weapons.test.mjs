import fs from "node:fs";
const M = JSON.parse(fs.readFileSync(new URL("./fixtures/masteries.json", import.meta.url)));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const deepClone = o => structuredClone(o);
function mergeObject(t, s) { for (const [k, v] of Object.entries(s)) { if (isObj(v) && isObj(t[k])) mergeObject(t[k], v); else t[k] = deepClone(v); } return t; }
function expandObject(o) { const r = {}; for (const [k, v] of Object.entries(o)) { const p = k.split("."); let c = r; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; } return r; }
function setFlat(obj, k, v) { const p = k.split("."); let c = obj; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; }
const hooks = {}; let writes = 0, chat = [];
globalThis.foundry = { utils: { expandObject, mergeObject, deepClone, debounce: (fn, ms) => () => { clearTimeout(fn._t); fn._t = setTimeout(fn, ms); } } };
globalThis.CONFIG = { DND5E: { weaponMasteries: M } };
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f) };
const call = (n, ...a) => hooks[n].forEach(f => f(...a));
class Item { constructor(src, parent) { this._source = src; this.parent = parent; this.id = src._id; this.type = src.type; this.name = src.name; }
  get system() { return this._source.system; }
  updateSource(c) { mergeObject(this._source, c); } }
class Actor { constructor(src) { this._source = src; this.type = src.type; this.name = src.name; this.items = (src.items ?? []).map(i => new Item(i, this)); }
  get itemTypes() { return { weapon: this.items.filter(i => i.type === "weapon") }; }
  get system() { return { traits: { weaponProf: { mastery: { value: new Set(this._source.system?.traits?.weaponProf?.mastery?.value ?? []) } } } }; }
  updateSource(c) { mergeObject(this._source, c); this.items = (this._source.items ?? []).map(i => new Item(i, this)); }
  async updateEmbeddedDocuments(_, ups) { writes++; for (const u of ups) { const it = this.items.find(i => i.id === u._id); for (const [k, v] of Object.entries(u)) if (k !== "_id") setFlat(it._source, k, v); } }
  async update(c) { writes++; for (const [k, v] of Object.entries(c)) setFlat(this._source, k, v); } }
const settings = { desc: true, infer: true, grant: true };
const actors = [];
const worldItems = [];
globalThis.Item = { implementation: { updateDocuments: async ups => { writes++; for (const u of ups) { const it = worldItems.find(i => i.id === u._id); for (const [k, v] of Object.entries(u)) if (k !== "_id") setFlat(it._source, k, v); } } } };
globalThis.ChatMessage = { implementation: { create: async m => chat.push(m.content) }, getWhisperRecipients: () => [] };
globalThis.ui = { notifications: { warn: console.warn } };
const mod = {};
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { isSelf: false } }, settings: { register() {}, get: (_, k) => settings[k] }, packs: { has: p => p === "dnd5e.content24" },
  modules: { get: id => id === "wm5e" ? undefined : mod }, actors, items: worldItems, scenes: [] };
await import("../scripts/main.js");
call("init"); call("ready");
const api = mod.api;
const w = (id, name, value, baseItem = "", mastery = "", desc = "") => ({ _id: id, name, type: "weapon", system: { type: { value, baseItem }, mastery, description: { value: desc } } });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log("FAIL:", m)); };
const REF = M.push.reference;

// 1 preCreateItem on NPC weapon with no base item
let it = new Item(w("a", "Greatclub", "simpleM"), null); call("preCreateItem", it, {}, {}, "gm");
ok(it._source.system.type.baseItem === "greatclub" && it._source.system.mastery === "push", "infer base+mastery");
ok(it._source.system.description.value.includes(REF), "push link");
// 2 idempotent
ok(api.planItem(it._source).changes === null, "idempotent");
// 3 natural attacks untouched
ok(api.planItem(w("b", "Bite", "natural")).changes === null, "bite untouched");
ok(api.planItem(w("c", "Unarmed Strike", "natural")).changes === null, "unarmed untouched");
// 4 v1.2 block untouched; v1.1 text block upgraded; duplicates collapsed; normalized HTML tolerated
const v12 = `<p>x</p><section data-wm5e-mastery="push"><p>Mastery: @UUID[${REF}]{Push}</p></section>`;
ok(api.planItem(w("d", "Greatclub", "simpleM", "greatclub", "push", v12)).changes === null, "v1.2 block kept");
const v11 = `<p>x</p><section data-wm5e-mastery="push"><p><strong>Mastery: Push.</strong> text</p></section>`;
let p = api.planItem(w("e", "Greatclub", "simpleM", "greatclub", "push", v11));
ok(p.changes?.["system.description.value"]?.includes(REF) && !p.changes["system.description.value"].includes("<strong>"), "v1.1 upgraded");
p = api.planItem(w("f", "Greatclub", "simpleM", "greatclub", "push", v12 + v12.slice(8)));
ok((p.changes?.["system.description.value"].match(/data-wm5e-mastery/g) ?? []).length === 1, "duplicates collapsed");
const norm = `<p>x</p>\n<section data-wm5e-mastery="push">\n  <p>Mastery: @UUID[${REF}]{Push}</p>\n</section>`;
ok(api.planItem(w("g", "Greatclub", "simpleM", "greatclub", "push", norm)).changes === null, "normalized HTML no rewrite");
// 5 existing mastery respected (no override)
ok(api.planItem(w("h", "Club", "simpleM", "club", "sap", "")).changes?.["system.mastery"] === undefined, "keeps set mastery");
// 6 homebrew no match
p = api.planItem(w("i", "Psychic Blade", "simpleM"));
ok(p.weapon && !p.mastery && p.changes === null, "homebrew unresolved");
// 7 compendium target skipped
it = new Item(w("j", "Mace", "simpleM"), null); call("preCreateItem", it, {}, { pack: "world.x" }, "gm");
ok(!it._source.system.mastery, "pack skipped");
// 8 preCreateActor character
let pc = new Actor({ name: "Teddy", type: "character", system: {}, items: [w("k", "Halberd", "martialM", "halberd"), w("l", "Handaxe", "simpleM"), { _id: "m", name: "Rope", type: "loot", system: {} }] });
call("preCreateActor", pc, {}, {}, "gm");
ok(!pc._source.system.traits, "2.2: no keys granted");
ok(pc._source.items[0].system.mastery === "cleave" && pc._source.items[1].system.mastery === "vex" && pc._source.items[2].type === "loot", "pc items");
// 9 preCreateActor NPC: no keys
let npc = new Actor({ name: "Ogre", type: "npc", system: {}, items: [w("n", "Greatclub", "simpleM"), w("o", "Javelin", "simpleM")] });
call("preCreateActor", npc, {}, {}, "gm");
ok(!npc._source.system.traits && npc._source.items[1].system.mastery === "slow", "npc no keys, items set");
// 11 sweep then re-sweep = zero writes
actors.push(new Actor({ name: "Bandit", type: "npc", system: {}, items: [w("t", "Scimitar", "martialM"), w("u", "Light Crossbow", "simpleR"), w("v", "Bite", "natural")] }));
actors.push(new Actor({ name: "Wolf", type: "npc", system: {}, items: [w("w", "Bite", "natural")] }));
actors.push(new Actor({ name: "Kit", type: "character", system: {}, items: [w("x", "Longsword", "martialM", "longsword", "sap", v12), w("y", "Psychic Blade", "simpleM")] }));
worldItems.push(new Item(w("z", "Warhammer", "martialM"), null));
writes = 0; const r1 = await api.sweep();
ok(r1.actors === 2 && r1.items === 3 && r1.world === 1 && r1.manual.length === 1, `sweep1 ${JSON.stringify(r1)}`);
writes = 0; const r2 = await api.sweep();
ok(writes === 0 && r2.actors === 0 && r2.world === 0, `sweep2 writes=${writes}`);
// 12 settings off: no description writes
settings.desc = false; call("ready");
ok(api.planItem(w("aa", "Pike", "martialM")).changes["system.description.value"] === undefined, "desc off");
console.log(`${pass} passed, ${fail} failed`); console.log(chat.at(-1));

if (fail) process.exitCode = 1;
