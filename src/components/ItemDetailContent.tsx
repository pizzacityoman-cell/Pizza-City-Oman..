import React, { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Share2, Check, CheckCircle2, AlertCircle } from "lucide-react";
import { MenuItem, BundleSelection, BundleGroup } from "../types";
import {
  getDefaultSizes,
  getSizeAdjustedPrice,
  getOptimizedUnitPrice,
  getEffectiveBasePrice,
} from "../lib/priceUtils";
import { getMenuItemAltText } from "../lib/altText";
import { FALLBACK_FOOD_IMAGE, getMediaUrl } from "../lib/images";
import MenuCard from "./MenuCard";

interface ItemDetailContentProps {
  item: MenuItem;
  related: MenuItem[];
  onAdd: (item: MenuItem, size: string, quantity: number, bundleSelections?: BundleSelection[]) => void;
  /** Card buttons inside "related" keep the standard configure-modal flow. */
  onConfigure: (item: MenuItem) => void;
  onQuickView?: (item: MenuItem) => void;
  displayToast?: (msg: string) => void;
  menuItems?: MenuItem[];
}

export default function ItemDetailContent({
  item,
  related,
  onAdd,
  onConfigure,
  onQuickView,
  displayToast,
  menuItems = [],
}: ItemDetailContentProps) {
  const isUnavailable = item.available === false;
  const isBundle = Boolean(item.bundleConfig?.enabled && item.bundleConfig.groups && item.bundleConfig.groups.length > 0);
  const bundleGroups = item.bundleConfig?.groups || [];

  const sizes = useMemo(
    () => item.sizes || getDefaultSizes(item.category),
    [item.sizes, item.category]
  );
  const basePrice = getEffectiveBasePrice(item.price, item.discountPrice);
  const [size, setSize] = useState(sizes[0]?.name || "Medium");
  const [qty, setQty] = useState(1);
  const [copied, setCopied] = useState(false);

  // Bundle selections state: groupId -> { optionItemId: quantity }
  const [groupSelections, setGroupSelections] = useState<Record<string, Record<string, number>>>({});
  // Track which bundle groups are fully expanded (show all items)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Menu items map for fast option resolution
  const menuMap = useMemo(() => {
    const map = new Map<string, MenuItem>();
    menuItems.forEach((m) => map.set(m._id, m));
    related.forEach((m) => {
      if (!map.has(m._id)) map.set(m._id, m);
    });
    return map;
  }, [menuItems, related]);

  const getGroupCount = (groupId: string): number => {
    const sel = groupSelections[groupId] || {};
    return Object.values(sel).reduce((sum, val) => sum + val, 0);
  };

  const handleOptionQtyChange = (
    groupId: string,
    optionId: string,
    newQty: number,
    group: BundleGroup
  ) => {
    const currentGroup = groupSelections[groupId] || {};
    const currentCount = getGroupCount(groupId);
    const existingOptionQty = currentGroup[optionId] || 0;
    const diff = newQty - existingOptionQty;

    if (diff > 0 && currentCount + diff > group.maxSelections) {
      return;
    }

    const updatedGroup = { ...currentGroup };
    if (newQty <= 0) {
      delete updatedGroup[optionId];
    } else {
      updatedGroup[optionId] = newQty;
    }

    setGroupSelections((prev) => ({
      ...prev,
      [groupId]: updatedGroup,
    }));
  };

  const handleToggleOption = (groupId: string, optionId: string, group: BundleGroup) => {
    const currentGroup = groupSelections[groupId] || {};
    const isSelected = (currentGroup[optionId] || 0) > 0;
    const currentCount = getGroupCount(groupId);

    if (isSelected) {
      const updatedGroup = { ...currentGroup };
      delete updatedGroup[optionId];
      setGroupSelections((prev) => ({
        ...prev,
        [groupId]: updatedGroup,
      }));
    } else {
      if (currentCount >= group.maxSelections) return;
      setGroupSelections((prev) => ({
        ...prev,
        [groupId]: {
          ...currentGroup,
          [optionId]: 1,
        },
      }));
    }
  };

  const areAllGroupsValid = useMemo(() => {
    if (!isBundle) return true;
    return bundleGroups.every((group) => {
      const count = getGroupCount(group.id);
      if (group.required && count < (group.minSelections || 1)) return false;
      if (count < (group.minSelections || 0)) return false;
      if (count > group.maxSelections) return false;
      return true;
    });
  }, [isBundle, bundleGroups, groupSelections]);

  const activeSize = sizes.find((s) => s.name === size) ? size : sizes[0]?.name || "Medium";
  const unitPrice = getOptimizedUnitPrice(basePrice, activeSize, sizes, qty);
  const total = unitPrice * qty;

  const handleAddToCart = () => {
    if (!areAllGroupsValid) {
      displayToast?.("⚠️ Please finish making all required bundle selections.");
      return;
    }

    let bundleSelections: BundleSelection[] | undefined = undefined;
    if (isBundle && bundleGroups.length > 0) {
      bundleSelections = bundleGroups
        .map((group) => {
          const selMap = groupSelections[group.id] || {};
          const items = Object.entries(selMap)
            .filter(([_, q]) => q > 0)
            .map(([optId, q]) => {
              const optItem = menuMap.get(optId);
              return {
                menuItemId: optId,
                name: optItem?.name || optId,
                quantity: q,
              };
            });
          return {
            groupId: group.id,
            groupTitle: group.title,
            items,
          };
        })
        .filter((g) => g.items.length > 0);
    }

    onAdd(item, activeSize, qty, bundleSelections);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    displayToast?.("Link copied — share this dish!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-[20px] overflow-hidden bg-gray-100">
          <img
            src={getMediaUrl(item.image, 1000) || FALLBACK_FOOD_IMAGE}
            alt={getMenuItemAltText(item)}
            className="w-full aspect-[4/3] object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pc-amber-400)]">
                {item.category}
              </span>
              <h2 className="font-playfair font-black text-2xl md:text-3xl text-[var(--pc-color-text-primary-light)]">
                {item.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={share}
              aria-label="Copy link to this dish"
              className="shrink-0 p-2.5 rounded-full border border-gray-200 hover:border-[var(--pc-red-500)] hover:text-[var(--pc-red-500)] transition-colors cursor-pointer"
            >
              {copied ? <Check size={16} /> : <Share2 size={16} />}
            </button>
          </div>

          {isUnavailable ? (
            <span className="inline-block bg-red-600/95 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
              🚫 Out of Stock
            </span>
          ) : (
            item.discountPrice !== undefined &&
            item.discountPrice > 0 &&
            item.discountPrice < item.price && (
              <span className="inline-block bg-gradient-to-r from-amber-500 to-amber-400 text-black text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full">
                Save OMR {(item.price - item.discountPrice).toFixed(2)}
              </span>
            )
          )}

          <p className="text-sm leading-relaxed whitespace-pre-line text-[var(--pc-color-text-secondary-light)]">
            {item.description || "A delicious handcrafted item from Pizza City."}
          </p>

          {!isUnavailable && (
            <>
              {/* Bundle Customization Groups */}
              {isBundle && bundleGroups.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-playfair font-black text-sm text-[var(--pc-color-text-primary-light)] uppercase tracking-wider">
                        Customize Bundle
                      </h3>
                      <p className="text-[11px] text-[var(--pc-color-text-muted-light)]">
                        Select your preferred items for this combo
                      </p>
                    </div>
                    {areAllGroupsValid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                        <CheckCircle2 size={13} /> Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        <AlertCircle size={13} /> Selections Needed
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                    {bundleGroups.map((group) => {
                      const count = getGroupCount(group.id);
                      const isComplete =
                        count >= (group.minSelections || (group.required ? 1 : 0)) &&
                        count <= group.maxSelections;
                      const isOver = count > group.maxSelections;
                      const options = group.optionItemIds
                        .map((id) => menuMap.get(id))
                        .filter((it): it is MenuItem => Boolean(it));

                      return (
                        <div
                          key={group.id}
                          className="bg-gray-50/80 border border-gray-200/80 rounded-2xl p-3.5 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-xs font-black text-[var(--pc-color-text-primary-light)] uppercase tracking-wider">
                                {group.title}
                              </h4>
                              {group.description && (
                                <p className="text-[11px] text-[var(--pc-color-text-muted-light)]">
                                  {group.description}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0">
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                  isOver
                                    ? "bg-red-100 text-red-700"
                                    : isComplete && count > 0
                                    ? "bg-green-100 text-green-700 font-black"
                                    : group.required
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-200 text-gray-700"
                                }`}
                              >
                                {count}/{group.maxSelections} {group.required ? "(Required)" : "(Optional)"}
                              </span>
                            </div>
                          </div>

                          {/* Options Grid */}
                          {(() => {
                            const VISIBLE_LIMIT = 4;
                            const isExpanded = expandedGroups[group.id] ?? false;
                            const hasMore = options.length > VISIBLE_LIMIT;
                            const visibleOptions = isExpanded ? options : options.slice(0, VISIBLE_LIMIT);
                            const hiddenCount = options.length - VISIBLE_LIMIT;

                            return (
                              <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {options.length === 0 ? (
                                    <p className="col-span-full text-xs text-gray-400 italic py-2">
                                      No items available in this group.
                                    </p>
                                  ) : (
                                    visibleOptions.map((opt) => {
                                      const currentQty = groupSelections[group.id]?.[opt._id] || 0;
                                      const isSelected = currentQty > 0;

                                      return (
                                        <div
                                          key={opt._id}
                                          className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                                            isSelected
                                              ? "bg-white border-[var(--pc-color-primary)] shadow-xs"
                                              : "bg-white border-gray-200 hover:border-gray-300"
                                          }`}
                                        >
                                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                            <img
                                              src={getMediaUrl(opt.image, 200) || FALLBACK_FOOD_IMAGE}
                                              alt={opt.name}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                const el = e.currentTarget;
                                                if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
                                              }}
                                            />
                                          </div>

                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-[var(--pc-color-text-primary-light)] truncate">
                                              {opt.name}
                                            </p>
                                            <p className="text-[10px] text-[var(--pc-color-text-muted-light)] capitalize">
                                              {opt.category}
                                            </p>
                                          </div>

                                          {group.allowDuplicates ? (
                                            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5 shrink-0">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleOptionQtyChange(
                                                    group.id,
                                                    opt._id,
                                                    Math.max(0, currentQty - 1),
                                                    group
                                                  )
                                                }
                                                disabled={currentQty <= 0}
                                                className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                              >
                                                -
                                              </button>
                                              <span className="w-4 text-center text-xs font-bold">{currentQty}</span>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleOptionQtyChange(group.id, opt._id, currentQty + 1, group)
                                                }
                                                disabled={count >= group.maxSelections}
                                                className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                              >
                                                +
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleToggleOption(group.id, opt._id, group)}
                                              disabled={!isSelected && count >= group.maxSelections}
                                              className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                                                isSelected
                                                  ? "bg-[var(--pc-color-primary)] text-white border-transparent"
                                                  : count >= group.maxSelections
                                                  ? "bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed"
                                                  : "bg-white text-gray-700 border-gray-200 hover:border-[var(--pc-color-primary)]"
                                              }`}
                                            >
                                              {isSelected ? "Selected" : "Select"}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                                {hasMore && !isExpanded && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: true }))}
                                    className="text-[11px] font-bold text-[var(--pc-color-primary)] hover:text-[var(--pc-amber-400)] transition-colors cursor-pointer pt-1"
                                  >
                                    Show all items ({hiddenCount} more)
                                  </button>
                                )}
                                {hasMore && isExpanded && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: false }))}
                                    className="text-[11px] font-bold text-[var(--pc-color-text-muted-light)] hover:text-[var(--pc-color-primary)] transition-colors cursor-pointer pt-1"
                                  >
                                    Show fewer
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-[var(--pc-color-text-muted-light)]">
                  Size
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {sizes.map((s) => {
                    const price = getSizeAdjustedPrice(basePrice, s.name, sizes);
                    const selected = s.name === activeSize;
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => setSize(s.name)}
                        className={`min-w-0 px-2 py-2.5 rounded-xl border text-[13px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                          selected
                            ? "bg-[var(--pc-color-primary)] text-white border-transparent shadow-md"
                            : "bg-white border-gray-200 hover:border-[var(--pc-color-primary)] hover:text-[var(--pc-color-primary)]"
                        }`}
                      >
                        {s.label}
                        <span className={`block text-[10px] ${selected ? "text-white/80" : "text-[var(--pc-color-primary)]"}`}>
                          OMR {price.toFixed(3)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-1">
                  <button
                    type="button"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    aria-label="Decrease quantity"
                    className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold transition-colors cursor-pointer"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="font-black min-w-[24px] text-center">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(qty + 1)}
                    aria-label="Increase quantity"
                    className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold transition-colors cursor-pointer"
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pc-color-text-muted-light)]">Total</p>
                  <p className="font-black text-xl text-[var(--pc-color-primary)]">
                    OMR {total.toFixed(3)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={!areAllGroupsValid}
                onClick={handleAddToCart}
                className={`menu-btn w-full py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                  areAllGroupsValid
                    ? "menu-btn-primary cursor-pointer"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed border-transparent shadow-none"
                }`}
              >
                <ShoppingCart size={17} />
                {areAllGroupsValid ? "Add to Cart" : "Complete Selections to Add"}
              </button>
            </>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-playfair font-black text-xl text-[var(--pc-color-text-primary-light)]">
            You may also like
          </h3>
          <div className="menu-grid">
            {related.slice(0, 3).map((rel, index) => (
              <React.Fragment key={rel._id}>
                <MenuCard
                  item={rel}
                  onOrder={onConfigure}
                  index={index}
                  displayToast={displayToast}
                  onQuickView={onQuickView}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
