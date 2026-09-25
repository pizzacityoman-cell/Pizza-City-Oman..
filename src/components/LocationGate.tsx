import { useState, useEffect, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  Navigation,
  Search,
  AlertCircle,
  X,
  Check,
  Loader2,
  Store,
  Bike,
  ShoppingBag,
  Clock,
  Phone,
  ChevronRight,
} from "lucide-react";
import { CustomerLocation, Branch, OrderType } from "../types";
import { resolveAddressToCoordinates, getBranchCoordinates } from "../lib/location";

interface LocationGateProps {
  isOpen: boolean;
  onClose?: () => void;
  onLocationSelected: (location: CustomerLocation) => void;
  currentLocation?: CustomerLocation | null;
  canDismiss?: boolean;
  branches?: Branch[];
}

export default function LocationGate({
  isOpen,
  onClose,
  onLocationSelected,
  currentLocation,
  canDismiss = true,
  branches = [],
}: LocationGateProps) {
  const [orderType, setOrderType] = useState<OrderType>(
    currentLocation?.orderType || "delivery"
  );
  const [deliveryTab, setDeliveryTab] = useState<"gps" | "manual">("gps");
  const [isLocating, setIsLocating] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [selectedBranchName, setSelectedBranchName] = useState<string | null>(
    currentLocation?.selectedBranchName || null
  );
  const [branchSearch, setBranchSearch] = useState("");

  // Load branches if not passed as prop
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Sync state when modal opens or currentLocation updates
  useEffect(() => {
    if (isOpen) {
      if (currentLocation?.orderType) {
        setOrderType(currentLocation.orderType);
      }
      if (currentLocation?.selectedBranchName) {
        setSelectedBranchName(currentLocation.selectedBranchName);
      }
    }
  }, [isOpen, currentLocation]);

  useEffect(() => {
    if (!isOpen) return;
    if (branches && branches.length > 0) {
      setLocalBranches(branches.filter((b) => b.isActive !== false));
      setIsLoadingBranches(false);
      return;
    }
    // Only fetch if we don't have branches loaded yet
    if (localBranches.length === 0) {
      setIsLoadingBranches(true);
      fetch("/api/branches")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setLocalBranches(data.filter((b: any) => b.isActive !== false));
          }
        })
        .catch((err) => console.warn("Failed fetching branches:", err))
        .finally(() => setIsLoadingBranches(false));
    }
  }, [isOpen, branches]);

  // Reset states when order type changes
  useEffect(() => {
    setErrorMessage(null);
    setSuccessInfo(null);
  }, [orderType]);

  const filteredBranches = localBranches.filter((b) => {
    const q = branchSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      b.name.toLowerCase().includes(q) ||
      b.address.toLowerCase().includes(q)
    );
  });

  // ── Delivery: GPS ──────────────────────────────────────────────────
  const handleUseGps = () => {
    setErrorMessage(null);
    setSuccessInfo(null);

    if (!navigator.geolocation) {
      setErrorMessage(
        "Geolocation is not supported by your browser. Please enter your location manually below."
      );
      setDeliveryTab("manual");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const loc: CustomerLocation = {
          latitude,
          longitude,
          accuracy,
          address: "Current GPS Location",
          source: "gps",
          timestamp: Date.now(),
          orderType: "delivery",
        };
        setSuccessInfo("Location detected!");
        setTimeout(() => {
          onLocationSelected(loc);
        }, 300);
      },
      (err) => {
        setIsLocating(false);
        let msg = "Could not get your location.";
        if (err.code === 1) {
          msg =
            "Location permission denied. Please allow location access or type your address manually below.";
          setDeliveryTab("manual");
        } else if (err.code === 2) {
          msg =
            "Location position unavailable. Please type your address manually.";
          setDeliveryTab("manual");
        } else if (err.code === 3) {
          msg =
            "Location request timed out. Please try again or type your address manually.";
        }
        setErrorMessage(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  // ── Delivery: Manual ───────────────────────────────────────────────
  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) {
      setErrorMessage(
        "Please enter an address or area name in Oman (e.g., Al Khoud, Nizwa, Samail)."
      );
      return;
    }

    setErrorMessage(null);
    setSuccessInfo(null);
    setIsResolving(true);

    try {
      const resolved = await resolveAddressToCoordinates(manualInput);
      const loc: CustomerLocation = {
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        address: resolved.address,
        source: "manual",
        timestamp: Date.now(),
        orderType: "delivery",
      };
      setSuccessInfo(
        `Found: ${resolved.address.split(",").slice(0, 2).join(",")}`
      );
      setTimeout(() => {
        setIsResolving(false);
        onLocationSelected(loc);
      }, 300);
    } catch (err: any) {
      setIsResolving(false);
      setErrorMessage(
        err.message || "Could not resolve address. Please refine and try again."
      );
    }
  };

  // ── Pick-Up: Branch Selection ──────────────────────────────────────
  const handlePickupSelect = (branch: Branch) => {
    const coords = getBranchCoordinates(branch);
    const loc: CustomerLocation = {
      latitude: coords?.latitude ?? 0,
      longitude: coords?.longitude ?? 0,
      address: branch.address || branch.name,
      source: "manual",
      timestamp: Date.now(),
      orderType: "pickup",
      selectedBranchName: branch.name,
    };
    setSelectedBranchName(branch.name);
    setSuccessInfo(`Pick-up from ${branch.name}!`);
    setTimeout(() => {
      onLocationSelected(loc);
    }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={canDismiss && onClose ? onClose : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-label="Choose Order Type"
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[var(--pc-red-500)]/10 z-10 overflow-hidden max-h-[88vh] flex flex-col my-auto"
          >
            {/* ── Top Accent Bar ────────────────────────────────── */}
            <div className="h-1 w-full bg-gradient-to-r from-[var(--pc-red-500)] via-[var(--pc-amber-400)] to-[var(--pc-red-500)]" />

            {/* ── Close Button ──────────────────────────────────── */}
            {canDismiss && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-5 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer z-20"
              >
                <X size={16} />
              </button>
            )}

            {/* ── Scrollable content ───────────────────────────── */}
            <div className="overflow-y-auto flex-1 p-5 sm:p-6">
              {/* Header */}
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white flex items-center justify-center mx-auto shadow-md shadow-[var(--pc-red-500)]/20 mb-3">
                  <MapPin size={28} />
                </div>
                <h2 className="font-playfair font-black text-xl sm:text-2xl text-[var(--pc-gray-700)]">
                  How would you like your order?
                </h2>
                <p className="text-xs text-[var(--pc-gray-500)] mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Choose delivery to your door, or pick up from our nearest outlet.
                </p>
              </div>

              {/* ── Order Type Toggle ── Delivery / Pick-Up ────── */}
              <div className="flex bg-gray-100 p-1 rounded-2xl mb-5 gap-1">
                <button
                  type="button"
                  onClick={() => setOrderType("delivery")}
                  className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    orderType === "delivery"
                      ? "bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-red-600)] text-white shadow-md shadow-[var(--pc-red-500)]/20"
                      : "text-[var(--pc-gray-500)] hover:text-[var(--pc-gray-700)] hover:bg-white/50"
                  }`}
                >
                  <Bike size={15} />
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("pickup")}
                  className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    orderType === "pickup"
                      ? "bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-red-600)] text-white shadow-md shadow-[var(--pc-red-500)]/20"
                      : "text-[var(--pc-gray-500)] hover:text-[var(--pc-gray-700)] hover:bg-white/50"
                  }`}
                >
                  <Store size={15} />
                  Pick-Up
                </button>
              </div>

              {/* ── Current saved location notice ──────────────── */}
              {currentLocation && (
                <div className="mb-4 p-3 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between text-xs">
                  <div className="truncate pr-2">
                    <span className="font-bold text-[var(--pc-gray-700)] block">
                      Current:
                    </span>
                    <span className="text-[var(--pc-gray-500)] truncate block">
                      {currentLocation.orderType === "pickup" && currentLocation.selectedBranchName
                        ? `Pick-up: ${currentLocation.selectedBranchName}`
                        : currentLocation.address ||
                          `${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}`}
                    </span>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                    Active
                  </span>
                </div>
              )}

              {/* ── Error Message ──────────────────────────────── */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-2 animate-fadeIn">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* ── Success Feedback ───────────────────────────── */}
              {successInfo && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-800 flex items-center gap-2 animate-fadeIn">
                  <Check size={15} className="shrink-0" />
                  <span className="font-bold">{successInfo}</span>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════
                   DELIVERY FLOW
                 ═══════════════════════════════════════════════════ */}
              {orderType === "delivery" && (
                <div className="space-y-4">
                  {/* Sub-tabs: GPS / Manual Address */}
                  <div className="flex bg-gray-50 p-0.5 rounded-xl gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryTab("gps");
                        setErrorMessage(null);
                      }}
                      className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        deliveryTab === "gps"
                          ? "bg-white text-[var(--pc-red-500)] shadow-sm"
                          : "text-[var(--pc-gray-500)] hover:text-[var(--pc-gray-700)]"
                      }`}
                    >
                      <Navigation size={12} />
                      Use GPS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryTab("manual");
                        setErrorMessage(null);
                      }}
                      className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        deliveryTab === "manual"
                          ? "bg-white text-[var(--pc-red-500)] shadow-sm"
                          : "text-[var(--pc-gray-500)] hover:text-[var(--pc-gray-700)]"
                      }`}
                    >
                      <Search size={12} />
                      Enter Address
                    </button>
                  </div>

                  {/* GPS Tab */}
                  {deliveryTab === "gps" && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        disabled={isLocating}
                        onClick={handleUseGps}
                        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-[var(--pc-red-500)]/25 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                      >
                        {isLocating ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Locating via GPS...
                          </>
                        ) : (
                          <>
                            <Navigation size={18} />
                            Use My Current Location
                          </>
                        )}
                      </button>
                      <p className="text-[11px] text-center text-[var(--pc-gray-400)]">
                        Your browser will ask for one-time location permission to
                        calculate distance to our kitchens.
                      </p>
                    </div>
                  )}

                  {/* Manual Tab */}
                  {deliveryTab === "manual" && (
                    <form onSubmit={handleManualSubmit} className="space-y-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="manual-loc-input"
                          className="text-xs font-bold text-[var(--pc-gray-700)] block"
                        >
                          Wilayat, City or Landmark
                        </label>
                        <div className="relative">
                          <input
                            id="manual-loc-input"
                            type="text"
                            placeholder="e.g. Al Khoud 6, Nizwa Souq, Samail..."
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            className="w-full bg-white border border-gray-200 focus:border-[var(--pc-red-500)] rounded-2xl px-4 py-3 text-sm text-[var(--pc-gray-700)] focus:outline-none transition-colors"
                            autoFocus
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Search size={16} />
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--pc-gray-400)] block">
                          Tip: You can also paste coordinates (e.g. 23.5753,
                          58.1824) or a Google Maps link.
                        </span>
                      </div>

                      <button
                        type="submit"
                        disabled={isResolving || !manualInput.trim()}
                        className="w-full py-3.5 px-6 rounded-2xl bg-[var(--pc-red-500)] hover:bg-[var(--pc-red-600)] text-white font-black text-sm uppercase tracking-wider shadow-md shadow-[var(--pc-red-500)]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isResolving ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Checking Distance...
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Set Location & Find Outlet
                          </>
                        )}
                      </button>

                      <p className="text-[10px] text-center text-[var(--pc-gray-400)]">
                        Map search data ©{" "}
                        <a
                          href="https://www.openstreetmap.org/copyright"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-[var(--pc-gray-600)]"
                        >
                          OpenStreetMap contributors
                        </a>
                      </p>
                    </form>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════
                   PICK-UP FLOW — Branch Selection
                 ═══════════════════════════════════════════════════ */}
              {orderType === "pickup" && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-[var(--pc-gray-700)]">
                    Select an outlet for pick-up:
                  </p>

                  {/* Branch search */}
                  {localBranches.length > 4 && (
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search outlets..."
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 focus:border-[var(--pc-red-500)] rounded-xl px-4 py-2.5 text-xs text-[var(--pc-gray-700)] focus:outline-none transition-colors pl-9"
                      />
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                    </div>
                  )}

                  {/* Loading */}
                  {isLoadingBranches && (
                    <div className="flex items-center justify-center py-6 gap-2 text-xs text-[var(--pc-gray-500)]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading outlets...
                    </div>
                  )}

                  {/* Branch cards */}
                  {!isLoadingBranches && (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
                      {filteredBranches.length === 0 && (
                        <p className="text-xs text-[var(--pc-gray-400)] text-center py-4">
                          No outlets found.
                        </p>
                      )}
                      {filteredBranches.map((branch) => {
                        const isSelected = selectedBranchName === branch.name;
                        return (
                          <motion.button
                            key={branch._id || branch.name}
                            type="button"
                            onClick={() => handlePickupSelect(branch)}
                            whileTap={{ scale: 0.98 }}
                            className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer group ${
                              isSelected
                                ? "border-[var(--pc-red-500)] bg-[var(--pc-red-500)]/5 shadow-sm"
                                : "border-gray-100 bg-white hover:border-[var(--pc-red-500)]/30 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Branch icon */}
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-[var(--pc-red-500)] text-white"
                                    : "bg-gray-100 text-[var(--pc-gray-500)] group-hover:bg-[var(--pc-red-500)]/10 group-hover:text-[var(--pc-red-500)]"
                                }`}
                              >
                                <Store size={18} />
                              </div>

                              {/* Branch info */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`font-bold text-sm truncate ${
                                    isSelected
                                      ? "text-[var(--pc-red-500)]"
                                      : "text-[var(--pc-gray-700)]"
                                  }`}
                                >
                                  {branch.name}
                                </p>
                                <p className="text-[11px] text-[var(--pc-gray-400)] truncate mt-0.5">
                                  {branch.address}
                                </p>
                                {branch.hours && (
                                  <p className="text-[10px] text-[var(--pc-gray-400)] flex items-center gap-1 mt-0.5">
                                    <Clock size={10} />
                                    {branch.hours}
                                  </p>
                                )}
                              </div>

                              {/* Arrow / Check */}
                              <div className="flex-shrink-0">
                                {isSelected ? (
                                  <div className="w-6 h-6 rounded-full bg-[var(--pc-red-500)] text-white flex items-center justify-center">
                                    <Check size={14} />
                                  </div>
                                ) : (
                                  <ChevronRight
                                    size={16}
                                    className="text-gray-300 group-hover:text-[var(--pc-red-500)] transition-colors"
                                  />
                                )}
                              </div>
                            </div>

                            {/* Phone number */}
                            {branch.phone && (
                              <p className="text-[10px] text-[var(--pc-gray-400)] mt-2 flex items-center gap-1 pl-[52px]">
                                <Phone size={10} />
                                {branch.phone}
                              </p>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
