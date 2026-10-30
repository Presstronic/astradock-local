import options from '../../contracts/overlayFilterOptions.json';
import type { OverlayFilters } from '../../overlayFilters';
export type { OverlayFilters };
export const CATEGORIES = options.categories;
export const ACTIONS = options.actions;
export const ITEM_TYPES = options.itemTypes;
export function normalizeOverlayFilters(value?: Partial<OverlayFilters>): OverlayFilters {
  const selected = (key: keyof OverlayFilters) => [...new Set((value?.[key] || []).filter(id => Object.hasOwn(options[key], id)))];
  return { categories: selected('categories'), actions: selected('actions'), itemTypes: selected('itemTypes') };
}
