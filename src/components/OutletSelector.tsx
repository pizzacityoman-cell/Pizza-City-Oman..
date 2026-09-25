import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Search,
  ShoppingCart,
  MessageSquare,
  MapPin,
  Info,
  Plus,
  Minus,
  Phone,
  Tag,
  AlertCircle,
  CheckCircle,
  Store,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  Ruler,
  Flame,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { MenuItem, CartEntry, Branch, CustomerLocation } from "../types";
import { getVolumeDiscountPercentage, getSizeAdjustedPrice, getDefaultSizes } from "../lib/priceUtils";
import { getMenuItemAltText } from "../lib/altText";
import { FALLBACK_FOOD_IMAGE } from "../lib/images";
import { sortBranchesByDistance, isBranchEligible, DEFAULT_DELIVERY_RADIUS_KM } from "../lib/location";
import type { MenuItemSize } from "../lib/priceUtils";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import Loader from "./Loader";

// ─── Step Progress ──────────────────────────────────────────────────────────

function StepProgress({ step }: { step: "checkout" | "outlet" }) {
  const steps = [
    { id: "checkout", label: "Your Details" },
    { id: "outlet", label: "Pick Outlet" },
  ];

  return (
    <div className="cp-step-progress">
      {steps.map((s, idx) => {
        const isActive = step === s.id;
        const isCompleted = step === "outlet" && s.id === "checkout";
        const isLast = idx === steps.length - 1;

        return (
          <React.Fragment key={s.id}>
            <div className={`cp-step ${isActive ? "cp-step--active" : ""} ${isCompleted ? "cp-step--completed" : ""}`}>
              <div className="cp-step__dot">
                {isCompleted ? (
                  <CheckCircle size={12} strokeWidth={3} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span className="cp-step__label hidden sm:inline">{s.label}</span>
            </div>
            {!isLast && (
              <div className={`cp-step__line ${isCompleted ? "cp-step__line--done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Cart Item Card ──────────────────────────────────────────────────────────

interface CartItemCardProps {
  key?: string;
  entry: CartEntry;
  index: number;
  onUpdate: (index: number, qty: number, size: string) => void;
}

function CartItemCard({ entry, index, onUpdate }: CartItemCardProps) {
  const itemSizes = entry.item.sizes || getDefaultSizes(entry.item.category);
  const hasMultipleSizes = itemSizes.length > 1;
  const discountPct = getVolumeDiscountPercentage(entry.quantity);
  const isDiscounted = discountPct > 0;
  const lineTotal = entry.unitPrice * entry.quantity;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, scale: 0.95 }}
      transition={{ type: "spring", damping: 26, stiffness: 300 }}
      className="cp-cart-item"
    >
      {/* Image */}
      <div className="cp-cart-item__img-wrap">
        <img
          src={entry.item.image || FALLBACK_FOOD_IMAGE}
          alt={getMenuItemAltText(entry.item)}
          className="cp-cart-item__img"
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
          }}
        />
        {isDiscounted && (
          <span className="cp-cart-item__badge">-{discountPct}%</span>
        )}
      </div>

      {/* Body */}
      <div className="cp-cart-item__body">
        <div className="cp-cart-item__top">
          <div className="cp-cart-item__meta">
            <h5 className="cp-cart-item__name">{entry.item.name}</h5>
            {hasMultipleSizes && (
              <span className="cp-cart-item__size">
                Size: <strong>{entry.size}</strong>
              </span>
            )}
            {entry.bundleSelections && entry.bundleSelections.length > 0 && (
              <div className="cp-cart-item__bundles">
                {entry.bundleSelections.map((grp, gIdx) => (
                  <div key={gIdx} className="cp-cart-item__bundle-row">
                    <span className="font-bold">{grp.groupTitle}:</span>{" "}
                    {grp.items.map((opt) => `${opt.quantity && opt.quantity > 1 ? `${opt.quantity}x ` : ""}${opt.name}`).join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="cp-cart-item__price-col">
            <span className="cp-cart-item__price">OMR {lineTotal.toFixed(3)}</span>
            <span className="cp-cart-item__unit-price">× OMR {entry.unitPrice.toFixed(3)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="cp-cart-item__controls">
          {/* Size dropdown */}
          {hasMultipleSizes && (
            <select
              value={entry.size}
              onChange={(e) => onUpdate(index, entry.quantity, e.target.value)}
              className="cp-size-select"
              aria-label="Select size"
            >
              {itemSizes.map((s) => (
                <option key={s.name} value={s.name}>{s.label}</option>
              ))}
            </select>
          )}

          {/* Qty stepper */}
          <div className="cp-qty-stepper">
            <button
              onClick={() => onUpdate(index, entry.quantity - 1, entry.size)}
              aria-label={`Decrease ${entry.item.name}`}
              className="cp-qty-stepper__btn cp-qty-stepper__btn--minus"
            >
              {entry.quantity === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
            </button>
            <span className="cp-qty-stepper__val">{entry.quantity}</span>
            <button
              onClick={() => onUpdate(index, entry.quantity + 1, entry.size)}
              aria-label={`Increase ${entry.item.name}`}
              className="cp-qty-stepper__btn"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Props & Component ───────────────────────────────────────────────────────

interface OutletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartEntry[];
  onClearCart: () => void;
  onShowToast: (msg: string) => void;
  onUpdateCartItem: (index: number, newQty: number, newSize: string) => void;
  onOrderSuccess?: (orderId: string) => void;
  branches?: Branch[];
  menuItems?: MenuItem[];
  onBrowseMenu?: () => void;
  onAddToCart?: (item: MenuItem) => void;
  customerLocation?: CustomerLocation | null;
  onChangeLocation?: () => void;
}

export default function OutletSelector({
  isOpen,
  onClose,
  cart,
  onClearCart,
  onShowToast,
  onUpdateCartItem,
  onOrderSuccess,
  branches,
  menuItems,
  onBrowseMenu,
  onAddToCart,
  customerLocation,
  onChangeLocation,
}: OutletSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOutlet, setSelectedOutlet] = useState<string | null>(null);
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (branches && branches.length > 0) {
      setLocalBranches(branches.filter((b) => b.isActive !== false));
      return;
    }
    setIsLoadingBranches(true);
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data) => setLocalBranches(data.filter((b: any) => b.isActive !== false)))
      .catch((err) => console.warn("Failed fetching active branches:", err))
      .finally(() => setIsLoadingBranches(false));
  }, [isOpen, branches]);

  // Customer details
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"checkout" | "outlet">("checkout");
  const [showSizeChart, setShowSizeChart] = useState(false);

  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string;
    shortId: string;
    whatsappUrl: string;
    outletName: string;
    total: number;
  } | null>(null);

  // Promo
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<any | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState("");

  const hasMultipleSizeItems = cart.some((entry) => {
    const s = entry.item.sizes || getDefaultSizes(entry.item.category);
    return s.length > 1;
  });
  const totalAmount = cart.reduce((sum, e) => sum + e.unitPrice * e.quantity, 0);
  const discountAmount = appliedPromo
    ? appliedPromo.discountType === "percentage"
      ? totalAmount * (appliedPromo.discountValue / 100)
      : appliedPromo.discountValue
    : 0;
  const finalAmount = Math.max(0, totalAmount - discountAmount);

  useEffect(() => {
    if (appliedPromo && appliedPromo.minOrderAmount > 0 && totalAmount < appliedPromo.minOrderAmount) {
      setPromoError(`Cart total must be at least OMR ${appliedPromo.minOrderAmount.toFixed(3)} to keep this promo.`);
      setAppliedPromo(null);
      setPromoCodeInput("");
    }
  }, [totalAmount, appliedPromo]);

  useEffect(() => {
    if (!isOpen) setOrderSuccess(null);
  }, [isOpen]);

  // Lock body scroll when panel open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const isPickup = customerLocation?.orderType === "pickup";

  const sortedBranchInfos = React.useMemo(() => {
    const list = sortBranchesByDistance(customerLocation, localBranches);
    if (isPickup) {
      return list.map((info) => ({
        ...info,
        eligible: info.branch.isActive !== false,
        reason: info.branch.isActive === false ? "Branch temporarily closed" : undefined,
      }));
    }
    return list;
  }, [customerLocation, localBranches, isPickup]);

  const q = searchQuery.toLowerCase().trim();
  const filteredBranchInfos = React.useMemo(() => {
    if (!q) return sortedBranchInfos;
    return sortedBranchInfos.filter(
      (info) =>
        info.branch.name.toLowerCase().includes(q) ||
        info.branch.address.toLowerCase().includes(q)
    );
  }, [sortedBranchInfos, q]);

  const eligibleBranches = React.useMemo(
    () => filteredBranchInfos.filter((b) => b.eligible),
    [filteredBranchInfos]
  );

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) { setPromoError("Code cannot be empty."); return; }
    setIsValidatingPromo(true);
    setPromoError("");
    try {
      const response = await fetch("/api/promos/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCodeInput.trim().toUpperCase(), cartTotal: totalAmount }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setAppliedPromo(data.promo);
        onShowToast(`Code "${data.promo.code.toUpperCase()}" applied!`);
        setPromoError("");
      } else {
        setPromoError(data.error || "Invalid code.");
        setAppliedPromo(null);
      }
    } catch {
      setPromoError("Network error validating promo.");
      setAppliedPromo(null);
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleClearPromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    setPromoError("");
  };

  const handleOrderSubmission = async (outletName: string) => {
    const targetBranch = localBranches.find(
      (b) => b.name.toLowerCase().trim() === outletName.toLowerCase().trim()
    );

    if (targetBranch && customerLocation && !isPickup) {
      const eligibility = isBranchEligible(customerLocation, targetBranch);
      if (!eligibility.eligible) {
        onShowToast(`Cannot deliver from ${outletName}: ${eligibility.reason || "Outside delivery radius"}`);
        return;
      }
    }

    if (!customerName.trim()) { onShowToast("Please enter your name."); setStep("checkout"); return; }
    if (!customerPhone.trim()) { onShowToast("Please enter your WhatsApp phone number."); setStep("checkout"); return; }
    const cleaned = customerPhone.replace(/\D/g, "");
    if (cleaned.length < 8 || cleaned.length > 15) {
      onShowToast("Please enter a valid phone number (8-15 digits including country code).");
      setStep("checkout");
      return;
    }

    setIsSubmitting(true);
    onShowToast("Saving your order to database...");

    const orderPayload = {
      items: cart.map((entry) => {
        const itemSizes = entry.item.sizes || getDefaultSizes(entry.item.category);
        const hasMultipleSizes = itemSizes.length > 1;
        return {
          menuItemId: entry.item._id,
          name: hasMultipleSizes ? `${entry.item.name} [Size: ${entry.size}]` : entry.item.name,
          size: hasMultipleSizes ? entry.size : undefined,
          quantity: entry.quantity,
          bundleSelections:
            entry.bundleSelections && entry.bundleSelections.length > 0
              ? entry.bundleSelections
              : undefined,
        };
      }),
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail || undefined,
        notes: customerNotes || undefined,
      },
      outlet: outletName,
      orderType: isPickup ? "pickup" : "delivery",
      promoCode: appliedPromo ? appliedPromo.code : undefined,
      deliveryLocation:
        !isPickup && customerLocation
          ? {
              latitude: customerLocation.latitude,
              longitude: customerLocation.longitude,
              accuracy: customerLocation.accuracy,
              address: customerLocation.address || customerNotes || undefined,
              source: customerLocation.source,
            }
          : undefined,
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save order");

      if (data.order && data.order._id) {
        try {
          const stored = localStorage.getItem("pizza_city_recent_tracked_orders");
          let currentList: string[] = stored ? JSON.parse(stored) : [];
          if (!currentList.includes(data.order._id)) {
            currentList = [data.order._id, ...currentList].slice(0, 5);
            localStorage.setItem("pizza_city_recent_tracked_orders", JSON.stringify(currentList));
          }
          localStorage.setItem("pizza_city_last_placed_order_id", data.order._id);
        } catch (e) {
          console.error("Local storage error:", e);
        }
      }

      try {
        const bc = new BroadcastChannel("pizza_city_menu_channel");
        bc.postMessage({ type: "NEW_ORDER_PLACED", order: data.order });
        bc.close();
      } catch {}
      window.dispatchEvent(new CustomEvent("pizza_city_new_order_placed", { detail: data.order }));

      const shortId = data.order._id.toString().slice(-6).toUpperCase();
      const successTotal = data.order.total ?? finalAmount;

      setOrderSuccess({
        orderId: data.order._id,
        shortId,
        whatsappUrl: data.whatsappUrl || "",
        outletName,
        total: successTotal,
      });

      onShowToast(`🎉 Order ${shortId} placed successfully! Opening WhatsApp...`);

      if (data.whatsappUrl) {
        try {
          window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
        } catch {}
      }
    } catch (err: any) {
      console.error(err);
      onShowToast("Error placing order: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setCustomerNotes("");
    setPromoCodeInput("");
    setAppliedPromo(null);
    setPromoError("");
    setSelectedOutlet(null);
    setStep("checkout");
  };

  const handleCloseSuccess = () => {
    onClearCart();
    resetForm();
    setOrderSuccess(null);
    onClose();
  };

  const handleTrackOrder = () => {
    if (!orderSuccess) return;
    const { orderId } = orderSuccess;
    onClearCart();
    resetForm();
    const capturedId = orderId;
    setOrderSuccess(null);
    onClose();
    if (onOrderSuccess) onOrderSuccess(capturedId);
  };

  const handleOpenWhatsapp = () => {
    if (orderSuccess?.whatsappUrl) window.open(orderSuccess.whatsappUrl, "_blank");
  };

  if (!isOpen) return null;

  const cartQty = cart.reduce((s, e) => s + e.quantity, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cp-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-[58] bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="cp-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260, mass: 0.9 }}
            className="cp-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Submitting overlay */}
            {isSubmitting && (
              <div className="absolute inset-0 z-[10] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-[inherit]">
                <Loader size={64} text="Baking your order..." />
              </div>
            )}

            {/* ── HEADER ── */}
            <div className="cp-panel__header">
              {orderSuccess ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="cp-panel__title">Order Confirmed!</h3>
                      <p className="cp-panel__subtitle">Track your order in real-time</p>
                    </div>
                  </div>
                  <button onClick={handleCloseSuccess} className="cp-icon-btn" aria-label="Close">
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {step === "checkout" ? (
                        <div className="cp-header-icon">
                          <ShoppingCart size={18} />
                        </div>
                      ) : (
                        <div className="cp-header-icon cp-header-icon--outlet">
                          <MapPin size={18} />
                        </div>
                      )}
                      <div>
                        <h3 className="cp-panel__title">
                          {step === "checkout" ? "Your Cart" : "Select Outlet"}
                        </h3>
                        <p className="cp-panel__subtitle">
                          {step === "checkout"
                            ? `${cartQty} ${cartQty === 1 ? "item" : "items"} · OMR ${finalAmount.toFixed(3)}`
                            : "Choose a Pizza City branch"}
                        </p>
                      </div>
                    </div>
                    <button onClick={onClose} className="cp-icon-btn" aria-label="Close cart">
                      <X size={18} />
                    </button>
                  </div>
                  {cart.length > 0 && <StepProgress step={step} />}
                </div>
              )}
            </div>

            {/* ── SCROLLABLE BODY ── */}
            <div className="cp-panel__body">

              {/* ══ ORDER SUCCESS VIEW ══ */}
              {orderSuccess ? (
                <div className="flex flex-col items-center text-center gap-5 py-4">
                  <div className="w-24 h-24 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center shadow-inner">
                    <CheckCircle size={48} className="text-green-500" />
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="font-display text-2xl text-[var(--pc-color-text-primary-light)]">
                      Thank you, {customerName || "Pizza Lover"}! 🎉
                    </h4>
                    <p className="text-sm text-[var(--pc-color-text-secondary-light)] leading-relaxed max-w-xs mx-auto">
                      Your order is confirmed at{" "}
                      <span className="font-bold text-[var(--pc-color-text-primary-light)]">
                        Pizza City — {orderSuccess.outletName}
                      </span>{" "}
                      and is now being prepared.
                    </p>
                  </div>

                  <div className="w-full cp-order-ref-card">
                    <div className="cp-order-ref-card__row">
                      <span className="cp-order-ref-card__label">Order Reference</span>
                      <span className="cp-order-ref-card__badge">#{orderSuccess.shortId}</span>
                    </div>
                    <div className="cp-order-ref-card__id-row">
                      <div className="text-left min-w-0">
                        <p className="cp-order-ref-card__id-label">Full Order ID</p>
                        <p className="cp-order-ref-card__id font-mono">{orderSuccess.orderId}</p>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(orderSuccess.orderId); onShowToast("Order ID copied!"); }}
                        className="cp-order-ref-card__copy-btn"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="cp-order-ref-card__total-row">
                      <span>Total Charged</span>
                      <span className="font-black text-[var(--pc-color-primary)]">OMR {orderSuccess.total.toFixed(3)}</span>
                    </div>
                  </div>

                  <div className="w-full space-y-3">
                    <button onClick={handleTrackOrder} className="cp-btn cp-btn--primary w-full">
                      <MapPin size={16} /> Track My Order Live
                    </button>
                    {orderSuccess.whatsappUrl && (
                      <button onClick={handleOpenWhatsapp} className="cp-btn cp-btn--wa w-full">
                        <MessageSquare size={16} /> Open WhatsApp Invoice
                      </button>
                    )}
                    <button onClick={handleCloseSuccess} className="cp-btn cp-btn--ghost w-full">
                      Continue Shopping
                    </button>
                  </div>

                  <p className="text-[11px] text-[var(--pc-color-text-muted-light)] leading-relaxed">
                    Save your ID <span className="font-mono font-bold">#{orderSuccess.shortId}</span> to track baking & delivery in real-time.
                  </p>
                </div>

              ) : cart.length === 0 ? (
                /* ══ EMPTY CART ══ */
                <div className="flex flex-col items-center justify-center text-center gap-6 py-10 h-full">
                  <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-[var(--pc-color-border-light)] shadow-sm">
                    <ShoppingBag size={44} className="text-[var(--pc-color-primary)] opacity-50" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-display text-3xl text-[var(--pc-color-text-primary-light)]">Your Cart is Hungry</h3>
                    <p className="text-sm text-[var(--pc-color-text-secondary-light)]">No handcrafted pizzas added yet.</p>
                  </div>

                  {menuItems && menuItems.length > 0 && (
                    <div className="w-full space-y-3">
                      <h4 className="flex items-center gap-2 font-extrabold text-xs text-[var(--pc-color-text-primary-light)] uppercase tracking-widest border-b border-gray-100 pb-2 text-left">
                        <Flame size={14} className="text-[var(--pc-color-cta)]" /> Popular Picks
                      </h4>
                      <div className="grid grid-cols-2 gap-2.5">
                        {menuItems.filter((i) => i.available !== false).slice(0, 4).map((item) => (
                          <div key={item._id} className="cp-empty-rec-card group">
                            <img
                              src={item.image || FALLBACK_FOOD_IMAGE}
                              alt={getMenuItemAltText(item)}
                              className="w-full h-24 object-cover rounded-xl mb-2 group-hover:scale-[1.03] transition-transform"
                              onError={(e) => { const el = e.currentTarget; if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE; }}
                            />
                            <p className="font-extrabold text-xs text-[var(--pc-color-text-primary-light)] truncate">{item.name}</p>
                            <p className="text-xs font-black text-[var(--pc-color-primary)] mt-0.5">
                              OMR {item.discountPrice && item.discountPrice < item.price ? item.discountPrice.toFixed(2) : item.price.toFixed(2)}
                            </p>
                            <button
                              onClick={() => onAddToCart && onAddToCart(item)}
                              className="mt-2 w-full py-1.5 rounded-lg bg-[var(--pc-color-primary)]/10 hover:bg-[var(--pc-color-primary)] text-[var(--pc-color-primary)] hover:text-white text-xs font-black transition-all"
                            >
                              Add +
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={onBrowseMenu} className="cp-btn cp-btn--primary px-8 py-3">
                    <Sparkles size={16} /> Explore Full Menu
                  </button>
                </div>

              ) : step === "checkout" ? (
                /* ══ STEP 1: CART + DETAILS ══ */
                <div className="space-y-5">

                  {/* Size Chart Toggle */}
                  {hasMultipleSizeItems && (
                    <div className="cp-size-chart-wrap">
                      <button
                        onClick={() => setShowSizeChart(!showSizeChart)}
                        className="cp-size-chart-toggle"
                      >
                        <Ruler size={13} />
                        {showSizeChart ? "Hide" : "View"} Size Chart & Bulk Savings
                        {showSizeChart ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      <AnimatePresence>
                        {showSizeChart && (() => {
                          const allSizes = cart.flatMap((e) => e.item.sizes || getDefaultSizes(e.item.category));
                          const uniqueSizes = allSizes.filter((s, i, a) => a.findIndex((x) => x.name === s.name) === i);
                          const cols = Math.min(uniqueSizes.length, 3);
                          return (
                            <motion.div
                              key="size-chart"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22 }}
                              className="overflow-hidden"
                            >
                              <div className="cp-size-chart mt-2">
                                <div className="grid gap-2 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
                                  {uniqueSizes.map((s) => {
                                    const pct = Math.round((1 - s.multiplier) * 100);
                                    return (
                                      <div key={s.name} className="cp-size-chart__cell">
                                        <span className="font-extrabold text-[var(--pc-color-primary)]">{s.label}</span>
                                        {s.slices && <span className="text-[9px] text-gray-400 mt-0.5">{s.slices} Slices</span>}
                                        {pct > 0 ? (
                                          <span className="text-[9px] font-black text-green-700 bg-green-50 px-1 py-0.5 rounded mt-1">{pct}% Off</span>
                                        ) : (
                                          <span className="text-[9px] font-black text-gray-500 bg-gray-100 px-1 py-0.5 rounded mt-1">Base Price</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-[var(--pc-color-text-secondary-light)] mt-2 flex items-start gap-1.5 border-t border-dashed border-gray-200 pt-2">
                                  <Info size={11} className="mt-0.5 text-[var(--pc-color-cta)] flex-shrink-0" />
                                  Buy 2 → Save 5% · Buy 3-4 → Save 8% · Buy 5+ → Save 12% per unit
                                </p>
                              </div>
                            </motion.div>
                          );
                        })()}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Cart Items */}
                  <div>
                    <h4 className="cp-section-label">
                      <ShoppingCart size={14} className="text-[var(--pc-color-primary)]" />
                      Cart Items ({cartQty})
                    </h4>
                    <div className="space-y-3 mt-2">
                      <AnimatePresence mode="popLayout">
                        {cart.map((entry, index) => (
                          <CartItemCard
                            key={`${entry.item._id}-${entry.size}-${index}`}
                            entry={entry}
                            index={index}
                            onUpdate={onUpdateCartItem}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Promo Code */}
                  <div className="cp-promo-box">
                    <span className="cp-section-label mb-2">
                      <Tag size={14} className="text-[var(--pc-color-cta)]" />
                      Promo Code
                    </span>
                    {!appliedPromo ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          placeholder="ENTER CODE"
                          value={promoCodeInput}
                          onChange={(e) => { setPromoCodeInput(e.target.value.toUpperCase()); setPromoError(""); }}
                          className="cp-input flex-1 uppercase font-bold text-xs"
                        />
                        <button
                          onClick={handleApplyPromo}
                          disabled={isValidatingPromo}
                          className="cp-btn cp-btn--primary px-4 py-2 text-xs"
                        >
                          {isValidatingPromo ? "…" : "Apply"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5 mt-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-green-600" />
                          <div>
                            <p className="text-[10px] uppercase font-black tracking-wider text-green-700">Applied</p>
                            <p className="text-xs font-black text-green-800">{appliedPromo.code.toUpperCase()}</p>
                          </div>
                        </div>
                        <button onClick={handleClearPromo} className="text-[10px] font-black text-[var(--pc-color-primary)] hover:underline">
                          Remove
                        </button>
                      </div>
                    )}
                    {promoError && (
                      <p className="text-[11px] font-bold text-red-500 flex items-center gap-1 mt-1.5">
                        <AlertCircle size={12} /> {promoError}
                      </p>
                    )}
                  </div>

                  {/* Order Total */}
                  <div className="cp-total-box">
                    {appliedPromo && (
                      <>
                        <div className="cp-total-box__row cp-total-box__row--muted">
                          <span>Subtotal</span>
                          <span>OMR {totalAmount.toFixed(3)}</span>
                        </div>
                        <div className="cp-total-box__row cp-total-box__row--green">
                          <span>Discount ({appliedPromo.code})</span>
                          <span>- OMR {discountAmount.toFixed(3)}</span>
                        </div>
                        <div className="cp-total-box__divider" />
                      </>
                    )}
                    <div className="cp-total-box__row cp-total-box__row--total">
                      <span>Total</span>
                      <span>OMR {finalAmount.toFixed(3)}</span>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div>
                    <h4 className="cp-section-label mb-3">
                      <Phone size={14} className="text-[var(--pc-color-primary)]" />
                      Your Details
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="cp-label">Your Name <span className="text-[var(--pc-color-primary)]">*</span></label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ahmad Al-Farsi"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="cp-input"
                        />
                      </div>
                      <div>
                        <label className="cp-label">WhatsApp Number <span className="text-[var(--pc-color-primary)]">*</span></label>
                        <div className="phone-input-wrapper">
                          <PhoneInput
                            international
                            defaultCountry="OM"
                            value={customerPhone}
                            onChange={(value) => setCustomerPhone(value || "")}
                            countries={["OM", "AE", "SA", "KW", "BH", "QA", "IN", "PK", "BD", "PH", "EG", "GB", "US"]}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="cp-label">Email <span className="cp-optional">Optional</span></label>
                        <input
                          type="email"
                          placeholder="e.g. customer@example.com"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className="cp-input"
                        />
                      </div>
                      <div>
                        <label className="cp-label">Delivery Address / Notes <span className="cp-optional">Optional</span></label>
                        <textarea
                          rows={2}
                          placeholder="Your address or special instructions..."
                          value={customerNotes}
                          onChange={(e) => setCustomerNotes(e.target.value)}
                          className="cp-input resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

              ) : (
                /* ══ STEP 2: OUTLET SELECTOR ══ */
                <div className="space-y-4">
                  {/* Location Banner */}
                  {customerLocation ? (
                    <div className="cp-location-banner cp-location-banner--set">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[var(--pc-red-500)]/15 flex items-center justify-center flex-shrink-0 text-[var(--pc-red-500)]">
                          {isPickup ? <Store size={15} /> : <MapPin size={15} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-xs text-[var(--pc-gray-700)] truncate">
                            {customerLocation.orderType === "pickup" && customerLocation.selectedBranchName
                              ? `Pick-up: ${customerLocation.selectedBranchName}`
                              : customerLocation.address || `GPS (${customerLocation.latitude.toFixed(4)}, ${customerLocation.longitude.toFixed(4)})`}
                          </p>
                          <p className="text-[10px] text-[var(--pc-gray-500)]">
                            {isPickup ? "Self Pick-Up" : customerLocation.source === "gps" ? "Verified GPS" : "Manual Address"}
                          </p>
                        </div>
                      </div>
                      {onChangeLocation && (
                        <button onClick={onChangeLocation} className="cp-change-btn">Change</button>
                      )}
                    </div>
                  ) : onChangeLocation && (
                    <div className="cp-location-banner cp-location-banner--unset">
                      <div className="flex items-center gap-2">
                        <MapPin size={15} className="text-amber-500 flex-shrink-0" />
                        <span className="text-amber-800 font-bold text-xs">Set delivery location to find nearest outlet</span>
                      </div>
                      <button onClick={onChangeLocation} className="cp-change-btn cp-change-btn--amber">Set</button>
                    </div>
                  )}

                  {/* Search */}
                  <div className="cp-search-bar">
                    <Search size={15} className="text-[var(--pc-gray-400)] flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Search city or branch..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-sm focus:outline-none text-[var(--pc-gray-700)] placeholder:text-[var(--pc-gray-400)]"
                    />
                  </div>

                  {/* Outside radius alert */}
                  {customerLocation && localBranches.length > 0 && eligibleBranches.length === 0 && (
                    <div className="cp-alert cp-alert--amber">
                      <AlertCircle size={22} className="text-amber-500 mx-auto mb-2" />
                      <p className="font-bold text-sm text-amber-900">No outlet delivers to this location.</p>
                      <p className="text-xs text-amber-700 leading-relaxed mt-1">
                        Your location is outside our {DEFAULT_DELIVERY_RADIUS_KM} km delivery radius.
                      </p>
                      {onChangeLocation && (
                        <button onClick={onChangeLocation} className="cp-btn cp-btn--primary mt-3 px-4 py-2 text-xs mx-auto">
                          <MapPin size={13} /> Change Address
                        </button>
                      )}
                    </div>
                  )}

                  {/* Branch List */}
                  <div className="space-y-3">
                    {isLoadingBranches ? (
                      <p className="text-center text-xs text-[var(--pc-gray-400)] py-4">Synchronizing branches...</p>
                    ) : localBranches.length === 0 ? (
                      <p className="text-center text-sm text-[var(--pc-gray-400)] py-4">No outlets available right now.</p>
                    ) : filteredBranchInfos.length > 0 ? (
                      filteredBranchInfos.map((info, idx) => {
                        const { branch, distanceKm, eligible, reason } = info;
                        const isRecommended = eligible && idx === 0 && !!customerLocation;

                        return (
                          <div
                            key={branch._id || branch.id || branch.name}
                            onClick={() => {
                              if (eligible) handleOrderSubmission(branch.name);
                              else onShowToast(reason || "This outlet cannot deliver to your location.");
                            }}
                            className={`cp-branch-card ${eligible ? "cp-branch-card--eligible" : "cp-branch-card--ineligible"} ${isRecommended ? "cp-branch-card--recommended" : ""}`}
                          >
                            {isRecommended && (
                              <span className="cp-branch-card__rec-badge">★ Nearest Outlet</span>
                            )}

                            <div className={`cp-branch-card__icon ${eligible ? "cp-branch-card__icon--on" : "cp-branch-card__icon--off"}`}>
                              <Store size={22} />
                            </div>

                            <div className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className={`font-extrabold text-sm ${eligible ? "text-[var(--pc-gray-700)]" : "text-gray-400"}`}>
                                  Pizza City — {branch.name}
                                </h5>
                                {distanceKm !== null && (
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                    eligible
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : "bg-gray-100 text-gray-400 border-gray-200"
                                  }`}>
                                    {distanceKm.toFixed(1)} km
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
                                {eligible ? (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                                    <span className="text-green-700 font-bold">
                                      {isPickup ? "Pick-Up Available" : "Delivery Available"}
                                    </span>
                                    <span className="text-gray-300">·</span>
                                    <span className="truncate text-[var(--pc-gray-500)]">{branch.hours || "Daily 11 AM – 11 PM"}</span>
                                  </>
                                ) : (
                                  <span className="text-red-500 font-bold flex items-center gap-1">
                                    <AlertCircle size={12} className="flex-shrink-0" />
                                    {reason || "Outside delivery radius"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className={`cp-branch-card__arrow ${eligible ? "cp-branch-card__arrow--on" : "cp-branch-card__arrow--off"}`}>
                              <ArrowRight size={16} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-center text-sm text-[var(--pc-gray-400)] py-4">No matching outlets found.</p>
                    )}
                  </div>

                  <button onClick={() => setStep("checkout")} className="cp-btn cp-btn--secondary w-full py-3">
                    <ArrowLeft size={16} /> Back to Details
                  </button>
                </div>
              )}

              {/* WhatsApp note footer */}
              {!orderSuccess && cart.length > 0 && (
                <div className="cp-footer-note">
                  <MessageSquare size={16} className="text-[var(--pc-color-cta)] flex-shrink-0" />
                  <p>Order saves to our database then auto-redirects to WhatsApp with your invoice.</p>
                </div>
              )}
            </div>

            {/* ── STICKY FOOTER CTA ── */}
            {!orderSuccess && cart.length > 0 && (
              <div className="cp-panel__footer">
                {step === "checkout" ? (
                  <button
                    onClick={() => {
                      if (!customerName.trim() || !customerPhone.trim()) {
                        onShowToast("Please enter both your Name and WhatsApp phone number.");
                        return;
                      }
                      const cleaned = customerPhone.replace(/\D/g, "");
                      if (cleaned.length < 8 || cleaned.length > 15) {
                        onShowToast("Please enter a valid phone number (8-15 digits including country code).");
                        return;
                      }
                      setStep("outlet");
                    }}
                    className="cp-btn cp-btn--primary w-full py-4 text-sm"
                  >
                    <MapPin size={16} /> Select Outlet & Place Order
                    <span className="ml-auto font-black text-white/80 text-sm">OMR {finalAmount.toFixed(3)}</span>
                  </button>
                ) : null}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
