import React, { useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Phone, MapPin, Clock, ArrowLeft, Truck, ShoppingBag, Navigation, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { Branch } from "../types";
import { getBranchAltText } from "../lib/altText";
import { getMediaUrl } from "../lib/images";

/* ─────────────────────── Helpers ─────────────────────── */

/** Approximate GPS Coordinates for Oman Wilayats to provide valid numeric GeoCoordinates in Schema.org */
const WILAYAT_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  nizwa: { latitude: 22.9333, longitude: 57.5333 },
  samail: { latitude: 23.3000, longitude: 57.9500 },
  sur: { latitude: 22.5667, longitude: 59.5289 },
  quriyat: { latitude: 23.2625, longitude: 58.9189 },
  fanja: { latitude: 23.4561, longitude: 58.1472 },
  "al-khoud": { latitude: 23.6190, longitude: 58.1965 },
  alkhoud: { latitude: 23.6190, longitude: 58.1965 },
  "al khoud": { latitude: 23.6190, longitude: 58.1965 },
  ibri: { latitude: 23.2250, longitude: 56.4333 },
  mabela: { latitude: 23.6030, longitude: 58.1820 },
  "al maabilaah": { latitude: 23.6030, longitude: 58.1820 },
};

/** Normalize Oman phone numbers to a clean "+968 XXXX XXXX" display and a tel: link */
function formatOmanPhone(raw: string): { display: string; tel: string } {
  const digits = raw.replace(/\D/g, "");
  // Ensure +968 prefix
  const full = digits.startsWith("968") ? digits : `968${digits}`;
  const local = full.slice(3); // 8 digits
  const display = `+968 ${local.slice(0, 4)} ${local.slice(4)}`;
  const tel = `+${full}`;
  return { display, tel };
}

/** Parse "Daily 11 AM – 11 PM" into Schema.org openingHoursSpecification */
function parseHoursToSchema(hours?: string) {
  if (!hours) return [];
  // Match patterns like "11 AM" and "11 PM" or "02 AM"
  const match = hours.match(/(\d{1,2})\s*(AM|PM)\s*[–-]\s*(\d{1,2})\s*(AM|PM)/i);
  if (!match) return [];
  const to24 = (h: number, ampm: string) => {
    const upper = ampm.toUpperCase();
    if (upper === "AM" && h === 12) return 0;
    if (upper === "PM" && h !== 12) return h + 12;
    return h;
  };
  const opens = `${String(to24(parseInt(match[1]), match[2])).padStart(2, "0")}:00`;
  const closes = `${String(to24(parseInt(match[3]), match[4])).padStart(2, "0")}:00`;
  return [{
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "https://schema.org/Monday", "https://schema.org/Tuesday",
      "https://schema.org/Wednesday", "https://schema.org/Thursday",
      "https://schema.org/Friday", "https://schema.org/Saturday",
      "https://schema.org/Sunday"
    ],
    opens,
    closes,
  }];
}

/** Legacy alias — use shared getMediaUrl() (handles R2 + legacy Cloudinary). */
function cloudinaryUrl(imageUrl?: string, width = 800): string | undefined {
  return getMediaUrl(imageUrl, width);
}

/** Derive a URL-safe slug from a branch name */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/* ─────────────────────── Props ─────────────────────── */
interface LocationDetailPageProps {
  branches: Branch[];
}

/* ─────────────────────── Component ─────────────────────── */
export default function LocationDetailPage({ branches }: LocationDetailPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const activeBranches = useMemo(() => {
    // Dynamic branches only — no static fallback (source of truth is /api/branches).
    return (branches || []) as Branch[];
  }, [branches]);

  // Find the outlet matching this slug
  const outlet = useMemo(() => {
    if (!slug) return null;
    return activeBranches.find(
      (b) => toSlug(b.name) === slug || toSlug(b._id || "") === slug || toSlug(b.id || "") === slug
    ) || null;
  }, [slug, activeBranches]);

  // Inject JSON-LD and meta tags into <head>
  useEffect(() => {
    // Clean up previous injections
    document.querySelectorAll("[data-location-seo]").forEach((el) => el.remove());

    if (!outlet) return;

    const isActive = outlet.isActive !== false;

    // --- Meta: robots ---
    const robotsMeta = document.createElement("meta");
    robotsMeta.name = "robots";
    robotsMeta.content = isActive ? "index,follow" : "noindex,nofollow";
    robotsMeta.setAttribute("data-location-seo", "robots");
    document.head.appendChild(robotsMeta);

    // --- Meta: description ---
    const descMeta = document.createElement("meta");
    descMeta.name = "description";
    descMeta.content = isActive
      ? `Pizza City ${outlet.name} – ${outlet.address}. ${outlet.delivery ? "Free delivery available." : "Pickup only."} Call ${outlet.phone}. ${outlet.hours || "Daily 11 AM – 11 PM"}.`
      : `Pizza City ${outlet.name} is currently closed.`;
    descMeta.setAttribute("data-location-seo", "description");
    document.head.appendChild(descMeta);

    // --- Canonical URL ---
    const targetCanonical = `https://pizzacityoman.com/locations/${slug}`;
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonicalEl) {
      canonicalEl.setAttribute("href", targetCanonical);
      canonicalEl.setAttribute("data-location-seo", "canonical");
    } else {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      canonicalEl.setAttribute("href", targetCanonical);
      canonicalEl.setAttribute("data-location-seo", "canonical");
      document.head.appendChild(canonicalEl);
    }

    // --- Title ---
    document.title = isActive
      ? `Pizza City ${outlet.name} – Order Pizza Delivery in ${outlet.geo || outlet.name}, Oman`
      : `Pizza City ${outlet.name} – Temporarily Closed`;

    if (!isActive) return; // Don't inject JSON-LD for inactive outlets

    // --- JSON-LD ---
    const phone = formatOmanPhone(outlet.phone);
    const coords = WILAYAT_COORDINATES[slug || ""] || WILAYAT_COORDINATES[toSlug(outlet.geo || outlet.name)] || { latitude: 23.5880, longitude: 58.3829 };

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "@id": `https://pizzacityoman.com/locations/${slug}`,
      name: `Pizza City ${outlet.name}`,
      telephone: phone.tel,
      url: `https://pizzacityoman.com/locations/${slug}`,
      image: cloudinaryUrl(outlet.image, 1200),
      hasMap: outlet.map,
      address: {
        "@type": "PostalAddress",
        streetAddress: outlet.address,
        addressLocality: outlet.geo || outlet.name,
        addressRegion: "Oman",
        addressCountry: "OM",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      openingHoursSpecification: parseHoursToSchema(outlet.hours),
      servesCuisine: ["Pizza", "Italian", "Fast Food"],
      priceRange: "$$",
      amenityFeature: {
        "@type": "LocationFeatureSpecification",
        name: "Food Delivery",
        value: outlet.delivery ?? true,
      },
    };

    const scriptEl = document.createElement("script");
    scriptEl.type = "application/ld+json";
    scriptEl.textContent = JSON.stringify(jsonLd);
    scriptEl.setAttribute("data-location-seo", "jsonld");
    document.head.appendChild(scriptEl);

    return () => {
      document.querySelectorAll("[data-location-seo]").forEach((el) => el.remove());
      const canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute("href", "https://pizzacityoman.com/");
      document.title = "Pizza City Oman — Handcrafted Oven-Baked Pizza | Order Online";
    };
  }, [outlet, slug]);

  /* ─── 404 / Inactive layout ─── */
  if (!outlet) {
    if (!branches || branches.length === 0) {
      return (
        <div className="container mx-auto px-4 py-24 text-center space-y-6">
          <h1 className="font-playfair font-black text-4xl text-[var(--pc-gray-700)]">Loading outlet…</h1>
          <p className="text-[var(--pc-gray-500)]">Fetching the latest outlet information.</p>
        </div>
      );
    }
    return (
      <div className="container mx-auto px-4 py-24 text-center space-y-6">
        <h1 className="font-playfair font-black text-4xl text-[var(--pc-gray-700)]">Location Not Found</h1>
        <p className="text-[var(--pc-gray-500)]">The outlet you're looking for doesn't exist or has been removed.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-bold text-sm rounded-2xl hover:shadow-lg transition-all">
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </div>
    );
  }

  if (outlet.isActive === false) {
    return (
      <div className="container mx-auto px-4 py-24 text-center space-y-6">
        <div className="inline-flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-full text-sm font-bold mx-auto">
          <Clock size={16} /> Temporarily Closed
        </div>
        <h1 className="font-playfair font-black text-4xl text-[var(--pc-gray-700)]">
          Pizza City {outlet.name}
        </h1>
        <p className="text-[var(--pc-gray-500)] max-w-md mx-auto">
          This outlet is currently closed. Please check back later or visit one of our other locations.
        </p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-bold text-sm rounded-2xl hover:shadow-lg transition-all">
          <ArrowLeft size={16} /> Browse Other Outlets
        </Link>
      </div>
    );
  }

  /* ─── Computed values ─── */
  const phone = formatOmanPhone(outlet.phone);
  const whatsappPhone = outlet.whatsapp ? formatOmanPhone(outlet.whatsapp) : phone;
  const heroImage = cloudinaryUrl(outlet.image, 1200);
  const embedMapSrc = outlet.map && outlet.map.includes("output=embed")
    ? outlet.map
    : `https://maps.google.com/maps?q=${encodeURIComponent(outlet.name + ", " + outlet.address)}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
  const gpsLink = outlet.map && !outlet.map.includes("output=embed")
    ? outlet.map
    : `https://maps.google.com/?q=${encodeURIComponent(outlet.geo || outlet.name || "Oman")}`;

  // Other active branches for the "Other Locations" section
  const otherBranches = activeBranches.filter(
    (b) => b.isActive !== false && toSlug(b.name) !== slug && toSlug(b._id || "") !== slug
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="min-h-screen pb-16"
    >
      {/* ─── Back navigation ─── */}
      <div className="container mx-auto px-4 md:px-8 pt-4 pb-2">
        <Link
          to="/locations"
          className="inline-flex items-center gap-2 text-sm font-bold text-[var(--pc-gray-500)] hover:text-[var(--pc-red-500)] transition-colors"
        >
          <ArrowLeft size={16} />
          All Locations
        </Link>
      </div>

      {/* ─── Hero image / Map ─── */}
      <div className="container mx-auto px-4 md:px-8">
        <div className="rounded-3xl overflow-hidden shadow-lg relative h-56 md:h-80 bg-[var(--pc-gray-200)]">
          {heroImage ? (
            <img
              src={heroImage}
              alt={getBranchAltText(outlet)}
              className="w-full h-full object-cover"
              loading="eager"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <iframe
              src={embedMapSrc}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen={false}
              loading="lazy"
              title={`Map of Pizza City ${outlet.name}`}
            />
          )}

          {/* Status badge overlay */}
          <div className="absolute top-4 left-4">
            <span className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-green-700 text-xs font-black px-3 py-1.5 rounded-full shadow-md">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Open Now
            </span>
          </div>

          {/* Delivery badge */}
          <div className="absolute top-4 right-4">
            <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm ${
              outlet.delivery !== false
                ? "bg-green-50/95 text-green-700"
                : "bg-amber-50/95 text-amber-700"
            }`}>
              {outlet.delivery !== false ? <Truck size={13} /> : <ShoppingBag size={13} />}
              {outlet.delivery !== false ? "Delivery Active" : "Pickup Only"}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Main content grid ─── */}
      <div className="container mx-auto px-4 md:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left column: Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Outlet name & address */}
            <div className="space-y-2">
              <h1 className="font-playfair font-black text-3xl md:text-4xl text-[var(--pc-gray-700)]">
                Pizza City {outlet.name}
              </h1>
              <p lang="ar" dir="rtl" className="text-xs text-[var(--pc-gray-500)]">
                بيتزا سيتي {outlet.name} — بيتزا طازجة والتوصيل سريع داخل عُمان
              </p>
              <p className="flex items-start gap-2 text-sm text-[var(--pc-gray-500)] leading-relaxed">
                <MapPin size={16} className="text-[var(--pc-amber-400)] shrink-0 mt-0.5" />
                {outlet.address}
              </p>
            </div>

            {/* Info cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Hours */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-2 text-[var(--pc-gray-600)]">
                  <Clock size={16} className="text-[var(--pc-amber-400)]" />
                  <span className="text-xs font-bold uppercase tracking-wider">Hours</span>
                </div>
                <p className="text-sm font-bold text-[var(--pc-gray-700)]">{outlet.hours || "Daily 11 AM – 11 PM"}</p>
              </div>

              {/* Phone */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-2 text-[var(--pc-gray-600)]">
                  <Phone size={16} className="text-[var(--pc-amber-400)]" />
                  <span className="text-xs font-bold uppercase tracking-wider">Call Us</span>
                </div>
                <a href={`tel:${phone.tel}`} className="text-sm font-bold font-mono text-[var(--pc-gray-700)] hover:text-[var(--pc-red-500)] transition-colors block">
                  {phone.display}
                </a>
              </div>

              {/* Delivery */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-2 text-[var(--pc-gray-600)]">
                  {outlet.delivery !== false ? <Truck size={16} className="text-green-500" /> : <ShoppingBag size={16} className="text-amber-500" />}
                  <span className="text-xs font-bold uppercase tracking-wider">Service</span>
                </div>
                <p className="text-sm font-bold text-[var(--pc-gray-700)]">
                  {outlet.delivery !== false ? "🛵 Delivery & Pickup" : "🛍️ Pickup Only"}
                </p>
              </div>
            </div>

            {/* CTA buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a
                href={`tel:${phone.tel}`}
                className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-bold text-sm rounded-2xl active:scale-95 transition-all shadow-md hover:shadow-lg"
              >
                <Phone size={15} />
                Call Now
              </a>
              <a
                href={`https://wa.me/${whatsappPhone.tel.replace("+", "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 bg-green-500 text-white font-bold text-sm rounded-2xl active:scale-95 transition-all shadow-md hover:shadow-lg"
              >
                💬 WhatsApp
              </a>
              <a
                href={gpsLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-[var(--pc-gray-700)] font-bold text-sm rounded-2xl active:scale-95 transition-all hover:border-[var(--pc-amber-400)] hover:shadow-md"
              >
                <Navigation size={15} />
                Directions
              </a>
              <Link
                to="/"
                onClick={() => {
                  setTimeout(() => {
                    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-[var(--pc-gray-700)] font-bold text-sm rounded-2xl active:scale-95 transition-all hover:border-[var(--pc-amber-400)] hover:shadow-md"
              >
                <ExternalLink size={15} />
                Order Now
              </Link>
            </div>
          </div>

          {/* Right column: Embedded map */}
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 h-64 lg:h-full min-h-[240px] bg-[var(--pc-gray-200)]">
              <iframe
                src={embedMapSrc}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen={false}
                loading="lazy"
                title={`Google Maps – Pizza City ${outlet.name}`}
                className="opacity-90 hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Other Locations ─── */}
      {otherBranches.length > 0 && (
        <div className="container mx-auto px-4 md:px-8 mt-16">
          <div className="text-center space-y-1.5 mb-8">
            <span className="text-xs font-bold text-[var(--pc-amber-400)] uppercase tracking-widest">More Outlets</span>
            <h2 className="font-playfair font-black text-2xl text-[var(--pc-gray-700)]">Other Pizza City Locations</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {otherBranches.map((b) => {
              const bSlug = toSlug(b.name);
              const bPhone = formatOmanPhone(b.phone);
              const bImage = cloudinaryUrl(b.image, 400);

              return (
                <Link
                  key={b._id || b.id}
                  to={`/locations/${bSlug}`}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-[var(--pc-amber-400)]/40 transition-all"
                >
                  <div className="h-32 bg-[var(--pc-gray-200)] overflow-hidden">
                    {bImage ? (
                      <img
                        src={bImage}
                        alt={getBranchAltText(b)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--pc-gray-400)]">
                        <MapPin size={24} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <h3 className="font-playfair font-black text-sm text-[var(--pc-gray-700)] group-hover:text-[var(--pc-red-500)] transition-colors">
                      Pizza City {b.name}
                    </h3>
                    <p className="text-xs text-[var(--pc-gray-500)] font-mono">{bPhone.display}</p>
                    <div className="flex items-center gap-1 text-xs text-green-600 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {b.hours || "Daily 11 AM – 11 PM"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
