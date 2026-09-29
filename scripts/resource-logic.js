export const RESOURCE_DICE = Object.freeze([4, 6, 8, 10, 12]);
export const STANDARD_RESOURCE_DICE = Object.freeze([6, 8, 10, 12]);

export const DEFAULT_RESOURCE_WEIGHTS = Object.freeze({
  4: "tiny",
  6: "tiny",
  8: "light",
  10: "light",
  12: "regular"
});

const NEXT_DIE = Object.freeze({
  12: 10,
  10: 8,
  8: 6,
  6: null,
  4: null
});

const SPLITS = Object.freeze({
  12: Object.freeze([
    Object.freeze({ keep: 10, split: 6 }),
    Object.freeze({ keep: 8, split: 8 })
  ]),
  10: Object.freeze([
    Object.freeze({ keep: 8, split: 6 })
  ]),
  8: Object.freeze([
    Object.freeze({ keep: 6, split: 6 })
  ]),
  6: Object.freeze([]),
  4: Object.freeze([])
});

export function normalizeResourceDie(value) {
  const die = Number(value);
  return RESOURCE_DICE.includes(die) ? die : null;
}

export function nextResourceDie(value) {
  const die = normalizeResourceDie(value);
  return die == null ? null : NEXT_DIE[die];
}

export function getResourceSplitOptions(value) {
  const die = normalizeResourceDie(value);
  if (die == null) return [];
  return SPLITS[die].map((option) => ({ ...option }));
}

export function shouldDepleteResource(rollTotal) {
  const total = Number(rollTotal);
  return Number.isFinite(total) && total >= 1 && total <= 2;
}
