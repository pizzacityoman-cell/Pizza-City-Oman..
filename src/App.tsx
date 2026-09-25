import React, { Suspense, lazy, useState, useEffect, useMemo, useRef } from "react";
import { Routes, Route, Link, Navigate, matchPath, useLocation, useNavigate, useParams } from "react-router-dom";
import Seo from "./components/Seo";
import { PAGE_SEO, SECTION_TO_PATH, SITE_URL, OG_IMAGE, makePageBreadcrumb } from "./lib/seo";
import { LOGO_ALT, getMenuItemAltText } from "./lib/altText";
import { FALLBACK_FOOD_IMAGE } from "./lib/images";
import { 
  Menu as MenuIcon, X, ShoppingCart, MapPin, Lock, Sun, Flame, ShoppingBag, Search, ArrowLeft, Store
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Components
const OutletSelector = lazy(() => import("./components/OutletSelector"));
import LocationGate from "./components/LocationGate";
import Loader from "./components/Loader";
import BottomSheet from "./components/BottomSheet";

// Pages — HomePage stays eager (LCP-critical landing). All other routes & dialogs are
// code-split with React.lazy so the initial bundle only ships what's needed.
import HomePage from "./pages/HomePage";
const MenuPage = lazy(() => import("./pages/MenuPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const LocationDetailPage = lazy(() => import("./pages/LocationDetailPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const FaqPage = lazy(() => import("./pages/FaqPage"));
const TrackOrderPage = lazy(() => import("./pages/TrackOrderPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const ItemDetailPage = lazy(() => import("./pages/ItemDetailPage"));
const ItemDetailContent = lazy(() => import("./components/ItemDetailContent"));
import { getItemDetailData, itemSlug } from "./lib/itemSlug";

// Types & Utils
import { MenuItem, Category, CartEntry, HeroBanner, Branch, BundleSelection, CustomerLocation } from "./types";
import { getEffectiveBasePrice, getOptimizedUnitPrice, getSizeAdjustedPrice, getDefaultSizes } from "./lib/priceUtils";
import type { MenuItemSize } from "./lib/priceUtils";
import { SOCIAL_LINKS } from "./lib/socialLinks";

const CART_STORAGE_KEY = "pizza_city_cart";

export function getBundleSelectionsKey(selections?: BundleSelection[]): string {
  if (!selections || selections.length === 0) return "";
  const sorted = [...selections].sort((a, b) => a.groupId.localeCompare(b.groupId));
  return JSON.stringify(
    sorted.map((g) => ({
      groupId: g.groupId,
      items: [...g.items]
        .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId))
        .map((i) => ({
          id: i.menuItemId,
          q: i.quantity || 1,
        })),
    }))
  );
}

// Shown while a code-split route chunk loads (React.lazy + Suspense).
function RouteFallback() {
  return (
    <div className="flex justify-center py-16" aria-busy="true" aria-label="Loading page">
      <Loader size={140} text="Loading page..." />
    </div>
  );
}

function loadCartFromStorage(): CartEntry[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: any) =>
        e &&
        typeof e === "object" &&
        e.item &&
        typeof e.quantity === "number" &&
        e.quantity > 0 &&
        typeof e.size === "string" &&
        typeof e.unitPrice === "number"
    );
  } catch {
    return [];
  }
}

interface MenuSlugRouteProps {
  categories: Category[];
  menuItems: MenuItem[];
  isLoadingMenu: boolean;
  menuFilter: string;
  setMenuFilter: (f: string) => void;
  addToCart: (item: MenuItem) => void;
  addDirectToCart: (item: MenuItem, size: string, quantity: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  navHidden: boolean;
  displayToast: (msg: string) => void;
  openQuickView: (item: MenuItem) => void;
}

function MenuSlugRoute({
  categories,
  menuItems,
  isLoadingMenu,
  menuFilter,
  setMenuFilter,
  addToCart,
  addDirectToCart,
  searchQuery,
  onSearchChange,
  navHidden,
  displayToast,
  openQuickView,
}: MenuSlugRouteProps) {
  const { slug } = useParams<{ slug: string }>();
  const cleanSlug = (slug || "").toLowerCase();

  const matchedCategory = categories.find(
    (c) => c.slug.toLowerCase() === cleanSlug && c.active !== false
  );

  if (matchedCategory) {
    const title = matchedCategory.seoTitle || `${matchedCategory.name} | Pizza City Oman`;
    const description =
      matchedCategory.seoDescription ||
      matchedCategory.description ||
      `Order ${matchedCategory.name} online from Pizza City Oman via WhatsApp. Fast delivery across Oman.`;
    const canonical = `${SITE_URL}/menu/${matchedCategory.slug}`;

    return (
      <>
        <Seo title={title} description={description} canonical={canonical} />
        <div>
          <MenuPage
            menuItems={menuItems}
            categories={categories}
            isLoadingMenu={isLoadingMenu}
            menuFilter={matchedCategory.slug}
            setMenuFilter={setMenuFilter}
            categorySlug={matchedCategory.slug}
            addToCart={addToCart}
            addDirectToCart={addDirectToCart}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            navHidden={navHidden}
            displayToast={displayToast}
          />
        </div>
      </>
    );
  }

  return (
    <div className="mt-3 md:mt-0">
      <ItemDetailPage
        menuItems={menuItems}
        isLoadingMenu={isLoadingMenu}
        onAdd={addDirectToCart}
        onConfigure={addToCart}
        onQuickView={openQuickView}
        displayToast={displayToast}
      />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const isAdminRoute = currentPath === "/admin";

  // Item quick-view: card taps push /menu/:slug with the previous location stashed,
  // so the background page stays mounted behind the modal.
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  const itemRouteMatch = matchPath("/menu/:slug", location.pathname);
  const rawQuickViewSlug = backgroundLocation ? itemRouteMatch?.params.slug : undefined;
  // While the modal is open, nav/highlight follow the background page, not the item URL.
  const navPath = backgroundLocation ? backgroundLocation.pathname : currentPath;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  // Navbar adopts the full-width category-bar look on the menu route
  const isBarAttached = navPath === "/menu" || navPath.startsWith("/menu/");
  const prevScrollY = useRef(0);
  // Skip the scroll-to-top effect once when opening/closing the quick-view modal
  const skipScrollTopOnce = useRef(false);
  // Active nav section is now derived from the route (multi-page SEO routing).
  const activeSection =
    navPath === "/" ? "home"
    : navPath === "/menu" || navPath.startsWith("/menu/") ? "menu"
    : navPath === "/track-order" || navPath === "/track" ? "track"
    : navPath.startsWith("/locations") ? "locations"
    : navPath === "/contact" ? "contact"
    : navPath === "/faq" ? "faq"
    : "home";

  // Global Theme Selection — dark (midnight oven) is the default.
  // Only explicit "light" opts out; first visit (null) and legacy values land on dark.
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pizza_city_theme") !== "light";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      const root = window.document.documentElement;
      if (isDarkMode) {
        root.classList.add("midnight-oven");
        localStorage.setItem("pizza_city_theme", "midnight_oven");
      } else {
        root.classList.remove("midnight-oven");
        localStorage.setItem("pizza_city_theme", "light");
      }
    } catch (e) {
      console.warn("Theme persistence safe blocked.", e);
    }
  }, [isDarkMode]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);

  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [isLoadingBanners, setIsLoadingBanners] = useState(true);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isAppLoading, setIsAppLoading] = useState(true);

  // Global Customer Location (persisted to localStorage)
  const [customerLocation, setCustomerLocation] = useState<CustomerLocation | null>(() => {
    try {
      const raw = localStorage.getItem("pizza_city_customer_location");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        (
          (parsed.orderType === "pickup" && Boolean(parsed.selectedBranchName)) ||
          (
            typeof parsed.latitude === "number" &&
            typeof parsed.longitude === "number" &&
            Number.isFinite(parsed.latitude) &&
            Number.isFinite(parsed.longitude)
          )
        )
      ) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed reading saved customer location", e);
    }
    return null;
  });

  const [isLocationGateOpen, setIsLocationGateOpen] = useState(false);

  // Prompt location gate on public site entry only when there is no saved location
  useEffect(() => {
    if (!customerLocation && !isAdminRoute) {
      setIsLocationGateOpen(true);
    }
  }, [customerLocation, isAdminRoute]);

  const handleLocationSelect = (loc: CustomerLocation) => {
    setCustomerLocation(loc);
    try {
      localStorage.setItem("pizza_city_customer_location", JSON.stringify(loc));
    } catch (e) {
      console.warn("Could not save customer location", e);
    }
    setIsLocationGateOpen(false);
    displayToast(
      loc.orderType === "pickup" && loc.selectedBranchName
        ? `Pick-up outlet set: ${loc.selectedBranchName}`
        : (loc.address
            ? `Delivery location set: ${loc.address.split(",").slice(0, 2).join(",")}`
            : "Delivery location set!")
    );
  };

  // Global Cart (persisted to localStorage)
  const [cart, setCart] = useState<CartEntry[]>(loadCartFromStorage);
  const [isOutletSelectorOpen, setIsOutletSelectorOpen] = useState(false);
  const [lastPlacedOrderId, setLastPlacedOrderId] = useState<string>(() => {
    try { return localStorage.getItem("pizza_city_last_placed_order_id") || ""; } catch { return ""; }
  });

  const [selectedConfigureItem, setSelectedConfigureItem] = useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>("Medium");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);

  // Filter state for MenuPage (kept global so it persists when returning)
  const [menuFilter, setMenuFilter] = useState<string>("all");

  // Global search (navbar search mode drives the Menu filter)
  const [siteSearch, setSiteSearch] = useState("");
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const navSearchRef = useRef<HTMLInputElement>(null);

  // Matches MenuPage's predicate: name, description (ingredients), category
  const navSearchResults = useMemo(() => {
    const q = siteSearch.toLowerCase().trim();
    if (!q) return [];
    return menuItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [siteSearch, menuItems]);

  const closeNavSearch = (clearQuery = true) => {
    if (clearQuery) setSiteSearch("");
    setNavSearchOpen(false);
  };

  useEffect(() => {
    if (!navSearchOpen) return;
    const t = setTimeout(() => navSearchRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNavSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [navSearchOpen]);

  const goToMenuResults = () => {
    closeNavSearch(false);
    setDrawerOpen(false);
    if (currentPath !== "/menu") navigate("/menu");
  };

  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const displayToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Footer newsletter (validated, no dead form)
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      displayToast("Please enter a valid email address.");
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem("pizza_city_newsletter") || "[]");
      const list = Array.isArray(stored) ? stored : [];
      if (!list.includes(email)) {
        list.push(email);
        localStorage.setItem("pizza_city_newsletter", JSON.stringify(list));
      }
    } catch {
      // storage unavailable — still confirm
    }
    setNewsletterEmail("");
    displayToast("Shukran! You're on the list for exclusive offers.");
  };

  const toSlug = (name: string) =>
    (name || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const footerBranches = useMemo(() => {
    const list = branches && branches.length > 0 ? branches : [];
    return list.filter((b) => b.isActive !== false);
  }, [branches]);

  const refreshMenu = async () => {
    try {
      const [res, catRes] = await Promise.all([fetch("/api/menu"), fetch("/api/categories")]);
      if (res.ok) {
        setMenuItems(await res.json());
      }
      if (catRes.ok) {
        setCategories(await catRes.json());
      }
    } catch (err) {
      console.warn("Live menu sync failure", err);
    }
  };

  useEffect(() => {
    async function loadData() {
      setIsLoadingMenu(true);
      setIsLoadingBanners(true);
      setIsLoadingBranches(true);
      try {
        const [menuRes, bannersRes, branchesRes, catRes] = await Promise.all([
          fetch("/api/menu"),
          fetch("/api/banners"),
          fetch("/api/branches"),
          fetch("/api/categories"),
        ]);
        if (menuRes.ok) setMenuItems(await menuRes.json());
        if (bannersRes.ok) setBanners(await bannersRes.json());
        if (branchesRes.ok) setBranches(await branchesRes.json());
        if (catRes.ok) setCategories(await catRes.json());
      } catch (err) {
        console.warn("Error loading data from server", err);
      } finally {
        setIsLoadingMenu(false);
        setIsLoadingBanners(false);
        setIsLoadingBranches(false);
        setIsAppLoading(false);
      }
    }
    loadData();
  }, []);

  // Route-based navigation (multi-page SEO routing — replaces scrollToSection).
  // Kept under the same name so existing callbacks (footer, drawers, banners)
  // keep working while now producing real indexable URLs.
  const scrollToSection = (sectionId: string) => {
    setDrawerOpen(false);
    const target = SECTION_TO_PATH[sectionId] || "/";
    if (currentPath !== target) {
      navigate(target);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Hide-navbar-on-scroll (applies to all routes now, not just "/")
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      if (y > prevScrollY.current + 5 && y > 120 && !navSearchOpen && !drawerOpen) {
        setNavHidden(true);
      } else if (y < prevScrollY.current - 5) {
        setNavHidden(false);
      }
      prevScrollY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [navSearchOpen, drawerOpen]);

  // Backward compatibility: old hash links (/#menu, /#faq, ...) -> clean routes (/menu, /faq, ...)
  useEffect(() => {
    const hash = (location.hash || window.location.hash || "").replace("#", "");
    if (!hash) return;
    const target = SECTION_TO_PATH[hash];
    if (target && currentPath !== target) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, currentPath]);

  // Scroll to top on route change (after splash).
  // Skipped when opening/closing the item quick-view modal so the background keeps its scroll.
  useEffect(() => {
    if (isAppLoading) return;
    if (skipScrollTopOnce.current) {
      skipScrollTopOnce.current = false;
      return;
    }
    window.scrollTo(0, 0);
    setNavHidden(false);
    prevScrollY.current = 0;
  }, [isAppLoading, currentPath]);

  // Legacy /track alias -> canonical /track-order
  useEffect(() => {
    if (currentPath === "/track") {
      navigate("/track-order", { replace: true });
    }
  }, [currentPath, navigate]);

  const addToCart = (product: MenuItem) => {
    if (product.bundleConfig?.enabled && product.bundleConfig.groups && product.bundleConfig.groups.length > 0) {
      openQuickView(product);
      return;
    }
    setSelectedConfigureItem(product);
    const sizes = product.sizes || getDefaultSizes(product.category);
    setSelectedSize(sizes[0]?.name || "Medium");
    setSelectedQuantity(1);
  };

  const confirmAddToCart = () => {
    if (!selectedConfigureItem) return;
    
    const basePrice = (selectedConfigureItem.discountPrice && selectedConfigureItem.discountPrice < selectedConfigureItem.price)
      ? selectedConfigureItem.discountPrice : selectedConfigureItem.price;
    const itemSizes = selectedConfigureItem.sizes || getDefaultSizes(selectedConfigureItem.category);

    const optimizedPrice = getOptimizedUnitPrice(basePrice, selectedSize, itemSizes, selectedQuantity);

    setCart((prev) => {
      const exists = prev.find(
        (entry) =>
          entry.item._id === selectedConfigureItem._id &&
          entry.size === selectedSize &&
          getBundleSelectionsKey(entry.bundleSelections) === ""
      );
      if (exists) {
        const newQty = exists.quantity + selectedQuantity;
        const reOptimizedPrice = getOptimizedUnitPrice(basePrice, selectedSize, itemSizes, newQty);
        return prev.map((entry) =>
          entry.item._id === selectedConfigureItem._id &&
          entry.size === selectedSize &&
          getBundleSelectionsKey(entry.bundleSelections) === ""
            ? { ...entry, quantity: newQty, unitPrice: reOptimizedPrice }
            : entry
        );
      }
      return [...prev, { item: selectedConfigureItem, quantity: selectedQuantity, size: selectedSize, unitPrice: optimizedPrice }];
    });

    displayToast(`Added ${selectedQuantity}x ${selectedConfigureItem.name} to cart.`);
    setSelectedConfigureItem(null);
    setIsOutletSelectorOpen(true);
  };

  // Direct add from item detail views (size/qty already chosen — same pricing math, no configure modal)
  const addDirectToCart = (
    product: MenuItem,
    size: string,
    quantity: number,
    bundleSelections?: BundleSelection[]
  ) => {
    const basePrice = (product.discountPrice && product.discountPrice < product.price)
      ? product.discountPrice : product.price;
    const itemSizes = product.sizes || getDefaultSizes(product.category);
    const validSize = itemSizes.find((s) => s.name === size) ? size : itemSizes[0]?.name || "Medium";
    const optimizedPrice = getOptimizedUnitPrice(basePrice, validSize, itemSizes, quantity);
    const newBundleKey = getBundleSelectionsKey(bundleSelections);

    setCart((prev) => {
      const exists = prev.find(
        (entry) =>
          entry.item._id === product._id &&
          entry.size === validSize &&
          getBundleSelectionsKey(entry.bundleSelections) === newBundleKey
      );
      if (exists) {
        const newQty = exists.quantity + quantity;
        const reOptimizedPrice = getOptimizedUnitPrice(basePrice, validSize, itemSizes, newQty);
        return prev.map((entry) =>
          entry.item._id === product._id &&
          entry.size === validSize &&
          getBundleSelectionsKey(entry.bundleSelections) === newBundleKey
            ? { ...entry, quantity: newQty, unitPrice: reOptimizedPrice }
            : entry
        );
      }
      return [
        ...prev,
        {
          item: product,
          quantity,
          size: validSize,
          unitPrice: optimizedPrice,
          bundleSelections: bundleSelections && bundleSelections.length > 0 ? bundleSelections : undefined,
        },
      ];
    });

    displayToast(`Added ${quantity}x ${product.name} to cart.`);
    setIsOutletSelectorOpen(true);
  };

  // Item quick-view data + open/close (location plumbing lives near the top of the component)
  const isCategorySlug = rawQuickViewSlug
    ? categories.some((c) => c.slug.toLowerCase() === rawQuickViewSlug.toLowerCase())
    : false;
  const quickViewSlug = isCategorySlug ? undefined : rawQuickViewSlug;

  const quickViewData = useMemo(
    () => (quickViewSlug ? getItemDetailData(menuItems, quickViewSlug) : { item: null, related: [] }),
    [quickViewSlug, menuItems]
  );

  const openQuickView = (product: MenuItem) => {
    skipScrollTopOnce.current = true;
    navigate(`/menu/${itemSlug(product)}`, { state: { backgroundLocation: location } });
  };

  // Tapping a specific navbar search result opens its quick-view modal instead
  // of dumping the raw query onto the menu page (the old goToMenuResults path).
  const selectSearchResult = (product: MenuItem) => {
    setDrawerOpen(false);
    closeNavSearch();
    openQuickView(product);
  };

  const closeQuickView = () => {
    skipScrollTopOnce.current = true;
    if (backgroundLocation) {
      navigate(backgroundLocation.pathname + backgroundLocation.search, { replace: true });
    } else {
      navigate("/menu");
    }
  };

  // Lock body scroll + Escape-to-close while the quick-view modal is open
  useEffect(() => {
    if (!quickViewSlug) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeQuickView();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickViewSlug]);

  const updateCartItem = (index: number, newQty: number, newSize: string) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((_, idx) => idx !== index));
      displayToast("Item removed from cart.");
      return;
    }

    setCart((prev) =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry;
        const basePrice = (entry.item.discountPrice && entry.item.discountPrice < entry.item.price)
          ? entry.item.discountPrice : entry.item.price;
        const itemSizes = entry.item.sizes || getDefaultSizes(entry.item.category);
        const optimizedPrice = getOptimizedUnitPrice(basePrice, newSize, itemSizes, newQty);
        return {
          ...entry,
          quantity: newQty,
          size: newSize,
          unitPrice: optimizedPrice
        };
      })
    );
  };

  // Menu ItemList JSON-LD for the /menu route (names + images only — prices are size-dependent)
  const menuItemListSchema = useMemo(() => {
    const items = menuItems.filter((item) => item.available !== false);
    if (items.length === 0) return undefined;
    return [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Pizza City Oman Menu",
        url: `${SITE_URL}/menu`,
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "MenuItem",
            name: item.name,
            ...(item.description ? { description: item.description } : {}),
            ...(item.image ? { image: item.image } : {}),
          },
        })),
      },
      makePageBreadcrumb("Menu", "/menu"),
    ];
  }, [menuItems]);

  // BreadcrumbList schemas — one per section page (unlocks sitelink breadcrumbs in SERP)
  const locationsSchema = useMemo(() => makePageBreadcrumb("Locations", "/locations"), []);
  const contactSchema   = useMemo(() => makePageBreadcrumb("Contact",   "/contact"),   []);
  const faqSchema       = useMemo(() => makePageBreadcrumb("FAQ",        "/faq"),       []);

  const cartTotalQty = cart.reduce((sum, entry) => sum + entry.quantity, 0);
  const cartTotalPrice = cart.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);

  // Persist cart to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // storage full or unavailable — silently ignore
    }
  }, [cart]);

  const clearCart = () => {
    setCart([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleOrderSuccess = (orderId: string) => {
    setLastPlacedOrderId(orderId);
    try { localStorage.setItem("pizza_city_last_placed_order_id", orderId); } catch {}
    displayToast(`✅ Order ${orderId.slice(-6).toUpperCase()} confirmed! Tracking now...`);
    // Give modal closing animation a moment, then go to the tracker page
    setTimeout(() => navigate("/track-order"), 250);
  };

  const NavItem = ({ sectionId, label, isActive }: { sectionId: string, label: string, isActive: boolean }) => {
    const to = SECTION_TO_PATH[sectionId] || "/";
    return (
      <li className="relative">
        {isActive && (
          <motion.div
            layoutId="nav-active-pill"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] shadow-md shadow-[var(--pc-red-500)]/30"
          />
        )}
        <Link
          to={to}
          className={`relative z-10 px-4 py-1.5 whitespace-nowrap transition-colors hover:text-[var(--pc-red-500)] font-extrabold text-sm cursor-pointer inline-block ${isActive ? "text-white" : "text-inherit"}`}
        >
          {label}
        </Link>
      </li>
    );
  };

  const drawerItems = [
    { id: "home", label: "Home" },
    { id: "menu", label: "Menu Catalog" },
    { id: "track", label: "Track Order" },
    { id: "locations", label: "Locations" },
    { id: "contact", label: "Contact" },
    { id: "faq", label: "FAQs" },
  ];

  return (
    <>
      {isAppLoading && <Loader fullPage text="Pre-heating the ovens..." />}
      <div className={`min-h-screen font-sans antialiased selection:bg-[var(--pc-red-500)]/20 selection:text-[var(--pc-red-500)] flex flex-col transition-colors duration-300 ${isDarkMode ? "midnight-oven bg-[var(--pc-gray-900)] text-[#ffedd4]" : "bg-[var(--pc-gray-100)] text-[var(--pc-gray-600)]"}`}>
      
{!isAdminRoute && (
<>
{/* Navbar — Glass Ember Floating Pill */}
<nav
        id="navbar"
        className={`fixed left-0 right-0 z-40 h-14 md:h-16 ${
          isBarAttached
            ? "w-full max-w-none mx-0 rounded-none top-0 navbar--attached"
            : "w-full mx-0 rounded-none top-0 md:w-[calc(100%-1.5rem)] md:max-w-5xl md:mx-auto md:rounded-full md:top-[max(0.75rem,env(safe-area-inset-top,0px))]"
        } glass-navbar transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
          navHidden ? "-translate-y-[130px]" : ""
        }`}
      >
        {navSearchOpen && (
          <div className="fixed inset-0 -z-10 bg-black/50 backdrop-blur-sm" onClick={() => closeNavSearch()} />
        )}

        <AnimatePresence mode="wait">
          {navSearchOpen ? (
            <motion.div
              key="nav-search"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col w-full h-full px-3 md:px-5"
            >
              <div className="flex items-center gap-2 w-full h-full">
                <button onClick={() => closeNavSearch()} className="p-2 md:p-2.5 rounded-full glass-navbar-btn active:scale-90 transition-all items-center justify-center shrink-0" aria-label="Close search">
                  <ArrowLeft size={16} />
                </button>

                <Search size={16} className="text-[var(--pc-gray-400)] shrink-0" />

                <input
                  ref={navSearchRef}
                  type="text"
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") goToMenuResults(); }}
                  placeholder="Search pizzas, sides, drinks..."
                  className="nav-search-input flex-1 min-w-0 bg-transparent text-sm md:text-base font-body outline-none placeholder:text-[var(--pc-gray-400)]"
                  aria-label="Search menu"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />

                {siteSearch && (
                  <button onClick={() => setSiteSearch("")} className="p-2 rounded-full glass-navbar-btn active:scale-90 transition-all shrink-0" aria-label="Clear search">
                    <X size={16} />
                  </button>
                )}

                <button
                  onClick={goToMenuResults}
                  className="shrink-0 px-3.5 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-[var(--menu-red)] to-[var(--menu-amber)] text-white active:scale-95 transition-transform"
                >
                  Go
                </button>
              </div>

              {navSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] rounded-3xl overflow-hidden glass-navbar nav-search-panel p-2">
                  {navSearchResults.slice(0, 5).map((item) => (
                    <button
                      key={item._id}
                      onClick={() => selectSearchResult(item)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                    >
                      <img
                        src={item.image}
                        alt={getMenuItemAltText(item)}
                        className="w-10 h-10 rounded-xl object-cover shrink-0 bg-white/10"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{item.name}</p>
                        <p className="text-xs opacity-60 capitalize truncate">{item.category}</p>
                      </div>
                      <span className="text-sm font-bold text-[var(--menu-amber)] shrink-0">
                        {getEffectiveBasePrice(item.price, item.discountPrice)} OMR
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {navSearchOpen && siteSearch && navSearchResults.length === 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] rounded-2xl glass-navbar glass-navbar-btn p-4 text-center text-sm">
                  No items match "<span className="text-[var(--menu-amber)] font-semibold">{siteSearch}</span>"
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="nav-default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center justify-between w-full h-full px-3 md:px-5 gap-2"
            >
              <div className="flex items-center cursor-pointer shrink min-w-0" onClick={() => scrollToSection("home")}>
                <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/dfZWWj1nq2KWjIwX/ei_1771693328794-removebg-preview-H1gq480p6x8lYS4E.png" alt={LOGO_ALT} className="h-7 min-[400px]:h-8 sm:h-9 md:h-11 object-contain shrink-0" />
              </div>

              <ul className="hidden md:flex items-center gap-1 font-extrabold text-sm text-[var(--pc-gray-600)]">
                <NavItem sectionId="home" label="Home" isActive={activeSection === "home"} />
                <NavItem sectionId="menu" label="Menu" isActive={activeSection === "menu"} />
                <NavItem sectionId="track" label="Track Order" isActive={activeSection === "track"} />
                <NavItem sectionId="locations" label="Locations" isActive={activeSection === "locations"} />
                <NavItem sectionId="contact" label="Contact" isActive={activeSection === "contact"} />
                <NavItem sectionId="faq" label="FAQs" isActive={activeSection === "faq"} />
              </ul>

              <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
                {/* Location selector trigger */}
                <button
                  onClick={() => setIsLocationGateOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-navbar-btn active:scale-95 transition-all text-xs font-bold max-w-[170px]"
                  title={customerLocation?.orderType === "pickup" && customerLocation.selectedBranchName ? `Pick-up: ${customerLocation.selectedBranchName}` : (customerLocation?.address || "Set Delivery / Pick-Up")}
                >
                  {customerLocation?.orderType === "pickup" ? (
                    <Store size={14} className="text-[var(--pc-red-500)] flex-shrink-0" />
                  ) : (
                    <MapPin size={14} className="text-[var(--pc-red-500)] flex-shrink-0" />
                  )}
                  <span className="truncate">
                    {customerLocation
                      ? (customerLocation.orderType === "pickup" && customerLocation.selectedBranchName
                          ? `Pick-up: ${customerLocation.selectedBranchName}`
                          : (customerLocation.address ? customerLocation.address.split(",")[0] : "GPS Set"))
                      : "Delivery / Pick-Up"}
                  </span>
                </button>

                <button
                  onClick={() => setNavSearchOpen(true)}
                  className="p-2 md:p-2.5 rounded-full glass-navbar-btn active:scale-90 transition-all flex items-center justify-center"
                  aria-label="Search menu"
                >
                  <Search size={16} />
                </button>

                <button
                  onClick={() => { setIsDarkMode(!isDarkMode); displayToast(!isDarkMode ? "Midnight Oven dark mode enabled." : "Switched to light mode."); }}
                  className="hidden md:flex p-2 md:p-2.5 rounded-full glass-navbar-btn active:scale-90 transition-all items-center justify-center"
                  aria-label="Toggle dark mode"
                >
                  {isDarkMode ? <Sun size={16} className="text-amber-400 fill-amber-400/20" /> : <Flame size={16} className="text-[var(--pc-amber-400)] animate-pulse" />}
                </button>

                <button onClick={() => setIsOutletSelectorOpen(true)} className="relative p-2 md:p-2.5 rounded-full glass-navbar-btn active:scale-90 transition-all flex items-center justify-center" aria-label="Open cart">
                  <ShoppingCart size={16} />
                  {cartTotalQty > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--pc-red-500)] text-white font-extrabold text-[10px] rounded-full flex items-center justify-center animate-bounce">{cartTotalQty}</span>}
                </button>

                <button onClick={() => setDrawerOpen(!drawerOpen)} className="md:hidden p-2 md:p-2.5 rounded-full glass-navbar-btn active:scale-90 transition-all flex items-center justify-center" aria-label="Open menu">
                  <MenuIcon size={16} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      </>
      )}

      {!isAdminRoute && (
      <>
      {/* Mobile Drawer — Glass Ember Sheet */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-black md:hidden" />
            <motion.div
              initial={{ x: "115%" }}
              animate={{ x: 0 }}
              exit={{ x: "115%" }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="fixed right-3 top-3 bottom-3 z-50 w-[72%] max-w-[320px] min-w-[250px] md:hidden glass-drawer rounded-[24px] p-4 flex flex-col gap-1 overflow-y-auto"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[var(--pc-red-500)]/10 mb-1">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setDrawerOpen(false); scrollToSection("home"); }}>
                  <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/dfZWWj1nq2KWjIwX/ei_1771693328794-removebg-preview-H1gq480p6x8lYS4E.png" alt={LOGO_ALT} className="h-7 object-contain" />
                </div>
                <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-full glass-navbar-btn active:scale-90 transition-all flex items-center justify-center" aria-label="Close menu">
                  <X size={18} />
                </button>
              </div>

              {/* Delivery location selector in mobile drawer */}
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 }}
                onClick={() => {
                  setDrawerOpen(false);
                  setIsLocationGateOpen(true);
                }}
                className="flex items-center justify-between w-full py-3 px-4 rounded-2xl font-bold text-sm glass-navbar-btn mt-1"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {customerLocation?.orderType === "pickup" ? (
                    <Store size={16} className="text-[var(--pc-red-500)] flex-shrink-0" />
                  ) : (
                    <MapPin size={16} className="text-[var(--pc-red-500)] flex-shrink-0" />
                  )}
                  <span className="truncate">
                    {customerLocation
                      ? (customerLocation.orderType === "pickup" && customerLocation.selectedBranchName
                          ? `Pick-up: ${customerLocation.selectedBranchName}`
                          : `Deliver: ${customerLocation.address ? customerLocation.address.split(",")[0] : "GPS Set"}`)
                      : "Set Delivery / Pick-Up"}
                  </span>
                </span>
                <span className="text-xs text-[var(--pc-red-500)] font-extrabold flex-shrink-0">
                  {customerLocation ? "Change" : "Set"}
                </span>
              </motion.button>

              {/* Theme toggle */}
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                onClick={() => { setIsDarkMode(!isDarkMode); displayToast(!isDarkMode ? "Midnight Oven dark mode enabled." : "Switched to light mode."); }}
                className="flex items-center justify-between w-full py-3 px-4 rounded-2xl font-bold text-sm glass-navbar-btn mt-1"
              >
                <span className="flex items-center gap-2.5">
                  {isDarkMode ? <Sun size={16} className="text-amber-400 fill-amber-400/20" /> : <Flame size={16} className="text-[var(--pc-amber-400)] animate-pulse" />}
                  {isDarkMode ? "Midnight Oven Mode" : "Light Mode"}
                </span>
                <span className={`relative w-10 h-6 rounded-full transition-colors duration-300 ${isDarkMode ? "bg-[var(--pc-red-500)]" : "bg-[var(--pc-black)]/20"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ${isDarkMode ? "left-[18px]" : "left-0.5"}`} />
                </span>
              </motion.button>

              <div className="h-px bg-[var(--pc-red-500)]/10 my-1.5" />

              {drawerItems.map((item, i) => {
                const isActive = activeSection === item.id;
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                    onClick={() => {
                      setDrawerOpen(false);
                      navigate(SECTION_TO_PATH[item.id] || "/");
                    }}
                    className={`py-3 px-4 font-bold rounded-2xl text-left transition-colors ${isActive ? "bg-[var(--pc-red-500)]/10 text-[var(--pc-red-500)]" : "text-[var(--pc-gray-600)] hover:bg-[var(--pc-red-500)]/5 hover:text-[var(--pc-red-500)]"}`}
                  >
                    {item.label}
                  </motion.button>
                );
              })}

              <div className="flex-1" />

            </motion.div>
          </>
        )}
      </AnimatePresence>
      </>
      )}

      {/* Pages Router — multi-page SEO routing: one URL per page.
          When a quick-view modal is open, the background page stays mounted
          (Routes render at backgroundLocation) and the item overlays it. */}
      <div className={`pt-0 ${isAdminRoute ? "" : "md:pt-24"} flex-1 ${cartTotalQty > 0 ? 'pb-24 md:pb-0' : ''}`}>
        <Suspense fallback={<RouteFallback />}>
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={
            <>
              <Seo title={PAGE_SEO.home.title} description={PAGE_SEO.home.description} canonical={PAGE_SEO.home.canonical} ogImage={PAGE_SEO.home.ogImage || OG_IMAGE} />
              <HomePage banners={banners} isLoadingBanners={isLoadingBanners} setActiveTab={(tab) => { const key = tab === 'loc' ? 'locations' : tab; navigate(SECTION_TO_PATH[key] || "/"); }} displayToast={displayToast} onOpenOutletSelector={() => setIsOutletSelectorOpen(true)} menuItems={menuItems} categories={categories} isLoadingMenu={isLoadingMenu} branches={branches} onAddToCart={addToCart} setMenuFilter={setMenuFilter} />
            </>
          } />
          <Route path="/menu" element={
            <>
              <Seo title={PAGE_SEO.menu.title} description={PAGE_SEO.menu.description} canonical={PAGE_SEO.menu.canonical} ogImage={PAGE_SEO.menu.ogImage || OG_IMAGE} schema={menuItemListSchema} schemaId="menu-itemlist-schema" />
              <div>
                <MenuPage menuItems={menuItems} categories={categories} isLoadingMenu={isLoadingMenu} menuFilter={menuFilter} setMenuFilter={setMenuFilter} addToCart={addToCart} addDirectToCart={addDirectToCart} searchQuery={siteSearch} onSearchChange={setSiteSearch} navHidden={navHidden} displayToast={displayToast} />
              </div>
            </>
          } />
          <Route path="/track-order" element={
            <>
              <Seo title={PAGE_SEO.trackOrder.title} description={PAGE_SEO.trackOrder.description} canonical={PAGE_SEO.trackOrder.canonical} />
              <div className="mt-12 md:mt-0">
                <TrackOrderPage trackOrderId={lastPlacedOrderId} displayToast={displayToast} isDarkMode={isDarkMode} />
              </div>
            </>
          } />
          <Route path="/track" element={<Navigate to="/track-order" replace />} />
          <Route path="/locations" element={
            <>
              <Seo title={PAGE_SEO.locations.title} description={PAGE_SEO.locations.description} canonical={PAGE_SEO.locations.canonical} ogImage={PAGE_SEO.locations.ogImage || OG_IMAGE} schema={locationsSchema} schemaId="locations-breadcrumb-schema" />
              <div className="mt-12 md:mt-0">
                <LocationsPage branches={branches} />
              </div>
            </>
          } />
          <Route path="/contact" element={
            <>
              <Seo title={PAGE_SEO.contact.title} description={PAGE_SEO.contact.description} canonical={PAGE_SEO.contact.canonical} ogImage={PAGE_SEO.contact.ogImage || OG_IMAGE} schema={contactSchema} schemaId="contact-breadcrumb-schema" />
              <div className="mt-12 md:mt-0">
                <ContactPage displayToast={displayToast} />
              </div>
            </>
          } />
          <Route path="/faq" element={
            <>
              <Seo title={PAGE_SEO.faq.title} description={PAGE_SEO.faq.description} canonical={PAGE_SEO.faq.canonical} ogImage={PAGE_SEO.faq.ogImage || OG_IMAGE} schema={faqSchema} schemaId="faq-breadcrumb-schema" />
              <div className="mt-12 md:mt-0 pb-16">
                <FaqPage />
              </div>
            </>
          } />
          <Route path="/locations/:slug" element={<LocationDetailPage branches={branches} />} />
          <Route path="/menu/:slug" element={
            <MenuSlugRoute
              categories={categories}
              menuItems={menuItems}
              isLoadingMenu={isLoadingMenu}
              menuFilter={menuFilter}
              setMenuFilter={setMenuFilter}
              addToCart={addToCart}
              addDirectToCart={addDirectToCart}
              searchQuery={siteSearch}
              onSearchChange={setSiteSearch}
              navHidden={navHidden}
              displayToast={displayToast}
              openQuickView={openQuickView}
            />
          } />
          <Route path="/privacy" element={
            <>
              <Seo title={PAGE_SEO.privacy.title} description={PAGE_SEO.privacy.description} canonical={PAGE_SEO.privacy.canonical} />
              <div className="mt-12 md:mt-0">
                <PrivacyPage />
              </div>
            </>
          } />
          <Route path="/terms" element={
            <>
              <Seo title={PAGE_SEO.terms.title} description={PAGE_SEO.terms.description} canonical={PAGE_SEO.terms.canonical} />
              <div className="mt-12 md:mt-0">
                <TermsPage />
              </div>
            </>
          } />
          <Route path="/admin" element={
            <>
              <Seo title="Staff Portal | Pizza City Oman" description="Staff login for Pizza City Oman." canonical={`${SITE_URL}/admin`} noindex />
              <AdminPage displayToast={displayToast} refreshMenu={refreshMenu} isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode(!isDarkMode)} />
            </>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>

        {/* Item quick-view — bottom sheet on mobile, centered modal on desktop.
            Overlay only; direct visits render the full page route instead. */}
        <AnimatePresence>
          {quickViewSlug && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={closeQuickView}
                className="fixed inset-0 z-[55] bg-black md:block hidden"
              />
              {/* Mobile — bottom sheet (swipe-to-dismiss via drag handle) */}
              <div className="md:hidden">
                <BottomSheet
                  isOpen={!!quickViewSlug}
                  onClose={closeQuickView}
                  title={quickViewData.item ? undefined : "Dish not found"}
                >
                  {quickViewData.item ? (
                    <Suspense fallback={<div className="p-8 flex justify-center"><Loader size={64} text="Loading details..." /></div>}>
                      <ItemDetailContent
                        item={quickViewData.item}
                        related={quickViewData.related}
                        menuItems={menuItems}
                        onAdd={(it, size, qty, bundleSelections) => {
                          addDirectToCart(it, size, qty, bundleSelections);
                          closeQuickView();
                        }}
                        onConfigure={addToCart}
                        onQuickView={(rel) => {
                          skipScrollTopOnce.current = true;
                          navigate(`/menu/${itemSlug(rel)}`, {
                            replace: true,
                            state: { backgroundLocation },
                          });
                        }}
                        displayToast={displayToast}
                      />
                    </Suspense>
                  ) : !isLoadingMenu ? (
                    <div className="text-center py-12 space-y-3">
                      <span className="text-3xl block">🍕</span>
                      <p className="font-bold text-sm">Dish not found</p>
                      <button
                        type="button"
                        onClick={closeQuickView}
                        className="px-6 py-2.5 rounded-full bg-[var(--pc-color-primary)] text-white text-sm font-bold cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  ) : (
                    <div className="skeleton-card">
                      <div className="skeleton-card__image skeleton" />
                      <div className="skeleton-card__body">
                        <div className="skeleton-card__title skeleton" />
                        <div className="skeleton-card__desc skeleton" />
                      </div>
                    </div>
                  )}
                </BottomSheet>
              </div>
              {/* Desktop — centered modal (unchanged) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                role="dialog"
                aria-modal="true"
                aria-label={quickViewData.item ? quickViewData.item.name : "Dish quick view"}
                className="hidden md:block fixed inset-x-3 top-[4.5rem] bottom-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:top-24 md:bottom-8 md:w-[min(880px,calc(100%-3rem))] z-[56] rounded-3xl overflow-y-auto p-5 md:p-8 shadow-2xl"
                style={{ background: "var(--pc-color-surface, #fff)" }}
              >
                <button
                  type="button"
                  onClick={closeQuickView}
                  aria-label="Close quick view"
                  className="sticky top-0 ml-auto mb-2 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors cursor-pointer z-10"
                >
                  <X size={16} />
                </button>
                {quickViewData.item ? (
                  <Suspense fallback={<div className="p-8 flex justify-center"><Loader size={64} text="Loading details..." /></div>}>
                    <ItemDetailContent
                      item={quickViewData.item}
                      related={quickViewData.related}
                      menuItems={menuItems}
                      onAdd={(it, size, qty, bundleSelections) => {
                        addDirectToCart(it, size, qty, bundleSelections);
                        closeQuickView();
                      }}
                      onConfigure={addToCart}
                      onQuickView={(rel) => {
                        skipScrollTopOnce.current = true;
                        navigate(`/menu/${itemSlug(rel)}`, {
                          replace: true,
                          state: { backgroundLocation },
                        });
                      }}
                      displayToast={displayToast}
                    />
                  </Suspense>
                ) : !isLoadingMenu ? (
                  <div className="text-center py-12 space-y-3">
                    <span className="text-3xl block">🍕</span>
                    <p className="font-bold text-sm">Dish not found</p>
                    <button
                      type="button"
                      onClick={closeQuickView}
                      className="px-6 py-2.5 rounded-full bg-[var(--pc-color-primary)] text-white text-sm font-bold cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div className="skeleton-card">
                    <div className="skeleton-card__image skeleton" />
                    <div className="skeleton-card__body">
                      <div className="skeleton-card__title skeleton" />
                      <div className="skeleton-card__desc skeleton" />
                    </div>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Shared Footer (all public routes) */}
        {!isAdminRoute && (
        <footer className="bg-[var(--pc-gray-700)] py-12 md:py-16 mt-8 rounded-t-[40px] shadow-2xl" style={{ color: "var(--pc-color-footer-text)" }}>
          <div className="container mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <img src="https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=768,fit=crop/dfZWWj1nq2KWjIwX/ei_1771693328794-removebg-preview-H1gq480p6x8lYS4E.png" alt={LOGO_ALT} className="h-10 md:h-12 object-contain brightness-0 invert opacity-90" />
              <p className="text-sm leading-relaxed">Authentic handcrafted oven-baked pizzas, hand-kneaded signature sourdough bases, and premium Omani ingredients.</p>
            </div>
            <div>
              <h4 className="text-white font-playfair font-black text-lg mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm font-bold">
                <li><Link to="/" className="hover:text-[var(--pc-amber-400)] transition-colors">Home</Link></li>
                <li><Link to="/menu" className="hover:text-[var(--pc-amber-400)] transition-colors">Menu Catalog</Link></li>
                <li><Link to="/track-order" className="hover:text-[var(--pc-amber-400)] transition-colors">Track Order</Link></li>
                <li><Link to="/locations" className="hover:text-[var(--pc-amber-400)] transition-colors">Locations</Link></li>
                <li><Link to="/contact" className="hover:text-[var(--pc-amber-400)] transition-colors">Contact</Link></li>
                <li><Link to="/faq" className="hover:text-[var(--pc-amber-400)] transition-colors">FAQs</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-playfair font-black text-lg mb-4">Contact Info</h4>
              <ul className="space-y-2 text-sm font-bold">
                <li>Muscat, Oman</li>
                <li>
                  <a href="tel:+96896928714" className="hover:text-[var(--pc-amber-400)] transition-colors">
                    Phone: +968 9692 8714
                  </a>
                </li>
                <li>
                  <a
                    href="https://wa.me/96896928714?text=Hi%20Pizza%20City!%20I%20want%20to%20order."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--pc-amber-400)] transition-colors"
                  >
                    WhatsApp: Order directly
                  </a>
                </li>
                <li>
                  <a href="mailto:info@pizzacityoman.com" className="hover:text-[var(--pc-amber-400)] transition-colors">
                    info@pizzacityoman.com
                  </a>
                </li>
                <li>Open Daily: 11 AM - 2 AM</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-playfair font-black text-lg mb-4">Newsletter</h4>
              <p className="text-sm mb-4">Subscribe for exclusive offers and secret menu drops.</p>
              <form
                onSubmit={handleNewsletterSubmit}
                className="flex bg-white/5 rounded-xl overflow-hidden p-1 focus-within:ring-2 ring-[var(--pc-amber-400)]/50 border border-white/10"
              >
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder="Your email address"
                  aria-label="Email address for newsletter"
                  className="bg-transparent border-none outline-none px-4 py-2 text-white text-sm w-full placeholder:text-white/40"
                />
                <button
                  type="submit"
                  className="bg-[var(--pc-amber-400)] text-[#1A0A00] px-4 py-2 rounded-lg font-bold text-sm hover:brightness-110 active:scale-95 transition-all"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
          {footerBranches.length > 0 && (
            <nav aria-label="Our outlets" className="container mx-auto px-4 md:px-8 mt-10 flex flex-wrap gap-2">
              {footerBranches.map((b) => (
                <Link
                  key={b._id || b.name}
                  to={`/locations/${toSlug(b.name)}`}
                  className="text-xs font-bold px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Pizza in {b.name}
                </Link>
              ))}
              <Link
                to="/menu"
                className="text-xs font-bold px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors"
              >
                Pizza Menu Oman — Prices in OMR
              </Link>
            </nav>
          )}
          <div className="container mx-auto px-4 md:px-8 mt-12 pt-8 border-t border-white/10 flex flex-col items-center gap-4 text-xs font-bold tracking-wider md:flex-row md:justify-between">
            <p className="order-1">&copy; {new Date().getFullYear()} Pizza City Oman. All rights reserved.</p>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={social.label}
                  className="w-9 h-9 rounded-full bg-white flex items-center justify-center transition-all hover:bg-[var(--pc-amber-400)] hover:scale-110"
                >
                  <img src={social.icon} alt={social.label} className="w-4.5 h-4.5" />
                </a>
              ))}
            </div>
            <div className="flex gap-4 items-center order-3">
              <Link to="/admin" className="hover:text-white cursor-pointer flex items-center gap-1.5 transition-colors">
                <Lock size={12} /> Staff Portal
              </Link>
              <Link to="/privacy" className="hover:text-white cursor-pointer transition-colors">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-white cursor-pointer transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </footer>
        )}
      </div>

      {/* Overlays & Modals */}
      {!isAdminRoute && (
      <>
      <LocationGate
        isOpen={isLocationGateOpen}
        onClose={() => setIsLocationGateOpen(false)}
        onLocationSelected={handleLocationSelect}
        currentLocation={customerLocation}
        canDismiss={true}
        branches={branches}
      />

      <Suspense fallback={null}>
        <OutletSelector 
          isOpen={isOutletSelectorOpen} 
          onClose={() => setIsOutletSelectorOpen(false)} 
          cart={cart} 
          onClearCart={clearCart} 
          onShowToast={displayToast} 
          branches={branches} 
          onUpdateCartItem={updateCartItem}
          menuItems={menuItems}
          onBrowseMenu={() => {
            setIsOutletSelectorOpen(false);
            navigate("/menu");
          }}
          onAddToCart={addToCart}
          onOrderSuccess={handleOrderSuccess}
          customerLocation={customerLocation}
          onChangeLocation={() => setIsLocationGateOpen(true)}
        />
      </Suspense>
      
      <AnimatePresence>
        {selectedConfigureItem && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setSelectedConfigureItem(null)} className="fixed inset-0 z-[60] bg-black" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[90%] max-w-sm bg-white rounded-3xl p-6 shadow-2xl">

              {/* Item Header */}
              <div className="flex items-center gap-3 mb-5">
                <img
                  src={selectedConfigureItem.image || FALLBACK_FOOD_IMAGE}
                  alt={getMenuItemAltText(selectedConfigureItem)}
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-2xl tracking-wide text-[var(--pc-color-text-primary-light)]">Configure</h3>
                  <p className="font-body font-bold text-sm text-[var(--pc-color-text-secondary-light)] truncate">{selectedConfigureItem.name}</p>
                </div>
                <button onClick={() => setSelectedConfigureItem(null)} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-[var(--pc-color-text-muted-light)] flex items-center justify-center transition-colors flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              {/* Size Picker with Prices */}
              {(() => {
                const configSizes = selectedConfigureItem.sizes || getDefaultSizes(selectedConfigureItem.category);
                const basePrice = (selectedConfigureItem.discountPrice && selectedConfigureItem.discountPrice < selectedConfigureItem.price)
                  ? selectedConfigureItem.discountPrice : selectedConfigureItem.price;
                const cols = Math.min(configSizes.length, 3);
                return (
                  <>
                    <div className={`grid gap-2 mb-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {configSizes.map(s => {
                        const sizePrice = getSizeAdjustedPrice(basePrice, s.name, configSizes);
                        const isActive = selectedSize === s.name;
                        return (
                          <button key={s.name} onClick={() => setSelectedSize(s.name)}
                            className={`min-w-0 flex flex-col items-center py-3 px-1 rounded-xl border font-bold text-[13px] transition-all ${
                              isActive
                                ? "bg-[var(--pc-color-primary)] text-white border-transparent shadow-md"
                                : "bg-white text-[var(--pc-color-text-muted-light)] border-[var(--pc-color-border-light)] hover:border-[var(--pc-color-primary)] hover:text-[var(--pc-color-primary)]"
                            }`}
                          >
                            <span className="font-body whitespace-nowrap">{s.label}</span>
                            <span className={`text-[10px] mt-0.5 ${isActive ? "text-white/80" : "text-[var(--pc-color-primary)]"}`}>
                              OMR {sizePrice.toFixed(3)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Size Info Strip — shown when sizes have metadata */}
                    {configSizes.some(s => s.inch || s.slices) && (
                      <div className="bg-gray-50 border border-[var(--pc-color-border-light)] rounded-xl p-2.5 mb-4 grid gap-2 text-center text-[10px] leading-tight" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                        {configSizes.map((s, i) => {
                          const parts: string[] = [];
                          if (s.inch) parts.push(`${s.inch}"`);
                          if (s.slices) parts.push(`${s.slices} slices`);
                          return (
                            <div key={s.name} className={`p-1 ${i > 0 ? 'border-l border-[var(--pc-color-border-light)]' : ''}`}>
                              <span className="font-black text-[var(--pc-color-primary)]">{s.label}</span>
                              {parts.length > 0 && <p className="text-[var(--pc-color-text-secondary-light)] mt-0.5">{parts.join(' · ')}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Quantity & Price Summary */}
                    <div className="bg-gray-50 border border-[var(--pc-color-border-light)] rounded-xl p-3 mb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-body font-bold text-xs text-[var(--pc-color-text-secondary-light)]">Quantity</span>
                        <div className="flex items-center gap-3 bg-white rounded-lg border border-[var(--pc-color-border-light)] p-1">
                          <button onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))} className="w-8 h-8 rounded-md bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold text-sm text-[var(--pc-color-text-primary-light)] transition-colors">-</button>
                          <span className="font-body font-black text-base min-w-[24px] text-center text-[var(--pc-color-text-primary-light)]">{selectedQuantity}</span>
                          <button onClick={() => setSelectedQuantity(selectedQuantity + 1)} className="w-8 h-8 rounded-md bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold text-sm text-[var(--pc-color-text-primary-light)] transition-colors">+</button>
                        </div>
                      </div>
                      <div className="border-t border-dashed border-[var(--pc-color-border-light)] pt-2 flex justify-between items-center">
                        <span className="font-body text-xs text-[var(--pc-color-text-secondary-light)]">Total</span>
                        <span className="font-body font-black text-[var(--pc-color-primary)]">
                          OMR {(getSizeAdjustedPrice(basePrice, selectedSize, configSizes) * selectedQuantity).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Confirm Button */}
              <button onClick={confirmAddToCart} className="w-full py-3.5 bg-gradient-to-r from-[var(--pc-color-primary)] to-[var(--pc-color-cta)] text-white font-body font-black rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[var(--pc-color-primary)]/25">
                Confirm Add to Cart
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </>
      )}

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            onClick={() => setShowToast(false)}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] toast-popup px-6 py-3.5 rounded-full flex items-center gap-3 cursor-pointer select-none max-w-[90vw] text-center"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--pc-amber-400)] animate-ping shrink-0" />
            <span className="text-xs sm:text-sm font-extrabold tracking-wide text-white leading-snug">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sticky Cart Bar */}
      {!isAdminRoute && cartTotalQty > 0 && (
        <div className="mobile-cart-bar md:hidden" onClick={() => setIsOutletSelectorOpen(true)}>
          {/* Thumbnail strip */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center -space-x-2 flex-shrink-0">
              {cart.slice(0, 3).map((entry, i) => (
                <img
                  key={i}
                  src={entry.item.image || ""}
                  alt={entry.item.name}
                  className="w-9 h-9 rounded-full object-cover border-2 border-[rgba(43,17,0,0.97)] flex-shrink-0"
                  style={{ zIndex: 3 - i }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ))}
              {cart.length > 3 && (
                <div className="w-9 h-9 rounded-full bg-white/10 border-2 border-[rgba(43,17,0,0.97)] flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ zIndex: 0 }}>
                  +{cart.length - 3}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="mobile-cart-bar__count">
                {cartTotalQty} {cartTotalQty === 1 ? "item" : "items"}
              </p>
              <p className="mobile-cart-bar__total">
                <span className="currency">OMR</span> {cartTotalPrice.toFixed(3)}
              </p>
            </div>
          </div>
          <button className="mobile-cart-bar__btn flex-shrink-0">
            View Cart →
          </button>
        </div>
      )}
    </div>
    </>
  );
}

