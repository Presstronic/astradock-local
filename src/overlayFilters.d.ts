export interface OverlayFilters { categories: string[]; actions: string[]; itemTypes: string[] }
export const CATEGORIES: Readonly<Record<string, string>>;
export const ACTIONS: Readonly<Record<string, string>>;
export const ITEM_TYPES: Readonly<Record<string, string>>;
export function normalizeOverlayFilters(value?: unknown, options?: { strict?: boolean }): OverlayFilters;
