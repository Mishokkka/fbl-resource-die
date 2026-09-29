import {
  DEFAULT_RESOURCE_WEIGHTS,
  getResourceSplitOptions,
  nextResourceDie,
  normalizeResourceDie,
  shouldDepleteResource
} from "./resource-logic.js";

export const MODULE_ID = "fbl-resource-dice";
export const RESOURCE_FLAG = "die";
export const RESOURCE_WEIGHT_FLAG = "weightByDie";
export const RESOURCE_ITEM_TYPES = new Set(["gear"]);
export const UNSTACKED_ITEM_TYPES = new Set(["gear", "weapon", "armor"]);

const normalizationInFlight = new Set();
const resourceOperationsInFlight = new Set();

export function localize(key, fallback, data = {}) {
  const fullKey = `${MODULE_ID}.${key}`;
  const localized = game.i18n?.localize?.(fullKey);
  let text = localized && localized !== fullKey ? localized : fallback;
  for (const [name, value] of Object.entries(data)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function getResourceDie(item) {
  return normalizeResourceDie(item?.getFlag?.(MODULE_ID, RESOURCE_FLAG));
}

export function isResourceItem(item) {
  return RESOURCE_ITEM_TYPES.has(item?.type) && getResourceDie(item) != null;
}

export function canUseResourceItem(item) {
  return Boolean(
    isResourceItem(item)
    && item?.parent?.documentName === "Actor"
    && (item.isOwner ?? item.parent?.isOwner ?? false)
  );
}

export function getResourceWeightMap(item) {
  const stored = item?.getFlag?.(MODULE_ID, RESOURCE_WEIGHT_FLAG);
  return normalizeResourceWeightMap(stored);
}

export async function setResourceWeightMap(item, weightMap) {
  if (!RESOURCE_ITEM_TYPES.has(item?.type)) return false;

  const normalized = normalizeResourceWeightMap(weightMap);
  const current = getResourceWeightMap(item);
  const update = {};

  if (!resourceWeightMapsEqual(current, normalized)) {
    update[`flags.${MODULE_ID}.${RESOURCE_WEIGHT_FLAG}`] = normalized;
  }

  const die = getResourceDie(item);
  const mappedWeight = getMappedWeight(normalized, die);
  if (mappedWeight !== undefined && !weightValuesEqual(item.system?.weight, mappedWeight)) {
    update["system.weight"] = mappedWeight;
  }

  if (!Object.keys(update).length) return true;
  await item.update(update);
  return true;
}

export async function resetResourceWeightMap(item) {
  return setResourceWeightMap(item, DEFAULT_RESOURCE_WEIGHTS);
}

export async function setResourceDie(item, die) {
  if (!RESOURCE_ITEM_TYPES.has(item?.type)) return false;

  const normalized = normalizeResourceDie(die);
  if (normalized == null) {
    const raw = item?.getFlag?.(MODULE_ID, RESOURCE_FLAG);
    if (raw === undefined || raw === null) return true;
    await item.unsetFlag(MODULE_ID, RESOURCE_FLAG);
    return true;
  }

  const update = buildResourceDieUpdate(item, normalized);
  if (!Object.keys(update).length) return true;
  await item.update(update);
  return true;
}

export async function rollResourceDie(item) {
  if (!canUseResourceItem(item)) {
    ui.notifications?.warn?.(localize(
      "Notifications.ActorOnly",
      "Resource dice can only be used from an item in an Actor inventory."
    ));
    return null;
  }

  return withExclusiveResourceOperation(item, async () => {
    const die = getResourceDie(item);
    if (die == null) return null;

    const roll = await new Roll(`1d${die}`).evaluate();
    const total = Number(roll.total);
    const depletes = shouldDepleteResource(total);
    const next = depletes ? nextResourceDie(die) : die;
    const actor = item.parent;
    const itemName = item.name;

    let status;
    if (!depletes) {
      status = localize("Chat.Unchanged", "Resource remains d{die}.", { die });
    } else if (next == null) {
      status = localize("Chat.Depleted", "Resource depleted.");
    } else {
      status = localize("Chat.SteppedDown", "Resource: d{from} → d{to}.", { from: die, to: next });
    }

    // Apply the mechanical result before creating presentation. A chat failure
    // must not leave the resource state inconsistent with the already-evaluated
    // roll.
    if (depletes) {
      if (next == null) await item.delete();
      else await setResourceDie(item, next);
    }

    try {
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: buildRollFlavor(itemName, die, status)
      });
    } catch (error) {
      console.error(`${MODULE_ID} | resource chat message failed`, error);
      ui.notifications?.warn?.(localize("Notifications.ChatFailed", "Resource was updated, but the chat message could not be created."));
    }

    return {
      roll,
      from: die,
      to: depletes ? next : die,
      depleted: depletes && next == null
    };
  });
}

export async function splitResourceItem(item, splitOption) {
  return withExclusiveResourceOperation(item, () => splitResourceItemUnlocked(item, splitOption));
}

async function splitResourceItemUnlocked(item, splitOption, { renderCreated = true } = {}) {
  const die = getResourceDie(item);
  const actor = item?.parent;
  if (!actor || actor.documentName !== "Actor" || !(item.isOwner ?? actor.isOwner ?? false)) {
    ui.notifications?.warn?.(localize("Notifications.CannotModify", "You cannot modify this item."));
    return null;
  }

  const options = getResourceSplitOptions(die);
  const chosen = options.find((option) => (
    option.keep === Number(splitOption?.keep)
    && option.split === Number(splitOption?.split)
  ));
  if (!chosen) return null;

  const source = item.toObject();
  delete source._id;
  source.system ??= {};
  source.system.quantity = 1;
  source.flags ??= {};
  source.flags[MODULE_ID] = {
    ...(source.flags[MODULE_ID] ?? {}),
    [RESOURCE_FLAG]: chosen.split
  };

  const weightMap = getResourceWeightMap(item);
  const splitWeight = getMappedWeight(weightMap, chosen.split);
  if (splitWeight !== undefined) source.system.weight = splitWeight;

  const oldDie = die;
  const oldWeight = item.system?.weight;
  const keepUpdate = buildResourceDieUpdate(item, chosen.keep);

  // The create below will render the Actor. Suppress the preceding Item update
  // render so a split produces one sheet render instead of two.
  await item.update(keepUpdate, {
    render: false,
    [MODULE_ID]: { resourceOperation: "split" }
  });

  try {
    const created = await actor.createEmbeddedDocuments("Item", [source], {
      render: renderCreated,
      [MODULE_ID]: { resourceOperation: "split", skipQuantityNormalization: true }
    });
    return created?.[0] ?? null;
  } catch (error) {
    try {
      const rollback = { [`flags.${MODULE_ID}.${RESOURCE_FLAG}`]: oldDie };
      if (oldWeight !== undefined) rollback["system.weight"] = oldWeight;
      await item.update(rollback, { [MODULE_ID]: { resourceOperation: "splitRollback" } });
    } catch (rollbackError) {
      console.error(`${MODULE_ID} | split rollback failed`, rollbackError);
    }
    throw error;
  }
}

export async function transferResourceItem(item, splitOption = null) {
  return withExclusiveResourceOperation(item, async () => {
    const api = getItemPilesApi();
    if (!api || typeof api.giveItem !== "function") {
      ui.notifications?.warn?.(localize("Notifications.ItemPilesMissing", "Item Piles give-item API is unavailable."));
      return false;
    }

    if (!splitOption) {
      await api.giveItem(item);
      return true;
    }

    const actor = item.parent;
    const oldDie = getResourceDie(item);
    const oldWeight = item.system?.weight;
    // The temporary split-off Item does not need to render the sheet before
    // Item Piles opens its transfer dialog. Success or rollback will provide
    // the single visible render for the operation.
    const created = await splitResourceItemUnlocked(item, splitOption, { renderCreated: false });
    if (!created) return false;

    try {
      await api.giveItem(created);
    } catch (error) {
      await rollbackTransferSplit(actor, item, created.id, oldDie, oldWeight);
      throw error;
    }

    // giveItem waits for its dialog. If the split-off item still exists on the
    // source actor afterwards, the transfer was cancelled or did not complete.
    if (actor.items?.get?.(created.id)) {
      await rollbackTransferSplit(actor, item, created.id, oldDie, oldWeight);
      return false;
    }

    return true;
  });
}

async function rollbackTransferSplit(actor, originalItem, splitItemId, oldDie, oldWeight) {
  const splitItem = actor?.items?.get?.(splitItemId);
  if (splitItem) {
    await splitItem.delete({
      render: false,
      [MODULE_ID]: { resourceOperation: "transferRollback" }
    });
  }

  const liveOriginal = actor?.items?.get?.(originalItem.id);
  if (!liveOriginal) return;

  const update = { [`flags.${MODULE_ID}.${RESOURCE_FLAG}`]: oldDie };
  if (oldWeight !== undefined) update["system.weight"] = oldWeight;
  await liveOriginal.update(update, { [MODULE_ID]: { resourceOperation: "transferRollback" } });
}

export function getSplitOptions(item) {
  return getResourceSplitOptions(getResourceDie(item));
}

export async function normalizeItemQuantity(item, { force = false } = {}) {
  if (!item?.parent || item.parent.documentName !== "Actor") return false;
  if (!UNSTACKED_ITEM_TYPES.has(item.type)) return false;

  // Quantity 1 is overwhelmingly the common case. Bail out before consulting
  // Item Piles or permissions so normal Item creation stays effectively free.
  const quantity = Number(item.system?.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity <= 1) return false;
  if (!force && !(item.isOwner ?? item.parent.isOwner ?? false)) return false;
  if (isItemPileActor(item.parent)) return false;

  const key = item.uuid ?? `${item.parent.id}.${item.id}`;
  if (normalizationInFlight.has(key)) return false;
  normalizationInFlight.add(key);

  try {
    const actor = item.parent;
    const source = item.toObject();
    delete source._id;
    source.system ??= {};
    source.system.quantity = 1;

    // The following create renders the actor, so suppress the intermediate
    // quantity-reset render. This fallback normally runs only when an external
    // module bypasses Item Piles' unstackable configuration.
    await item.update({ "system.quantity": 1 }, {
      render: false,
      [MODULE_ID]: { normalizing: true }
    });

    try {
      const copies = Array.from({ length: quantity - 1 }, () => foundry.utils.deepClone(source));
      if (copies.length) {
        await actor.createEmbeddedDocuments("Item", copies, {
          [MODULE_ID]: { normalizing: true, skipQuantityNormalization: true }
        });
      }
      return true;
    } catch (error) {
      // Do not silently lose a stack if document creation fails after the
      // original quantity was reset.
      await item.update({ "system.quantity": quantity }, {
        [MODULE_ID]: { normalizing: true, rollback: true }
      });
      throw error;
    }
  } finally {
    normalizationInFlight.delete(key);
  }
}

export function isItemPileActor(actor) {
  if (!actor) return false;

  const flags = actor.flags?.["item-piles"];
  if (flags?.data?.enabled || flags?.enabled || flags?.pile?.enabled) return true;

  try {
    const api = getItemPilesApi();
    return Boolean(api && typeof api.isValidItemPile === "function" && api.isValidItemPile(actor));
  } catch (error) {
    console.debug(`${MODULE_ID} | Item Piles pile detection failed`, error);
    return false;
  }
}

export async function configureItemPilesIntegration() {
  // Item Piles stores these integration values as world settings. Only a GM
  // should attempt to write them; players consume the configured settings.
  if (!game.user?.isGM) return false;

  const api = getItemPilesApi();
  if (!api) return false;

  let changed = false;

  if (typeof api.setUnstackableItemTypes === "function") {
    const existing = Array.isArray(api.UNSTACKABLE_ITEM_TYPES) ? [...api.UNSTACKABLE_ITEM_TYPES] : [];
    const next = [...new Set([...existing, ...UNSTACKED_ITEM_TYPES])];
    if (next.length !== existing.length || next.some((value, index) => value !== existing[index])) {
      await api.setUnstackableItemTypes(next);
      changed = true;
    }
  }

  if (typeof api.setItemSimilarities === "function") {
    const resourcePath = `flags.${MODULE_ID}.${RESOURCE_FLAG}`;
    const existing = Array.isArray(api.ITEM_SIMILARITIES) ? [...api.ITEM_SIMILARITIES] : [];
    if (!existing.includes(resourcePath)) {
      await api.setItemSimilarities([...existing, resourcePath]);
      changed = true;
    }
  }

  return changed;
}

// Backward-compatible public API name from 0.1.0.
export const configureItemPilesSimilarity = configureItemPilesIntegration;

export function getItemPilesApi() {
  const module = game.modules?.get?.("item-piles");
  if (module && module.active === false) return null;
  return game.itempiles?.API
    ?? game.itempiles?.api
    ?? module?.api
    ?? null;
}

function buildResourceDieUpdate(item, die) {
  const normalized = normalizeResourceDie(die);
  if (normalized == null) return {};

  const update = {};
  if (getResourceDie(item) !== normalized) {
    update[`flags.${MODULE_ID}.${RESOURCE_FLAG}`] = normalized;
  }

  const mappedWeight = getMappedWeight(getResourceWeightMap(item), normalized);
  if (mappedWeight !== undefined && !weightValuesEqual(item.system?.weight, mappedWeight)) {
    update["system.weight"] = mappedWeight;
  }
  return update;
}

function normalizeResourceWeightMap(value) {
  const stored = value && typeof value === "object" ? value : {};
  const normalized = {};
  for (const die of [4, 6, 8, 10, 12]) {
    const raw = Object.prototype.hasOwnProperty.call(stored, die)
      ? stored[die]
      : Object.prototype.hasOwnProperty.call(stored, String(die))
        ? stored[String(die)]
        : DEFAULT_RESOURCE_WEIGHTS[die];
    normalized[die] = normalizeWeightValue(raw);
  }
  return normalized;
}

function normalizeWeightValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && /^[-+]?\d+(?:\.\d+)?$/.test(text) ? numeric : text;
}

function getMappedWeight(weightMap, die) {
  const normalizedDie = normalizeResourceDie(die);
  if (normalizedDie == null) return undefined;
  const value = weightMap?.[normalizedDie] ?? weightMap?.[String(normalizedDie)];
  return value === null || value === undefined || value === "" ? undefined : value;
}

function resourceWeightMapsEqual(left, right) {
  return [4, 6, 8, 10, 12].every((die) => weightValuesEqual(left?.[die], right?.[die]));
}

function weightValuesEqual(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return left == null && right == null;
  return String(left) === String(right);
}

async function withExclusiveResourceOperation(item, operation) {
  const key = item?.uuid ?? (item?.parent?.id && item?.id ? `${item.parent.id}.${item.id}` : null);
  if (!key) return operation();
  if (resourceOperationsInFlight.has(key)) return null;

  resourceOperationsInFlight.add(key);
  try {
    return await operation();
  } finally {
    resourceOperationsInFlight.delete(key);
  }
}

function buildRollFlavor(itemName, die, status) {
  return `<div class="fblr-chat-resource"><strong>${escapeHtml(itemName)}</strong><br>${localize(
    "Chat.Rolling",
    "Resource roll: d{die}",
    { die }
  )}<br>${escapeHtml(status)}</div>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
