import { chooseSplitOption } from "./dialogs.js";
import {
  getResourceDie,
  getSplitOptions,
  isResourceItem,
  localize,
  rollResourceDie,
  splitResourceItem,
  transferResourceItem
} from "./resource-service.js";

let installed = false;

export function installQuickAccessIntegration() {
  if (installed || !game.modules?.get?.("fbl-quick-access")?.active) return false;
  installed = true;
  document.addEventListener("contextmenu", captureQuickAccessContext, true);
  return true;
}

function captureQuickAccessContext(event) {
  if (!(event.target instanceof Element)) return;

  const row = event.target.closest('.fblqa-gear-card[data-item-id], .item[data-item-id], .item[data-itemid]');
  if (!(row instanceof HTMLElement)) return;

  const app = findOwningActorApp(row);
  const actor = app?.actor ?? app?.document;
  if (!actor || actor.documentName !== "Actor") return;

  const itemId = row.dataset.itemId ?? row.dataset.itemid;
  const item = actor.items?.get?.(itemId);
  if (!isResourceItem(item)) return;

  // Quick Access opens its menu synchronously during the bubbling phase of this
  // same contextmenu event. A microtask runs immediately after dispatch, with no
  // timer/frame delay and without global mutable pending state.
  queueMicrotask(() => patchOpenQuickAccessMenu(actor, itemId));
}

function patchOpenQuickAccessMenu(actor, itemId) {
  const menu = document.querySelector(`.fblqa-gear-context-menu[data-item-id="${cssEscape(itemId)}"]`);
  if (!(menu instanceof HTMLElement) || menu.dataset.fblrPatched === "true") return;

  const item = actor.items?.get?.(itemId);
  if (!isResourceItem(item)) return;
  menu.dataset.fblrPatched = "true";

  const duplicateButton = menu.querySelector(".fa-copy")?.closest("button") ?? null;
  const useButton = buildQaButton("fa-dice-d6", localize("Actions.Use", "Use resource"), async () => {
    await rollResourceDie(item);
  });

  if (duplicateButton) menu.insertBefore(useButton, duplicateButton);
  else menu.append(useButton);

  const splits = getSplitOptions(item);
  if (splits.length) {
    const splitButton = buildQaButton("fa-code-branch", localize("Actions.Split", "Split resource"), async () => {
      const selected = await chooseSplitOption(item.name, getResourceDie(item), splits);
      if (!selected?.option) return;
      await splitResourceItem(item, selected.option);
    });
    if (duplicateButton) menu.insertBefore(splitButton, duplicateButton);
    else menu.append(splitButton);
  }

  const transferButton = menu.querySelector(".fa-exchange-alt")?.closest("button");
  if (transferButton && splits.length) replaceResourceTransferButton(transferButton, item, splits);
}

function replaceResourceTransferButton(original, item, splits) {
  const replacement = original.cloneNode(true);
  original.replaceWith(replacement);
  replacement.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeQuickAccessMenu(replacement.closest(".fblqa-gear-context-menu"));

    try {
      const selected = await chooseSplitOption(item.name, getResourceDie(item), splits, { transfer: true });
      if (!selected) return;
      if (selected.whole) await transferResourceItem(item);
      else await transferResourceItem(item, selected.option);
    } catch (error) {
      console.error("fbl-resource-dice | resource transfer failed", error);
      ui.notifications?.error?.(localize("Notifications.TransferFailed", "Resource transfer failed."));
    }
  });
}

function buildQaButton(iconClass, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("fblqa-gear-menu-button", "fblr-qa-menu-button");
  button.setAttribute("role", "menuitem");

  const icon = document.createElement("i");
  icon.classList.add("fas", iconClass, "fblqa-gear-menu-icon");
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.classList.add("fblqa-gear-menu-label");
  text.textContent = label;

  button.append(icon, text);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeQuickAccessMenu(button.closest(".fblqa-gear-context-menu"));
    try {
      await action();
    } catch (error) {
      console.error("fbl-resource-dice | Quick Access action failed", error);
      ui.notifications?.error?.(localize("Notifications.ActionFailed", "Resource action failed."));
    }
  });
  return button;
}

function closeQuickAccessMenu(menu) {
  if (!(menu instanceof HTMLElement)) return;
  // Quick Access owns document-level cleanup listeners for its menu. Escape is
  // the only public DOM-level path that lets it release them before we invoke a
  // custom action. The explicit remove is only a defensive fallback.
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  if (menu.isConnected) menu.remove();
}

function findOwningActorApp(element) {
  const appRoot = element.closest?.(".app[data-appid]");
  const appId = appRoot?.dataset?.appid;
  const direct = appId != null ? ui.windows?.[appId] : null;
  if (direct) {
    const actor = direct.actor ?? direct.document;
    if (actor?.documentName === "Actor") return direct;
  }

  // Compatibility fallback for custom sheet wrappers that do not expose the
  // standard data-appid attribute.
  for (const app of Object.values(ui.windows ?? {})) {
    const root = extractElement(app?.element);
    if (!root?.contains?.(element)) continue;
    const actor = app?.actor ?? app?.document;
    if (actor?.documentName === "Actor") return app;
  }
  return null;
}

function extractElement(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  if (value?.element instanceof HTMLElement) return value.element;
  return null;
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replaceAll('"', '\\"');
}
