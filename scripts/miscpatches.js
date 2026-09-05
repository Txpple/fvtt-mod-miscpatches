/**
 * Misc Patches — small, independent fixes for things other modules and the platform get
 * slightly wrong at the table. One file per patch under scripts/patches/, each behind its own
 * world setting, each registering its own hooks. This is the only esmodules entry; the names
 * the patches share are in core.js.
 *
 * Why a module of patches: none of these is a rule of the game a resolver should own (they
 * were pulled out of Battle Flow for exactly that reason), and none is big enough to be a
 * module of its own. They share nothing but the settings menu.
 */
import "./core.js";
import "./patches/teleports.js";
