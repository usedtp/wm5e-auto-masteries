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
- [usedtp Logger](https://github.com/usedtp/usedtp-logger) 1.0.0 or later (Foundry offers to install it with this module). Errors and "unclear" cases show under GM Settings, usedtp Logger, Open logs.
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

## Weapon mastery automation (2024 PHB)
Applies weapon masteries exactly as the 2024 Player's Handbook describes. Full rules: `SPEC-masteries.md`.

- **Turn off Automated Masteries 5e** (Manage Modules). While it is active, this automation stays idle and the GM sees a notice.
- **Combat only.** Masteries apply only while the attacker is in a started combat. The PHB has no such limit; it is a Foundry rule here.
- **Characters only.** dnd5e records a mastery on the attack only when the character knows it. NPCs use masteries only under the house rule.
- **One target per attack.** Attacks with several targets get no mastery and are logged as unclear.
- **Result lines.** Each mastery adds a line to the attack card. The GM sees Approve and Reject. Reject reverses it. At the start of the attacker's next turn, open lines count as approved.
- **Apply weapon mastery.** Slow and Vex apply when damage is applied with Apply Damage. If HP was changed by hand, the GM presses Apply weapon mastery on the damage card.

Built so far: Sap, Vex, Slow. Topple, Graze, Push, Cleave and Nick follow.

Live self-test: with usedtp Logger 1.1.2 or later, the GM's browser plays a short hidden test combat once after each update of this module and reports the result (see usedtp Logger's README).

## Reporting a mastery problem
Every weapon attack and damage card ends with "Mastery wrong or unclear?" and two buttons, the same as Roll Lessons:
- **Error**: a mastery didn't happen, the wrong one was used, or its effect was wrong.
- **Unclear**: it's not clear whether a mastery should have happened, or what it did.

The player ticks what happened and can add a comment. The report records the weapon, its mastery and base item, the mastery used on the roll, whether the character knows it, whether Automated Masteries 5e acted, the auto-trigger setting and module versions. Reports show in usedtp Logger > Open logs. Turn the buttons off with the "Error and Unclear buttons on weapon cards" setting.

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
| Error and Unclear buttons on weapon cards | On |
| Allow house rules (homebrew) | Off |
| House rule: NPCs use weapon masteries | Off (PHB) |

## Macros
`macros/` holds GM tools: `wm5e-qa.js` (in-world QA suite, sandboxed), `wm5e-mastery-audit.js` (read-only audit report), `cleave-check.js` (explains why Cleave finds no second target).

## Development
```sh
npm test
```

### Releasing a new version
1. Bump `version` in `module.json` (MAJOR.MINOR.PATCH) and add an entry to `CHANGELOG.md`.
2. Push to `main`.

The Release workflow runs when `main` has a `module.json` version with no release yet. It runs the tests, writes the repository URLs into `module.json`, tags the version, and publishes a release with `module.json` and `module.zip`.
