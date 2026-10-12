// Cleave diagnostic. Read-only. Run as a Script macro.
// Setup: select the ATTACKER token (click it), and TARGET the creature it hit (T key or right-click > target).
// Runs the same filters Automated Masteries 5e uses for Cleave and explains each token it rejects.
const lines = [];
try {
  const attacker = canvas.tokens.controlled[0];
  const first = [...game.user.targets][0];
  if (!attacker) throw new Error("Select the attacker token first.");
  if (!first) throw new Error("Target the creature the attacker hit first.");
  if (typeof ac5e === "undefined") throw new Error("Automated Conditions 5e is not active.");

  const weapon = attacker.actor?.itemTypes.weapon.find(i => i.system.mastery === "cleave");
  const activity = weapon?.system.activities?.find(a => a.type === "attack");
  const grid = canvas.grid?.distance || 5;
  const reach = activity?.range?.reach || grid;
  const sameSide = (a, b) => a.document.disposition === b.document.disposition;
  const down = t => ["dead", "incapacitated"].some(s => t.actor?.statuses?.has(s));
  const dist = (a, b) => Math.round(ac5e.checkDistance(a, b) * 10) / 10;

  lines.push(`<b>Cleave check</b> | wm5e ${game.modules.get("wm5e")?.version} | AC5E ${game.modules.get("automated-conditions-5e")?.version}`);
  lines.push(`Attacker: ${attacker.name} | Hit: ${first.name} | Weapon: ${weapon?.name ?? "no Cleave weapon found"} | Reach: ${reach} ${canvas.grid.units}`);
  lines.push(`Distance attacker to first target: ${dist(attacker, first)} | Grid diagonals rule: ${canvas.grid.diagonals}`);

  let valid = 0;
  for (const t of canvas.tokens.placeables) {
    if (t === attacker || t === first) continue;
    const why = [];
    if (t.document.hidden) why.push("token is hidden");
    if (down(t)) why.push("dead or incapacitated");
    if (sameSide(attacker, t)) why.push(`same disposition as attacker (${t.document.disposition}), counted as an ally`);
    const dA = dist(attacker, t), dT = dist(first, t);
    if (dA > reach) why.push(`${dA} from attacker, beyond reach ${reach}`);
    if (dT > grid) why.push(`${dT} from first target, more than ${grid}`);
    if (!why.length) valid++;
    lines.push(`${why.length ? "NO" : "<b>VALID</b>"} | ${t.name} | to attacker ${dA}, to first target ${dT}${why.length ? " | " + why.join("; ") : ""}`);
  }
  lines.push(`<b>Valid Cleave targets: ${valid}</b>`);
} catch (e) {
  lines.push(`<b>ERROR</b> ${e.message}`);
}
ChatMessage.implementation.create({ content: lines.join("<br>"), whisper: [game.user.id] });
