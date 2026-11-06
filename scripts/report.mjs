import { log } from "./diag.mjs";

/*
 * "Error" and "Unclear" buttons under every weapon attack and damage card, matching Roll Lessons.
 * This module does not run at attack time (Automated Masteries 5e applies the effect), so the report records what
 * both modules knew: the weapon's mastery, the mastery used on the attack, whether the character knows it, and
 * whether Automated Masteries 5e acted. Sending, delivery to the GM and the offline queue are handled by usedtp Logger.
 */

const MOD = "wm5e-auto-masteries";
const WM5E = "wm5e";
const COMMENT_MAX = 500;
const CHOICES = {
  error: ["expectedNone", "wrongMastery", "wrongEffect"],
  unclear: ["shouldItHappen", "whatItDid"]
};

const loc = key => game.i18n.localize(`WM5EAM.report.${key}`);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/** A dnd5e 6 weapon attack or damage card. */
export function isWeaponRoll(message) {
  if (!["attack", "damage"].includes(message?.type)) return false;
  return message.getAssociatedItem?.()?.type === "weapon";
}

/** What a report carries: the card, the weapon's mastery data, and whether Automated Masteries 5e acted. */
export function reportContext(message) {
  const item = message.getAssociatedItem?.();
  const actor = message.getAssociatedActor?.() ?? item?.parent;
  const baseItem = item?.system?.type?.baseItem || null;
  const known = actor?.system?.traits?.weaponProf?.mastery?.value;
  const wm5eSetting = (() => { try { return game.settings.get(WM5E, "autoMasteries"); } catch (err) { return null; } })();
  return {
    messageId: message.id,
    kind: message.type,
    weapon: item?.name ?? null,
    weaponUuid: item?.uuid ?? null,
    weaponMastery: item?.system?.mastery || null,
    baseItem,
    attackMastery: message.system?.mastery || null,
    actor: actor?.name ?? null,
    actorUuid: actor?.uuid ?? null,
    knowsMastery: baseItem && known ? known.has?.(baseItem) ?? [...known].includes(baseItem) : null,
    wm5eActed: !!message.flags?.[WM5E],
    wm5eFlags: message.flags?.[WM5E] ?? null,
    autoTrigger: wm5eSetting,
    targets: message.system?.targets?.length ?? 0,
    versions: {
      wm5e: game.modules?.get(WM5E)?.version ?? null,
      ac5e: game.modules?.get("automated-conditions-5e")?.version ?? null
    }
  };
}

/** Send a report through usedtp Logger and say what happened. */
export async function sendReport(category, message, { choices = [], comment = "" } = {}) {
  const outcome = await log().report(category === "unclear" ? "unclear" : "error", {
    comment: String(comment ?? "").trim().slice(0, COMMENT_MAX),
    context: { ...reportContext(message), choices }
  });
  ui.notifications?.info(loc(["logged", "sent", "queued"].includes(outcome) ? outcome : "queued"));
  return outcome;
}

async function openDialog(category, message) {
  const { DialogV2 } = foundry.applications.api;
  const keys = CHOICES[category];
  const rows = keys.map((k, i) => `<label class="wm5eam-report-row"><input type="checkbox" name="c${i}"> ${esc(loc(`choice.${k}`))}</label>`).join("");
  const content = `
    <p>${esc(loc(category === "unclear" ? "introUnclear" : "introError"))}</p>
    <fieldset><legend>${esc(loc("rows"))}</legend>${rows}</fieldset>
    <label for="wm5eam-report-comment">${esc(loc("comment"))}</label>
    <textarea id="wm5eam-report-comment" name="comment" rows="4" maxlength="${COMMENT_MAX}"></textarea>
    <p class="hint">${esc(loc("disclaimer"))}</p>`;
  const result = await DialogV2.prompt({
    window: { title: loc(category === "unclear" ? "titleUnclear" : "titleError") },
    classes: ["wm5eam-report-dialog"],
    content,
    ok: {
      label: loc("send"),
      callback: (event, button) => {
        const form = button.form;
        return { choices: keys.filter((k, i) => form.elements[`c${i}`]?.checked), comment: form.elements.comment?.value ?? "" };
      }
    },
    rejectClose: false
  });
  if (!result) return;
  await sendReport(category, message, result);
}

/** The bar at the bottom of the card: prompt, Error, Unclear. */
export function reportBar(message) {
  const bar = document.createElement("div");
  bar.className = "wm5eam-report";
  const label = document.createElement("span");
  label.textContent = loc("prompt");
  bar.append(label);
  for (const category of ["error", "unclear"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `wm5eam-report-${category}`;
    b.textContent = loc(category);
    b.title = loc(category === "unclear" ? "hintUnclear" : "hintError");
    b.addEventListener("click", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      log().guard("report", () => openDialog(category, message), { messageId: message.id });
    });
    bar.append(b);
  }
  return bar;
}

/** renderChatMessageHTML handler. Adds the bar once per render. */
export function onRenderChatMessage(message, html) {
  if (!game.settings.get(MOD, "reportButtons") || !isWeaponRoll(message)) return;
  const root = html?.querySelector?.(".message-content") ?? html;
  if (!root || root.querySelector?.(".wm5eam-report")) return;
  root.append(reportBar(message));
}
