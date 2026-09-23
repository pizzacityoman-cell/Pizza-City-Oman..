import React, { useState, useMemo } from "react";
import { Search, X as CloseIcon, Check } from "lucide-react";
import { MenuItem } from "../../types";
import { FALLBACK_FOOD_IMAGE } from "../../lib/images";

interface BundleOptionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  selectedOptionItemIds: string[];
  onChange: (ids: string[]) => void;
  groupTitle: string;
}

export const BundleOptionSelector: React.FC<BundleOptionSelectorProps> = ({
  isOpen,
  onClose,
  menuItems,
  selectedOptionItemIds,
  onChange,
  groupTitle,
}) => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ["all", ...Array.from(set)];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === "all" || item.category === selectedCategory;
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [menuItems, search, selectedCategory]);

  const selectedSet = useMemo(() => new Set(selectedOptionItemIds), [selectedOptionItemIds]);

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedOptionItemIds.filter((item) => item !== id));
    } else {
      onChange([...selectedOptionItemIds, id]);
    }
  };

  const handleSelectAllFiltered = () => {
    const newSet = new Set(selectedOptionItemIds);
    filteredItems.forEach((it) => newSet.add(it._id));
    onChange(Array.from(newSet));
  };

  const handleDeselectAllFiltered = () => {
    const filteredIdSet = new Set(filteredItems.map((it) => it._id));
    onChange(selectedOptionItemIds.filter((id) => !filteredIdSet.has(id)));
  };

  return (
    <div className="fixed inset-0 bg-[var(--pc-gray-700)]/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-[var(--pc-red-500)]/15 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-playfair font-black text-lg text-[var(--pc-gray-700)]">
              Allowed Options for &ldquo;{groupTitle || "Group"}&rdquo;
            </h3>
            <p className="text-xs text-[var(--pc-gray-500)]">
              {selectedOptionItemIds.length} item(s) currently selected
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-[var(--pc-gray-700)] rounded-full hover:bg-gray-100 transition-colors"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-100 bg-[var(--pc-gray-50)] space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name or category..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[var(--pc-amber-400)]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 overflow-x-auto scrollbar-thin py-0.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold capitalize transition-colors ${
                    selectedCategory === cat
                      ? "bg-[var(--pc-red-500)] text-white"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex gap-2 text-[11px]">
              <button
                onClick={handleSelectAllFiltered}
                className="font-bold text-[var(--pc-red-500)] hover:underline"
              >
                Select Shown
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleDeselectAllFiltered}
                className="font-bold text-gray-500 hover:underline"
              >
                Clear Shown
              </button>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {filteredItems.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-400 text-xs">
              No menu items match your search.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedSet.has(item._id);
              return (
                <div
                  key={item._id}
                  onClick={() => toggleItem(item._id)}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[var(--pc-amber-400)]/10 border-[var(--pc-amber-400)]"
                      : "bg-white border-gray-150 hover:border-gray-300"
                  }`}
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    <img
                      src={item.image || FALLBACK_FOOD_IMAGE}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const el = e.currentTarget;
                        if (el.src !== FALLBACK_FOOD_IMAGE) el.src = FALLBACK_FOOD_IMAGE;
                      }}
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-[var(--pc-red-500)]/70 flex items-center justify-center text-white">
                        <Check size={16} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[var(--pc-gray-700)] truncate">
                      {item.name}
                    </p>
                    <p className="text-[10px] text-[var(--pc-gray-400)] capitalize">
                      {item.category} • OMR {item.price.toFixed(3)}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-[var(--pc-red-500)] border-[var(--pc-red-500)] text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-[var(--pc-gray-500)] font-medium">
            {selectedOptionItemIds.length} option(s) enabled for customer selection
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-[var(--pc-red-500)] to-[var(--pc-amber-400)] text-white text-xs font-black rounded-full hover:brightness-105 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
