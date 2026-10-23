/** Dacha Par R8.1. Display-only package naming; never changes price, model ids or state. */
export const PACKAGE_NAMES = Object.freeze({ standard: 'Комфорт', featured: 'Делюкс', custom: 'Комфорт с выбранными дополнениями' });

function positiveQuantity(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}
function optionCount(options) {
  return new Set(options).size === options.length;
}
/**
 * @param {object} catalog The existing pricebook with featuredBundle and options.
 * @param {object} state Existing quote state: model, size, options, quantities.
 * Exact match must be about actual item quantities, not click history or "comfort" radio state.
 */
export function publicPackageName(catalog, state) {
  if (!catalog || !state || typeof state.model !== 'string' || typeof state.size !== 'string') throw new TypeError('INVALID_PACKAGE_STATE');
  const keys = Array.isArray(state.options) ? state.options : [];
  if (!optionCount(keys)) return PACKAGE_NAMES.custom;
  if (!keys.length) return PACKAGE_NAMES.standard;
  const bundle = catalog.featuredBundle;
  if (!bundle || state.model !== bundle.modelId || state.size !== bundle.sizeId) return PACKAGE_NAMES.custom;
  const wanted = bundle.selectedOptionIds;
  if (!Array.isArray(wanted) || !optionCount(wanted) || wanted.length !== keys.length) return PACKAGE_NAMES.custom;
  const chosen = new Set(keys);
  if (!wanted.every(key => chosen.has(key))) return PACKAGE_NAMES.custom;
  for (const key of wanted) {
    const spec = catalog.options?.[key];
    if (!spec) return PACKAGE_NAMES.custom;
    const baseline = positiveQuantity(spec.quantity ?? 1);
    const explicit = Object.prototype.hasOwnProperty.call(state.quantities ?? {}, key) ? state.quantities[key] : baseline;
    const actual = positiveQuantity(explicit);
    if (!Number.isFinite(baseline) || !Number.isFinite(actual) || baseline !== actual) return PACKAGE_NAMES.custom;
  }
  return PACKAGE_NAMES.featured;
}
