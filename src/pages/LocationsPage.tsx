import React from "react";
import { Link } from "react-router-dom";
import { Phone, MapPin, Clock, Truck, ShoppingBag, Navigation } from "lucide-react";
import { Branch } from "../types";
import { getBranchAltText } from "../lib/altText";
import { getMediaUrl } from "../lib/images";

/* ─────────────────── Helpers ─────────────────── */

/** Normalize Oman phone numbers to "+968 XXXX XXXX" */
function formatOmanPhone(raw: string): { display: string; tel: string } {
  const digits = raw.replace(/\D/g, "");
  const full = digits.startsWith("968") ? digits : `968${digits}`;
  const local = full.slice(3);
  const display = `+968 ${local.slice(0, 4)} ${local.slice(4)}`;
  const tel = `+${full}`;
  return { display, tel };
}

/** Legacy alias — use shared getMediaUrl() (handles R2 + legacy Cloudinary). */
function cloudinaryUrl(imageUrl?: string, width = 400): string | undefined {
  return getMediaUrl(imageUrl, width);
}

/** URL-safe slug */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/* ─────────────────── Props ─────────────────── */
interface LocationsPageProps {
  branches: Branch[];
}

/* ─────────────────── Component ─────────────────── */
export default function LocationsPage({ branches }: LocationsPageProps) {
  // Dynamic branches only — no static fallback (source of truth is /api/branches).
  const displayBranches = (branches || []).filter(b => b.isActive !== false);

  return (
    <div className="container mx-auto px-4 md:px-8 pb-16 space-y-8 animate-fadeIn">
      {/* Hero section */}
      <div className="text-center space-y-1.5 max-w-xl mx-auto py-6">
        <span className="text-xs font-bold text-[var(--pc-amber-400)] uppercase tracking-widest block">Available Outlets</span>
        <h1 className="font-playfair font-black text-3xl md:text-4xl text-[var(--pc-gray-700)]">Pizza City Outlets Across Oman</h1>
        <p lang="ar" dir="rtl" className="text-xs text-[var(--pc-gray-500)] leading-relaxed">
          فروع بيتزا سيتي في سلطنة عمان: نزوى، سمائل، صور، قريات، فنجاء، الخوض، عبري والمعبيلة
        </p>
        <p className="text-xs text-[var(--pc-gray-500)] leading-relaxed">
          Come dine-in, collect order pick-ups, or select hot delivery directly to your home coordinates.
        </p>
      </div>

      {/* Location item grids cards */}
      {displayBranches.length === 0 ? (
        <p className="text-center text-sm font-bold text-[var(--pc-gray-500)] py-12">
          Outlet locations are loading. Please check back in a moment.
        </p>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayBranches.map((outlet: any) => {
          const slug = toSlug(outlet.name);
          const phone = formatOmanPhone(outlet.phone || "");
          const heroImage = cloudinaryUrl(outlet.image, 400);
          const embedMapSrc = outlet.map && outlet.map.includes("output=embed")
            ? outlet.map
            : `https://maps.google.com/maps?q=${encodeURIComponent(outlet.name + ", " + outlet.address)}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
          const gpsLink = outlet.map && !outlet.map.includes("output=embed")
            ? outlet.map
            : `https://maps.google.com/?q=${encodeURIComponent(outlet.geo || outlet.name || "Oman")}`;

          return (
            <div key={outlet._id || outlet.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between group hover:shadow-md hover:border-[var(--pc-amber-400)]/30 transition-all duration-300">
              
              {/* Map or Image Header — links to detail page */}
              <Link to={`/locations/${slug}`} className="block w-full h-44 bg-[var(--pc-gray-200)] relative overflow-hidden">
                {heroImage ? (
                  <img
                    src={heroImage}
                    alt={getBranchAltText(outlet)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
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
                    className="opacity-90 hover:opacity-100 transition-opacity pointer-events-none"
                  ></iframe>
                )}

                {/* Active status badge */}
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1 bg-white/95 backdrop-blur-sm text-green-700 text-[10px] font-black px-2 py-1 rounded-full shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Open
                  </span>
                </div>

                {/* Delivery badge */}
                <div className="absolute top-3 right-3">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full shadow-sm backdrop-blur-sm ${
                    outlet.delivery !== false
                      ? "bg-green-50/95 text-green-700"
                      : "bg-amber-50/95 text-amber-700"
                  }`}>
                    {outlet.delivery !== false ? <Truck size={10} /> : <ShoppingBag size={10} />}
                    {outlet.delivery !== false ? "Delivery" : "Pickup"}
                  </span>
                </div>
              </Link>

              {/* Content panel */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4 text-left">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-green-700 font-bold">
                    <Clock size={12} className="text-[var(--pc-amber-400)]" />
                    {outlet.hours || "Open Now · Daily 11 AM – 11 PM"}
                  </div>
                  
                  <Link to={`/locations/${slug}`} className="hover:text-[var(--pc-red-500)] transition-colors">
                    <h4 className="font-playfair font-black text-lg text-[var(--pc-gray-700)] leading-tight">{outlet.name}</h4>
                  </Link>
                  
                  <p className="text-xs text-[var(--pc-gray-500)] leading-relaxed flex items-start gap-1">
                    <MapPin size={12} className="text-[var(--pc-amber-400)] shrink-0 mt-0.5" />
                    {outlet.address}
                  </p>
                </div>

                <div className="space-y-2 pt-3 border-t border-gray-100">
                  {/* Dial telephone helper — formatted Oman number */}
                  <div className="flex items-center justify-between text-xs text-[var(--pc-gray-600)]">
                    <span className="font-semibold flex items-center gap-1">
                      <Phone size={13} className="text-[var(--pc-amber-400)]" />
                      Dial Staff line:
                    </span>
                    <a href={`tel:${phone.tel}`} className="font-mono font-bold hover:text-[var(--pc-red-500)] transition-colors">
                      {phone.display}
                    </a>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1.5">
                    <a 
                      href={`tel:${phone.tel}`}
                      className="py-2 bg-gray-50 hover:bg-gray-100 text-[var(--pc-gray-600)] font-bold text-center text-xs rounded-xl border border-gray-100 active:scale-95 transition-all block"
                    >
                      📞 Call Branch
                    </a>
                    <a 
                      href={gpsLink}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-bold text-center text-xs rounded-xl active:scale-95 transition-all block"
                    >
                      📍 GPS Dir
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
