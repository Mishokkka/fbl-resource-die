import {
  escapeHtml,
  getResourceWeightMap,
  localize,
  resetResourceWeightMap,
  setResourceWeightMap
} from "./resource-service.js";

export function chooseSplitOption(itemName, die, options, { transfer = false } = {}) {
  if (!options.length) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const buttons = {};
    if (transfer) {
      buttons.whole = {
        icon: '<i class="fas fa-exchange-alt"></i>',
        label: localize("Dialog.TransferWhole", "Transfer whole d{die}", { die }),
        callback: () => finish({ whole: true })
      };
    }

    options.forEach((option, index) => {
      const key = `split${index}`;
      buttons[key] = {
        icon: '<i class="fas fa-code-branch"></i>',
        label: transfer
          ? localize("Dialog.TransferPart", "Transfer d{split}, keep d{keep}", option)
          : localize("Dialog.SplitOption", "d{keep} + d{split}", option),
        callback: () => finish({ whole: false, option })
      };
    });

    const dialog = new Dialog({
      title: transfer
        ? localize("Dialog.TransferTitle", "Transfer resource: {name}", { name: itemName })
        : localize("Dialog.SplitTitle", "Split resource: {name}", { name: itemName }),
      content: `<p>${transfer
        ? localize("Dialog.TransferPrompt", "Choose how much of d{die} to transfer.", { die })
        : localize("Dialog.SplitPrompt", "Choose how to split d{die}.", { die })
      }</p>`,
      buttons,
      close: () => finish(null)
    });
    dialog.render(true);
  });
}

export function configureResourceWeights(item, weightOptions) {
  const options = normalizeWeightOptions(weightOptions);
  const map = getResourceWeightMap(item);
  const content = buildWeightDialogContent(map, options);

  const dialog = new Dialog({
    title: localize("WeightDialog.Title", "Resource weight: {name}", { name: item.name }),
    content,
    buttons: {
      defaults: {
        icon: '<i class="fas fa-undo"></i>',
        label: localize("WeightDialog.Defaults", "Defaults"),
        callback: async () => {
          await resetResourceWeightMap(item);
        }
      },
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: localize("WeightDialog.Save", "Save"),
        callback: async (html) => {
          const root = extractDialogElement(html);
          const next = {};
          for (const die of [4, 6, 8, 10, 12]) {
            const select = root?.querySelector?.(`[name="weight-${die}"]`);
            next[die] = select?.value === "__keep__" ? null : select?.value;
          }
          await setResourceWeightMap(item, next);
        }
      },
      cancel: {
        label: localize("WeightDialog.Cancel", "Cancel")
      }
    },
    default: "save"
  });
  dialog.render(true);
}

function buildWeightDialogContent(map, weightOptions) {
  const rows = [12, 10, 8, 6, 4].map((die) => {
    const current = map?.[die] ?? null;
    return `
      <label class="fblr-weight-dialog-row">
        <strong>d${die}</strong>
        <select name="weight-${die}">
          <option value="__keep__"${current == null ? " selected" : ""}>${escapeHtml(localize("WeightDialog.Keep", "Do not change weight"))}</option>
          ${renderWeightOptions(weightOptions, current)}
        </select>
      </label>`;
  }).join("");

  return `
    <form class="fblr-weight-dialog">
      <p>${escapeHtml(localize(
        "WeightDialog.Help",
        "Choose the item weight used at each resource die. The weight changes automatically when the resource changes or is split."
      ))}</p>
      ${rows}
    </form>`;
}

function renderWeightOptions(groups, current) {
  return groups.map((group) => {
    const body = group.options.map((option) => {
      const selected = String(option.value) === String(current) ? " selected" : "";
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    }).join("");
    return group.label
      ? `<optgroup label="${escapeHtml(group.label)}">${body}</optgroup>`
      : body;
  }).join("");
}

function normalizeWeightOptions(groups) {
  if (Array.isArray(groups) && groups.some((group) => Array.isArray(group?.options) && group.options.length)) {
    return groups;
  }

  return [{
    label: "",
    options: [
      { value: "none", label: game.i18n?.localize?.("WEIGHT.NONE") ?? "None" },
      { value: "tiny", label: game.i18n?.localize?.("WEIGHT.TINY") ?? "Tiny" },
      { value: "light", label: game.i18n?.localize?.("WEIGHT.LIGHT") ?? "Light" },
      { value: "regular", label: game.i18n?.localize?.("WEIGHT.REGULAR") ?? "Normal" },
      { value: "heavy", label: game.i18n?.localize?.("WEIGHT.HEAVY") ?? "Heavy" }
    ]
  }];
}

function extractDialogElement(value) {
  if (value instanceof HTMLElement) return value;
  if (value?.[0] instanceof HTMLElement) return value[0];
  return null;
}
