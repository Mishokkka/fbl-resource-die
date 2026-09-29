import {
  MODULE_ID,
  normalizeItemQuantity,
  UNSTACKED_ITEM_TYPES,
  isItemPileActor
} from "./resource-service.js";

const MIGRATION_SETTING = "inventoryMigrationVersion";
const MIGRATION_VERSION = 1;

export function registerQuantityNormalizer() {
  game.settings.register(MODULE_ID, MIGRATION_SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  Hooks.on("createItem", (item, options, userId) => {
    if (userId && userId !== game.user?.id) return;
    if (options?.[MODULE_ID]?.skipQuantityNormalization || options?.[MODULE_ID]?.normalizing) return;
    void normalizeItemQuantity(item).catch(logNormalizationError);
  });

  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId && userId !== game.user?.id) return;
    if (options?.[MODULE_ID]?.normalizing || options?.[MODULE_ID]?.skipQuantityNormalization) return;
    if (!hasQuantityChange(changes)) return;
    void normalizeItemQuantity(item).catch(logNormalizationError);
  });
}

export async function migrateExistingHiddenQuantities() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users?.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return false;
  if (Number(game.settings.get(MODULE_ID, MIGRATION_SETTING) ?? 0) >= MIGRATION_VERSION) return false;

  for (const actor of game.actors?.contents ?? []) {
    if (actor.type !== "character" || isItemPileActor(actor)) continue;
    await migrateActorQuantities(actor);
  }

  await game.settings.set(MODULE_ID, MIGRATION_SETTING, MIGRATION_VERSION);
  return true;
}

async function migrateActorQuantities(actor) {
  const updates = [];
  const rollbackUpdates = [];
  const copies = [];

  for (const item of actor.items ?? []) {
    if (!UNSTACKED_ITEM_TYPES.has(item.type)) continue;

    const quantity = Number(item.system?.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 1) continue;

    updates.push({ _id: item.id, "system.quantity": 1 });
    rollbackUpdates.push({ _id: item.id, "system.quantity": quantity });

    const source = item.toObject();
    delete source._id;
    source.system ??= {};
    source.system.quantity = 1;
    for (let index = 1; index < quantity; index += 1) {
      copies.push(foundry.utils.deepClone(source));
    }
  }

  if (!updates.length) return false;

  // This runs once during ready, before users normally open sheets. Batch all
  // changes for an Actor and suppress rendering entirely instead of causing one
  // Actor render per legacy stack.
  await actor.updateEmbeddedDocuments("Item", updates, {
    render: false,
    [MODULE_ID]: { normalizing: true, migration: true }
  });

  try {
    if (copies.length) {
      await actor.createEmbeddedDocuments("Item", copies, {
        render: false,
        [MODULE_ID]: { normalizing: true, migration: true, skipQuantityNormalization: true }
      });
    }
    return true;
  } catch (error) {
    try {
      await actor.updateEmbeddedDocuments("Item", rollbackUpdates, {
        render: false,
        [MODULE_ID]: { normalizing: true, migrationRollback: true }
      });
    } catch (rollbackError) {
      console.error(`${MODULE_ID} | inventory migration rollback failed for ${actor.name}`, rollbackError);
    }
    throw error;
  }
}

function hasQuantityChange(changes) {
  if (!changes || typeof changes !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(changes, "system.quantity")) return true;
  return Object.prototype.hasOwnProperty.call(changes.system ?? {}, "quantity");
}

function logNormalizationError(error) {
  console.error(`${MODULE_ID} | inventory quantity normalization failed`, error);
}
