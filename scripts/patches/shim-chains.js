/**
 * SHIM CHAINS — an effect written against an old dnd5e key reaches the field it was moved to,
 * however many times it moved.
 *
 * THE PROBLEM (Session 8, 2026-09-22 — Jetten's Roving never raised his speed): dnd5e 6.0 keeps
 * a table of moved effect keys, `ActiveEffect5e.SHIM_FIELDS`, and `_applyChangeShim` rewrites a
 * change's key through it ONCE. Some keys moved twice and the table records each move on its
 * own: `system.attributes.movement.speed` → `system.attributes.movement.walk`, and
 * `…movement.walk` → `…movement.speeds.walk`. One hop leaves the change on `movement.walk`,
 * which is no longer a number field — measured on 6.0.3 against the PHB's own Roving (a
 * premium pack not yet written for 6.0: `movement.speed` +10, climb and swim `=
 * @attributes.movement.speed`) on a 35-foot ranger: a walking speed of **3510** (the +10 glued
 * on as text) and climb and swim to match. The same item with the chain followed: 45, 45, 45 —
 * the rule exactly.
 *
 * THE FIX: at `setup`, before any actor prepares, every shim whose target is itself shimmed is
 * pointed at the END of its chain. Nothing else about the entry changes (its `type`, `value`
 * and deprecation `warning` stay the first hop's), a single-hop entry is untouched, and a cycle
 * stops where it closes. The pack's data is never edited — every copy of every item with an
 * old key is fixed at once, including the next ranger's Roving.
 */
import { MODULE_ID, TITLE } from "../core.js";

const SETTING_ON = "shimChains";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_ON, {
    name: "Old effect keys reach their new fields",
    hint: "dnd5e 6.0 redirects an effect written against an old key (a premium pack not yet updated for 6.0) to the key's new home — but only one step, and some keys moved twice. Roving's +10 feet landed on a field that is no longer a number and made a 35-foot speed read 3510. On, every redirect is followed to its end, so those effects work as written. Takes effect on reload.",
    scope: "world", config: true, type: Boolean, default: true, requiresReload: true
  });
});

/**
 * Point every shim at the end of its chain — pure over the table, returns the rewrites made.
 * @param {Record<string, {key: string}>} table   the system's SHIM_FIELDS (mutated in place)
 * @returns {{from: string, via: string, to: string}[]}
 */
export function resolveShimChains(table) {
  const made = [];
  for ( const [from, shim] of Object.entries(table ?? {}) ) {
    if ( !shim?.key || !table[shim.key] ) continue;
    const seen = new Set([from]);
    let to = shim.key;
    let cycle = false;
    while ( table[to]?.key ) {
      if ( seen.has(to) ) { cycle = true; break; }
      seen.add(to);
      to = table[to].key;
    }
    // A chain that closes on itself has no end to point at: the entry keeps its one step.
    if ( cycle || seen.has(to) || (to === shim.key) ) continue;
    made.push({ from, via: shim.key, to });
  }
  // Written after the walk, so no entry is read half-rewritten.
  for ( const { from, to } of made ) table[from] = { ...table[from], key: to };
  return made;
}

Hooks.once("setup", () => {
  try {
    if ( game.system?.id !== "dnd5e" ) return;
    if ( !game.settings.get(MODULE_ID, SETTING_ON) ) return;
    const table = CONFIG.ActiveEffect?.documentClass?.SHIM_FIELDS;
    if ( !table ) return;
    const made = resolveShimChains(table);
    if ( made.length ) console.log(`${TITLE} | ${made.length} moved effect key(s) now reach their end: `
      + made.map(m => `${m.from} → ${m.to}`).join("; "));
  } catch(err) {
    console.error(`${TITLE} | The shim chains could not be resolved — old effect keys take one step only.`, err);
  }
});
