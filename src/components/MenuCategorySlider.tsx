import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MenuItem, Category } from "../types";
import CategoryIcon from "./CategoryIcon";

/**
 * Category discovery rail — id/order/label are the contract with filtering
 * logic (MenuPage.scrollToCategory / HomePage.handleCategorySelect).
 * Visuals only: playful 3D-cartoon SVG art, no photo downloads.
 */
export const VISUAL_CATEGORIES = [
  { id: "all", label: "All Items" },
  { id: "featured", label: "Featured" },
  { id: "combo", label: "Combo" },
  { id: "pizza", label: "Pizzas" },
  { id: "sides", label: "Sides & Appetizers" },
  { id: "drinks", label: "Cold Drinks" },
  { id: "dessert", label: "Desserts" },
];

interface MenuCategorySliderProps {
  menuItems: MenuItem[];
  categories?: Category[];
  selectedId: string;
  onSelect: (categoryId: string) => void;
}

/** Visual category cards slider — shared by the menu page and the homepage. */
export default function MenuCategorySlider({ categories, selectedId, onSelect }: MenuCategorySliderProps) {
  const visualSliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const visualCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      const activeCats = categories
        .filter((c) => c.active !== false && c.showOnMenu !== false)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      return [
        { id: "all", label: "All Items" },
        { id: "featured", label: "Featured" },
        ...activeCats.map((c) => ({ id: c.slug, label: c.name })),
      ];
    }
    return VISUAL_CATEGORIES;
  }, [categories]);

  const checkVisualScroll = () => {
    const el = visualSliderRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkVisualScroll();
    window.addEventListener("resize", checkVisualScroll);
    return () => window.removeEventListener("resize", checkVisualScroll);
  }, []);

  const scrollVisualSlider = (dir: 1 | -1) => {
    const el = visualSliderRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <div className="cat-rail-wrap relative my-2 sm:my-3 group/vslider">
      {/* Category header — eyebrow + serif headline, inspired by the menu-section title style */}
      {/* px-1 matches the rail's inner px-1 so title and tiles share one left edge */}
      <div className="cat-rail__head text-left px-1 mb-3 sm:mb-4">
        <p className="cat-rail__eyebrow">Pizza City Menu</p>
        <h3 className="cat-rail__title">Craving something?</h3>
        <span className="cat-rail__rule" aria-hidden="true" />
      </div>
      {canScrollLeft && (
        <button
          onClick={() => scrollVisualSlider(-1)}
          className="absolute -left-2 top-[40%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-gray-800 text-gray-800 dark:text-white shadow-xl border border-gray-100 dark:border-white/10 flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer"
          aria-label="Scroll categories left"
        >
          <ChevronLeft size={18} />
        </button>
      )}

      <div
        ref={visualSliderRef}
        onScroll={checkVisualScroll}
        className="cat-rail flex gap-3 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-proximity py-2 px-1"
      >
        {visualCategories.map((cat) => {
          const isSelected = selectedId === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              aria-pressed={isSelected}
              aria-label={`${cat.label} category`}
              className={`cat-tile group/card cursor-pointer focus:outline-none${isSelected ? " cat-tile--selected" : ""}`}
            >
              <span className="cat-tile__art">
                <CategoryIcon category={cat.id} />
              </span>

              <span className="cat-tile__label">
                {cat.label}
              </span>
              <span className="cat-tile__pip" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <span className={`edge-fade edge-fade--left${canScrollLeft ? " is-visible" : ""}`} aria-hidden="true" />
      <span className={`edge-fade edge-fade--right${canScrollRight ? " is-visible" : ""}`} aria-hidden="true" />

      {canScrollRight && (
        <button
          onClick={() => scrollVisualSlider(1)}
          className="absolute -right-2 top-[40%] -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-gray-800 text-gray-800 dark:text-white shadow-xl border border-gray-100 dark:border-white/10 flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer"
          aria-label="Scroll categories right"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
