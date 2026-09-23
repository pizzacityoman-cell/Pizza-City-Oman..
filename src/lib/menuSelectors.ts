import { MenuItem } from "../types";

/**
 * Single source of truth for menu grouping.
 * Every consumer (menu page, homepage teasers, category slider, admin filter)
 * must use these — never re-implement the predicates inline.
 */

/** "Featured" = admin-pinned only. The legacy `featured` flag is NOT used for listing. */
export function isFeatured(item: MenuItem): boolean {
  return !!item.pinnedFeatured;
}

export function getFeaturedItems(items: MenuItem[]): MenuItem[] {
  return items.filter(isFeatured);
}

export function getCategoryItems(items: MenuItem[], categorySlugOrId: string): MenuItem[] {
  const clean = (categorySlugOrId || "").toLowerCase().trim();
  return items.filter(
    (item) =>
      item.categoryId === categorySlugOrId ||
      (item.category && item.category.toLowerCase().trim() === clean)
  );
}
