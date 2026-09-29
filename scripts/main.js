import { renderResourceActorSheet, closeResourceActorSheet } from "./actor-sheet.js";
import { renderResourceItemSheet } from "./item-sheet.js";
import { installQuickAccessIntegration } from "./quick-access-integration.js";
import { migrateExistingHiddenQuantities, registerQuantityNormalizer } from "./quantity-normalizer.js";
import {
  configureItemPilesIntegration,
  configureItemPilesSimilarity,
  getResourceDie,
  getResourceWeightMap,
  getSplitOptions,
  isResourceItem,
  MODULE_ID,
  resetResourceWeightMap,
  rollResourceDie,
  setResourceDie,
  setResourceWeightMap,
  splitResourceItem,
  transferResourceItem
} from "./resource-service.js";

Hooks.once("init", () => {
  registerQuantityNormalizer();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      configureItemPilesIntegration,
      configureItemPilesSimilarity,
      getResourceDie,
      getResourceWeightMap,
      getSplitOptions,
      isResourceItem,
      resetResourceWeightMap,
      rollResourceDie,
      setResourceDie,
      setResourceWeightMap,
      splitResourceItem,
      transferResourceItem
    };
  }
});

Hooks.once("ready", async () => {
  installQuickAccessIntegration();

  // Keep optional integration failures isolated. A broken/missing Item Piles
  // integration must never prevent the independent inventory migration.
  try {
    await configureItemPilesIntegration();
  } catch (error) {
    console.error(`${MODULE_ID} | Item Piles initialization failed`, error);
  }

  try {
    await migrateExistingHiddenQuantities();
  } catch (error) {
    console.error(`${MODULE_ID} | inventory migration failed`, error);
    ui.notifications?.error?.("FBL Resource Dice: inventory migration failed. See console.");
  }
});

// Forbidden Lands 13.0.5 uses V1 document sheets. V2 hooks are a guarded
// migration fallback; all render functions are idempotent for the same DOM.
Hooks.on("renderActorSheet", renderResourceActorSheet);
Hooks.on("renderItemSheet", renderResourceItemSheet);
Hooks.on("renderApplicationV2", (app, html) => {
  const doc = app?.document;
  if (doc?.documentName === "Actor") renderResourceActorSheet(app, html);
  if (doc?.documentName === "Item") renderResourceItemSheet(app, html);
});
Hooks.on("closeActorSheet", closeResourceActorSheet);
Hooks.on("closeApplicationV2", (app) => {
  if (app?.document?.documentName === "Actor") closeResourceActorSheet(app);
});
