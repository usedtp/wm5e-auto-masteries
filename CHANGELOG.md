# Changelog

All notable changes to WM5E Auto Masteries. Versions follow [Semantic Versioning](https://semver.org):
MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

## [2.9.0] - 2026-11-06
### Added
- Cleave: on a melee hit, a second attack against a creature (allies included) within 5 ft of the first target and within your reach. One such creature: it attacks at once. Several: the attacking player picks. The extra attack gets its own use card; its damage drops a positive ability modifier. Once per turn. Reject deletes the extra cards.
- Nick: a "Light attack (Nick)" button on the attack card, on the attacker's turn. It rolls the extra attack of the Light property with another equipped Light weapon, as part of the Attack action, in off-hand mode (no positive modifier on damage). Once per turn. Reject deletes it.
- All 8 weapon masteries now follow the 2024 PHB. Live self-test covers Cleave and Nick.

## [2.8.0] - 2026-11-06
### Added
- Push: on a hit, pushes a Large or smaller target straight away from the attacker, along the line from the attacker's center through the target's center. Counts squares the 2024 way (a diagonal square is 5 ft). Stops at the last open square: walls, other tokens and the scene edge block. When both 5 and 10 ft fit, the attacking player is asked; otherwise it goes as far as it can. Reject moves the token back.
- House rules (need "Allow house rules"): the attacker picks the direction; slide 45 degrees when blocked; always the full 10 ft.
- Live self-test covers a 10 ft push, a wall stop at 5 ft, and a Huge target.

## [2.7.1] - 2026-11-06
### Fixed
- Live self-test: the Graze step now sets the test goblin's AC as a whole object. dnd5e 6 ignored the flat-only update, so the miss never happened.

## [2.7.0] - 2026-11-06
### Added
- Topple: on a hit, the attack card shows the DC (8 + the ability modifier the attack used + Proficiency Bonus) and a GM Roll save button. A failed Constitution save makes the target Prone. Reject removes the Prone it added.
- Graze: on a miss, a damage card for the attack's ability modifier, in the weapon's damage type, with the normal Apply tray. Nothing when the modifier is 0 or less. Reject deletes the card.
- Live self-test covers Topple and Graze.
### Fixed
- Live self-test waits for the Slow line, not only the effect. It failed when a second GM browser was online.

## [2.6.0] - 2026-11-06
### Added
- Live self-test for the mastery engine, run by usedtp Logger 1.1.2 or later once per new version: Sap, Vex, Slow, Reject, turn expiry and report context, in a hidden sandbox combat. Skips itself while Automated Masteries 5e is active.

## [2.5.2] - 2026-11-06
### Fixed
- Error and Unclear reports on weapon cards now record which engine applied masteries and the card's mastery result lines, with their Approve or Reject status.

## [2.5.1] - 2026-11-06
### Fixed
- A GM logged in from two browsers no longer applies a mastery twice. One browser claims each decision.
- A rejected mastery line is not re-applied when damage is applied again to the same attack.

## [2.5.0] - 2026-11-06
### Added
- Weapon mastery automation per the 2024 PHB: Sap, Vex, Slow. Idle while Automated Masteries 5e is active.
- Result line on the attack card for each mastery, with GM Approve and Reject. Reject reverses the effect.
- Apply weapon mastery button on damage cards for the GM, for HP changed by hand.
- Settings: Allow house rules (homebrew); House rule: NPCs use weapon masteries.

## [2.4.0] - 2026-11-06
### Added
- Error and Unclear buttons under every weapon attack and damage card, matching Roll Lessons. Reports go to usedtp Logger with the weapon, mastery, base item, mastery used, whether the character knows it, and whether Automated Masteries 5e acted.
- New world setting to turn the buttons off.

## [2.3.0] - 2026-11-06
### Changed
- Diagnostics and reports now go through usedtp Logger. The module requires usedtp Logger 1.0.0 or later.
- Every mastery hook (new weapon, new actor with weapons, change to a character's known masteries) runs guarded: a failure is logged with the weapon, mastery and actor, and Foundry carries on.
- Setting Automated Masteries 5e's auto-trigger is guarded the same way; the old console error is gone.
- The QA and Cleave check macros log failures through usedtp Logger.
- Release builds on every push to main when `module.json` has a new version.
### Added
- "Unclear" entries in usedtp Logger whenever the module hands a decision back to the GM or player: a weapon with no PHB mastery, a character's weapon with a mastery but no base item, a class that is not in the 2024 PHB, a character over their mastery limit, a repair that had to choose which masteries to keep, and an Automated Masteries 5e version without the auto-trigger setting.
- `api.log()` for macros.
- `scripts/diag.mjs`: the only file that talks to usedtp Logger. Without usedtp Logger the module still runs and logs to the console.

## [2.2.0] - 2026-10-12
### Changed
- Never grants weapon masteries to characters. Players pick them at level-up or in Configure Weapons.
- Enemies follow the 2024 PHB: only characters with a Weapon Mastery feature use masteries (turn off Automated Masteries 5e's "Enable NPC Masteries").
### Added
- PHB mastery limits: Barbarian 2/3/4, Fighter 3/4/5/6, Paladin, Ranger and Rogue 2, +1 per Weapon Master feat, 0 for other classes. Multiclass uses the highest single class.
- GM warning when a character knows more masteries than their limit.
- `api.repair()` (dry run), `api.repair({ apply: true })` and `api.undoRepair()` to trim over-limit characters, keeping level-up picks first.
- `api.masteryCap(actor)`.
### Removed
- "Grant player characters their weapon masteries" setting, replaced by "Warn the GM about characters over their mastery limit".
### Fixed
- Characters without Weapon Mastery (for example a Wizard with a Staff) could trigger masteries.

## [2.1.0] - 2026-10-10
### Added
- GM setting "Automatically trigger masteries for" (Everyone on / Everyone off / Each player chooses) that sets Automated Masteries 5e's per-user auto-trigger at login and hides the per-player checkbox.

## [2.0.0] - 2026-10-10
### Changed
- Rebuilt for dnd5e 6.0.x and Foundry v14 (14.367+).
- Weapons are fixed before they are saved (preCreate hooks): no second write, no compendium document loads.
- Writes only when data actually changes; description check compares content, not exact HTML.
- Sweep skips actors without weapons, batches world items, and reports totals with a collapsed manual-setup list.
### Added
- Missing base items filled from the weapon name.
- World settings for description links and base-item matching.
- Natural attacks and compendium packs are never touched.

## [1.2.0] - 2026-10-04
### Changed
- Weapon descriptions link to the system's mastery rule page instead of a text summary.

## [1.1.0] - 2026-10-04
### Added
- Short mastery summary appended to weapon descriptions.

## [1.0.0] - 2026-10-04
### Added
- Fills each weapon's mastery from the 2024 PHB table and a one-time sweep for existing actors.
