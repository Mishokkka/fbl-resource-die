import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RESOURCE_WEIGHTS,
  getResourceSplitOptions,
  nextResourceDie,
  normalizeResourceDie,
  shouldDepleteResource
} from "../scripts/resource-logic.js";

test("standard resource depletion ladder ends at d6", () => {
  assert.equal(nextResourceDie(12), 10);
  assert.equal(nextResourceDie(10), 8);
  assert.equal(nextResourceDie(8), 6);
  assert.equal(nextResourceDie(6), null);
});

test("d4 is valid but special and depletes directly", () => {
  assert.equal(normalizeResourceDie(4), 4);
  assert.equal(nextResourceDie(4), null);
  assert.deepEqual(getResourceSplitOptions(4), []);
});

test("resource split table matches campaign rule", () => {
  assert.deepEqual(getResourceSplitOptions(12), [
    { keep: 10, split: 6 },
    { keep: 8, split: 8 }
  ]);
  assert.deepEqual(getResourceSplitOptions(10), [{ keep: 8, split: 6 }]);
  assert.deepEqual(getResourceSplitOptions(8), [{ keep: 6, split: 6 }]);
  assert.deepEqual(getResourceSplitOptions(6), []);
});

test("only 1-2 deplete the resource", () => {
  assert.equal(shouldDepleteResource(1), true);
  assert.equal(shouldDepleteResource(2), true);
  assert.equal(shouldDepleteResource(3), false);
  assert.equal(shouldDepleteResource(12), false);
});

test("invalid dice are rejected", () => {
  assert.equal(normalizeResourceDie(20), null);
  assert.equal(normalizeResourceDie(0), null);
  assert.equal(normalizeResourceDie("d8"), null);
});

test("default resource weights match the campaign resource scale", () => {
  assert.deepEqual(DEFAULT_RESOURCE_WEIGHTS, {
    4: "tiny",
    6: "tiny",
    8: "light",
    10: "light",
    12: "regular"
  });
});
