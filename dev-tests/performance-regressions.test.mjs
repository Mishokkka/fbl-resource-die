import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("actor sheet observer decorates only added subtrees and uses one delegated click listener", () => {
  const source = read("scripts/actor-sheet.js");
  assert.match(source, /mutation\.addedNodes/);
  assert.match(source, /decorateAddedSubtree/);
  assert.doesNotMatch(source, /queued\s*=\s*true/);
  assert.match(source, /root\.addEventListener\("click", state\.onClick, true\)/);
  assert.doesNotMatch(source, /button\.addEventListener\("click"/);
  assert.match(source, /state\.observer\?\.takeRecords\(\)/);
});

test("split and quantity normalization suppress intermediate renders", () => {
  const service = read("scripts/resource-service.js");
  assert.match(service, /item\.update\(keepUpdate, \{[\s\S]*?render: false/);
  assert.match(service, /item\.update\(\{ "system\.quantity": 1 \}, \{[\s\S]*?render: false/);
  assert.match(service, /splitItem\.delete\(\{[\s\S]*?render: false/);
});

test("migration is batched per actor instead of normalizing items one by one", () => {
  const source = read("scripts/quantity-normalizer.js");
  assert.match(source, /actor\.updateEmbeddedDocuments\("Item", updates/);
  assert.match(source, /actor\.createEmbeddedDocuments\("Item", copies/);
  assert.doesNotMatch(source, /await normalizeItemQuantity\(item, \{ force: true \}\)/);
});

test("quick access integration uses microtask scheduling and direct app lookup", () => {
  const source = read("scripts/quick-access-integration.js");
  assert.match(source, /queueMicrotask\(\(\) => patchOpenQuickAccessMenu/);
  assert.doesNotMatch(source, /setTimeout\(patchOpenQuickAccessMenu/);
  assert.match(source, /\.app\[data-appid\]/);
});

test("resource mutations are idempotent and high-level operations are serialized", () => {
  const source = read("scripts/resource-service.js");
  assert.match(source, /if \(!Object\.keys\(update\)\.length\) return true/);
  assert.match(source, /resourceOperationsInFlight/);
  assert.match(source, /withExclusiveResourceOperation/);
});

test("resource badges do not impersonate Quick Access item rows", () => {
  const source = read("scripts/actor-sheet.js");
  assert.match(source, /data-fblr-resource-item-id/);
  assert.match(source, /dataset\.fblrResourceItemId/);
  assert.doesNotMatch(source, /\.fblr-resource-badge\[data-item-id\]/);
  assert.doesNotMatch(source, /button\.dataset\.itemId\s*=/);
});
