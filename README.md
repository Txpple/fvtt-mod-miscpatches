# Misc Patches

Small, independent fixes for things other modules and the platform get slightly wrong at the
table. One patch per file, each behind its own setting in **Game Settings → Configure Settings →
Misc Patches**. Nothing here is a rule of the game; that is what [Battle Flow](https://github.com/Txpple/fvtt-mod-battleflow)
is for, and these were pulled out of it for exactly that reason.

Requires dnd5e 5.x or 6.x on Foundry v13 or v14.

The first patch — teleports crossing walls and creatures under Automated Animations — was
**removed in v1.1.0** (2026-09-23): FX Studio plays the teleport move itself. Its code is in the
history at v1.0.0.

## Patches

### Old effect keys reach their new fields

**The problem.** dnd5e 6.0 moved many actor fields and keeps a table that redirects an effect
written against an old key to the new one, so content not yet updated for 6.0 keeps working.
But it redirects only **one step**, and some keys moved twice: `movement.speed` goes to
`movement.walk`, which itself moved to `movement.speeds.walk`. The PHB's Ranger feature Roving
(+10 feet, climb and swim equal to your speed) landed on a field that is no longer a number, and
a 35-foot speed read **3510**.

**The patch.** When the world loads, every redirect whose target was itself redirected is
pointed at the end of its chain. Nothing in any compendium or on any sheet is edited: every copy
of every item with an old key works as written, including the next ranger's Roving. A key that
moved once is untouched. Switch: *Old effect keys reach their new fields* (on by default; takes
effect on reload).

## Testing

`tools/smoke-shim-chains.mjs` builds rangers in memory (nothing is written) with an old-key
speed bonus and with the PHB's own Roving, and checks the speeds come out as numbers and as the
rule says. It needs the house MCP repo beside this one for its Foundry client.
