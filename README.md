# Forbidden Lands Resource Dice

Companion module for **Foundry VTT 13.351** and **Forbidden Lands 13.0.5**.

## Inventory quantity compatibility

For character inventories, `gear`, `weapon`, and `armor` are treated as physical individual Items instead of hidden stacks in `system.quantity`. `rawMaterial` remains quantity-based.

The module configures Item Piles to treat those three item types as unstackable when its API is available, and keeps a Foundry-side normalization fallback. Existing hidden quantities are migrated once by the active GM.

Item Piles actors/merchants are excluded from the fallback normalizer.

## Resource dice

Resource dice are available **only for `gear` Items**.

The Item MAIN tab gets a Resource field next to Weight:

- Standard: `d6`, `d8`, `d10`, `d12`
- Special: `d4`
- `—` disables the resource mechanic

Only the current die is required to use the mechanic:

`flags.fbl-resource-dice.die`

## Resource weight

The weight icon next to the Resource label opens per-die weight configuration. Defaults are:

- `d12` → Normal
- `d10` → Light
- `d8` → Light
- `d6` → Tiny
- `d4` → Tiny

Each die can instead be assigned any weight exposed by the Forbidden Lands Weight selector, including special numeric weights, or set to **Do not change weight**.

The mapping is stored in:

`flags.fbl-resource-dice.weightByDie`

Weight updates automatically when the current resource die changes, when the resource depletes, and when a resource is split.

## Use and depletion

Click the resource badge in the character inventory, or the dice icon beside Resource on an embedded Gear sheet.

On a result of 1–2:

`d12 → d10 → d8 → d6 → depleted`

`d4 → depleted`

A depleted resource Item is deleted from the Actor inventory. Results 3+ do not update the Item.

## Splitting

- `d12 → d10 + d6`
- `d12 → d8 + d8`
- `d10 → d8 + d6`
- `d8 → d6 + d6`
- `d6` and `d4` cannot be split

Both resulting Items receive the correct weight for their new resource die.

## Quick Access integration

If `fbl-quick-access` is active:

- table inventory shows a clickable `die + dX` badge immediately before the Gear name;
- card view shows a compact resource badge at the left side of the card title;
- the context menu adds **Use resource** and, where applicable, **Split resource**;
- the existing **Transfer** action can transfer the whole resource or split off and transfer a valid part.

Partial transfer uses Item Piles' existing `giveItem` flow. Cancelling the transfer rolls the split back, including the original weight.

## Public API

Available as `game.modules.get("fbl-resource-dice").api`:

- `configureItemPilesIntegration()`
- `configureItemPilesSimilarity()` (0.1.0 compatibility alias)
- `getResourceDie(item)`
- `getResourceWeightMap(item)`
- `getSplitOptions(item)`
- `isResourceItem(item)`
- `resetResourceWeightMap(item)`
- `rollResourceDie(item)`
- `setResourceDie(item, die)`
- `setResourceWeightMap(item, map)`
- `splitResourceItem(item, option)`
- `transferResourceItem(item, option?)`


## Performance / render behavior

The module is designed so normal resource interaction does not create render loops or unnecessary Document writes:

- A successful resource roll with result `3+` performs **0 Item updates** and therefore **0 Actor renders** from the resource state.
- A depletion step (`d12 → d10`, etc.) performs **1 Item update** containing both die and weight changes.
- A normal split suppresses the intermediate update render and renders from the new split Item creation only once.
- A partial Quick Access Transfer keeps the temporary split changes renderless until Item Piles completes or the operation is rolled back.
- Actor-sheet badges use one delegated click listener. When Quick Access is enabled, one MutationObserver watches only the Gear tab and processes only newly-added subtrees.
- Resource setters are idempotent and skip `Item.update()` when the stored state is already correct.
- Hidden-quantity migration is batched per Actor and runs only once per world.

The high-level roll/split/transfer operations also use a per-Item in-flight guard to prevent accidental duplicate actions from multiple open sheets or double-clicks.
