// Logging through usedtp Logger: registration, guarded hooks, "unclear" cases, no stray console calls.
import fs from "node:fs";

const M = JSON.parse(fs.readFileSync(new URL("./fixtures/masteries.json", import.meta.url)));
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
function mergeObject(t, s) { for (const [k, v] of Object.entries(s)) { if (isObj(v) && isObj(t[k])) mergeObject(t[k], v); else t[k] = structuredClone(v); } return t; }
function expandObject(o) { const r = {}; for (const [k, v] of Object.entries(o)) { const p = k.split("."); let c = r; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; } return r; }
const getFlat = (o, k) => k.split(".").reduce((c, x) => c?.[x], o);
const setFlat = (o, k, v) => { const p = k.split("."); let c = o; p.slice(0, -1).forEach(x => c = c[x] ??= {}); c[p.at(-1)] = v; };

// Fake usedtp Logger: records every call; guard behaves like the real one (logs, returns undefined).
const calls = [];
let registered = null;
const fakeLogger = {
  debug: (m, d) => calls.push(["debug", m, d]),
  info: (m, d) => calls.push(["info", m, d]),
  warn: (m, d) => calls.push(["warn", m, d]),
  error: (m, e, d) => calls.push(["error", m, d, e]),
  unclear: (k, m, d) => calls.push(["unclear", k, d, m]),
  report: () => Promise.resolve("logged"),
  async guard(label, fn, data) { try { return await fn(); } catch (err) { this.error(`${label} failed`, err, data); return undefined; } },
  openReport() {}
};
const loggerApi = { register: (id, opts) => { registered = { id, opts }; return fakeLogger; } };

const hooks = {};
const call = (n, ...a) => (hooks[n] ?? []).map(f => f(...a));
const settings = { desc: true, infer: true, warn: true, autoTrigger: "on" };
const wm5eSettings = new Map([["wm5e.autoMasteries", { config: true }]]);
let wm5eAuto = false;
let failSet = false;
const mod = {};
globalThis.foundry = { utils: { expandObject, mergeObject, deepClone: structuredClone, hasProperty: (o, k) => getFlat(o, k) !== undefined } };
globalThis.CONFIG = { DND5E: { weaponMasteries: M } };
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f) };
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
globalThis.ChatMessage = { implementation: { create: async () => {} }, getWhisperRecipients: () => [{ id: "gm" }] };
globalThis.Item = { implementation: { updateDocuments: async () => {} } };
globalThis.game = {
  user: { id: "gm", isGM: true }, users: { activeGM: { isSelf: true } }, actors: { contents: [], [Symbol.iterator]: function* () {} }, items: [], scenes: [],
  packs: { has: () => true },
  modules: { get: id => id === "usedtp-logger" ? { active: true, api: loggerApi } : id === "wm5e" ? { active: true, version: "14.605.1" } : mod },
  settings: {
    register() {}, settings: wm5eSettings,
    get: (m, k) => m === "wm5e" ? wm5eAuto : settings[k],
    set: async (m, k, v) => { if (failSet) throw new Error("permission denied"); if (m === "wm5e") wm5eAuto = v; }
  }
};

await import("../scripts/main.js");
call("init");
await Promise.all(call("ready"));
await new Promise(r => setTimeout(r, 0));
const api = mod.api;

let pass = 0, fail = 0;
const ok = (c, m) => c ? pass++ : (fail++, console.log("FAIL:", m));
const last = (level, match) => calls.filter(c => c[0] === level && String(c[1]).includes(match)).at(-1);
const w = (n, cat, base = "", m = "") => ({ name: n, type: "weapon", system: { type: { value: cat, baseItem: base }, mastery: m, description: { value: "" } } });
class Item { constructor(src, parent) { this._source = src; this.parent = parent; this.type = src.type; this.name = src.name; } updateSource(c) { mergeObject(this._source, c); } }
const pcParent = { id: "pc1", name: "Test Fighter", uuid: "Actor.pc1", type: "character" };

// Registration
ok(registered?.id === "wm5e-auto-masteries" && registered.opts.title === "WM5E Auto Masteries", "registers with usedtp Logger");
ok(calls.some(c => c[0] === "info" && c[1] === "ready"), "logs ready");
ok(typeof api.log === "function" && api.log() === fakeLogger, "api.log exposes the same logger");

// Guarded hook: normal run still changes the item before the hook returns
const club = new Item(w("Greatclub", "simpleM"), pcParent);
call("preCreateItem", club, {}, {}, "gm");
ok(club._source.system.mastery === "push", "preCreateItem change lands synchronously inside guard");

// Guarded hook: a throw is logged with weapon, mastery and actor, and does not escape
const broken = new Item(w("Mace", "simpleM"), pcParent);
broken.updateSource = () => { throw new Error("boom"); };
let threw = false;
try { await Promise.all(call("preCreateItem", broken, {}, {}, "gm")); } catch { threw = true; }
const e1 = last("error", "preCreateItem failed");
ok(!threw && e1, "preCreateItem failure is caught and logged");
ok(e1 && "weapon" in e1[2] && "mastery" in e1[2] && "actor" in e1[2] && e1[2].weapon === "Mace" && e1[2].actor === "Test Fighter", `guard data has weapon, mastery, actor: ${JSON.stringify(e1?.[2])}`);

// Unclear: homebrew weapon with no PHB mastery
call("preCreateItem", new Item(w("Psychic Blade", "simpleM"), pcParent), {}, {}, "gm");
const u1 = last("unclear", "no-mastery:");
ok(u1 && u1[2].weapon === "Psychic Blade" && u1[2].mastery === null && u1[2].actor === "Test Fighter", "unclear: weapon with no PHB mastery");

// Unclear: character's weapon has a mastery but no base item
call("preCreateItem", new Item(w("Odd Blade", "martialM", "", "vex"), pcParent), {}, {}, "gm");
const u2 = last("unclear", "no-base:");
ok(u2 && u2[2].mastery === "vex" && u2[2].weapon === "Odd Blade", "unclear: mastery without base item on a character");
const nb = calls.length;
call("preCreateItem", new Item(w("Odd Blade", "martialM", "", "vex"), { id: "n1", name: "Bandit", type: "npc" }), {}, {}, "gm");
ok(!calls.slice(nb).some(c => c[0] === "unclear" && String(c[1]).startsWith("no-base:")), "no base-item note for NPCs (they do not need one)");

// Unclear: class outside the 2024 PHB
const art = { id: "a1", name: "Tinker", uuid: "Actor.a1", type: "character", classes: { artificer: { system: { levels: 3 } } }, items: [] };
ok(api.masteryCap(art) === 0 && last("unclear", "unknown-class:a1:artificer"), "unclear: non-PHB class");
const wiz = { id: "w1", name: "Mage", type: "character", classes: { wizard: { system: { levels: 3 } } }, items: [] };
const nw = calls.length;
api.masteryCap(wiz);
ok(!calls.slice(nw).some(c => c[0] === "unclear"), "PHB class with no mastery is not unclear");

// Unclear: over the PHB limit
const over = { id: "o1", name: "Overreach", uuid: "Actor.o1", type: "character", classes: { wizard: { system: { levels: 1 } } }, items: [],
  _source: { system: { traits: { weaponProf: { mastery: { value: ["quarterstaff"] } } } } } };
await Promise.all(call("updateActor", over, { system: { traits: { weaponProf: { mastery: { value: ["quarterstaff"] } } } } }));
const u3 = last("unclear", "over-cap:o1");
ok(u3 && Array.isArray(u3[2].mastery) && u3[2].actor === "Overreach", "unclear: over the PHB limit");

// Unclear: repair has to choose without level-up picks
const multi = { id: "r1", name: "Picker", uuid: "Actor.r1", type: "character", classes: { fighter: { system: { levels: 1 }, advancement: { byType: { Trait: [] } } } }, items: [],
  _source: { system: { traits: { weaponProf: { mastery: { value: ["dagger", "longsword", "handaxe", "rapier"] } } } } } };
const dry = await api.repair({ actors: [multi] });
ok(dry?.[0]?.remove?.join() === "rapier" && last("unclear", "repair-order:r1"), "unclear: repair chose by list order");

// Auto-trigger: failure to set is logged, no console
failSet = true;
settings.autoTrigger = "off"; wm5eAuto = true;
await Promise.all(call("ready"));
await new Promise(r => setTimeout(r, 0));
ok(last("error", "set auto-trigger failed"), "auto-trigger set failure logged through guard");
failSet = false;

// Auto-trigger: Automated Masteries 5e without the setting
wm5eSettings.delete("wm5e.autoMasteries");
await Promise.all(call("ready"));
await new Promise(r => setTimeout(r, 0));
ok(last("unclear", "autotrigger-setting-missing"), "unclear: auto-trigger setting missing");

// API entry points are guarded
const realActors = game.actors;
game.actors = { [Symbol.iterator]: () => { throw new Error("actors unavailable"); } };
ok(await api.sweep() === undefined && last("error", "sweep failed"), "sweep failure logged, not thrown");
game.actors = realActors;

// No console calls outside diag.mjs
const stray = [];
for (const dir of ["scripts", "macros"]) {
  for (const f of fs.readdirSync(new URL(`../${dir}/`, import.meta.url))) {
    if (f === "diag.mjs") continue;
    const text = fs.readFileSync(new URL(`../${dir}/${f}`, import.meta.url), "utf8");
    if (/console\./.test(text)) stray.push(`${dir}/${f}`);
  }
}
ok(!stray.length, `console.* only in diag.mjs: ${stray}`);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
