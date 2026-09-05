# Misc Patches — working notes for sessions in this repo

**What this is.** A house Foundry VTT module of small, independent patches for things other
modules and the platform get slightly wrong at the table. Each patch is one file under
`scripts/patches/`, behind its own world setting, registering its own hooks. Nothing here is a
rule of the game — that is Battle Flow's (`../fvtt-mod-battleflow`), and patches are pulled out
of it for exactly that reason. Same author, same house conventions as the sister repos beside
this one (`fvtt-mod-combatplus`, `fvtt-mod-partystash`, …): no build step, plain ES modules,
MIT.

**Born 2026-09-04** from the Misty Step block: Battle Flow's backlog holds the full measurement
(`../fvtt-mod-battleflow/BACKLOG.md`, the Misty Step row; `NOTES.md` §1 there has the Foundry
movement-pipeline facts). The first patch is that fix.

## Test environment

- **The LOCAL sandbox is the test box**, never prod. It is a byte copy of the Molten prod world
  run headless: `node ../fvtt-mcp-molten5e/scripts/local-foundry.mjs start|stop|status|restart`.
  Never launch the Electron app for suites.
- **Deploy to the sandbox:** `node ../fvtt-mcp-molten5e/scripts/deploy-house-module.mjs
  fvtt-mod-miscpatches --local`, then **restart** the sandbox when `module.json` changed (a new
  setting, a new file in `esmodules`); a world reload is enough for script edits. A sandbox
  refresh from prod wipes locally deployed modules — re-deploy after every refresh.
- **The suites** live in `tools/` and use the MCP repo's Foundry client
  (`../fvtt-mcp-molten5e/dist/foundry.js`, credentials from its `.env`; the suite identity is
  "Tester Assistant"). They reuse Battle Flow's fixtures on the sandbox (the *Battle Flow Test
  Range* scene, the *BF Test* actors); if those are missing run
  `node ../fvtt-mod-battleflow/tools/fixture-suite.mjs`. Disconnect the MCP bridge
  (`disconnect-bridge`) before a suite or a restart — one connected user blocks the restart.
- **Prod (Molten)** is deployed with the same script without `--local`, and only on the user's
  explicit say-so. A module.json change needs the prod process restarted, which is not ours to
  do. Never force-reload the user's prod window.

## Release ritual (as the sisters do it)

Bump `version` AND the `download` URL in `module.json` together, one `release:` commit, tag
`vX.Y.Z`, push with tags, `gh release create vX.Y.Z` with a zip of `module.json` + `scripts/`
(forward-slash entry names — see Battle Flow's `tools/build-release.ps1` for why) and a bare
`module.json`.

## Patches

| Patch | File | Settings |
| --- | --- | --- |
| Teleports cross walls and creatures | `scripts/patches/teleports.js` | `teleports` (switch), `teleportList` (names) |

**Teleports:** Automated Animations' teleport preset moves the token with a bare
`document.move()`; Foundry walks that, so walls and (under dnd5e's full movement automation)
hostile creatures stop it. Foundry's `blink` is wall-checked too; only `displace` crosses both,
and a token's `movementAction` may be set to it. The patch arms the caster's token with
`displace` at a listed use, judges the move in `preMoveToken` (sight wall → refuse; creature on
the square → refuse), restores the action on `moveToken` or after two minutes. ⚠ Automated
Animations' own *Check Collision* preset option refuses a wall at the circle before any move —
the user turns it off on the teleport presets. Suite: `node tools/smoke-teleports.mjs`.
