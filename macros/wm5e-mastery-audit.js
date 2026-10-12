// WM5E mastery audit. READ-ONLY: changes nothing. Run as GM in a Script macro.
// Compares each character's known weapon masteries with what the 2024 PHB allows,
// and lists every NPC whose weapons carry a mastery. Saves a text report and whispers a summary.
const PHB = {
  barbarian: l => (l >= 10 ? 4 : l >= 4 ? 3 : 2),
  fighter: l => (l >= 16 ? 6 : l >= 10 ? 5 : l >= 4 ? 4 : 3),
  paladin: () => 2, ranger: () => 2, rogue: () => 2
};
const out = [];
const summary = { pcs: 0, pcsOver: 0, npcs: 0, npcsWithMastery: 0 };
const npcSetting = game.settings.get("wm5e", "npcMasteries");

out.push(`WM5E mastery audit | ${new Date().toISOString()} | world: ${game.world.title}`);
out.push(`Automated Masteries "Enable NPC Masteries": ${npcSetting}`);
out.push(`WM5E Auto Masteries grant setting: ${game.settings.get("wm5e-auto-masteries", "grant")}`);
out.push("", "== PLAYER CHARACTERS ==", "name | classes | allowed | known | level-up picks | verdict");

for (const a of game.actors.filter(x => x.type === "character")) {
  summary.pcs++;
  const classes = Object.entries(a.classes ?? {}).map(([id, c]) => ({ id, lvl: c.system.levels ?? 0 }));
  const fromClass = Math.max(0, ...classes.map(c => PHB[c.id]?.(c.lvl) ?? 0));
  const feats = a.items.filter(i => i.type === "feat" && i.name.trim().toLowerCase() === "weapon master").length;
  const allowed = fromClass + feats;
  const known = [...(a._source.system?.traits?.weaponProf?.mastery?.value ?? [])].sort();
  const picks = new Set();
  for (const c of Object.values(a.classes ?? {})) {
    const advs = c.advancement?.byType?.Trait ?? Object.values(c.system?.advancement ?? {});
    for (const adv of advs) {
      if (adv.configuration?.mode !== "mastery") continue;
      for (const k of adv.value?.chosen ?? []) picks.add(String(k).split(":").pop());
    }
  }
  const verdict = known.length <= allowed ? "OK" : `OVER by ${known.length - allowed}`;
  if (known.length > allowed) summary.pcsOver++;
  const cls = classes.map(c => `${c.id} ${c.lvl}`).join(" / ") || "no class";
  out.push(`${a.name} | ${cls}${feats ? ` + Weapon Master x${feats}` : ""} | ${allowed} | ${known.join(", ") || "-"} | ${[...picks].sort().join(", ") || "-"} | ${verdict}`);
}

out.push("", "== NPCs AND ENEMIES ==", "name | weapons with a mastery | has a Weapon Mastery feature");
for (const a of game.actors.filter(x => x.type === "npc")) {
  summary.npcs++;
  const ws = (a.itemTypes.weapon ?? []).filter(i => i.system.mastery).map(i => `${i.name} (${i.system.mastery})`);
  if (!ws.length) continue;
  summary.npcsWithMastery++;
  const feature = a.items.some(i => i.type === "feat" && /weapon mastery/i.test(i.name));
  out.push(`${a.name} | ${ws.join(", ")} | ${feature ? "yes" : "no"}`);
}

const text = out.join("\n");
foundry.utils.saveDataToFile(text, "text/plain", "wm5e-mastery-audit.txt");
ChatMessage.implementation.create({
  whisper: [game.user.id],
  content: `<b>WM5E mastery audit (read-only)</b><br>Player characters: ${summary.pcs}, over the PHB limit: ${summary.pcsOver}<br>`
    + `NPCs: ${summary.npcs}, with weapon masteries: ${summary.npcsWithMastery}<br>Full report saved as wm5e-mastery-audit.txt`
});
