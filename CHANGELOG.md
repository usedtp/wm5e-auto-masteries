# Changelog

All notable changes to WM5E Auto Masteries. Versions follow [Semantic Versioning](https://semver.org):
MAJOR for breaking changes, MINOR for new features, PATCH for fixes.

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
