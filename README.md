# WM5E Auto Masteries

Helper for [Automated Masteries 5e](https://foundryvtt.com/packages/wm5e) on Foundry VTT v14 with dnd5e 6.0.x.

- Sets each weapon's 2024 PHB mastery and base item as it is created.
- Links the mastery's rule page at the end of each weapon description.
- Enforces 2024 PHB mastery limits: warns the GM when a character knows too many, and repairs it on request.
- Lets the GM turn Automated Masteries 5e auto-triggering on or off for every user.

It never grants masteries. Players choose them at level-up or in Configure Weapons.

## Requirements
- Foundry VTT 14.367 or later
- dnd5e 6.0.x
- Automated Masteries 5e and Automated Conditions 5e (recommended; this module prepares data, they apply the effects)

## Install
In Foundry: Add-on Modules, Install Module, paste this Manifest URL, Install:

```
https://github.com/usedtp/wm5e-auto-masteries/releases/latest/download/module.json
```

Updates then appear under Foundry's Update button.

## First run (GM)
Run once as a Script macro to fix actors and items that existed before install:

```js
await game.modules.get("wm5e-auto-masteries").api.sweep()
```

## Mastery limits (2024 PHB)
| Class | Weapon kinds |
| --- | --- |
| Barbarian | 2; 3 at level 4; 4 at level 10 |
| Fighter | 3; 4 at level 4; 5 at level 10; 6 at level 16 |
| Paladin, Ranger, Rogue | 2 |
| Weapon Master feat | +1 |
| Other classes, monsters | 0 |

Multiclass characters use their highest single class.

## Repair over-limit characters (GM)
```js
await game.modules.get("wm5e-auto-masteries").api.repair()                 // dry run, changes nothing
await game.modules.get("wm5e-auto-masteries").api.repair({ apply: true })  // apply
await game.modules.get("wm5e-auto-masteries").api.undoRepair()            // restore removed picks
```

## Settings (world)
| Setting | Default |
| --- | --- |
| Automatically trigger masteries for | Everyone on |
| Add mastery link to weapon descriptions | On |
| Fill missing base items from weapon name | On |
| Warn the GM about characters over their mastery limit | On |

## Macros
`macros/` holds GM tools: `wm5e-qa.js` (in-world QA suite, sandboxed), `wm5e-mastery-audit.js` (read-only audit report), `cleave-check.js` (explains why Cleave finds no second target).

## Development
```sh
npm test
```

### Releasing a new version
1. Bump `version` in `module.json` (MAJOR.MINOR.PATCH) and add an entry to `CHANGELOG.md`.
2. Commit and push to `main`.
3. Create a GitHub release with tag `<version>` (for example `2.2.1`, no "v") and publish it. Do not mark it as a pre-release.

The Release workflow runs the tests, checks the tag matches `module.json`, writes the repository URLs into `module.json`, and attaches `module.json` and `module.zip` to the release.
