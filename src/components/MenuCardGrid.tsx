import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MenuItem } from "../types";
import MenuCard from "./MenuCard";

interface MenuCardGridProps {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  onOrder: (item: MenuItem) => void;
  /** Direct add for single-size items only (skips configure modal). */
  onAddDirect?: (item: MenuItem, size: string) => void;
  badge?: string | ((item: MenuItem, index: number) => string | undefined);
  emptyMessage?: string;
  limit?: number;
  showHeader?: boolean;
  isLoading?: boolean;
  displayToast?: (msg: string) => void;
  onQuickView?: (item: MenuItem) => void;
  /** Render every card in the full-width horizontal variant. */
  wideCards?: boolean;
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card__image skeleton" />
      <div className="skeleton-card__body">
        <div className="skeleton-card__title skeleton" />
        <div className="skeleton-card__desc skeleton" />
        <div className="skeleton-card__desc--short skeleton" />
      </div>
      <div className="skeleton-card__footer">
        <div className="skeleton-card__price skeleton" />
        <div className="skeleton-card__btn skeleton" />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="menu-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default function MenuCardGrid({
  title,
  subtitle,
  items,
  onOrder,
  onAddDirect,
  badge,
  emptyMessage = "No items available in this category right now.",
  limit,
  showHeader = true,
  isLoading = false,
  displayToast,
  onQuickView,
  wideCards = false,
}: MenuCardGridProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Reset expanded state only when category changes (not on every items.length change)
  useEffect(() => {
    setIsExpanded(false);
  }, [title]);

  const resolveBadge = (item: MenuItem, index: number): string | undefined => {
    if (typeof badge === "function") {
      return badge(item, index);
    }
    if (typeof badge === "string") {
      return badge;
    }
    return undefined;
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

  const toggleExpand = (e: React.MouseEvent<HTMLButtonElement>) => {
    handleRipple(e);
    setIsExpanded((prev) => !prev);
  };

  const hasMoreItems = limit !== undefined && items.length > limit;
  const displayedItems = hasMoreItems && !isExpanded ? items.slice(0, limit) : items;

  const gridContent = (
    <>
      {showHeader && (
        <div className="text-center space-y-2 mb-6">
          <span
            className="inline-block text-xs font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full"
            style={{ color: "var(--menu-amber)", background: "rgba(245, 158, 11, 0.12)" }}
          >
            Pizza City Menu
          </span>
          <h2 className="font-display text-4xl sm:text-5xl md:text-6xl text-white tracking-wide leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm max-w-xl mx-auto" style={{ color: "var(--menu-text-secondary)" }}>
              {subtitle}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid />
      ) : displayedItems.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: "var(--menu-text-secondary)" }}>
            {emptyMessage}
          </p>
        </div>
      ) : (
        <div>
          <div className="menu-grid">
            {displayedItems.map((item, index) => (
              <React.Fragment key={item._id}>
                <MenuCard
                  item={item}
                  onOrder={onOrder}
                  onAddDirect={onAddDirect}
                  badge={resolveBadge(item, index)}
                  index={index}
                  displayToast={displayToast}
                  onQuickView={onQuickView}
                  wide={wideCards}
                />
              </React.Fragment>
            ))}
          </div>

          {hasMoreItems && (
            <div className="flex justify-center mt-6 mb-12">
              <button
                onClick={toggleExpand}
                className="menu-btn menu-btn-primary px-10 py-4 text-sm font-bold uppercase tracking-widest cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xl"
                style={{ minWidth: "220px" }}
              >
                {isExpanded ? (
                  <span className="flex items-center gap-2">
                    Show Less Menu <ChevronUp size={18} />
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Show All Menu <ChevronDown size={18} />
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (!showHeader) {
    return <div>{gridContent}</div>;
  }

  return (
    <section className="menu-section font-body">
      <div className="menu-section__inner">
        {gridContent}
      </div>
    </section>
  );
}
