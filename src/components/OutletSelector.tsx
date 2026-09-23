import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { MenuItem, CartEntry, Branch } from "../types";
import { getVolumeDiscountPercentage, getSizeAdjustedPrice, getDefaultSizes } from "../lib/priceUtils";
import { getMenuItemAltText } from "../lib/altText";
import { FALLBACK_FOOD_IMAGE } from "../lib/images";
import type { MenuItemSize } from "../lib/priceUtils";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import Loader from "./Loader";

function StepProgress({ step }: { step: "checkout" | "outlet" }) {
  const steps = [
    { id: "checkout", label: "Your Details" },
    { id: "outlet", label: "Pick Outlet" },
  ];

  return (
    <div className="cart-step-progress">
      {steps.map((s, idx) => {
        const isActive = step === s.id;
        const isCompleted = step === "outlet" && s.id === "checkout";
        const isLast = idx === steps.length - 1;

        return (
          <React.Fragment key={s.id}>
            <div className={`cart-step ${isActive ? "cart-step--active" : ""} ${isCompleted ? "cart-step--completed" : ""}`}>
              <div className="cart-step__dot">
                {isCompleted ? (
                  <CheckCircle size={12} strokeWidth={3} />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span className="cart-step__label hidden sm:inline">{s.label}</span>
            </div>
            {!isLast && (
              <div className={`cart-step__line ${isCompleted ? "cart-step__line--completed" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

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
}: OutletSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOutlet, setSelectedOutlet] = useState<string | null>(null);
  
  // Dynamic branches state
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (branches && branches.length > 0) {
      setLocalBranches(branches.filter(b => b.isActive !== false));
      return;
    }
    setIsLoadingBranches(true);
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data) => {
        setLocalBranches(data.filter((b: any) => b.isActive !== false));
      })
      .catch((err) => console.warn("Failed fetching active branches:", err))
      .finally(() => setIsLoadingBranches(false));
  }, [isOpen, branches]);

  // Customer details form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"checkout" | "outlet">("checkout"); // checkout info first, then choose outlet
  const [showSizeChartInCart, setShowSizeChartInCart] = useState(true);

  // Order success state — shows confirmation and allows navigation to tracker
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string;
    shortId: string;
    whatsappUrl: string;
    outletName: string;
    total: number;
  } | null>(null);

  // Promo code states
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<any | null>(null);
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState("");

  const hasMultipleSizeItems = cart.some((entry) => {
    const s = entry.item.sizes || getDefaultSizes(entry.item.category);
    return s.length > 1;
  });
  const totalAmount = cart.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);
  const discountAmount = appliedPromo
    ? (appliedPromo.discountType === "percentage"
        ? totalAmount * (appliedPromo.discountValue / 100)
        : appliedPromo.discountValue)
    : 0;
  const finalAmount = Math.max(0, totalAmount - discountAmount);

  useEffect(() => {
    if (appliedPromo && appliedPromo.minOrderAmount > 0 && totalAmount < appliedPromo.minOrderAmount) {
      setPromoError(`Cart total must be at least OMR ${appliedPromo.minOrderAmount.toFixed(3)} to keep this promo.`);
      setAppliedPromo(null);
      setPromoCodeInput("");
    }
  }, [totalAmount, appliedPromo]);

  // Reset success view when modal is closed/reopened — MUST be before early return (hooks rule)
  useEffect(() => {
    if (!isOpen) {
      setOrderSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Group outlets based on search query (dynamic branches only — no static fallback)
  const q = searchQuery.toLowerCase().trim();
  const filteredDynamicBranches = localBranches.filter((b) => {
    return (
      b.name.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q)
    );
  });

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) {
      setPromoError("Code cannot be empty.");
      return;
    }
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
    } catch (err) {
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
    if (!customerName.trim()) {
      onShowToast("Please enter your name.");
      setStep("checkout");
      return;
    }
    if (!customerPhone.trim()) {
      onShowToast("Please enter your WhatsApp phone number.");
      setStep("checkout");
      return;
    }
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
          bundleSelections: entry.bundleSelections && entry.bundleSelections.length > 0 ? entry.bundleSelections : undefined,
        };
      }),
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail || undefined,
        notes: customerNotes || undefined,
      },
      outlet: outletName,
      promoCode: appliedPromo ? appliedPromo.code : undefined,
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save order");
      }

      // Save order ID database references to local history automatically
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

      // ⚡ Broadcast and dispatch new order event for live sync
      try {
        const bc = new BroadcastChannel("pizza_city_menu_channel");
        bc.postMessage({ type: "NEW_ORDER_PLACED", order: data.order });
        bc.close();
      } catch (e) {
        // sandbox safe fallback
      }
      window.dispatchEvent(new CustomEvent("pizza_city_new_order_placed", { detail: data.order }));

      const shortId = data.order._id.toString().slice(-6).toUpperCase();
      const successTotal = data.order.total ?? finalAmount;

      // Show persistent success UI immediately (so user has order ref even if WhatsApp blocked)
      setOrderSuccess({
        orderId: data.order._id,
        shortId,
        whatsappUrl: data.whatsappUrl || "",
        outletName,
        total: successTotal,
      });

      onShowToast(`🎉 Order ${shortId} placed successfully! Opening WhatsApp...`);

      // Auto redirect to WhatsApp — user request
      if (data.whatsappUrl) {
        try {
          // Direct user-gesture continuation (after async fetch, still allowed in most browsers)
          window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
        } catch (e) {
          console.warn("WhatsApp auto-open blocked, fallback button remains in success view", e);
        }
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
    const successId = orderSuccess?.orderId;
    onClearCart();
    resetForm();
    setOrderSuccess(null);
    onClose();
    if (successId && onOrderSuccess) {
      // still navigate to tracker even if user just closes
      // onOrderSuccess will be handled by the primary Track button;
      // we don't auto-navigate on generic close to avoid surprising the user
    }
  };

  const handleTrackOrder = () => {
    if (!orderSuccess) return;
    const { orderId } = orderSuccess;
    // WhatsApp already auto-opened on order success; Track now just navigates
    onClearCart();
    resetForm();
    const capturedId = orderId;
    setOrderSuccess(null);
    onClose();
    if (onOrderSuccess) onOrderSuccess(capturedId);
  };

  const handleOpenWhatsapp = () => {
    if (orderSuccess?.whatsappUrl) {
      window.open(orderSuccess.whatsappUrl, "_blank");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      {isSubmitting && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-3xl">
          <Loader size={64} text="Baking your order..." />
        </div>
      )}
      <div 
        id="outlet-modal"
        className="w-full max-w-lg bg-[var(--pc-gray-100)] rounded-3xl border border-[#D72B2B]/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex flex-col gap-4 bg-white">
          {orderSuccess ? (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                    <CheckCircle size={20} className="text-white" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-3xl tracking-wide text-[var(--pc-color-text-primary-light)]">
                    Order Confirmed!
                  </h3>
                </div>
                <p className="text-xs font-sans font-semibold text-[var(--pc-color-text-secondary-light)] mt-1">
                  Your delicious order is now baking — track it live
                </p>
              </div>
              <button
                onClick={handleCloseSuccess}
                className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-[var(--pc-color-text-muted-light)] flex items-center justify-center transition-colors"
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2.5">
                    {step === "checkout" ? (
                      <ShoppingCart size={24} className="text-[var(--pc-color-primary)]" aria-hidden="true" />
                    ) : (
                      <MapPin size={24} className="text-[var(--pc-color-primary)]" aria-hidden="true" />
                    )}
                    <h3 className="font-display text-3xl tracking-wide text-[var(--pc-color-text-primary-light)]">
                      {step === "checkout" ? "Complete Your Order" : "Select Outlet"}
                    </h3>
                  </div>
                  <p className="text-xs font-sans font-semibold text-[var(--pc-color-text-secondary-light)] mt-1">
                    {step === "checkout"
                      ? "Enter your details to generate your order & invoice"
                      : "Choose which Pizza City branch should prepare your order"}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-[var(--pc-color-text-muted-light)] flex items-center justify-center transition-colors"
                  aria-label="Close cart"
                >
                  <X size={18} />
                </button>
              </div>
              <StepProgress step={step} />
            </>
          )}
        </div>

        {/* Modal content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {orderSuccess ? (
            <div className="flex flex-col items-center text-center space-y-5 py-2">
              <div className="w-20 h-20 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center shadow-sm">
                <CheckCircle size={42} className="text-green-600" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h4 className="font-display text-2xl text-[var(--pc-color-text-primary-light)]">Thank you, {customerName || "Pizza Lover"}!</h4>
                <p className="text-sm text-[var(--pc-color-text-secondary-light)] leading-relaxed max-w-sm">
                  Your order has been saved to Pizza City <span className="font-bold text-[var(--pc-color-text-primary-light)]">{orderSuccess.outletName}</span> and is now pending confirmation.
                </p>
              </div>

              <div className="w-full bg-gradient-to-br from-[var(--pc-color-primary)]/10 to-[var(--pc-color-cta)]/10 border border-[var(--pc-color-border-light)] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--pc-color-text-secondary-light)]">Order Reference</span>
                  <span className="text-[10px] font-bold bg-white border border-gray-200 px-2.5 py-1 rounded-full text-[var(--pc-color-text-primary-light)]">Last 6 — <span className="font-mono text-[var(--pc-color-primary)]">{orderSuccess.shortId}</span></span>
                </div>
                <div className="bg-white rounded-xl p-3 flex items-center justify-between shadow-sm border border-gray-100">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase text-[var(--pc-color-text-muted-light)]">Full Order ID</p>
                    <p className="font-mono text-xs font-bold text-[var(--pc-color-text-primary-light)] break-all">{orderSuccess.orderId}</p>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(orderSuccess.orderId); onShowToast("Order ID copied to clipboard"); }}
                    className="ml-3 text-xs font-bold text-[var(--pc-color-primary)] hover:underline shrink-0"
                  >
                    Copy
                  </button>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-[var(--pc-color-text-secondary-light)]">Total Paid</span>
                  <span className="font-black text-[var(--pc-color-primary)]">OMR {orderSuccess.total.toFixed(3)}</span>
                </div>
              </div>

              <div className="w-full space-y-3">
                <button
                  onClick={handleTrackOrder}
                  className="cart-btn cart-btn-primary w-full py-3.5 text-sm"
                >
                  <MapPin size={16} aria-hidden="true" />
                  Track My Order Live
                </button>
                {orderSuccess.whatsappUrl && (
                  <button
                    onClick={handleOpenWhatsapp}
                    className="cart-btn cart-btn-secondary w-full py-3 text-sm"
                  >
                    <MessageSquare size={16} aria-hidden="true" />
                    Open WhatsApp Invoice
                  </button>
                )}
                <button
                  onClick={handleCloseSuccess}
                  className="w-full py-2.5 text-sm font-bold text-[var(--pc-color-text-secondary-light)] hover:text-[var(--pc-color-text-primary-light)] transition-colors"
                >
                  Continue Shopping
                </button>
              </div>

              <p className="text-[11px] text-[var(--pc-color-text-muted-light)] leading-relaxed">
                Keep your reference <span className="font-mono font-bold">{orderSuccess.shortId}</span> — use it on the tracker to monitor baking & delivery in real-time.
              </p>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 space-y-8 h-full">
              <div className="space-y-3 max-w-sm mx-auto">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-[var(--pc-color-border-light)] shadow-sm">
                  <ShoppingBag size={40} className="text-[var(--pc-color-primary)] opacity-60" aria-hidden="true" />
                </div>
                <h3 className="font-display text-3xl text-[var(--pc-color-text-primary-light)]">Your Cart is Hungry</h3>
                <p className="text-sm font-sans text-[var(--pc-color-text-secondary-light)] leading-relaxed">Looks like you have not added any delicious handcrafted pizzas yet.</p>
              </div>

              {menuItems && menuItems.length > 0 && (
                <div className="w-full space-y-4">
                  <h4 className="flex items-center gap-2 font-extrabold text-sm text-[var(--pc-color-text-primary-light)] uppercase tracking-widest border-b border-gray-100 pb-2 text-left">
                    <Flame size={16} className="text-[var(--pc-color-cta)]" aria-hidden="true" />
                    Popular Recommendations
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {menuItems.filter(i => i.available !== false).slice(0, 4).map(item => (
                      <div key={item._id} className="cart-card flex items-center gap-3 p-3 text-left group">
                        <img src={item.image || FALLBACK_FOOD_IMAGE} alt={getMenuItemAltText(item)} className="w-16 h-16 rounded-xl object-cover shadow-sm group-hover:scale-105 transition-transform" onError={(e) => { const el = e.currentTarget; if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE; }} />
                        <div className="flex-1 min-w-0">
                          <h5 className="font-extrabold text-xs text-[var(--pc-color-text-primary-light)] truncate">{item.name}</h5>
                          <span className="font-body text-xs font-black text-[var(--pc-color-primary)]">OMR {item.discountPrice && item.discountPrice < item.price ? item.discountPrice.toFixed(2) : item.price.toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => {
                            if (onAddToCart) {
                              onAddToCart(item);
                            } else {
                              onShowToast("Adding from cart disabled right now.");
                            }
                          }}
                          className="w-9 h-9 min-w-9 min-h-9 rounded-full bg-gray-50 hover:bg-[var(--pc-color-primary)] text-[var(--pc-color-text-muted-light)] hover:text-white flex items-center justify-center transition-colors border border-gray-200 hover:border-transparent flex-shrink-0"
                          aria-label={`Add ${item.name} to cart`}
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onBrowseMenu}
                className="cart-btn cart-btn-primary w-full sm:w-auto px-8 py-3.5 text-sm"
              >
                Explore Full Menu
              </button>
            </div>
          ) : (
            <>
          {/* SIZE CHART TOGGLER & CARD — for items with multiple sizes */}
          {hasMultipleSizeItems && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowSizeChartInCart(!showSizeChartInCart)}
                className="text-xs font-black text-[var(--pc-color-primary)] hover:text-[var(--pc-color-cta)] flex items-center gap-1.5 bg-[var(--pc-color-primary)]/5 px-3 py-1.5 rounded-full border border-[var(--pc-color-border-light)] transition-all"
              >
                <Ruler size={13} aria-hidden="true" />
                {showSizeChartInCart ? "Hide Size Chart & Info" : "View Size Chart & Info"}
              </button>
              <span className="text-[10px] font-black uppercase text-green-700 bg-green-50 px-2 py-1 rounded border border-green-200/50 flex items-center gap-1">
                <CheckCircle size={11} aria-hidden="true" />
                Bulk savings active
              </span>
            </div>

            {showSizeChartInCart && (() => {
              const allSizes = cart.flatMap(e => e.item.sizes || getDefaultSizes(e.item.category));
              const uniqueSizes = allSizes.filter((s, i, a) => a.findIndex(x => x.name === s.name) === i);
              const cols = Math.min(uniqueSizes.length, 3);
              return (
                <div className="cart-card p-4 space-y-3">
                  <div className="grid gap-2.5 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {uniqueSizes.map((s) => {
                      const pct = Math.round((1 - s.multiplier) * 100);
                      const isDiscounted = pct > 0;
                      return (
                        <div key={s.name} className="bg-gray-50 p-2 rounded-xl border border-[var(--pc-color-border-light)] flex flex-col justify-between">
                          <span className="font-extrabold text-[var(--pc-color-primary)]">{s.label}</span>
                          {s.inch && <span className="text-[9px] text-[var(--pc-color-text-secondary-light)] mt-0.5">{s.slices ? `${s.slices} Slices` : ''}</span>}
                          {isDiscounted ? (
                            <span className="font-black text-[9px] mt-1 text-green-700 bg-green-50 py-0.5 rounded">{pct}% Off Base</span>
                          ) : (
                            <span className="font-black text-[9px] mt-1 text-[var(--pc-color-text-primary-light)] bg-gray-100 py-0.5 rounded">Standard Price</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-[var(--pc-color-text-secondary-light)] border-t border-dashed border-gray-200 pt-2 leading-relaxed flex items-start gap-1.5">
                    <Info size={12} className="mt-0.5 flex-shrink-0 text-[var(--pc-color-cta)]" aria-hidden="true" />
                    <span>
                      <strong>Optimize Unit Rates with Bulk Volume:</strong> Buy 2 units → <strong>Save 5%</strong>. Buy 3-4 units → <strong>Save 8%</strong>. Buy 5+ units → <strong>Save 12%</strong> on final unit price.
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
          )}

          {/* Cart Summary Header */}
          <div className="cart-card p-4 space-y-3.5">
            <h4 className="font-body font-bold text-sm text-[var(--pc-color-text-primary-light)] flex items-center gap-2">
              <ShoppingCart size={16} className="text-[var(--pc-color-primary)]" aria-hidden="true" />
              Your Customized Cart ({cart.reduce((s, e) => s + e.quantity, 0)} items)
            </h4>

            <AnimatePresence mode="popLayout">
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {cart.map((entry, index) => {
                  const discountPercent = getVolumeDiscountPercentage(entry.quantity);
                  const isDiscounted = discountPercent > 0;

                  return (
                    <motion.div
                      key={`${entry.item._id}-${entry.size}-${index}`}
                      layout
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -20, scale: 0.95 }}
                      transition={{ type: "spring", damping: 25, stiffness: 300 }}
                      className="bg-gray-50 p-3 rounded-xl border border-[var(--pc-color-border-light)] flex flex-col gap-2"
                    >
                      <div className="flex gap-3">
                        <img
                          src={entry.item.image || FALLBACK_FOOD_IMAGE}
                          alt={getMenuItemAltText(entry.item)}
                          className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 flex justify-between items-start gap-2 min-w-0">
                          <div className="min-w-0">
                            <h5 className="font-body font-extrabold text-xs text-[var(--pc-color-text-primary-light)] truncate">{entry.item.name}</h5>
                            <p className="text-[10px] text-[var(--pc-color-text-secondary-light)] mt-0.5">
                              Base OMR {entry.item.price.toFixed(2)}
                              {(() => {
                                const itemSizes = entry.item.sizes || getDefaultSizes(entry.item.category);
                                return itemSizes.length > 1 ? (
                                  <> · Size: <span className="font-bold text-[var(--pc-color-text-primary-light)]">{entry.size}</span></>
                                ) : null;
                              })()}
                            </p>
                            {entry.bundleSelections && entry.bundleSelections.length > 0 && (
                              <div className="mt-1 space-y-0.5 border-l-2 border-[var(--pc-color-primary)]/40 pl-2">
                                {entry.bundleSelections.map((grp, gIdx) => (
                                  <div key={gIdx} className="text-[10px] text-[var(--pc-color-text-secondary-light)]">
                                    <span className="font-bold text-[var(--pc-color-text-primary-light)]">{grp.groupTitle}:</span>{" "}
                                    {grp.items.map((opt) => `${opt.quantity && opt.quantity > 1 ? `${opt.quantity}x ` : ""}${opt.name}`).join(", ")}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end flex-shrink-0">
                            <span className="font-body font-bold text-xs text-[var(--pc-color-primary)]">
                              OMR {(entry.unitPrice * entry.quantity).toFixed(2)}
                            </span>
                            {isDiscounted && (
                              <span className="text-[9px] bg-green-50 text-green-700 font-extrabold px-1.5 py-0.5 rounded-full mt-0.5 flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle size={8} aria-hidden="true" />
                                Saved {discountPercent}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1 border-t border-dashed border-[var(--pc-color-border-light)]">
                        {/* Units option selector */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black uppercase text-[var(--pc-color-text-secondary-light)]">Qty</span>
                          <div className="cart-stepper">
                            <button
                              onClick={() => onUpdateCartItem(index, entry.quantity - 1, entry.size)}
                              aria-label={`Decrease ${entry.item.name} quantity`}
                            >
                              <Minus size={14} aria-hidden="true" />
                            </button>
                            <span>{entry.quantity}</span>
                            <button
                              onClick={() => onUpdateCartItem(index, entry.quantity + 1, entry.size)}
                              aria-label={`Increase ${entry.item.name} quantity`}
                            >
                              <Plus size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {/* Size Selector */}
                        {(() => {
                          const itemSizes = entry.item.sizes || getDefaultSizes(entry.item.category);
                          if (itemSizes.length > 1) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase text-[var(--pc-color-text-secondary-light)]">Size</span>
                                <select
                                  value={entry.size}
                                  onChange={(e) => onUpdateCartItem(index, entry.quantity, e.target.value)}
                                  className="text-[10px] font-bold bg-white text-[var(--pc-color-text-primary-light)] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[var(--pc-color-cta)]"
                                >
                                  {itemSizes.map(s => (
                                    <option key={s.name} value={s.name}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          }
                          return (
                            <div className="text-[10px] font-bold text-[var(--pc-color-text-secondary-light)] bg-gray-100 px-2 py-1 rounded-full">
                              Standard Size
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>

            {/* Promo Code Coupon Area */}
            <div className="bg-gray-50 border border-[var(--pc-color-border-light)] rounded-xl p-4 space-y-3 text-left">
              <span className="flex items-center gap-1.5 text-xs font-black uppercase text-[var(--pc-color-text-primary-light)] tracking-wider">
                <Tag size={14} className="text-[var(--pc-color-cta)]" aria-hidden="true" />
                Have a Promo Coupon?
              </span>

              {!appliedPromo ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ENTER CODE"
                    value={promoCodeInput}
                    onChange={(e) => {
                      setPromoCodeInput(e.target.value.toUpperCase());
                      setPromoError("");
                    }}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--pc-color-cta)] uppercase font-bold placeholder:font-normal"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    disabled={isValidatingPromo}
                    className="cart-btn cart-btn-primary px-4 py-2 text-xs"
                  >
                    {isValidatingPromo ? "Applying" : "Apply"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-green-50/70 border border-green-200/50 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-[var(--pc-green-500)]" aria-hidden="true" />
                    <div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-green-700">Code Applied</span>
                      <p className="text-xs font-black text-green-800">{appliedPromo.code.toUpperCase()}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearPromo}
                    className="text-[10px] font-black text-[var(--pc-color-primary)] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              {promoError && (
                <p className="text-[11px] font-bold text-[var(--pc-color-primary)] flex items-center gap-1 leading-relaxed">
                  <AlertCircle size={12} aria-hidden="true" />
                  {promoError}
                </p>
              )}
            </div>

            {/* Pricing calculations rows */}
            <div className="border-t border-dashed border-gray-200 pt-4 space-y-2 font-bold text-[var(--pc-color-text-primary-light)]">
              {appliedPromo && (
                <>
                  <div className="flex justify-between items-center text-xs text-[var(--pc-color-text-muted-light)] font-medium">
                    <span>Subtotal Price:</span>
                    <span className="font-body">OMR {totalAmount.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-green-600 font-medium pb-2 border-b border-dotted border-gray-200">
                    <span>Discount Applied:</span>
                    <span className="font-body">- OMR {discountAmount.toFixed(3)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm font-body">Total</span>
                <span className="text-lg font-body font-black text-[var(--pc-color-primary)]">OMR {finalAmount.toFixed(3)}</span>
              </div>
            </div>
          </div>

          {step === "checkout" ? (
            /* STEP 1: CUSTOMER DETAILS */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--pc-color-text-primary-light)] uppercase tracking-wider mb-1.5">
                    Your Name <span className="text-[var(--pc-color-primary)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ahmad Al-Farsi"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-white border border-[var(--pc-color-border-light)] rounded-xl px-4 py-3 text-sm focus:border-[var(--pc-color-cta)] focus:outline-none focus:ring-1 focus:ring-[var(--pc-color-cta)] text-[var(--pc-color-text-primary-light)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--pc-color-text-primary-light)] uppercase tracking-wider mb-1.5">
                    WhatsApp Phone Number <span className="text-[var(--pc-color-primary)]">*</span>
                  </label>
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
                  <label className="block text-xs font-bold text-[var(--pc-color-text-primary-light)] uppercase tracking-wider mb-1.5">
                    Email Address <span className="text-[var(--pc-color-text-muted-light)]">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. customer@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-white border border-[var(--pc-color-border-light)] rounded-xl px-4 py-3 text-sm focus:border-[var(--pc-color-cta)] focus:outline-none focus:ring-1 focus:ring-[var(--pc-color-cta)] text-[var(--pc-color-text-primary-light)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--pc-color-text-primary-light)] uppercase tracking-wider mb-1.5">
                    Delivery Address &amp; Instructions <span className="text-[var(--pc-color-text-muted-light)]">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter your home address or special prep details..."
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    className="w-full bg-white border border-[var(--pc-color-border-light)] rounded-xl px-4 py-3 text-sm focus:border-[var(--pc-color-cta)] focus:outline-none focus:ring-1 focus:ring-[var(--pc-color-cta)] text-[var(--pc-color-text-primary-light)]"
                  />
                </div>
              </div>

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
                className="cart-btn cart-btn-primary w-full py-3.5 text-sm"
              >
                <MapPin size={16} aria-hidden="true" />
                Proceed to Select Outlet
              </button>
            </div>
          ) : (
            /* STEP 2: OUTLET SELECTOR */
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-white border border-[var(--pc-color-border-light)] rounded-full px-4 py-2.5 shadow-sm">
                <Search size={16} className="text-[var(--pc-color-text-muted-light)]" />
                <input
                  type="text"
                  placeholder="Search city or branch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm focus:outline-none text-[var(--pc-color-text-primary-light)]"
                />
              </div>

              <div className="space-y-3">
                {isLoadingBranches ? (
                  <p className="text-center text-xs text-[var(--pc-color-text-muted-light)] py-4">Synchronizing branch status indices...</p>
                ) : localBranches.length === 0 ? (
                  <p className="text-center text-sm text-[var(--pc-color-text-muted-light)] py-4">No outlets available right now. Please try again in a moment.</p>
                ) : filteredDynamicBranches.length > 0 ? (
                    filteredDynamicBranches.map((branch) => (
                      <div
                        key={branch._id || branch.id}
                        onClick={() => handleOrderSubmission(branch.name)}
                        className="flex items-center gap-4 p-4 bg-white hover:bg-[var(--pc-color-primary)]/5 rounded-2xl cursor-pointer border border-transparent hover:border-[var(--pc-color-border-light)] transition-all shadow-sm active:scale-[0.98]"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--pc-color-primary)]/10 to-[var(--pc-color-cta)]/10 border border-[var(--pc-color-border-light)] flex items-center justify-center flex-shrink-0">
                          <Store size={22} className="text-[var(--pc-color-primary)]" aria-hidden="true" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <h5 className="font-body font-extrabold text-sm text-[var(--pc-color-text-primary-light)]">
                            Pizza City — {branch.name}
                            {branch.delivery === false && (
                              <span className="ml-2 inline-block align-middle text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                Pickup only
                              </span>
                            )}
                          </h5>
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--pc-color-text-secondary-light)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                            <span className="truncate">{branch.delivery === false ? "Pickup only" : (branch.hours || "Open Now · Daily 11 AM - 11 PM")}</span>
                            <span className="flex-shrink-0">·</span>
                            <Phone size={11} className="flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">{branch.phone}</span>
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[var(--pc-color-primary)] to-[var(--pc-color-cta)] flex items-center justify-center text-white shadow-md flex-shrink-0">
                          <ArrowRight size={16} aria-hidden="true" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm text-[var(--pc-color-text-muted-light)] py-4">No matching active outlets found.</p>
                  )}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep("checkout")}
                  className="cart-btn cart-btn-secondary flex-1 py-3 text-sm"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Edit Details
                </button>
              </div>
            </div>
          )}

          {/* Footer note info banner */}
          <div className="bg-[var(--pc-color-cta)]/5 border border-[var(--pc-color-cta)]/20 rounded-xl p-3 flex items-center gap-3 text-xs text-[var(--pc-color-text-secondary-light)]">
            <MessageSquare size={18} className="text-[var(--pc-color-cta)] flex-shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">
              Confirming order will securely save details to the Pizza City database and redirect to WhatsApp to send the invoice automatically.
            </p>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
