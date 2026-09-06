# Misc Patches

Small, independent fixes for things other modules and the platform get slightly wrong at the
table. One patch per file, each behind its own setting in **Game Settings → Configure Settings →
Misc Patches**. Nothing here is a rule of the game; that is what [Battle Flow](https://github.com/Txpple/fvtt-mod-battleflow)
is for, and these were pulled out of it for exactly that reason.

Requires dnd5e 5.x on Foundry v13 or v14.

## Patches

### Teleports cross walls and creatures

> **Carried into FX Studio on 2026-09-06.** FX Studio's own move shape now teleports the token
> with Foundry's `displace` action and judges the spot by the spell's words (`seen`,
> `unoccupied` on the look; `../fvtt-mod-fxstudio`, DESIGN §8). This patch stays here, switched
> on, for a table that still runs Automated Animations (prod until FX Studio's cutover); once
> FX Studio plays the moves it is switched off and retired.

**The problem.** Cast Misty Step with an animation module's teleport (Automated Animations'
circle), pick a destination, and the token is stopped by a wall or by another creature in the
way. The animation moves the token with a plain move, Foundry walks a plain move, so walls stop
it and dnd5e's full movement automation stops it in front of a hostile creature.

**The patch.** When a listed teleport is used, the caster's token is given Foundry's own
teleport movement action for the one move that follows, whether that is the circle's pick or a
drag by hand. The move crosses walls and creatures. The moment it lands the token's usual
movement action is put back. If no move comes within two minutes it is put back anyway.

**What is still judged.** The destination is checked against the spell's own words:

- *"a space you can see"* — a sight-blocking wall between the caster and the destination
  refuses the move with a notice. Dimension Door needs no line of sight and is not checked.
- *"an unoccupied space"* — a creature standing on the destination refuses the move.

A refusal leaves the token where it was and still armed, so the player can pick again. Range is
not judged; the animation's circle and the table hold it. Light (Shadow Step's dim light) is the
table's.

**The list.** Misty Step, Dimension Door, Moonlight Step, Shadow Step, Arcane Charge, by the
item's own name. Edit the list setting to add or remove names; a name not in the table above is
ignored.

**One thing to switch off.** Automated Animations' teleport presets carry their own *Check
Collision* option, which tests a movement ray at the circle before any move exists. With it on,
a wall still refuses there, before this patch can judge. Turn it off on the teleport presets
(Automated Animations → Autorec → Preset → Misty Step) to let the rule be the only judge.

## Testing

`tools/smoke-teleports.mjs` drives the patch on the local sandbox: a listed use arms the
token, a plain move crosses a wall and a creature, a sight wall and an occupied square refuse,
the movement action is restored. It needs the house MCP repo beside this one for its Foundry
client.
