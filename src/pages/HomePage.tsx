import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShoppingCart, MapPin, Rocket, Star, ChefHat, Leaf, MessageCircle, ChevronLeft, ChevronRight, BadgePercent } from "lucide-react";
import BannerSlider from "../components/BannerSlider";
import { useLocation, useNavigate } from "react-router-dom";
import { itemSlug } from "../lib/itemSlug";
import HomeCategorySection from "../components/home/HomeCategorySection";
import MenuCategorySlider from "../components/MenuCategorySlider";
import HomeReviews from "../components/home/HomeReviews";
import HomeLocationChips from "../components/home/HomeLocationChips";
import { HeroBanner, MenuItem, Branch, Category } from "../types";
import { getFeaturedItems, getCategoryItems } from "../lib/menuSelectors";
import { getBannerAltText } from "../lib/altText";

interface HomePageProps {
  banners: HeroBanner[];
  isLoadingBanners: boolean;
  setActiveTab: (tab: "home" | "menu" | "track" | "loc" | "contact" | "faq" | "admin") => void;
  displayToast: (msg: string) => void;
  onOpenOutletSelector?: () => void;
  menuItems?: MenuItem[];
  categories?: Category[];
  isLoadingMenu?: boolean;
  branches?: Branch[];
  onAddToCart?: (item: MenuItem) => void;
  setMenuFilter?: (f: string) => void;
}

export default function HomePage({
  banners,
  isLoadingBanners,
  setActiveTab,
  displayToast,
  onOpenOutletSelector,
  menuItems = [],
  categories = [],
  isLoadingMenu = false,
  branches = [],
  onAddToCart,
  setMenuFilter,
}: HomePageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleAddToCart = onAddToCart || (() => setActiveTab("menu"));

  // Card tap → item quick-view (modal over homepage, shareable URL)
  const openQuickView = (item: MenuItem) => {
    navigate(`/menu/${itemSlug(item)}`, { state: { backgroundLocation: location } });
  };

  // Category slider is linked with the menu page: pick a category -> open category URL.
  const handleCategorySelect = (catId: string) => {
    if (catId === "all") {
      if (setMenuFilter) setMenuFilter("all");
      navigate("/menu");
    } else if (catId === "featured") {
      if (setMenuFilter) setMenuFilter("featured");
      navigate("/menu");
    } else {
      navigate(`/menu/${catId}`);
    }
  };

  const activeCategories = useMemo(() => {
    if (categories && categories.length > 0) {
      return categories
        .filter((c) => c.active !== false && c.showOnMenu !== false)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return [];
  }, [categories]);

  const featuredItems = useMemo(() => getFeaturedItems(menuItems).slice(0, 6), [menuItems]);

  const categorySections = useMemo(() => {
    if (activeCategories.length > 0) {
      return activeCategories.map((cat) => ({
        id: `home-cat-${cat.slug}`,
        slug: cat.slug,
        title: cat.name,
        subtitle: cat.description || "Freshly prepared with authentic ingredients.",
        items: getCategoryItems(menuItems, cat.slug).slice(0, 6),
      }));
    }
    // Fallback if categories are loading
    return [
      { id: "home-cat-combo", slug: "combo", title: "Combo Deals", subtitle: "More food, smarter OMR value for groups.", items: getCategoryItems(menuItems, "combo").slice(0, 6) },
      { id: "home-cat-pizza", slug: "pizza", title: "Handcrafted Pizzas", subtitle: "48-hour sourdough, oven-baked hot.", items: getCategoryItems(menuItems, "pizza").slice(0, 6) },
      { id: "home-cat-sides", slug: "sides", title: "Savoury Sides & Appetizers", subtitle: "Garlic bread, wings and more to start.", items: getCategoryItems(menuItems, "sides").slice(0, 6) },
      { id: "home-cat-drinks", slug: "drinks", title: "Ice Cold Drinks & Revivers", subtitle: "Chilled drinks to go with every slice.", items: getCategoryItems(menuItems, "drinks").slice(0, 6) },
      { id: "home-cat-dessert", slug: "dessert", title: "Heavenly Sweet Finishes", subtitle: "Desserts to close the meal right.", items: getCategoryItems(menuItems, "dessert").slice(0, 6) },
    ];
  }, [activeCategories, menuItems]);

  const showMenuTeasers = isLoadingMenu || menuItems.length > 0;

  const handleOfferClick = (offer: HeroBanner) => {
    if (offer.buttonLink) {
      // Legacy "#menu" / "#locations" banner links -> route navigation
      if (offer.buttonLink.startsWith("#")) {
        const key = offer.buttonLink.replace("#", "");
        const map: Record<string, "home" | "menu" | "track" | "loc" | "contact" | "faq"> = {
          home: "home", menu: "menu", track: "track", locations: "loc", loc: "loc", contact: "contact", faq: "faq",
        };
        setActiveTab(map[key] || "menu");
        return;
      }
      if (offer.buttonLink.startsWith("http")) {
        window.location.href = offer.buttonLink;
      } else if (offer.buttonLink.startsWith("/")) {
        window.location.href = offer.buttonLink;
      } else {
        setActiveTab("menu");
      }
    } else {
      setActiveTab("menu");
    }
  };

  const offerBanners = banners.filter(b => b.type === "offer" || b.type === "all" || !b.type);

  const offersTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = offersTrackRef.current;
    if (!track) return;
    const cards = track.querySelectorAll<HTMLElement>(".offer-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle("offer-card-focused", entry.isIntersecting);
        });
      },
      { root: track, threshold: 0.6 }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [offerBanners, isLoadingBanners]);

  const scrollOffers = (dir: 1 | -1) => {
    const track = offersTrackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * (track.clientWidth * 0.43 + 16), behavior: "smooth" });
  };

  return (
    <div className="pb-3">
      {/* Primary Semantic H1 for Search Engines & Screen Readers */}
      <h1 className="sr-only">Pizza City Oman — Handcrafted Oven-Baked Pizza, Sourdough Crust &amp; Online Delivery</h1>
      <p lang="ar" dir="rtl" className="sr-only">بيتزا سيتي عمان — بيتزا طازجة بعجينة مخمّرة والتوصيل خلال ٣٠ دقيقة. اطلب عبر واتساب.</p>

      {/* Dynamic Web Banners Hero Gallery */}
      {/* Mobile: full-bleed behind dark translucent navbar; Desktop: contained with rounded corners */}
      <div className="pt-14 md:pt-10 md:container md:mx-auto md:px-0 md:pt-auto">
        <div className="w-full md:rounded-3xl overflow-hidden">
          <BannerSlider 
            banners={banners.filter(b => b.type === "hero" || b.type === "all" || !b.type)}
            isLoading={isLoadingBanners}
            onOrderNow={() => setActiveTab("menu")}
          />
        </div>
      </div>

      {/* Statistics Teaser bar — daylight: warm cream; midnight: dark (via CSS) */}
      <section className="stats-section">
        {/* Divider line */}
        <div className="stats-divider" />

        {/* Inner wrapper */}
        <div className="stats-teaser-pad stats-section__inner">

          {/* Stats grid — single row on mobile, 2×2 on desktop */}
          <div className="stats-grid">
            {[
              { icon: Rocket, color: "var(--pc-amber-400)", number: "30", suffix: "Min", label: "Delivery Guarantee" },
              { icon: MapPin, color: "var(--pc-amber-400)", number: "9",  suffix: "",    label: "Outlets Across Oman" },
              { icon: Star,   color: "var(--pc-amber-400)", number: "150", suffix: "+",  label: "5-Star Reviews" },
              { icon: ChefHat,color: "var(--pc-red-500)",    number: "30", suffix: "+",   label: "Menu Items" },
            ].map(({ icon: IconComponent, number, suffix, label }) => (
              <div
                key={label}
                className="stats-card"
                style={{
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                {/* Icon — daylight: brand red via CSS; midnight: amber/red via CSS */}
                <IconComponent className={`stats-card-icon${IconComponent === ChefHat ? " stats-card-icon--red" : ""}`} size={26} aria-hidden="true" />

                {/* Number + suffix */}
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                  <span className="stats-number">
                    {number}
                  </span>
                  {suffix && (
                    <span className="stats-suffix">
                      {suffix}
                    </span>
                  )}
                </span>

                {/* Label */}
                <p className="stats-label">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Outlet location chips — endless left-to-right marquee */}
          <div
            className="stats-marquee"
            style={{
              overflow: "hidden",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {(() => {
              // Dynamic outlet chips from /api/branches — no hardcoded list
              // (previously included "Baraka", which is not a real outlet).
              const chips = (branches || []).filter(b => b.isActive !== false).map(b => b.name);
              const render = (ariaHidden: boolean) =>
                chips.map((chip) => (
                  <span
                    key={chip}
                    aria-hidden={ariaHidden || undefined}
                    className="outlet-chip"
                  >
                    <MapPin size={12} style={{ color: "var(--pc-amber-400)" }} aria-hidden="true" />
                    {chip}
                  </span>
                ));
              return (
                <div className="location-marquee" style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
                  {render(false)}
                  {render(true)}
                </div>
              );
            })()}
          </div>

          {/* Bottom micro strip */}
          <div
            className="stats-strip"
          >
            <span className="stats-strip__text">
              <Leaf size={14} className="stats-strip__icon" aria-hidden="true" />
              100% Fresh Ingredients
            </span>
            <span className="stats-strip__text">
              Order via WhatsApp <MessageCircle size={14} className="stats-strip__icon" aria-hidden="true" />
            </span>
          </div>

        </div>
      </section>

      {/* Special Offers — Peek Carousel Section */}
      <section className="container mx-auto px-4 md:px-8 space-y-6 mt-12 md:mt-16">
        <div className="border-b border-gray-100 pb-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--pc-amber-400)]">Limited-Time Deals</span>
              <span className="text-[10px] bg-[var(--pc-red-500)]/10 text-[var(--pc-red-500)] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">Promo codes</span>
            </div>
            <h3 className="font-playfair font-black text-2xl md:text-3xl text-[var(--pc-gray-700)] flex items-center gap-2">
              <BadgePercent size={26} className="text-[var(--pc-amber-400)]" aria-hidden="true" />
              <span>Special Offers &amp; Promos</span>
            </h3>
            <p className="text-sm text-[var(--pc-gray-500)] max-w-xl font-medium">Explore our top offers below.</p>
          </div>
        </div>

        {isLoadingBanners ? (
          <div className="flex gap-4 overflow-hidden" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-[85%] sm:w-[43%] h-48 sm:h-60 lg:h-[340px] shrink-0 rounded-3xl animate-pulse bg-gray-200/20" />
            ))}
          </div>
        ) : offerBanners.length === 0 ? (
          <div className="w-full text-center py-12 space-y-3">
            <span className="text-3xl block">🏷️</span>
            <p className="text-sm font-black text-[var(--pc-gray-700)]">No active offers</p>
            <p className="text-xs text-[var(--pc-gray-500)]">Check our Instagram for daily flash sales!</p>
          </div>
        ) : (
          <div className="relative -mx-4 md:-mx-8">
            <button
              type="button"
              onClick={() => scrollOffers(-1)}
              aria-label="Previous offers"
              className="hidden lg:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-lg hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => scrollOffers(1)}
              aria-label="Next offers"
              className="hidden lg:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-lg hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>

            <div
              ref={offersTrackRef}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar px-4 md:px-8 scroll-px-4 md:scroll-px-8 pb-2"
            >
              {offerBanners.map((offer, i) => (
                <motion.div
                  key={offer._id ?? i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
                  className="shrink-0 w-[85%] sm:w-[43%] snap-start"
                >
                  <button
                    type="button"
                    onClick={() => handleOfferClick(offer)}
                    aria-label={offer.title}
                    className="offer-card w-full h-48 sm:h-60 lg:h-[340px] rounded-3xl overflow-hidden border border-white/10 shadow-sm hover:shadow-xl hover:border-white/20 cursor-pointer relative bg-[var(--pc-gray-900)] group/card"
                  >
                    <img
                      src={offer.image}
                      alt={getBannerAltText(offer)}
                      className="w-full h-full object-cover group-hover/card:scale-[1.03] transition-transform duration-500"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Menu category slider — same section as the menu page, linked through to category URLs */}
      {showMenuTeasers && (
        <div className="container mx-auto px-4 md:px-8 mt-8 md:mt-12">
          <MenuCategorySlider
            menuItems={menuItems}
            categories={categories}
            selectedId="all"
            onSelect={handleCategorySelect}
          />
        </div>
      )}

      {/* Menu by category — 6 items on desktop (2 full rows), 4 on mobile + View All */}
      {showMenuTeasers && (
        <>
          {featuredItems.length > 0 && (
            <HomeCategorySection
              id="home-cat-featured"
              title="Featured Items"
              subtitle="Our most-loved picks — limited-time favourites."
              items={featuredItems}
              isLoading={isLoadingMenu}
              onOrder={handleAddToCart}
              onQuickView={openQuickView}
              displayToast={displayToast}
            />
          )}

          {categorySections.map((sec) => (
            <HomeCategorySection
              key={sec.id}
              id={sec.id}
              categorySlug={sec.slug}
              title={sec.title}
              subtitle={sec.subtitle}
              items={sec.items}
              isLoading={isLoadingMenu}
              onOrder={handleAddToCart}
              onQuickView={openQuickView}
              displayToast={displayToast}
            />
          ))}
        </>
      )}

      {/* Demo Omani reviews */}
      <HomeReviews id="home-reviews" />

      {/* Location chips from branches API */}
      <HomeLocationChips branches={branches} id="home-locations" />
    </div>
  );
}
