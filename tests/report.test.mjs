// Error and Unclear bar on weapon cards: which cards get it, what a report carries, and that it reaches usedtp Logger.
import assert from "node:assert/strict";

// Minimal DOM: just enough for createElement, append, querySelector by class.
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ""; this.textContent = ""; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  addEventListener(n, f) { this.listeners[n] = f; }
  querySelector(sel) {
    const cls = sel.replace(/^\./, "");
    for (const c of this.children) {
      if (c.className === cls) return c;
      const d = c.querySelector?.(sel); if (d) return d;
    }
    return null;
  }
}
globalThis.document = { createElement: t => new El(t) };

const reports = []; const notes = [];
let dialogResult = { choices: ["expectedNone"], comment: "test comment" };
const settings = { reportButtons: true };
globalThis.ui = { notifications: { info: m => notes.push(m) } };
globalThis.game = {
  i18n: { localize: k => k },
  settings: { get: (m, k) => m === "wm5e" ? true : settings[k] },
  modules: {
    get: id => id === "usedtp-logger" ? { api: { register: () => ({
      error() {}, info() {}, warn() {},
      guard: async (l, fn) => fn(),
      report: (cat, payload) => { reports.push({ cat, ...payload }); return Promise.resolve("logged"); }
    }) } } : { version: "9.9" }
  }
};
globalThis.foundry = { applications: { api: { DialogV2: { prompt: async () => dialogResult } } } };

const { isWeaponRoll, reportContext, onRenderChatMessage } = await import("../scripts/report.mjs");

const actor = { name: "Test Fighter", uuid: "Actor.a1", system: { traits: { weaponProf: { mastery: { value: new Set(["longsword"]) } } } } };
const weapon = { type: "weapon", name: "Longsword", uuid: "Item.w1", parent: actor, system: { mastery: "sap", type: { baseItem: "longsword" } } };
const spell = { type: "spell", name: "Fire Bolt" };
const msg = (type, item, extra = {}) => ({
  id: `m-${type}-${item?.type}`, type, system: { mastery: "sap", targets: [{}], ...extra.system }, flags: extra.flags ?? {},
  getAssociatedItem: () => item, getAssociatedActor: () => actor
});

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log("ok  ", m); pass++; };

ok(isWeaponRoll(msg("attack", weapon)), "weapon attack card qualifies");
ok(isWeaponRoll(msg("damage", weapon)), "weapon damage card qualifies");
ok(!isWeaponRoll(msg("attack", spell)), "spell attack does not");
ok(!isWeaponRoll(msg("save", weapon)), "save card does not");

const ctx = reportContext(msg("attack", weapon, { flags: { wm5e: { applied: "sap" }, "wm5e-auto-masteries": { lines: [{ id: "l1", mastery: "sap", status: "rejected", text: "Sap: line" }] } } }));
ok(ctx.weapon === "Longsword" && ctx.weaponMastery === "sap" && ctx.baseItem === "longsword", "context has weapon, mastery, base item");
ok(ctx.knowsMastery === true && ctx.attackMastery === "sap", "context has known mastery and attack mastery");
ok(ctx.wm5eActed === true && ctx.autoTrigger === true && ctx.targets === 1, "context has wm5e state, auto-trigger, targets");
ok(ctx.lines[0].mastery === "sap" && ctx.lines[0].status === "rejected" && typeof ctx.engine === "string", "context has the engine and its result lines");

// Bar is added once, with prompt, Error and Unclear.
const html = new El("li"); const content = new El("div"); content.className = "message-content"; html.append(content);
const m = msg("attack", weapon);
onRenderChatMessage(m, html); onRenderChatMessage(m, html);
const bars = content.children.filter(c => c.className === "wm5eam-report");
ok(bars.length === 1, "bar added once per render");
ok(bars[0].children.map(c => c.textContent).join("|") === "WM5EAM.report.prompt|WM5EAM.report.error|WM5EAM.report.unclear", "bar is prompt, Error, Unclear");

// Clicking Error sends a report with the ticked choice and context.
await bars[0].children[1].listeners.click({ preventDefault() {}, stopPropagation() {} });
await new Promise(r => setTimeout(r, 5));
ok(reports[0]?.cat === "error" && reports[0].comment === "test comment", "Error click reaches usedtp Logger");
ok(reports[0].context.choices[0] === "expectedNone" && reports[0].context.weapon === "Longsword", "report carries choice and weapon");
ok(notes.includes("WM5EAM.report.logged"), "player sees the outcome");

// Unclear sends category unclear.
dialogResult = { choices: [], comment: "" };
await bars[0].children[2].listeners.click({ preventDefault() {}, stopPropagation() {} });
await new Promise(r => setTimeout(r, 5));
ok(reports[1]?.cat === "unclear", "Unclear click sends unclear");

// Setting off: no bar. Non-weapon: no bar.
settings.reportButtons = false;
const html2 = new El("li"); const c2 = new El("div"); c2.className = "message-content"; html2.append(c2);
onRenderChatMessage(m, html2);
ok(c2.children.length === 0, "setting off hides the bar");
settings.reportButtons = true;
onRenderChatMessage(msg("attack", spell), html2);
ok(c2.children.length === 0, "spell card gets no bar");

console.log(`report tests: ${pass} passed`);
