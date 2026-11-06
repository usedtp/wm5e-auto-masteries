# Mastery automation spec

Source of truth for the mastery engine in WM5E Auto Masteries. Rules follow the 2024 Player's Handbook (Mastery Properties, and the Rules Glossary entry for Speed). Written from the PHB; no code from Automated Masteries 5e.

## Ground rules
- Default is strict PHB.
- "Allow house rules (homebrew)" world checkbox, off by default. Off means every house-rule setting is ignored.
- Choices that exclude each other are one dropdown.
- Masteries run only for player characters, only with weapons whose mastery the character knows.
- Masteries run only in a started combat. **Foundry rule:** the PHB has no combat-only limit.
- Optional masteries (Cleave, Graze, Push, Slow, Topple) apply automatically.
- Each result is one line on the attack card, e.g. "Topple: failed DC 14 Con save, Prone."
- The GM sees Approve and Reject on each line. Reject reverses it: removes the effect, returns a pushed token, or deletes a Cleave or Graze roll. Players see the line only; they tell the GM. Buttons last until the start of the attacker's next turn, then the line counts as approved.
- While Automated Masteries 5e is active, the engine stays idle and tells the GM to turn it off in Manage Modules.

## Masteries
| Mastery | Behaviour |
|---|---|
| Cleave | On a melee hit, a second melee attack against any creature (allies included) within 5 ft of the first and in reach. One valid creature: attacks it. Several: the player picks. Damage adds the ability modifier only if negative. Once per turn. |
| Graze | On a miss, damage equal to the attack's ability modifier, of the weapon's damage type. Nothing if the modifier is 0 or less. |
| Nick | "Light attack (Nick)" button on the attack card rolls the off-hand Light attack right away, once per turn. The card notes the Bonus Action is still free. |
| Push | Straight line from the attacker's center through the target's center. Target Large or smaller, by creature size. Asks 5 or 10 ft only when both fit. If blocked, stops at the last open square. |
| Sap | On a hit, Disadvantage on the target's next attack roll before the start of the attacker's next turn. |
| Slow | When damage lands (HP lost), Speed and every special speed drop 10 ft until the start of the attacker's next turn. Never more than 10 ft from Slow. |
| Topple | On a hit, Constitution save, DC 8 + the ability modifier used for the attack + Proficiency Bonus. The GM is prompted to roll it. Fail: Prone. |
| Vex | When damage lands, Advantage on the attacker's next attack roll against that creature before the end of the attacker's next turn. |

## House rules (need the homebrew checkbox)
- Push: player picks the direction.
- Push: slide 45 degrees if the straight path is blocked.
- Push: always the full 10 ft.
- NPC masteries: Off / NPCs with a Weapon Mastery feature / All NPCs.

## Can't match the PHB exactly in Foundry
1. Nick: Foundry doesn't track the Attack action or Bonus Action. The button is the closest match.
2. Slow and Vex fire automatically only when damage goes through Apply Damage. For manual HP edits, the damage card has a GM-only "Apply weapon mastery" button beside dnd5e's apply-damage buttons. It applies the mastery for its normal duration.
3. Topple's save is a prompt to the GM.
4. Combat-only, see Ground rules.
5. Push needs the GM to be viewing the scene, because Foundry checks walls on the canvas.

## Build order
1. Core engine: switch-over, settings, combat gate, card lines, GM Approve/Reject, once-per-turn store.
2. Sap, Vex, Slow.
3. Topple, Graze.
4. Push.
5. Cleave, Nick.
Each phase: tests, then a release.
