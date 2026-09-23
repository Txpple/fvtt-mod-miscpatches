// Misc Patches — the shim-chain patch, measured live on the LOCAL sandbox (never prod).
//
//   node tools/smoke-shim-chains.mjs
//
// Nothing is written: every actor here is built IN MEMORY (`new Actor.implementation(data)`),
// prepared, read and dropped. It carries a hand-made feature whose effect uses the twice-moved
// key `system.attributes.movement.speed` — the PHB Roving's shape — and, when the premium pack is
// installed, the pack's own Roving too. The patch must have pointed the key at the end of its
// chain at `setup`; the speed must come out as the rule says, not as 30 and "10" glued together.
import { connectFoundry } from 'fvtt-mcp-dnd5e/client';

console.log('[shim-chains] connecting to the local sandbox…');
const { f, dispose } = await connectFoundry({ host: 'local', identity: 'suite', tag: 'shim-chains', watchdogMs: 300_000 });

const out = await f.evaluate(async () => {
  const MOD = 'fvtt-mod-miscpatches';
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  if (!game.modules.get(MOD)?.active) return { fatal: `${MOD} is not active` };
  if (!game.settings.settings.has(`${MOD}.shimChains`)) return { fatal: 'shimChains not registered — old code, restart the sandbox' };
  const table = CONFIG.ActiveEffect.documentClass.SHIM_FIELDS ?? {};
  const speedKey = 'system.attributes.movement.speed';

  // 1. the table: the twice-moved key points at the END of its chain, the one-step keys are untouched
  ok('1. movement.speed points at the end of its chain (speeds.walk)',
    table[speedKey]?.key === 'system.attributes.movement.speeds.walk', `key=${table[speedKey]?.key}`);
  ok('1b. a one-step key is untouched (movement.walk → speeds.walk)',
    table['system.attributes.movement.walk']?.key === 'system.attributes.movement.speeds.walk',
    `key=${table['system.attributes.movement.walk']?.key}`);

  // 2. an in-memory ranger with the old-key feature: 30 + 10, climb and swim equal to it
  const feature = {
    name: 'Old-Key Roving', type: 'feat', system: {},
    effects: [{
      name: 'Old-Key Roving', type: 'base', transfer: true, disabled: false,
      system: { changes: [
        { key: speedKey, type: 'add', value: 10, phase: 'initial' },
        { key: 'system.attributes.movement.climb', type: 'override', value: '@attributes.movement.speed', phase: 'initial' },
        { key: 'system.attributes.movement.swim', type: 'override', value: '@attributes.movement.speed', phase: 'initial' }
      ] }
    }]
  };
  const speeds = a => ({ walk: a.system.attributes.movement.speeds?.walk ?? a.system.attributes.movement.walk,
    climb: a.system.attributes.movement.speeds?.climb, swim: a.system.attributes.movement.speeds?.swim });
  const base = { name: 'Shim Probe', type: 'character', system: { attributes: { movement: { walk: 30 } } } };
  const plain = speeds(new Actor.implementation(foundry.utils.deepClone(base)));
  const probed = speeds(new Actor.implementation({ ...foundry.utils.deepClone(base), items: [feature] }));
  ok('2. an old-key +10 lands as a NUMBER on the walking speed', (probed.walk === plain.walk + 10) && (typeof probed.walk === 'number'),
    `plain=${JSON.stringify(plain)} probed=${JSON.stringify(probed)}`);
  ok('2b. and climb and swim equal the new speed (@attributes.movement.speed)', (probed.climb === probed.walk) && (probed.swim === probed.walk),
    JSON.stringify(probed));

  // 3. the pack's own Roving, when the premium PHB is installed on this world
  const roving = await fromUuid('Compendium.dnd-players-handbook.classes.Item.phbrgrRoving0000').catch(() => null);
  if (roving) {
    const withPack = speeds(new Actor.implementation({ ...foundry.utils.deepClone(base), items: [roving.toObject()] }));
    ok("3. the PHB's own Roving: 30 becomes 40, climb and swim 40", (withPack.walk === 40) && (withPack.climb === 40) && (withPack.swim === 40),
      JSON.stringify(withPack));
  } else {
    ok('3. the PHB pack is not installed here — skipped', true);
  }

  // 4. the same class, a MULTIPLY: Spirit Guardians' Half Speed writes movement.speed x0.5 (Battle
  // Flow's backlog since 2026-09-16: "the number never halves") — the effect as the pack ships it.
  const guardians = await fromUuid('Compendium.dnd-players-handbook.spells.Item.phbsplSpiritGuar').catch(() => null)
    ?? (await game.packs.get('dnd-players-handbook.spells')?.getDocuments({ name: 'Spirit Guardians' }).catch(() => []))?.[0] ?? null;
  const half = guardians?.effects?.find(e => /half speed/i.test(e.name)) ?? null;
  if (half) {
    const slowed = speeds(new Actor.implementation({ ...foundry.utils.deepClone(base),
      effects: [{ ...half.toObject(), transfer: false, disabled: false, origin: null }] }));
    ok("4. Spirit Guardians' Half Speed halves the walking speed (30 → 15)", slowed.walk === 15,
      `changes=${JSON.stringify(half.toObject().system?.changes ?? half.toObject().changes)} got=${JSON.stringify(slowed)}`);
  } else {
    ok('4. no Spirit Guardians Half Speed in the installed packs — skipped', true);
  }
  return { results };
}, null);

await dispose();
if (out.fatal) { console.error(`[shim-chains] FATAL: ${out.fatal}`); process.exit(2); }
let failed = 0;
for (const r of out.results) {
  if (!r.pass) failed++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`[shim-chains] ${out.results.length - failed}/${out.results.length} passed`);
process.exit(failed ? 1 : 0);
