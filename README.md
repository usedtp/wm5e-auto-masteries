# WM5E Auto Masteries

A Foundry VTT helper module for dnd5e that sets up weapon masteries so [Automated Masteries 5e](https://foundryvtt.com/packages/wm5e) works without manual data entry.

## What it does

- Sets each weapon's 2024 Player's Handbook mastery when the weapon is created.
- Fills a missing base item by weapon name (for example, "Spiked Bone Club" becomes Club).
- Adds a link to the mastery's rule page at the end of the weapon description.
- Grants player characters the matching mastery for each weapon they own. It ignores class limits on how many weapon kinds can be mastered.
- Lets the GM turn Automated Masteries 5e auto-triggering on or off for every user.
- Includes a one-time sweep for existing actors and world items.

Changes are applied as items are created, so there is no second database write. The module does not load compendium documents and writes only when something differs.

## Requirements

- Foundry VTT v14 (14.367 or newer)
- dnd5e system 6.0.0 or newer (built against 6.0.6)
- Recommended: [Automated Masteries 5e](https://foundryvtt.com/packages/wm5e), which applies the mastery effects. That module requires [Automated Conditions 5e](https://foundryvtt.com/packages/automated-conditions-5e).

## Install

1. In Foundry, open **Add-on Modules**, then **Install Module**.
2. Paste this into **Manifest URL** and click **Install**:
   `https://github.com/usedtp/wm5e-auto-masteries/releases/latest/download/module.json`
3. Launch your world as GM. Open **Game Settings**, **Manage Modules**, tick **WM5E Auto Masteries**, click **Save Module Settings**.

## Update

Open **Add-on Modules** and click **Update** next to WM5E Auto Masteries.

## Settings

Open **Game Settings**, **Configure Settings**, **WM5E Auto Masteries**.

| Setting | Default | Effect |
|---|---|---|
| Add mastery link to weapon descriptions | On | Appends the mastery rule link to each weapon description |
| Fill missing base items from weapon name | On | Matches Simple and Martial weapons with no base item by name |
| Grant player characters their weapon masteries | On | Adds each owned weapon's base item to the character's mastery list |
| Automatically trigger masteries for | Everyone on | Everyone on, Everyone off, or Each player chooses |

## Fix existing actors and items

New weapons are handled automatically. For weapons that already exist, run the sweep once as GM:

1. Press F12 to open the browser console.
2. Run: `game.modules.get("wm5e-auto-masteries").api.sweep()`
3. To include unlinked tokens on scenes, run: `game.modules.get("wm5e-auto-masteries").api.sweep({ scenes: true })`
4. A whispered chat message reports what changed and lists weapons that need manual setup.

## Report a problem

Open an issue on this repo. Include your Foundry and dnd5e versions and any red errors from the browser console (F12).
