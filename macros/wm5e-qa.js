// WM5E Auto Masteries QA suite. Run as GM: as a Script macro, or pasted into the browser console.
// Creates temporary test documents in a "WM5E QA (temp)" folder and deletes them at the end.
// The only check that reads your real actors and items is read-only (no writes).
await (async () => {
  const MOD = "wm5e-auto-masteries";
  const results = [];
  const created = { actors: [], items: [], folders: [] };
  const t = (group, name, pass, detail = "") => results.push({ group, name, pass: !!pass, detail: String(detail) });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const weapon = (name, cat, baseItem = "", mastery = "") =>
    ({ name, type: "weapon", system: { type: { value: cat, baseItem }, mastery } });
  const blocks = html => (String(html ?? "").match(/data-wm5e-mastery/g) ?? []).length;

  try {
    // 1. Environment
    const ver = game.release?.version ?? game.version;
    t("Environment", "GM user", game.user.isGM, game.user.name);
    t("Environment", "Foundry 14.367+", !foundry.utils.isNewerVersion("14.367", ver), ver);
    t("Environment", "dnd5e 6.x", game.system.id === "dnd5e" && String(game.system.version).startsWith("6."), game.system.version);
    for (const id of [MOD, "wm5e", "automated-conditions-5e"]) {
      const m = game.modules.get(id);
      t("Environment", `${id} active`, m?.active, m?.version ?? "not installed");
    }
    const api = game.modules.get(MOD)?.api;
    t("Environment", "API exposed", api?.sweep && api?.planItem && api?.processActor && api?.repair && api?.undoRepair && api?.masteryCap);
    t("Environment", "Version 2.2.0+", !foundry.utils.isNewerVersion("2.2.0", game.modules.get(MOD)?.version ?? "0"), game.modules.get(MOD)?.version);
    if (!game.user.isGM || !api) throw new Error("Cannot continue: GM login and an active module are required");

    // 2. Settings
    const mode = game.settings.get(MOD, "autoTrigger");
    const userAuto = game.settings.get("wm5e", "autoMasteries");
    const def = game.settings.settings.get("wm5e.autoMasteries");
    t("Settings", "NPC masteries off (PHB: monsters have no Weapon Mastery)", game.settings.get("wm5e", "npcMasteries") === false);
    if (mode === "players") t("Settings", "Auto-trigger left to players", def?.config === true, `this user: ${userAuto}`);
    else {
      t("Settings", `Auto-trigger synced to "${mode}"`, userAuto === (mode === "on"), `this user: ${userAuto}`);
      t("Settings", "Per-player checkbox hidden", def?.config === false);
    }
    for (const k of ["desc", "infer", "warn"]) t("Settings", `${k} setting`, true, game.settings.get(MOD, k));

    // 3. System config
    const keys = Object.keys(CONFIG.DND5E.weaponIds ?? {});
    const unmapped = keys.filter(k => !api.planItem(weapon("x", "simpleM", k)).mastery);
    t("Config", "All dnd5e base weapons mapped", keys.length && !unmapped.length, `${keys.length} keys${unmapped.length ? `, unmapped: ${unmapped}` : ""}`);
    for (const [m, cfg] of Object.entries(CONFIG.DND5E.weaponMasteries)) {
      const page = await fromUuid(cfg.reference);
      t("Config", `Rule page: ${m}`, page?.documentName === "JournalEntryPage", page?.name ?? "missing");
    }

    // 4. Pure logic
    const cases = [
      ["Greatclub, no base", weapon("Greatclub", "simpleM"), p => p.base === "greatclub" && p.mastery === "push"],
      ["Spiked Bone Club", weapon("Spiked Bone Club", "simpleM"), p => p.base === "club" && p.mastery === "slow"],
      ["Light Crossbow (longer key wins)", weapon("Light Crossbow", "simpleR"), p => p.base === "lightcrossbow" && p.mastery === "slow"],
      ["Natural Bite untouched", weapon("Bite", "natural"), p => p.changes === null],
      ["Unarmed Strike untouched", weapon("Unarmed Strike", "natural"), p => p.changes === null],
      ["Hand-set mastery kept", weapon("Club", "simpleM", "club", "sap"), p => p.mastery === "sap" && !p.changes?.["system.mastery"]],
      ["Homebrew unresolved", weapon("Psychic Blade", "simpleM"), p => p.weapon && !p.mastery]
    ];
    for (const [name, src, check] of cases) {
      const p = api.planItem(src);
      t("Logic", name, check(p), `base=${p.base} mastery=${p.mastery}`);
    }

    // 5. Live: world item
    const folderA = await Folder.implementation.create({ name: "WM5E QA (temp)", type: "Actor" });
    const folderI = await Folder.implementation.create({ name: "WM5E QA (temp)", type: "Item" });
    created.folders.push(folderA, folderI);
    const wi = await Item.implementation.create({ ...weapon("QA Greatclub", "simpleM"), folder: folderI.id });
    created.items.push(wi);
    t("Live: world item", "Base item set on create", wi.system.type.baseItem === "greatclub", wi.system.type.baseItem);
    t("Live: world item", "Mastery set on create", wi.system.mastery === "push", wi.system.mastery);
    t("Live: world item", "One description link", blocks(wi.system.description.value) === 1);
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const html = await TE.enrichHTML(wi.system.description.value);
    t("Live: world item", "Link renders as content link", /content-link/.test(html) && html.includes(CONFIG.DND5E.weaponMasteries.push.reference.split(".").pop()));

    // 6. Live: NPC created with weapons already on it
    const npc = await Actor.implementation.create({ name: "QA Ogre", type: "npc", folder: folderA.id,
      items: [weapon("Greatclub", "simpleM"), weapon("Javelin", "simpleM"), weapon("Bite", "natural")] });
    created.actors.push(npc);
    const nw = n => npc.items.getName(n);
    t("Live: NPC create", "Greatclub = Push", nw("Greatclub")?.system.mastery === "push", nw("Greatclub")?.system.mastery);
    t("Live: NPC create", "Javelin = Slow", nw("Javelin")?.system.mastery === "slow", nw("Javelin")?.system.mastery);
    t("Live: NPC create", "Bite untouched", !nw("Bite")?.system.mastery && !blocks(nw("Bite")?.system.description.value));

    // 7. Live: character created with weapons already on it
    const cls = (id, lvl) => ({ name: id[0].toUpperCase() + id.slice(1), type: "class", system: { identifier: id, levels: lvl } });
    const pc = await Actor.implementation.create({ name: "QA Fighter", type: "character", folder: folderA.id,
      items: [cls("fighter", 1), weapon("Halberd", "martialM", "halberd"), weapon("Handaxe", "simpleM")] });
    created.actors.push(pc);
    const known = a => [...(a._source.system?.traits?.weaponProf?.mastery?.value ?? [])];
    t("Live: PC create", "Weapon masteries set", pc.items.getName("Halberd")?.system.mastery === "cleave" && pc.items.getName("Handaxe")?.system.mastery === "vex");
    t("Live: PC create", "No masteries granted (players pick)", known(pc).length === 0, known(pc).join(", ") || "none");
    t("Caps", "Fighter 1 = 3", api.masteryCap(pc) === 3, api.masteryCap(pc));

    const wiz = await Actor.implementation.create({ name: "QA Wizard", type: "character", folder: folderA.id,
      items: [cls("wizard", 1), weapon("Quarterstaff", "simpleM", "quarterstaff")] });
    const barb = await Actor.implementation.create({ name: "QA Barbarian", type: "character", folder: folderA.id, items: [cls("barbarian", 4)] });
    const multi = await Actor.implementation.create({ name: "QA Multiclass", type: "character", folder: folderA.id,
      items: [cls("fighter", 4), cls("rogue", 2), { name: "Weapon Master", type: "feat" }] });
    created.actors.push(wiz, barb, multi);
    t("Caps", "Wizard = 0", api.masteryCap(wiz) === 0, api.masteryCap(wiz));
    t("Caps", "Barbarian 4 = 3", api.masteryCap(barb) === 3, api.masteryCap(barb));
    t("Caps", "Fighter 4 / Rogue 2 + Weapon Master = 5", api.masteryCap(multi) === 5, api.masteryCap(multi));

    await wiz.update({ "system.traits.weaponProf.mastery.value": ["quarterstaff"] });
    await pc.update({ "system.traits.weaponProf.mastery.value": ["halberd", "handaxe", "dagger", "rapier", "longbow"] });
    const before = JSON.stringify([known(wiz), known(pc)]);
    const dry = await api.repair({ actors: [wiz, pc] });
    t("Repair", "Dry run changes nothing", JSON.stringify([known(wiz), known(pc)]) === before);
    t("Repair", "Dry run finds wizard and over-cap fighter", dry.length === 2, dry.map(r => `${r.name}: -${r.remove.join("/")}`).join("; "));
    await api.repair({ apply: true, actors: [wiz, pc] });
    t("Repair", "Wizard cleared", known(wiz).length === 0, known(wiz).join(", ") || "none");
    t("Repair", "Fighter trimmed to 3", known(pc).length === 3, known(pc).join(", "));
    await api.undoRepair({ actors: [wiz, pc] });
    t("Repair", "Undo restores both", known(wiz).length === 1 && known(pc).length === 5, `${known(wiz).length} / ${known(pc).length}`);
    t("Repair", "Undo clears the backup flag", !wiz.getFlag(MOD, "repair") && !pc.getFlag(MOD, "repair"));

    const rep = { actors: 0, items: 0, world: 0, manual: [] };
    for (const a of [npc, pc, wiz]) await api.processActor(a, rep);
    t("Live: idempotency", "Re-processing test actors changes nothing", rep.actors === 0 && rep.items === 0, `${rep.actors} actors, ${rep.items} items`);

    // 10. Read-only audit of your real world
    const pending = [];
    for (const a of game.actors) {
      if (a.folder?.name === "WM5E QA (temp)") continue;
      for (const i of a.itemTypes.weapon ?? []) if (api.planItem(i._source).changes) pending.push(`${a.name}: ${i.name}`);
    }
    for (const i of game.items) if (i.type === "weapon" && i.folder?.name !== "WM5E QA (temp)" && api.planItem(i._source).changes) pending.push(`Items: ${i.name}`);
    const over = game.actors.filter(a => a.type === "character" && a.folder?.name !== "WM5E QA (temp)" && known(a).length > api.masteryCap(a));
    t("World audit (read-only)", "No characters over their PHB mastery cap", !over.length, over.map(a => `${a.name} ${known(a).length}/${api.masteryCap(a)}`).join("; ") || "all within cap");
    t("World audit (read-only)", "No weapons waiting for the sweep", !pending.length, pending.length ? pending.slice(0, 15).join("; ") : "all clean");
  } catch (e) {
    t("Error", "Suite aborted", false, e.message);
  } finally {
    for (const a of created.actors) await a.delete().catch(() => {});
    for (const i of created.items) await i.delete().catch(() => {});
    for (const f of created.folders) await f.delete().catch(() => {});
    t("Cleanup", "Temporary documents removed", !game.actors.some(a => a.folder?.name === "WM5E QA (temp)") && !game.folders.some(f => f.name === "WM5E QA (temp)"));
  }

  const failed = results.filter(r => !r.pass);
  const rows = results.map(r => `<tr><td>${r.pass ? "PASS" : "<b>FAIL</b>"}</td><td>${r.group}</td><td>${r.name}</td><td>${foundry.utils.escapeHTML?.(r.detail) ?? r.detail}</td></tr>`).join("");
  await ChatMessage.implementation.create({
    whisper: [game.user.id],
    content: `<b>WM5E QA: ${results.length - failed.length}/${results.length} passed</b><details><summary>Details</summary><table>${rows}</table></details>`
  });
  return { passed: results.length - failed.length, total: results.length, failed, results };
})();
