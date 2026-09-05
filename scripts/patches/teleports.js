/**
 * TELEPORTS — a listed teleport's move crosses walls and creatures, and the destination is
 * judged by the spell's own words.
 *
 * THE PROBLEM (2026-09-04, at the table): Misty Step's circle (Automated Animations' teleport
 * preset) lets you pick a destination, then the token is stopped by a wall or by another
 * creature in the way. Measured on Foundry 14.365 / dnd5e 5.3.3: the preset moves the token
 * with a bare `document.move()` — no movement action, no constrain options. Foundry walks a
 * bare move, so a wall stops it (`constrainMovementPath`, the walk action's walls: "move"), and
 * dnd5e's *full* movement automation stops it in front of a hostile creature. The `blink`
 * action is a teleport that is STILL wall-checked (its config carries walls: "move"). Only
 * `displace` — Foundry's own teleport action (teleport: true, walls: null; the one its undo
 * uses) — crosses both, and a token's DEFAULT movement action may be set to it: the schema
 * accepts any key of CONFIG.Token.movement.actions.
 *
 * THE FIX: on the casting client, at a listed item's use, the caster's token is given the
 * `displace` action and a small flag; the one move that follows (the circle's pick, or a drag
 * by hand) is the teleport; the action goes back the moment the move lands, or when the
 * window closes with no move. The move that arrives while the token is armed meets
 * `preMoveToken` — Foundry's veto seat, after the path is constrained and before it commits —
 * and the destination is judged by the row: a sight-blocking wall between the caster's centre
 * and the destination refuses a `sight` row ("a space you can see"); a creature standing on
 * the destination refuses an `unoccupied` row. A refusal is a notice and no move; the token
 * stays armed so the player may pick again. Range is not judged — the circle and the table
 * hold it.
 *
 * ⚠ Automated Animations' own "Check Collision" option on a teleport preset is a MOVE-collision
 * ray tested at the circle, before any move exists: with it on, a wall still refuses there,
 * before this patch sees anything. Switch it off on the teleport presets (Automated Animations
 * → Autorec → Preset → Misty Step) to let the rule here be the only judge.
 *
 * Nothing else about the platform's pipeline is touched. An unlisted item, a move with no arm
 * on the token, and the token's other data are never read or written. The prior movement
 * action is kept on the flag and restored exactly, including "not set" (null — the platform
 * infers walk or fly from the sheet).
 */
import { MODULE_ID, TITLE } from "../core.js";

/** The rows: the item's own name → what its text demands of the destination, and the text. */
export const TELEPORTS = Object.freeze({
  "Misty Step": Object.freeze({ sight: true, unoccupied: true,
    rule: "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see." }),
  "Dimension Door": Object.freeze({ sight: false, unoccupied: true,
    rule: "You teleport to a location within range. You arrive at exactly the spot desired. It can be a place you can see, one you can visualize, or one you can describe by stating distance and direction." }),
  "Moonlight Step": Object.freeze({ sight: true, unoccupied: true,
    rule: "As a Bonus Action, you teleport up to 30 feet to an unoccupied space you can see, and you have Advantage on the next attack roll you make before the end of this turn." }),
  "Shadow Step": Object.freeze({ sight: true, unoccupied: true,
    rule: "While entirely within Dim Light or Darkness, you can use a Bonus Action to teleport up to 60 feet to an unoccupied space you can see that is also in Dim Light or Darkness." }),
  "Arcane Charge": Object.freeze({ sight: true, unoccupied: true,
    rule: "When you use your Action Surge, you can teleport up to 30 feet to an unoccupied space you can see. You can teleport before or after the additional action." })
});

const SETTING_ON = "teleports";
const SETTING_LIST = "teleportList";
/** The arm on the TOKEN: `flags.<module>.teleport = { name, previousAction, armedAt }`. */
const ARM_FLAG = "teleport";
/** How long an arm stands with no move — the circle's pick is seconds; two minutes covers a drag by hand. */
export const TELEPORT_WINDOW_MS = 120_000;
/** This client's disarm clocks, by token uuid. */
const clocks = new Map();

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_ON, {
    name: "Teleports cross walls and creatures",
    hint: "A listed teleport (Misty Step, Dimension Door, Moonlight Step, Shadow Step, Arcane Charge) lets the caster's token cross walls and other creatures on the one move that follows the cast — an animation module's circle, or a drag by hand — instead of being stopped by them. The destination is judged by the spell's own words: a space you can see (a sight-blocking wall between refuses it; Dimension Door needs no line of sight) and an unoccupied space (a creature standing there refuses it). Range stays the table's. If Automated Animations' teleport preset has Check Collision on, turn it off — it refuses a wall at the circle before this can judge.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_LIST, {
    name: "Teleports list",
    hint: "Which teleports are handled, by the spell's or feature's own name, separated by commas. Remove a name to leave that teleport to the table.",
    scope: "world", config: true, type: String, default: Object.keys(TELEPORTS).join(", ")
  });
});

/* --- the decision, from plain facts ---------------------------------------------------------- */

/** The row for an item, by name, case-insensitive — `{ key, row }` or null. */
export function teleportRowFor(name, table = TELEPORTS) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if ( !wanted ) return null;
  const key = Object.keys(table).find(k => k.toLowerCase() === wanted);
  return key ? { key, row: table[key] } : null;
}

/** The verdict on a destination: allowed, or refused in the rule's words — sight before occupancy. */
export function teleportVerdict({ row, sightBlocked = false, occupied = false }) {
  if ( row?.sight && sightBlocked ) return { allowed: false, reason: "the destination must be a space you can see — a wall stands between you and it" };
  if ( row?.unoccupied && occupied ) return { allowed: false, reason: "the destination must be an unoccupied space — a creature stands there" };
  return { allowed: true, reason: null };
}

/** Two axis-aligned footprints overlap (a square is its interior, not its border). */
export function footprintsOverlap(a, b) {
  const eps = 1;
  return (b.x < a.x + a.w - eps) && (b.x + b.w > a.x + eps) && (b.y < a.y + a.h - eps) && (b.y + b.h > a.y + eps);
}

/** The names the list stands for, lower-cased. */
function listedNames() {
  let raw = "";
  try { raw = String(game.settings.get(MODULE_ID, SETTING_LIST) ?? ""); } catch { return new Set(); }
  return new Set(raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
}

/** The listed row for an activity's item, or null — the switch, the list, the table. */
function rowFor(activity) {
  try { if ( !game.settings.get(MODULE_ID, SETTING_ON) ) return null; } catch { return null; }
  const found = teleportRowFor(activity?.item?.name ?? "");
  if ( !found || !listedNames().has(found.key.toLowerCase()) ) return null;
  return found;
}

/* --- the edge: the token ---------------------------------------------------------------------- */

/** The caster's token on a scene — a synthetic actor's own, else the first active one. */
function tokenOf(actor) {
  const tok = actor?.token ?? actor?.getActiveTokens?.(true, true)?.[0] ?? null;
  return tok?.parent ? tok : null;
}
const armOf = tok => tok?.getFlag?.(MODULE_ID, ARM_FLAG) ?? null;

/**
 * ARM: the token's next move is the teleport. The prior action is what the SOURCE holds (null
 * when the sheet infers it), never the inferred value, so the restore puts back exactly what
 * was there. A re-arm while armed keeps the original prior — two casts must not leave
 * "displace" behind as the remembered default.
 */
async function arm(tok, key) {
  const prior = armOf(tok);
  const previousAction = prior ? prior.previousAction : (tok._source?.movementAction ?? null);
  await tok.update({ movementAction: "displace", [`flags.${MODULE_ID}.${ARM_FLAG}`]: { name: key, previousAction, armedAt: Date.now() } },
    { miscpatchesTeleportArm: true });
  scheduleDisarm(tok);
}

/** DISARM: the action restored exactly, the flag gone. The owner's write; a lost race is fine. */
async function disarm(tok) {
  clearClock(tok);
  const flag = armOf(tok);
  if ( !flag || !tok.isOwner ) return;
  try {
    await tok.update({ movementAction: flag.previousAction ?? null, [`flags.${MODULE_ID}.-=${ARM_FLAG}`]: null },
      { miscpatchesTeleportDisarm: true });
  } catch(err) {
    console.warn(`${TITLE} | Could not restore the token's movement action after a teleport.`, err);
  }
}

function scheduleDisarm(tok) {
  clearClock(tok);
  clocks.set(tok.uuid, setTimeout(() => { clocks.delete(tok.uuid); void disarm(tok); }, TELEPORT_WINDOW_MS));
}
function clearClock(tok) {
  const id = clocks.get(tok?.uuid);
  if ( id ) clearTimeout(id);
  clocks.delete(tok?.uuid);
}

/** Does a creature stand on the destination footprint? */
function occupiedAt(tok, dest) {
  const grid = tok.parent.grid;
  const footprint = { x: dest.x, y: dest.y, w: (dest.width ?? tok.width) * grid.sizeX, h: (dest.height ?? tok.height) * grid.sizeY };
  return tok.parent.tokens.some(t => (t.id !== tok.id) && (t.actor?.system?.isCreature !== false)
    && footprintsOverlap(footprint, { x: t.x, y: t.y, w: t.width * grid.sizeX, h: t.height * grid.sizeY }));
}

/** A sight-blocking wall between the token's centre and the destination's? */
function sightBlockedTo(tok, dest) {
  const centre = pos => (typeof tok.getCenterPoint === "function") ? tok.getCenterPoint(pos)
    : { x: pos.x + (tok.width * tok.parent.grid.sizeX) / 2, y: pos.y + (tok.height * tok.parent.grid.sizeY) / 2 };
  const from = tok.object?.center ?? centre({ x: tok.x, y: tok.y });
  const to = centre({ x: dest.x, y: dest.y });
  return !!CONFIG.Canvas.polygonBackends.sight.testCollision(from, to, { type: "sight", mode: "any" });
}

/* --- the hooks -------------------------------------------------------------------------------- */

// THE ARM — a listed item used, on the using client (which owns the token and issues the move).
Hooks.on("dnd5e.postUseActivity", (activity) => {
  try {
    const found = rowFor(activity);
    if ( !found ) return;
    const actor = activity.actor;
    if ( !actor?.isOwner ) return;
    const tok = tokenOf(actor);
    if ( !tok?.isOwner ) return;
    void arm(tok, found.key);
  } catch(err) {
    console.error(`${TITLE} | Teleport arm failed — the move is the platform's.`, err);
  }
});

// THE JUDGEMENT — the move that arrives while armed. Foundry's veto seat: `false` refuses.
Hooks.on("preMoveToken", (tok, move) => {
  try {
    const flag = armOf(tok);
    if ( !flag ) return;
    const row = TELEPORTS[flag.name];
    if ( !row ) return;
    const dest = move.destination;
    const verdict = teleportVerdict({ row, sightBlocked: row.sight ? sightBlockedTo(tok, dest) : false,
      occupied: row.unoccupied ? occupiedAt(tok, dest) : false });
    if ( verdict.allowed ) return;
    ui.notifications?.warn(`${flag.name}: ${verdict.reason}.`);
    return false;
  } catch(err) {
    console.error(`${TITLE} | Teleport judgement failed — the move is the platform's.`, err);
  }
});

// THE LANDING — the armed move committed: the action goes back.
Hooks.on("moveToken", (tok) => {
  try {
    if ( armOf(tok) ) void disarm(tok);
  } catch(err) {
    console.error(`${TITLE} | Teleport disarm failed.`, err);
  }
});

Hooks.on("deleteToken", (tok) => { clearClock(tok); });

// A stale arm — a client that closed mid-window — is taken back by its owner at the next canvas.
Hooks.on("canvasReady", (cnv) => {
  try {
    for ( const tok of (cnv?.scene?.tokens ?? []) ) {
      const flag = armOf(tok);
      if ( flag && tok.isOwner && ((Date.now() - (flag.armedAt ?? 0)) > TELEPORT_WINDOW_MS) ) void disarm(tok);
    }
  } catch(err) {
    console.warn(`${TITLE} | Stale teleport sweep failed.`, err);
  }
});
