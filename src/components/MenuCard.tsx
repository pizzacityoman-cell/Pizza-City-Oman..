import React, { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { MenuItem } from "../types";
import { getDefaultSizes, getSizeAdjustedPrice } from "../lib/priceUtils";
import { getMenuItemAltText } from "../lib/altText";
import { FALLBACK_FOOD_IMAGE, getMediaUrl } from "../lib/images";

interface MenuCardProps {
  item: MenuItem;
  onOrder: (item: MenuItem) => void;
  /** Direct add for single-size items only (skips configure modal). */
  onAddDirect?: (item: MenuItem, size: string) => void;
  badge?: string;
  index?: number;
  displayToast?: (msg: string) => void;
  /** Card body/image tap → item quick-view. Buttons are unaffected. */
  onQuickView?: (item: MenuItem) => void;
  /** Full-width horizontal variant for small categories (combos). */
  wide?: boolean;
}

export default function MenuCard({
  item,
  onOrder,
  onAddDirect,
  badge,
  index = 0,
  displayToast,
  onQuickView,
  wide = false,
}: MenuCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  const isUnavailable = item.available === false;

  const sizes = item.sizes || getDefaultSizes(item.category);
  const isSingleSize = sizes.length <= 1;
  const [selectedSize, setSelectedSize] = useState(
    () => sizes[Math.floor(sizes.length / 2)]?.name || sizes[0]?.name || "Regular"
  );

  const effectiveBase =
    item.discountPrice && item.discountPrice < item.price ? item.discountPrice : item.price;
  const displayPrice = getSizeAdjustedPrice(effectiveBase, selectedSize, sizes);
  const originalPrice = getSizeAdjustedPrice(item.price, selectedSize, sizes);
  const hasDiscount =
    !isUnavailable &&
    item.discountPrice !== undefined &&
    item.discountPrice > 0 &&
    item.discountPrice < item.price;
  const savePct = hasDiscount ? Math.round((1 - item.discountPrice! / item.price) * 100) : 0;

  // Wide cards are always the full-width horizontal variant (small categories).
  const isWideMode = wide;

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const check = () => setCanExpand(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.description]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const notifyUnavailable = () => {
    if (displayToast) {
      displayToast("The Menu item is not available.");
    } else if (typeof window !== "undefined") {
      alert("The Menu item is not available.");
    }
  };

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const circle = document.createElement("span");
    const rect = button.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;
    circle.classList.add("ripple");

    const existingRipple = button.getElementsByClassName("ripple")[0];
    if (existingRipple) {
      existingRipple.remove();
    }

    button.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  };

  const addToCartWithSize = () => {
    // Restriction: direct add only for single-size items; everything else
    // keeps the existing configure-modal flow.
    if (isSingleSize && onAddDirect) {
      onAddDirect(item, sizes[0]?.name || "Regular");
    } else {
      onOrder(item);
    }
  };

  const handleOrder = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleRipple(e);
    if (isUnavailable) {
      notifyUnavailable();
      return;
    }
    addToCartWithSize();
  };

  const handleQuickAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleRipple(e);
    if (isUnavailable) {
      notifyUnavailable();
      return;
    }
    addToCartWithSize();
  };

  const handleCardClick = () => {
    if (isUnavailable) {
      notifyUnavailable();
      return;
    }
    onQuickView?.(item);
  };

  const badgeLabel = badge ? (badge.startsWith("🔥") ? badge : `🔥 ${badge}`) : null;

  const badgesBlock = (isCompactMode: boolean) => {
    if (isUnavailable) {
      return (
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-red-600/95 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg inline-flex items-center gap-1 leading-none border border-red-400/30">
            🚫 Out of Stock
          </span>
        </div>
      );
    }
    if (!badgeLabel && savePct <= 0) return null;
    return (
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
        {badgeLabel && (
          <span className="bg-gradient-to-r from-amber-500 to-amber-400 text-black text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg inline-flex items-center gap-1 leading-none">
            {badgeLabel}
          </span>
        )}
        {savePct > 0 && <span className="save-badge">Save {savePct}%</span>}
      </div>
    );
  };

  const priceBlock = (sizeClass = "text-sm sm:text-lg") => (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5 min-w-0">
      <span
        className={`font-body font-bold whitespace-nowrap ${sizeClass} ${
          isUnavailable ? "text-gray-500 line-through" : "text-amber-400"
        }`}
      >
        OMR {displayPrice.toFixed(2)}
      </span>
      {hasDiscount && (
        <span className="font-body text-[10px] sm:text-[11px] text-gray-500 line-through whitespace-nowrap shrink-0">
          OMR {originalPrice.toFixed(2)}
        </span>
      )}
    </div>
  );

  const sizePills = (
    <div className="flex items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2 flex-wrap" role="group" aria-label="Choose size">
      {sizes.map((s) => (
        <button
          key={s.name}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSize(s.name);
          }}
          aria-pressed={selectedSize === s.name}
          title={s.label}
          disabled={isUnavailable}
          className={`size-pill--interactive${
            selectedSize === s.name ? " is-selected" : ""
          }${isUnavailable ? " is-disabled" : ""}`}
        >
          {s.name === "Regular" ? "R" : s.name.charAt(0)}
        </button>
      ))}
    </div>
  );

  /* ---------- Wide (horizontal) variant — small categories / combos ---------- */
  if (isWideMode) {
    return (
      <article
        ref={cardRef}
        onClick={handleCardClick}
        className={`menu-card menu-card--wide fade-up flex p-0 shadow-lg border rounded-2xl transition-all duration-300 ease-out select-none overflow-hidden ${
          isUnavailable
            ? "opacity-55 grayscale-[35%] bg-neutral-900/90 border-red-500/20 cursor-not-allowed"
            : "shadow-black/40 border-white/[0.06] hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/5 cursor-pointer"
        }`}
        style={{ transitionDelay: `${index * 80}ms` }}
      >
        <div className="relative w-[38%] sm:w-[32%] shrink-0 overflow-hidden group">
          {badgesBlock(false)}
          <img
            src={getMediaUrl(item.image, 450) || FALLBACK_FOOD_IMAGE}
            alt={getMenuItemAltText(item)}
            className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out ${
              isUnavailable ? "" : "group-hover:scale-105"
            }`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
            }}
          />
        </div>
        <div className="flex flex-col p-3 sm:p-4 flex-1 min-w-0">
          <h2
            className={`font-playfair font-bold text-base sm:text-xl tracking-wide leading-tight ${
              isUnavailable ? "text-gray-400" : "text-white"
            }`}
          >
            {item.name}
          </h2>
          <p
            ref={descRef}
            className={`text-[11px] sm:text-xs mt-1 leading-snug whitespace-pre-line ${
              isUnavailable ? "text-gray-500" : "text-gray-400"
            } ${expanded ? "" : "line-clamp-2"}`}
          >
            {item.description || "A delicious handcrafted item from Pizza City."}
          </p>
          {canExpand && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="mt-1 text-[11px] font-semibold text-amber-400/80 hover:text-amber-400 transition-colors cursor-pointer self-start"
            >
              {expanded ? "See less" : "See more"}
            </button>
          )}
          {!isSingleSize && sizePills}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2.5 sm:pt-3">
            {priceBlock()}
            <button
              onClick={handleOrder}
              disabled={isUnavailable}
              data-ripple
              className={`px-3 sm:px-4 py-1.5 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider gap-1.5 transition-all shrink-0 ${
                isUnavailable
                  ? "bg-gray-800/80 text-gray-400 border border-gray-700/50 cursor-not-allowed rounded-full opacity-80"
                  : "menu-btn menu-btn-primary cursor-pointer"
              }`}
              aria-label={isUnavailable ? `${item.name} is not available` : `Order ${item.name}`}
            >
              {isUnavailable ? "Unavailable" : "Order"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  /* ---------- Default card (tablet/desktop) ---------- */
  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      className={`menu-card fade-up flex flex-col p-0 shadow-lg border rounded-2xl transition-all duration-300 ease-out select-none overflow-hidden ${
        isUnavailable
          ? "opacity-55 grayscale-[35%] bg-neutral-900/90 border-red-500/20 cursor-not-allowed"
          : "shadow-black/40 border-white/[0.06] hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/5 cursor-pointer"
      }`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Image Container with Quick-Add (desktop hover/touch) */}
      <div className="relative overflow-hidden group">
        {badgesBlock(false)}

        <button
          onClick={handleQuickAdd}
          type="button"
          disabled={isUnavailable}
          className={`hidden sm:flex absolute top-3 right-3 z-10 w-11 h-11 rounded-full backdrop-blur-md items-center justify-center transition-all shadow-lg active:scale-90 focus:opacity-100 ${
            isUnavailable
              ? "bg-red-950/60 text-gray-400 border border-red-500/20 cursor-not-allowed opacity-80"
              : "bg-black/40 hover:bg-black/60 text-white opacity-100 border border-white/20"
          }`}
          aria-label={isUnavailable ? `${item.name} is not available` : `Quick add ${item.name} to cart`}
          title={isUnavailable ? `${item.name} is not available` : `Quick add ${item.name}`}
        >
          <Plus size={18} />
        </button>
        <div className="overflow-hidden">
          <img
            src={getMediaUrl(item.image, 450) || FALLBACK_FOOD_IMAGE}
            alt={getMenuItemAltText(item)}
            className={`w-full aspect-[4/3] object-cover transition-transform duration-500 ease-out ${
              isUnavailable ? "" : "group-hover:scale-105"
            }`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
            }}
          />
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-col p-3 sm:p-4 pt-2.5 sm:pt-3.5 flex-1">
        <h2
          className={`font-playfair font-bold text-sm sm:text-xl tracking-wide leading-tight line-clamp-2 ${
            isUnavailable ? "text-gray-400" : "text-white"
          }`}
        >
          {item.name}
        </h2>

        <p
          ref={descRef}
          className={`text-[11px] sm:text-xs mt-1 leading-snug whitespace-pre-line ${
            isUnavailable ? "text-gray-500" : "text-gray-400"
          } ${expanded ? "" : "line-clamp-2"}`}
        >
          {item.description || "A delicious handcrafted item from Pizza City."}
        </p>

        {canExpand && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="mt-1 text-[11px] font-semibold text-amber-400/80 hover:text-amber-400 transition-colors cursor-pointer self-start"
          >
            {expanded ? "See less" : "See more"}
          </button>
        )}

        {/* Interactive size quick-select — updates displayed price */}
        {!isSingleSize && sizePills}

        <div className="flex items-center justify-between gap-1.5 mt-auto pt-2.5 sm:pt-3.5">
          {priceBlock()}
          <button
            onClick={handleOrder}
            disabled={isUnavailable}
            data-ripple
            className={`px-2.5 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider shrink-0 transition-all ${
              isUnavailable
                ? "bg-gray-800/80 text-gray-400 border border-gray-700/50 cursor-not-allowed rounded-full opacity-80"
                : "menu-btn menu-btn-primary cursor-pointer"
            }`}
            aria-label={isUnavailable ? `${item.name} is not available` : `Order ${item.name}`}
          >
            {isUnavailable ? "Unavailable" : "Order"}
          </button>
        </div>
      </div>
    </article>
  );
}
