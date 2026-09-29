import { configureResourceWeights } from "./dialogs.js";
import {
  canUseResourceItem,
  getResourceDie,
  localize,
  rollResourceDie,
  setResourceDie
} from "./resource-service.js";

export function renderResourceItemSheet(app, htmlOrElement) {
  const item = app?.item ?? app?.document;
  if (!item || item.documentName !== "Item" || item.type !== "gear") return;

  const root = extractElement(htmlOrElement) ?? extractElement(app?.element);
  if (!root || root.querySelector(".fblr-resource-editor")) return;

  const main = root.querySelector('.tab[data-tab="main"] .main.border, .sheet-body .tab[data-tab="main"] .main');
  const weight = main?.querySelector?.(".weight");
  const weightSelect = weight?.querySelector?.('select[name="system.weight"]');
  if (!main || !weight) return;

  const editor = document.createElement("div");
  editor.classList.add("fblr-resource-editor");
  const controlId = `fblr-resource-${app?.appId ?? item.id}`;

  const labelRow = document.createElement("div");
  labelRow.classList.add("fblr-resource-label-row");

  const label = document.createElement("label");
  label.textContent = localize("ItemSheet.Resource", "Resource");
  label.setAttribute("for", controlId);

  const actions = document.createElement("span");
  actions.classList.add("fblr-resource-label-actions");

  const rollButton = buildIconButton({
    icon: "fa-dice-d6",
    title: canUseResourceItem(item)
      ? localize("Actions.Use", "Use resource")
      : localize("Notifications.ActorOnly", "Resource dice can only be used from an item in an Actor inventory."),
    disabled: !canUseResourceItem(item),
    action: async () => {
      await rollResourceDie(item);
    }
  });

  const weightButton = buildIconButton({
    icon: "fa-weight-hanging",
    title: localize("Actions.ConfigureWeight", "Configure resource weight"),
    disabled: !(app?.isEditable ?? item.isOwner ?? item.parent?.isOwner ?? false),
    action: () => configureResourceWeights(item, collectWeightOptions(weightSelect))
  });

  actions.append(rollButton, weightButton);
  labelRow.append(label, actions);

  const select = document.createElement("select");
  select.id = controlId;
  select.classList.add("fblr-resource-select");
  select.setAttribute("aria-label", localize("ItemSheet.Resource", "Resource"));
  select.disabled = !(app?.isEditable ?? item.isOwner ?? item.parent?.isOwner ?? false);
  buildOptions(select, getResourceDie(item));

  select.addEventListener("change", async (event) => {
    // The control lives inside Forbidden Lands' auto-submit ItemSheet form.
    // Keep this module-owned field out of the native FormApplication change
    // pipeline so one user action produces exactly one Item update/render.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const control = event.currentTarget;
    const value = control.value;
    const wasDisabled = control.disabled;
    control.disabled = true;
    try {
      await setResourceDie(item, value === "" ? null : Number(value));
    } catch (error) {
      console.error("fbl-resource-dice | could not update resource die", error);
      ui.notifications?.error?.(localize("Notifications.SaveFailed", "Could not save resource die."));
    } finally {
      if (control?.isConnected) control.disabled = wasDisabled;
    }
  });

  editor.append(labelRow, select);
  weight.insertAdjacentElement("afterend", editor);
}

function buildIconButton({ icon, title, disabled = false, action }) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("fblr-resource-label-button");
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;
  button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;

    const wasDisabled = button.disabled;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      console.error("fbl-resource-dice | item-sheet resource action failed", error);
      ui.notifications?.error?.(localize("Notifications.ActionFailed", "Resource action failed."));
    } finally {
      if (button.isConnected) button.disabled = wasDisabled;
    }
  });
  return button;
}

function collectWeightOptions(select) {
  if (!(select instanceof HTMLSelectElement)) return [];
  const groups = [];
  let loose = null;

  for (const child of select.children) {
    if (child instanceof HTMLOptGroupElement) {
      groups.push({
        label: child.label,
        options: [...child.querySelectorAll(":scope > option")].map(toWeightOption)
      });
    } else if (child instanceof HTMLOptionElement) {
      loose ??= { label: "", options: [] };
      loose.options.push(toWeightOption(child));
    }
  }

  if (loose?.options.length) groups.unshift(loose);
  return groups;
}

function toWeightOption(option) {
  return { value: option.value, label: option.textContent?.trim() ?? option.value };
}

function buildOptions(select, selected) {
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.append(none);

  const standard = document.createElement("optgroup");
  standard.label = localize("ItemSheet.Standard", "Standard");
  for (const die of [6, 8, 10, 12]) standard.append(buildOption(die, selected));

  const special = document.createElement("optgroup");
  special.label = localize("ItemSheet.Special", "Special");
  special.append(buildOption(4, selected));

  select.append(standard, special);
}

function buildOption(die, selected) {
  const option = document.createElement("option");
  option.value = String(die);
  option.textContent = `d${die}`;
  option.selected = die === selected;
  return option;
}

function extractElement(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  if (value?.element instanceof HTMLElement) return value.element;
  return null;
}
