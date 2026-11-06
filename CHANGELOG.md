# Changelog

All notable changes to WM5E Auto Masteries. Versions follow [Semantic Versioning](https://semver.org):
MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

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
