import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MenuItem } from "../../types";
import MenuCard from "../MenuCard";

interface HomeCategorySectionProps {
  id: string;
  title: string;
  subtitle: string;
  items: MenuItem[];
  isLoading: boolean;
  onOrder: (item: MenuItem) => void;
  displayToast?: (msg: string) => void;
  onQuickView?: (item: MenuItem) => void;
  categorySlug?: string;
}

const PAGE_SIZE = 6;

export default function HomeCategorySection({
  id,
  title,
  subtitle,
  items,
  isLoading,
  onOrder,
  displayToast,
  onQuickView,
  categorySlug,
}: HomeCategorySectionProps) {
  if (!isLoading && items.length === 0) return null;
  return (
    <section id={id} className="container mx-auto px-4 md:px-8 mt-12 md:mt-16 scroll-mt-28 md:scroll-mt-36" aria-label={title}>
      <div className="flex items-end justify-between gap-4 border-b border-gray-100 pb-3 mb-6">
        <div className="space-y-1">
          <span className="text-xs font-black uppercase tracking-wider text-[var(--pc-amber-400)]">
            Pizza City Menu
          </span>
          <h2 className="font-playfair font-black text-2xl md:text-3xl text-[var(--pc-gray-700)]">
            {title}
          </h2>
          <p className="text-sm text-[var(--pc-gray-500)] max-w-xl font-medium">{subtitle}</p>
        </div>
        <Link
          to={categorySlug ? `/menu/${categorySlug}` : "/menu"}
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-black text-[var(--pc-red-500)] hover:text-[var(--pc-amber-400)] transition-colors"
        >
          View All Items <ArrowRight size={16} />
        </Link>
      </div>

      {isLoading ? (
        <div className="menu-grid" aria-hidden="true">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className={i >= 4 ? "hidden md:block" : undefined}>
              <div className="skeleton-card">
                <div className="skeleton-card__image skeleton" />
                <div className="skeleton-card__body">
                  <div className="skeleton-card__title skeleton" />
                  <div className="skeleton-card__desc skeleton" />
                </div>
                <div className="skeleton-card__footer">
                  <div className="skeleton-card__price skeleton" />
                  <div className="skeleton-card__btn skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="menu-grid">
          {items.slice(0, PAGE_SIZE).map((item, index) => (
            <React.Fragment key={item._id}>
              {/* Beyond 3 items: desktop-only so every viewport ends on a full row */}
              <div className={index >= 4 ? "hidden md:contents" : "contents"}>
                <MenuCard
                  item={item}
                  onOrder={onOrder}
                  index={index}
                  displayToast={displayToast}
                  onQuickView={onQuickView}
                />
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
