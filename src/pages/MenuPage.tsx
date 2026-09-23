import { useState, useEffect, useMemo, useRef } from "react";
import { Search, X, Sparkles, Star, Layers, LayoutGrid, Plus, Flame, ChefHat, Wine, Cookie, Utensils } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MenuItem, Category } from "../types";
import { useLocation, useNavigate } from "react-router-dom";
import MenuCardGrid from "../components/MenuCardGrid";
import MenuCategorySlider from "../components/MenuCategorySlider";
import BottomSheet from "../components/BottomSheet";
import { getFeaturedItems, getCategoryItems } from "../lib/menuSelectors";
import { itemSlug } from "../lib/itemSlug";

interface MenuPageProps {
  menuItems: MenuItem[];
  categories?: Category[];
  isLoadingMenu: boolean;
  menuFilter: string;
  setMenuFilter: (f: string) => void;
  addToCart: (item: MenuItem) => void;
  /** Direct add for single-size items only (skips configure modal). */
  addDirectToCart: (item: MenuItem, size: string, quantity: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  navHidden: boolean;
  displayToast?: (msg: string) => void;
  categorySlug?: string;
}

function getIconForCategory(slug: string) {
  const s = slug.toLowerCase();
  if (s.includes("pizza")) return Flame;
  if (s.includes("side") || s.includes("appetizer")) return ChefHat;
  if (s.includes("drink") || s.includes("beverage")) return Wine;
  if (s.includes("dessert") || s.includes("sweet")) return Cookie;
  if (s.includes("combo") || s.includes("deal")) return Layers;
  return Utensils;
}

const DEFAULT_CATEGORY_ORDER = ["featured", "combo", "pizza", "sides", "drinks", "dessert"];
const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  featured: "Featured Items",
  pizza: "Handcrafted Pizzas",
  sides: "Savoury Sides & Appetizers",
  drinks: "Ice Cold Drinks & Revivers",
  dessert: "Heavenly Sweet Finishes",
  combo: "Combo Deals",
};

export default function MenuPage({
  menuItems,
  categories = [],
  isLoadingMenu,
  menuFilter,
  setMenuFilter,
  addToCart,
  addDirectToCart,
  searchQuery,
  onSearchChange,
  navHidden,
  displayToast,
  categorySlug,
}: MenuPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories
        .filter((c) => c.active !== false && c.showOnMenu !== false)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return [];
  }, [categories]);

  const categoryOrder = useMemo(() => {
    if (activeCategories.length > 0) {
      return ["featured", ...activeCategories.map((c) => c.slug)];
    }
    return DEFAULT_CATEGORY_ORDER;
  }, [activeCategories]);

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {
      featured: "Featured Items",
      ...DEFAULT_CATEGORY_LABELS,
    };
    activeCategories.forEach((c) => {
      map[c.slug] = c.name;
    });
    return map;
  }, [activeCategories]);

  const categoryDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    activeCategories.forEach((c) => {
      if (c.description) map[c.slug] = c.description;
    });
    return map;
  }, [activeCategories]);

  const filters = useMemo(() => {
    const list = [
      { id: "all", label: "All Items", short: "All", icon: Sparkles },
      { id: "featured", label: "Featured", short: "Featured", icon: Star },
    ];
    if (activeCategories.length > 0) {
      activeCategories.forEach((c) => {
        list.push({
          id: c.slug,
          label: c.name,
          short: c.name,
          icon: getIconForCategory(c.slug),
        });
      });
    } else {
      DEFAULT_CATEGORY_ORDER.filter((c) => c !== "featured").forEach((c) => {
        list.push({
          id: c,
          label: DEFAULT_CATEGORY_LABELS[c] || c,
          short: c.charAt(0).toUpperCase() + c.slice(1),
          icon: getIconForCategory(c),
        });
      });
    }
    return list;
  }, [activeCategories]);

  // If a specific categorySlug was routed (e.g. /menu/pizza), use that as the active filter
  const effectiveFilter = categorySlug || menuFilter;
  const [activeTab, setActiveTab] = useState(effectiveFilter);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fabSheetOpen, setFabSheetOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Mobile keeps the bar always mounted: it carries the only menu search entry
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Card tap → item quick-view (bottom sheet on mobile, modal on desktop via App)
  const openQuickView = (item: MenuItem) => {
    navigate(`/menu/${itemSlug(item)}`, { state: { backgroundLocation: location } });
  };

  useEffect(() => {
    setActiveTab(menuFilter);
  }, [menuFilter]);

  // Auto-open the collapsible search when arriving with a query (navbar search
  // shares this state through App), so results are never hidden behind chips.
  useEffect(() => {
    if (searchQuery.trim()) setSearchOpen(true);
  }, []);

  // Show sticky filter bar only when scrolling down into menu items
  useEffect(() => {
    const handleScroll = () => {
      const el = document.getElementById("menu-anchor-top") || document.getElementById("menu");
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 120) {
        setShowStickyBar(true);
      } else {
        setShowStickyBar(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Search filter — matches name, description (ingredients), and category
  const searchFilteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return menuItems;
    return menuItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [menuItems, searchQuery]);

  // Refs so the rail can auto-center whichever chip is active
  const filterRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const railRef = useRef<HTMLDivElement>(null);
  const [canRailLeft, setCanRailLeft] = useState(false);
  const [canRailRight, setCanRailRight] = useState(false);

  const checkRailScroll = () => {
    const el = railRef.current;
    if (!el) return;
    setCanRailLeft(el.scrollLeft > 8);
    setCanRailRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    checkRailScroll();
    window.addEventListener("resize", checkRailScroll);
    return () => window.removeEventListener("resize", checkRailScroll);
  }, [menuItems, searchOpen]);

  // Scroll spy — automatically tracks the category in view (grouped "all" view)
  useEffect(() => {
    if (effectiveFilter !== "all") return;

    const sectionIds = [
      "menu-anchor-top",
      ...categoryOrder.filter(c => c !== "featured").map(c => `menu-section-${c}`),
    ];
    const entries: Record<string, IntersectionObserverEntry> = {};

    const observer = new IntersectionObserver(
      (allEntries) => {
        allEntries.forEach(e => { entries[e.target.id] = e; });
        let bestId = "";
        let bestRatio = 0;
        for (const id of sectionIds) {
          const r = entries[id]?.intersectionRatio ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            bestId = id;
          }
        }
        if (bestId) {
          const tab = bestId === "menu-anchor-top" ? "all" : bestId.replace("menu-section-", "");
          setActiveTab(tab);
        }
      },
      // Offset for sticky bar (bar ~64px + navbar) so spy doesn't flicker under it
      { threshold: [0, 0.05, 0.1, 0.2, 0.3, 0.5], rootMargin: "-140px 0px -60% 0px" }
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [effectiveFilter, menuItems, categoryOrder]);

  // Memoized per-category counts (was 7xN filter on every render)
  const countsByCat = useMemo(() => {
    const counts: Record<string, number> = {};
    counts.all = menuItems.length;
    counts.featured = getFeaturedItems(menuItems).length;
    for (const c of categoryOrder) {
      if (c === "featured") continue;
      counts[c] = getCategoryItems(menuItems, c).length;
    }
    return counts;
  }, [menuItems, categoryOrder]);

  // Auto-center the active chip — skip when chip already fully visible
  // so scroll-spy doesn't fight the user's own swipe (smooth -> no jank)
  useEffect(() => {
    const key = effectiveFilter === "all" ? activeTab : effectiveFilter;
    const el = filterRefs.current[key];
    const rail = railRef.current;
    if (!el || !rail || searchOpen) return;
    const railRect = rail.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const fullyVisible = elRect.left >= railRect.left && elRect.right <= railRect.right;
    if (fullyVisible) return;
    rail.scrollTo({
      left: rail.scrollLeft + (elRect.left - railRect.left) - (railRect.width / 2) + (elRect.width / 2),
      behavior: "smooth",
    });
  }, [effectiveFilter, activeTab, searchOpen]);

  const scrollToCategory = (catId: string) => {
    setShowStickyBar(true);
    setMenuFilter("all");
    setTimeout(() => {
      if (catId === "all") {
        const target = document.getElementById("menu-anchor-top") || document.getElementById("menu");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const el = document.getElementById(`menu-section-${catId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document.getElementById("menu")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 30);
  };

  // Group items by category for the "all" view (including unavailable items).
  // Predicates live in lib/menuSelectors so the homepage can never drift.
  const filteredItems = effectiveFilter === "all"
    ? searchFilteredItems
    : effectiveFilter === "featured"
      ? getFeaturedItems(searchFilteredItems)
      : getCategoryItems(searchFilteredItems, effectiveFilter);

  const featuredItems = getFeaturedItems(searchFilteredItems);

  const grouped = [
    ...(featuredItems.length > 0 ? [{ id: "featured", label: categoryLabels["featured"] || "Featured Items", items: featuredItems }] : []),
    ...categoryOrder.filter(cat => cat !== "featured").map(cat => ({
      id: cat,
      label: categoryLabels[cat] || cat,
      items: getCategoryItems(searchFilteredItems, cat),
    })).filter(g => g.items.length > 0),
  ];

  const hasSearch = searchQuery.trim().length > 0;

  // Strictly ONE top-seller item per category section
  const bestSellerByCat: Record<string, string> = {};
  categoryOrder.filter(c => c !== "featured" && c !== "combo").forEach(cat => {
    const catItems = getCategoryItems(menuItems, cat).filter(it => it.available !== false);
    const topSeller = catItems.find(it => it.featured) || catItems[0];
    if (topSeller) {
      bestSellerByCat[cat] = topSeller._id;
    }
  });

  const getBadgeForItem = (item: MenuItem) => {
    if (item._id && bestSellerByCat[item.category] === item._id) {
      return "Best Seller";
    }
    return undefined;
  };

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (!next) onSearchChange("");
      return next;
    });
  };

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // FAB — visible only when the sticky chip bar is up and search is closed
  const showFab = showStickyBar && !searchOpen;

  // Bar is only "present" once the user scrolls into the menu (or searches) —
  // otherwise it fully collapses so no empty strip sits under the navbar.
  const barActive = showStickyBar || searchOpen;

  // pt-14 on mobile clears the fixed h-14 navbar
  return (
    <div className="container mx-auto px-2 md:px-8 pt-14 md:pt-0 pb-2 animate-fadeIn overflow-x-clip">
      {/* Sticky bar — one compact row: chips + collapsible search (height ≤76px).
          Collapses to zero height until the user scrolls into the menu. */}
      <div
        className={`sticky z-[35] -mx-2 md:-mx-8 transition-all duration-300 ease-out ${navHidden ? "menu-filter-bar--flush" : "menu-filter-bar"} ${barActive ? "" : "menu-filter-bar--collapsed"}`}
      >
        <div className="menu-filter-bar__row">
          {searchOpen ? (
            <div className="px-3 md:px-8 py-2 w-full">
              <div className="relative max-w-xl mx-auto">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pc-gray-500)] pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") toggleSearch(); }}
                  placeholder="Search pizzas, ingredients, categories..."
                  aria-label="Search menu"
                  className="w-full bg-[var(--pc-gray-100)] border border-[var(--pc-red-500)]/20 rounded-2xl pl-10 pr-10 py-2.5 text-sm text-[var(--pc-gray-600)] font-bold placeholder:font-medium placeholder:text-[var(--pc-gray-500)]/70 focus:outline-none focus:border-[var(--pc-amber-400)] focus:ring-1 focus:ring-[var(--pc-amber-400)]"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--pc-gray-500)] hover:text-[var(--pc-red-500)] hover:bg-[var(--pc-red-500)]/10 transition-colors"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleSearch}
                    aria-label="Close search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[var(--pc-gray-500)] hover:text-[var(--pc-red-500)] hover:bg-[var(--pc-red-500)]/10 transition-colors"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              {hasSearch && (
                <p className="max-w-xl mx-auto pt-1.5 pb-0.5 text-[11px] font-bold text-[var(--pc-gray-500)] flex items-center justify-between gap-2">
                  <span>{filteredItems.length} {filteredItems.length === 1 ? "item" : "items"} for "{searchQuery.trim()}"</span>
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    className="text-[var(--pc-red-500)] hover:underline font-black shrink-0"
                  >
                    Clear
                  </button>
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Filter chips — hidden until user scrolls down into menu items */}
              <div
                className={`flex-1 min-w-0 transition-all duration-300 ease-out ${showStickyBar
                  ? "opacity-100 pointer-events-auto translate-y-0 max-h-[76px]"
                  : "opacity-0 pointer-events-none -translate-y-4 max-h-0 overflow-hidden"
                  }`}
              >
                <div className="menu-filter-rail-wrap relative">
                  <div ref={railRef} onScroll={checkRailScroll} className="flex items-center gap-2 overflow-x-auto no-scrollbar snap-x snap-proximity scroll-smooth overscroll-contain py-2 px-1">
                    {filters.map((cat) => {
                      const isActiveChip = effectiveFilter === "all" ? activeTab === cat.id : effectiveFilter === cat.id;
                      const Icon = cat.icon;
                      const count = countsByCat[cat.id] ?? 0;
                      return (
                        <button
                          key={cat.id}
                          ref={(el) => { filterRefs.current[cat.id] = el; }}
                          onClick={() => {
                            if (categorySlug) {
                              navigate("/menu");
                            }
                            scrollToCategory(cat.id);
                          }}
                          aria-current={isActiveChip ? true : undefined}
                          aria-pressed={isActiveChip}
                          title={cat.label}
                          className={`menu-chip${isActiveChip ? " menu-chip--active" : ""}`}
                        >
                          <span className="menu-chip__icon" aria-hidden="true">
                            <Icon size={15} />
                          </span>
                          <span className="hidden sm:inline">{cat.label}</span>
                          <span className="sm:hidden">{cat.short}</span>
                          <span className="menu-chip__count">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <span className={`edge-fade edge-fade--left${canRailLeft ? " is-visible" : ""}`} aria-hidden="true" />
                  <span className={`edge-fade edge-fade--right${canRailRight ? " is-visible" : ""}`} aria-hidden="true" />
                </div>
              </div>

              {/* Search toggle — 44px touch target, right edge of the bar */}
              <div className={`shrink-0 flex items-center pr-3 md:pr-8 transition-opacity duration-300 ${showStickyBar ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <button
                  type="button"
                  onClick={toggleSearch}
                  aria-label="Search menu"
                  aria-expanded={searchOpen}
                  className="menu-filter-search-btn"
                >
                  <Search size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category discovery rail — playful 3D-cartoon icons, same selection contract
          as the sticky chips. Mirrors the homepage so both pages feel one family. */}
      <MenuCategorySlider menuItems={menuItems} categories={categories} selectedId={effectiveFilter} onSelect={scrollToCategory} />

      {isLoadingMenu ? (
        <MenuCardGrid title="" items={[]} onOrder={addToCart} isLoading={true} showHeader={false} />
      ) : hasSearch && effectiveFilter === "all" && grouped.length === 0 ? (
        /* No search results — outside dark .menu-section, so use light-theme tokens */
        <div className="menu-empty text-center py-20 space-y-4">
          <div className="menu-empty__icon w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <Search size={28} />
          </div>
          <p className="menu-empty__title text-lg font-bold">No items found</p>
          <p className="menu-empty__desc text-sm max-w-xs mx-auto">
            No results for "<span className="font-medium">{searchQuery}</span>".
            Try searching by name, ingredient (mozzarella, chicken), or category (pizza, drinks).
          </p>
        </div>
      ) : effectiveFilter === "all" ? (
        /* Grouped view: all categories with scroll spy anchors */
        <section className="menu-section font-body">
          <div className="menu-section__inner">
            <div id="menu-anchor-top" className="text-center space-y-1 sm:space-y-2 mb-3 sm:mb-8 pt-1 scroll-mt-28">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-amber-500/50" />
                <span
                  className="inline-block text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.25em] px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full"
                  style={{ color: "var(--menu-amber)", background: "rgba(245, 158, 11, 0.12)" }}
                >
                  Pizza City Menu
                </span>
                <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-amber-500/50" />
              </div>
              <h1 className="font-display font-black text-2xl sm:text-4xl md:text-5xl tracking-wide leading-tight px-2">
                Pizza Menu — Prices &amp; Order Online in Oman
              </h1>
              <p lang="ar" dir="rtl" className="text-xs sm:text-sm max-w-xl mx-auto font-body opacity-70 hidden sm:block">
                بيتزا سيتي عمان — قائمة البيتزا الكاملة بالأسعار (ر.ع.) والتوصيل السريع
              </p>
              <p className="text-[11px] sm:text-sm max-w-xl mx-auto font-body opacity-80 px-4" style={{ color: "var(--menu-text-secondary)" }}>
                Hand-made recipes with premium components, oven-baked hot and delivered instantly.
              </p>
            </div>

            {grouped.map((group, index) => (
              <div
                key={group.id}
                id={`menu-section-${group.id}`}
                className={`scroll-mt-32 ${index > 0 ? "mt-12" : ""}`}
              >
                {/* Enhanced section header — count pill + full-width divider */}
                <div className="menu-section__head">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-1 h-8 bg-gradient-to-b from-[var(--menu-red)] to-[var(--menu-amber)] rounded-full flex-shrink-0" />
                    <h3 className="font-display text-2xl sm:text-3xl md:text-4xl text-white tracking-wide leading-tight min-w-0">
                      {group.label}
                    </h3>
                    <span className="menu-section__count">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="menu-section__divider" aria-hidden="true" />
                </div>
                <MenuCardGrid
                  showHeader={false}
                  title=""
                  items={group.items}
                  onOrder={addToCart}
                  onAddDirect={(item, size) => addDirectToCart(item, size, 1)}
                  badge={getBadgeForItem}
                  emptyMessage="No items found in this category."
                  isLoading={isLoadingMenu}
                  displayToast={displayToast}
                  onQuickView={openQuickView}
                  wideCards={group.items.length <= 2}
                />
              </div>
            ))}
          </div>
        </section>
      ) : (
        /* Single category view */
        <div className="mt-2">
          <MenuCardGrid
            title={
              effectiveFilter === "featured"
                ? "⭐ Featured Items"
                : categoryLabels[effectiveFilter] || (effectiveFilter.charAt(0).toUpperCase() + effectiveFilter.slice(1))
            }
            subtitle={categoryDescriptions[effectiveFilter]}
            items={filteredItems}
            onOrder={addToCart}
            onAddDirect={(item, size) => addDirectToCart(item, size, 1)}
            badge={getBadgeForItem}
            emptyMessage={
              hasSearch
                ? `No items match "${searchQuery}" in this category. Try a different search term or category.`
                : "No items found in this category. Try selecting a different filter."
            }
            isLoading={isLoadingMenu}
            displayToast={displayToast}
            onQuickView={openQuickView}
          />
        </div>
      )}

      {/* Floating category jump — mobile only, above the cart bar.
          Hidden while the search field is open so they never overlap. */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            type="button"
            onClick={() => setFabSheetOpen(true)}
            className="category-fab md:hidden"
            aria-label={`Jump to category — current: ${categoryLabels[activeTab] || "All Items"}`}
          >
            <LayoutGrid size={16} aria-hidden="true" />
            <span className="category-fab__label">
              {filters.find(f => f.id === activeTab)?.short || "All"}
            </span>
            <Plus size={14} className="category-fab__chev" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Category jump sheet — same selection contract as the sticky chips */}
      <BottomSheet isOpen={fabSheetOpen} onClose={() => setFabSheetOpen(false)} title="Jump to category">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {filters.map((cat) => {
            const isActiveChip = effectiveFilter === "all" ? activeTab === cat.id : effectiveFilter === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setFabSheetOpen(false);
                  if (categorySlug) {
                    navigate("/menu");
                  }
                  scrollToCategory(cat.id);
                }}
                className={`fab-sheet-item${isActiveChip ? " is-active" : ""}`}
              >
                <span className="fab-sheet-item__icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <span className="fab-sheet-item__label">{cat.label}</span>
                <span className="fab-sheet-item__count">{countsByCat[cat.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}
