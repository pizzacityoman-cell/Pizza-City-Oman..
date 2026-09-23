/**
 * Shared image fallbacks — single source of truth for placeholder imagery.
 * Used whenever a menu item, banner, or branch has no image of its own.
 * (Previously scattered across MenuCard, OutletSelector, App, AdminDashboard
 * with a mix of via.placeholder.com, Unsplash, and Zyrosite URLs.)
 */
export const FALLBACK_FOOD_IMAGE =
  "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=400,fit=crop/dfZWWj1nq2KWjIwX/pizza-placeholder.jpg";

export const LOCAL_LOGO_IMAGE = "/logo.png";

/** True for legacy Cloudinary URLs (kept working until DB migration rewrites them). */
export function isCloudinaryUrl(url?: string): boolean {
  return Boolean(url && url.includes("res.cloudinary.com"));
}

/**
 * Universal media resolver: R2 / local / Unsplash pass through untouched.
 * Legacy Cloudinary URLs keep responsive w_/q_auto/f_auto transforms so
 * unmigrated rows stay optimized during the transition.
 */
export function getMediaUrl(imageUrl?: string, width = 800): string | undefined {
  if (!imageUrl) return undefined;
  if (isCloudinaryUrl(imageUrl)) {
    return imageUrl.replace(/\/upload\/(.*?)\//, `/upload/w_${width},q_auto,f_auto/`);
  }
  return imageUrl;
}

/** Back-compat alias for previous `cloudinaryUrl()` helpers. */
export const cloudinaryUrl = getMediaUrl;
