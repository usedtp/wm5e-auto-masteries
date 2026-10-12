import fs from "node:fs";
const hooks = {}; const defs = new Map(); const vals = new Map(); let sets = 0;
globalThis.foundry = { utils: { debounce: f => f, expandObject: o => o, mergeObject: (a, b) => Object.assign(a, b), deepClone: structuredClone } };
globalThis.CONFIG = { DND5E: { weaponMasteries: {} } };
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f), once: (n, f) => (hooks[n] ??= []).push(f) };
const mod = {};
globalThis.game = {
  user: { id: "p1", isGM: false }, packs: { has: () => true }, actors: [], items: [], scenes: [],
  modules: { get: id => id === "wm5e" ? { active: true } : mod },
  settings: { settings: defs,
    register: (m, k, d) => { defs.set(`${m}.${k}`, { ...d }); if (!vals.has(`${m}.${k}`)) vals.set(`${m}.${k}`, d.default ?? d.type?.initial); },
    get: (m, k) => vals.get(`${m}.${k}`),
    set: async (m, k, v) => { sets++; vals.set(`${m}.${k}`, v); defs.get(`${m}.${k}`)?.onChange?.(v); } }
};
// wm5e registers its user-scope setting first (its own init), default false
game.settings.register("wm5e", "autoMasteries", { scope: "user", config: true, default: false });
await import("../scripts/main.js");
const run = n => Promise.all((hooks[n] ?? []).map(f => f()));
let pass = 0, fail = 0; const ok = (c, m) => c ? pass++ : (fail++, console.log("FAIL", m));
await run("init"); await run("ready"); await new Promise(r => setTimeout(r, 10));
ok(vals.get("wm5e.autoMasteries") === true && sets === 1, "default on forces player on");
ok(defs.get("wm5e.autoMasteries").config === false, "checkbox hidden");
sets = 0; await run("ready"); await new Promise(r => setTimeout(r, 10));
ok(sets === 0, "no write when already in sync");
await game.settings.set("wm5e-auto-masteries", "autoTrigger", "off"); await new Promise(r => setTimeout(r, 10));
ok(vals.get("wm5e.autoMasteries") === false, "GM switches everyone off");
await game.settings.set("wm5e-auto-masteries", "autoTrigger", "players"); await new Promise(r => setTimeout(r, 10));
ok(defs.get("wm5e.autoMasteries").config === true && vals.get("wm5e.autoMasteries") === false, "players mode restores checkbox, keeps value");
console.log(`${pass} passed, ${fail} failed`);

if (fail) process.exitCode = 1;
