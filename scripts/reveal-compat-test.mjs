import assert from "node:assert/strict";
import { hasUnsupportedAwaitedReveal } from "./check-reveal-compat.mjs";

const check = (source, minimum) => hasUnsupportedAwaitedReveal(`async function scenario() { ${source} }`, minimum);

for (const source of [
  'await workspace.revealLeaf(leaf);',
  'await (workspace.revealLeaf(leaf));',
  'await (workspace.revealLeaf)(leaf);',
  'await this.app.workspace.revealLeaf(leaf);',
  'await alias["revealLeaf"](leaf);',
  'if (requireApiVersion("1.6.6")) { await workspace.revealLeaf(leaf); }',
  'if (requireApiVersion("1.7.2")) {} else { await workspace.revealLeaf(leaf); }',
  'if (requireApiVersion("1.7.2")) {} await workspace.revealLeaf(leaf);',
]) assert.equal(check(source, "1.5.0"), true, source);
for (const source of [
  'workspace.revealLeaf(leaf);',
  'if (requireApiVersion("1.7.2")) { await workspace.revealLeaf(leaf); }',
  'if (requireApiVersion("1.8.0")) { if (ready) { await workspace.revealLeaf(leaf); } }',
]) assert.equal(check(source, "1.5.0"), false, source);
assert.equal(check('await workspace.revealLeaf(leaf);', "1.7.2"), false);
console.log("Awaited reveal API checks distinguish guarded, unguarded and legacy calls.");
