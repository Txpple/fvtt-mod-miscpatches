// Misc Patches — the teleport patch, driven live on the LOCAL sandbox (never prod).
//
//   node tools/smoke-teleports.mjs
//
// Connects as the suite identity through the house MCP repo's Foundry client (cloned beside this
// one), views the Battle Flow test range, places a mover and a hostile blocker, raises a wall,
// and makes the moves an animation module would make: a bare `document.move()`. Everything it
// creates is deleted in `finally`; the settings it touches are restored.
import { readFileSync } from 'node:fs';
import { Foundry } from 'file:///D:/Workbench/FVTT/Repos/fvtt-mcp-molten5e/dist/foundry.js';

const MCP = 'D:/Workbench/FVTT/Repos/fvtt-mcp-molten5e';
const env = {};
for (const line of readFileSync(`${MCP}/.env`, 'utf8').split(/\r?\n/)) {
  if (line.trimStart().startsWith('#')) continue;
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}
setTimeout(() => { console.error('[teleports] WATCHDOG 300s'); process.exit(3); }, 300_000);
const f = new Foundry({
  serverUrl: env.LOCAL_SERVER_URL || 'http://localhost:30000',
  user: env.BF_SUITE_USER || 'Tester Assistant', password: env.BF_SUITE_PASSWORD ?? '',
  adminKey: env.LOCAL_ADMIN_KEY, worldId: env.LOCAL_WORLD_ID || env.MOLTEN_WORLD_ID
});
console.log('[teleports] connecting to the local sandbox…');
await f.connect();

const out = await f.evaluate(async () => {
  const MOD = 'fvtt-mod-miscpatches';
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (!game.modules.get(MOD)?.active) return { fatal: `${MOD} is not active` };
  if (!game.settings.settings.has(`${MOD}.teleportList`)) return { fatal: 'teleportList not registered — old code, restart the sandbox' };

  const scene = game.scenes.getName('Battle Flow Test Range');
  const mover = game.actors.getName('BF Test Shielder');   // carries Misty Step
  const blocker = game.actors.getName('BF Test Attacker');
  if (!scene || !mover || !blocker) return { fatal: 'missing fixture: Battle Flow Test Range, BF Test Shielder, BF Test Attacker (run Battle Flow\'s tools/fixture-suite.mjs)' };
  const misty = mover.items.getName('Misty Step');
  const activity = misty ? [...misty.system.activities][0] : null;
  if (!activity) return { fatal: 'BF Test Shielder has no Misty Step activity' };
  if (scene.id !== canvas.scene?.id) { await scene.view(); await sleep(1500); }

  const g = canvas.grid.size;
  const row = 5 * g;
  const at = col => ({ x: col * g, y: row });
  const made = { tokens: [], walls: [] };
  const priorList = game.settings.get(MOD, 'teleportList');
  const priorOn = game.settings.get(MOD, 'teleports');
  let tok = null;
  const use = () => activity.use({ consume: false }, { configure: false }, { create: false });
  const armOf = () => tok?.getFlag(MOD, 'teleport') ?? null;
  const plainMove = async col => {
    let completed; let err = null;
    try { completed = await tok.move([at(col)], { animate: false }); } catch (e) { err = String(e?.message ?? e); }
    await sleep(300);
    return { completed, err, col: tok.x / g };
  };
  try {
    const [m] = await scene.createEmbeddedDocuments('Token', [{ ...(await mover.getTokenDocument()).toObject(), ...at(2), actorId: mover.id, disposition: 1 }]);
    const [b] = await scene.createEmbeddedDocuments('Token', [{ ...(await blocker.getTokenDocument()).toObject(), ...at(4), actorId: blocker.id, disposition: -1 }]);
    made.tokens.push(m.id, b.id);
    tok = m;
    await sleep(300);
    const priorAction = tok._source.movementAction ?? null;

    // 1. the arm: a listed use gives the token the displace action and the flag
    await use();
    await sleep(500);
    ok('1. a Misty Step use ARMS the token: movementAction is displace, the flag names the spell and remembers the prior action',
      (tok.movementAction === 'displace') && (armOf()?.name === 'Misty Step') && (armOf()?.previousAction === priorAction),
      `action=${tok.movementAction} flag=${JSON.stringify(armOf())} prior=${priorAction}`);

    // 2. a SIGHT wall between: the move is refused, the token stays, still armed
    const [sightWall] = await scene.createEmbeddedDocuments('Wall', [{ c: [6 * g, row - 2 * g, 6 * g, row + 3 * g], move: 20, sight: 20 }]);
    made.walls.push(sightWall.id);
    await sleep(300);
    const r2 = await plainMove(8);
    ok('2. a sight-blocking wall between refuses the move ("a space you can see"): not completed, the token where it was, still armed',
      (r2.completed === false) && (r2.col === 2) && !!armOf(), JSON.stringify(r2));

    // 3. a MOVE-only wall (a window) and a hostile creature in the way: the move lands past both; the action is restored
    await scene.deleteEmbeddedDocuments('Wall', [sightWall.id]); made.walls.length = 0;
    const [window] = await scene.createEmbeddedDocuments('Wall', [{ c: [6 * g, row - 2 * g, 6 * g, row + 3 * g], move: 20, sight: 0 }]);
    made.walls.push(window.id);
    await sleep(300);
    const r3 = await plainMove(8);
    await sleep(500);
    ok('3. a move-only wall and a hostile creature in the way: the bare move LANDS beyond both, and the action is put back',
      (r3.completed === true) && (r3.col === 8) && !armOf() && ((tok._source.movementAction ?? null) === priorAction),
      `${JSON.stringify(r3)} action=${tok._source.movementAction ?? null} flag=${JSON.stringify(armOf())}`);

    // 4. an OCCUPIED destination: refused; a free one beside it lands
    await tok.update(at(2), { animate: false, movement: { [tok.id]: { constrainOptions: { ignoreWalls: true, ignoreTokens: true } } } });
    await sleep(300);
    await use();
    await sleep(500);
    const r4a = await plainMove(4);
    const r4b = await plainMove(3);
    ok('4. a creature on the destination refuses ("an unoccupied space"); the free square beside it lands',
      (r4a.completed === false) && (r4a.col === 2) && (r4b.completed === true) && (r4b.col === 3) && !armOf(),
      `onto=${JSON.stringify(r4a)} beside=${JSON.stringify(r4b)}`);

    // 5. the list is the switch: an empty list arms nothing
    await game.settings.set(MOD, 'teleportList', '');
    await use();
    await sleep(500);
    ok('5. an empty Teleports list arms nothing — the move is the platform\'s',
      !armOf() && (tok.movementAction !== 'displace'), `action=${tok.movementAction} flag=${JSON.stringify(armOf())}`);
    await game.settings.set(MOD, 'teleportList', priorList);
  } catch (e) {
    return { fatal: `${e?.message ?? e}\n${e?.stack ?? ''}`, results };
  } finally {
    try {
      if (tok && armOf()) await tok.update({ movementAction: armOf().previousAction ?? null, [`flags.${MOD}.-=teleport`]: null });
      if (made.walls.length) await scene.deleteEmbeddedDocuments('Wall', made.walls.filter(id => scene.walls.get(id)));
      if (made.tokens.length) await scene.deleteEmbeddedDocuments('Token', made.tokens.filter(id => scene.tokens.get(id)));
      await game.settings.set(MOD, 'teleportList', priorList);
      await game.settings.set(MOD, 'teleports', priorOn);
    } catch (e) { results.push({ name: 'teardown', pass: false, detail: String(e?.message ?? e) }); }
  }
  return { results };
}, null);

try { await f.dispose?.(); } catch { /* the socket is gone either way */ }
if (out.fatal) { console.error(`[teleports] FATAL: ${out.fatal}`); process.exit(2); }
let failed = 0;
for (const r of out.results) {
  if (!r.pass) failed++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
}
console.log(`[teleports] ${out.results.length - failed}/${out.results.length} passed`);
process.exit(failed ? 1 : 0);
