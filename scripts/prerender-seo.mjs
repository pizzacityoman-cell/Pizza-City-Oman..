/**
 * Prerender SEO meta for Netlify static hosting.
 *
 * Problem: Netlify serves the same dist/index.html shell for every route
 * (/* -> /index.html), so crawlers see homepage title/canonical on /menu,
 * /locations/*, etc. The Express SSR in server.ts never runs on Netlify.
 *
 * Fix: after `vite build`, copy dist/index.html into per-route folders with
 * route-specific title/description/canonical/OG + branch JSON-LD injected.
 * Netlify serves existing static files before the /* -> /index.html rewrite,
 * so /menu resolves to dist/menu/index.html with correct crawler meta.
 * The SPA still hydrates normally for users (same JS bundle, same root div).
 *
 * Route meta is mirrored from src/lib/seo.ts PAGE_SEO + server.ts STATIC_SEO.
 * Keep the three in sync when titles change.
 */
import fs from "node:fs";
import path from "node:path";

const DIST = path.join(process.cwd(), "dist");
const SITE = "https://pizzacityoman.com";

const STATIC_ROUTES = {
  "/menu": {
    title: "Pizza Menu Oman — Prices & 30-Min Delivery | Pizza City",
    description:
      "Full Pizza City Oman menu with prices in OMR: handcrafted pizzas, combos, sides, drinks & desserts. 30-min delivery. Order via WhatsApp.",
  },
  "/locations": {
    title: "Pizza Locations Oman — Find Us Near You | Pizza City",
    description:
      "Find Pizza City outlets near you: Nizwa, Samail, Sur, Quriyat, Fanja, Al Khoud, Ibri & Mabela. Addresses, hours, phone & delivery info.",
  },
  "/contact": {
    title: "Contact Pizza City Oman — Phone, WhatsApp & Hours",
    description:
      "Call +968 9692 8714 or WhatsApp your order. Email info@pizzacityoman.com. Open daily 11 AM – 2 AM in Muscat, Oman.",
  },
  "/faq": {
    title: "Pizza Delivery FAQs — Halal, Ordering & Areas | Pizza City",
    description:
      "Halal ingredients? Delivery time & areas? Payment methods? Pizza City Oman answers: 30-min delivery, custom toppings, freshness & more.",
  },
  "/track-order": {
    title: "Track Your Order | Pizza City Oman",
    description:
      "Track your Pizza City Oman order live — enter your order ID to see preparation and delivery status.",
  },
  "/privacy": {
    title: "Privacy Policy | Pizza City Oman",
    description:
      "How Pizza City Oman collects and uses order and contact information, and how to request deletion.",
  },
  "/terms": {
    title: "Terms of Service | Pizza City Oman",
    description:
      "Ordering, pricing, delivery estimates and promo rules for Pizza City Oman online ordering.",
  },
  "/menu/pizza": {
    title: "Sourdough Pizzas Menu — Prices & Delivery | Pizza City Oman",
    description: "Browse our signature artisanal sourdough pizzas baked fresh with premium ingredients. Fast 30-min delivery across Oman.",
  },
  "/menu/combo": {
    title: "Combo Deals & Value Meals | Pizza City Oman",
    description: "Discover value-packed pizza combos, group meals, and bundle deals at Pizza City Oman. Order online via WhatsApp.",
  },
  "/menu/sides": {
    title: "Sides & Appetizers Menu | Pizza City Oman",
    description: "Crispy garlic breads, chicken wings, potato wedges, and savory sides at Pizza City Oman.",
  },
  "/menu/drinks": {
    title: "Chilled Drinks & Beverages | Pizza City Oman",
    description: "Refresh yourself with chilled beverages and soft drinks to complement your meal.",
  },
  "/menu/dessert": {
    title: "Desserts & Sweet Treats | Pizza City Oman",
    description: "Indulge in freshly baked sweet dessert pies and tiramisu treats at Pizza City Oman.",
  },
};

// Branch storefront data for prerendered location pages.
// Mirrors the DB seeds in server.ts — update both when hours/phones change.
const BRANCHES = [
  { slug: "nizwa", name: "Nizwa", geo: "Nizwa", address: "Nizwa 611, Oman.", phone: "+968 96928714", hours: "Daily 10 AM – 1 AM", delivery: true },
  { slug: "samail", name: "Samail", geo: "Samail", address: "Al Jarda-Saumara Rd, Samail, Ad Dakhiliyah Governorate, Oman", phone: "+968 96928716", hours: "Daily 11 AM – 1 AM", delivery: true },
  { slug: "sur", name: "Sur", geo: "Sur", address: "Sur Al Sharqiyah Government, City 411, Oman", phone: "+968 96928717", hours: "Daily 11 AM – 1 AM", delivery: true },
  { slug: "quriyat", name: "Quriyat", geo: "Quriyat", address: "Lake Park, Qurayyat 120, Oman.", phone: "+968 91446573", hours: "Daily 11 AM – 1 AM", delivery: true },
  { slug: "fanja", name: "Fanja", geo: "Fanja", address: "opposite Hour Shopping Center, Fanja 623, Oman", phone: "+968 96749772", hours: "Daily 10 AM – 1 AM", delivery: true },
  { slug: "al-khoud", name: "Al Khoud", geo: "Al Khoud", address: "Al Khoud 6, Muscat, Oman", phone: "+968 96928715", hours: "Daily 11 AM – 11 PM", delivery: true },
  { slug: "ibri", name: "Ibri", geo: "Ibri", address: "Ibri, Oman", phone: "+968 96928719", hours: "Daily 11 AM – 02 AM", delivery: false },
  { slug: "mabela", name: "Mabela", geo: "Mabela", address: "Al Maabilaah, Saeeb, Oman", phone: "+968 96928720", hours: "Daily 11 AM – 02 AM", delivery: true },
];

/** Escape for HTML attribute / text injection. */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectMeta(template, { title, description, canonical, schema }) {
  let out = template.replace(/<title>.*?<\/title>/i, `<title>${esc(title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content=".*?"\s*\/?>/i,
    `<meta name="description" content="${esc(description)}" />`
  );
  out = out.replace(
    /<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i,
    `<link rel="canonical" href="${esc(canonical)}" />`
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i,
    `<meta property="og:title" content="${esc(title)}" />`
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i,
    `<meta property="og:description" content="${esc(description)}" />`
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i,
    `<meta property="og:url" content="${esc(canonical)}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i,
    `<meta name="twitter:title" content="${esc(title)}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i,
    `<meta name="twitter:description" content="${esc(description)}" />`
  );
  if (schema) {
    const tag = `\n  <script type="application/ld+json" id="prerender-schema">\n  ${JSON.stringify(schema)}\n  </script>\n`;
    out = out.replace("</head>", `${tag}</head>`);
  }
  return out;
}

function branchPage(branch) {
  const canonical = `${SITE}/locations/${branch.slug}`;
  const title = `Pizza City ${branch.name} – Order Pizza Delivery in ${branch.geo}, Oman`;
  const description =
    `Order fresh handcrafted oven-baked pizzas from Pizza City ${branch.name} (${branch.address}) ` +
    `${branch.delivery ? "Fast delivery" : "Pick up"} available. Call ${branch.phone}. Open ${branch.hours}.`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": canonical,
    name: `Pizza City ${branch.name}`,
    telephone: branch.phone.replace(/\s/g, ""),
    url: canonical,
    address: {
      "@type": "PostalAddress",
      streetAddress: branch.address,
      addressLocality: branch.geo,
      addressRegion: "Oman",
      addressCountry: "OM",
    },
    servesCuisine: ["Pizza", "Italian", "Fast Food", "Halal"],
    priceRange: "OMR 2 - OMR 7",
    openingHours: branch.hours,
  };
  return { title, description, canonical, schema };
}

function main() {
  const indexPath = path.join(DIST, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error("[prerender-seo] dist/index.html not found — run build:client first.");
    process.exit(1);
  }
  const template = fs.readFileSync(indexPath, "utf-8");
  let count = 0;

  for (const [route, meta] of Object.entries(STATIC_ROUTES)) {
    const canonical = `${SITE}${route}`;
    const html = injectMeta(template, { ...meta, canonical });
    const dir = path.join(DIST, route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    count++;
  }

  for (const branch of BRANCHES) {
    const meta = branchPage(branch);
    const html = injectMeta(template, meta);
    const dir = path.join(DIST, "locations", branch.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
    count++;
  }

  console.log(`[prerender-seo] wrote ${count} prerendered route files.`);
}

main();
