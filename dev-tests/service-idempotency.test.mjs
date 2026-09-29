import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULE_ID,
  RESOURCE_FLAG,
  RESOURCE_WEIGHT_FLAG,
  setResourceDie,
  setResourceWeightMap
} from "../scripts/resource-service.js";

function fakeGear({ die = 8, weight = "light", weightMap } = {}) {
  const flags = {
    [RESOURCE_FLAG]: die,
    [RESOURCE_WEIGHT_FLAG]: weightMap
  };
  const updates = [];

  return {
    type: "gear",
    system: { weight },
    updates,
    getFlag(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      return flags[key];
    },
    async update(update) {
      updates.push(update);
      if (Object.hasOwn(update, `flags.${MODULE_ID}.${RESOURCE_FLAG}`)) {
        flags[RESOURCE_FLAG] = update[`flags.${MODULE_ID}.${RESOURCE_FLAG}`];
      }
      if (Object.hasOwn(update, `flags.${MODULE_ID}.${RESOURCE_WEIGHT_FLAG}`)) {
        flags[RESOURCE_WEIGHT_FLAG] = update[`flags.${MODULE_ID}.${RESOURCE_WEIGHT_FLAG}`];
      }
      if (Object.hasOwn(update, "system.weight")) this.system.weight = update["system.weight"];
    },
    async unsetFlag(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      delete flags[key];
    }
  };
}

test("setting the current die with the current mapped weight performs no document update", async () => {
  const item = fakeGear({ die: 8, weight: "light" });
  await setResourceDie(item, 8);
  assert.equal(item.updates.length, 0);
});

test("changing a die combines flag and weight into one update", async () => {
  const item = fakeGear({ die: 12, weight: "regular" });
  await setResourceDie(item, 6);
  assert.equal(item.updates.length, 1);
  assert.deepEqual(item.updates[0], {
    [`flags.${MODULE_ID}.${RESOURCE_FLAG}`]: 6,
    "system.weight": "tiny"
  });
});

test("saving an effective default weight map is a no-op when nothing changes", async () => {
  const item = fakeGear({ die: 8, weight: "light", weightMap: undefined });
  await setResourceWeightMap(item, {
    4: "tiny",
    6: "tiny",
    8: "light",
    10: "light",
    12: "regular"
  });
  assert.equal(item.updates.length, 0);
});
