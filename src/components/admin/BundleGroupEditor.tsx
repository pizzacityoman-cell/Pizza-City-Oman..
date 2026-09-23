import React, { useState, useMemo } from "react";
import { Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { BundleGroup, MenuItem } from "../../types";
import { BundleOptionSelector } from "./BundleOptionSelector";

interface BundleGroupEditorProps {
  group: BundleGroup;
  index: number;
  onChange: (updatedGroup: BundleGroup) => void;
  onDelete: () => void;
  menuItems: MenuItem[];
}

export const BundleGroupEditor: React.FC<BundleGroupEditorProps> = ({
  group,
  index,
  onChange,
  onDelete,
  menuItems,
}) => {
  const [isOptionSelectorOpen, setIsOptionSelectorOpen] = useState(false);

  const selectedItems = useMemo(() => {
    const map = new Map(menuItems.map((m) => [m._id, m]));
    return group.optionItemIds
      .map((id) => map.get(id))
      .filter((m): m is MenuItem => Boolean(m));
  }, [group.optionItemIds, menuItems]);

  // Validation warnings
  const validationWarnings: string[] = [];
  if (group.minSelections > group.maxSelections) {
    validationWarnings.push("Min selections cannot be greater than max selections.");
  }
  if (group.required && group.maxSelections < 1) {
    validationWarnings.push("A required group must allow at least 1 selection.");
  }
  if (!group.allowDuplicates && group.optionItemIds.length < group.maxSelections) {
    validationWarnings.push(
      `Only ${group.optionItemIds.length} option(s) available, but max is ${group.maxSelections} without duplicates allowed.`
    );
  }
  if (group.optionItemIds.length === 0) {
    validationWarnings.push("Please select at least one menu item option for this group.");
  }

  return (
    <div className="bg-[var(--pc-gray-50)] border border-[var(--pc-red-500)]/15 rounded-2xl p-4 space-y-4">
      {/* Group Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--pc-red-500)] text-white text-[11px] font-black flex items-center justify-center">
            {index + 1}
          </span>
          <h4 className="text-xs font-black text-[var(--pc-gray-700)] uppercase tracking-wider">
            Group {index + 1}: {group.title || "Untitled Group"}
          </h4>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
          title="Delete Group"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-[var(--pc-gray-500)] mb-1">
            Group Title *
          </label>
          <input
            type="text"
            value={group.title}
            onChange={(e) => onChange({ ...group, title: e.target.value })}
            placeholder="e.g., Choose 3 Pizzas"
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--pc-amber-400)]"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-[var(--pc-gray-500)] mb-1">
            Description (Optional)
          </label>
          <input
            type="text"
            value={group.description || ""}
            onChange={(e) => onChange({ ...group, description: e.target.value })}
            placeholder="e.g., Select any 3 medium pizza flavors"
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[var(--pc-amber-400)]"
          />
        </div>
      </div>

      {/* Quantities & Options */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-[var(--pc-gray-500)] mb-1">
            Min Selections
          </label>
          <input
            type="number"
            min="0"
            value={group.minSelections}
            onChange={(e) =>
              onChange({
                ...group,
                minSelections: Math.max(0, parseInt(e.target.value) || 0),
              })
            }
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[var(--pc-amber-400)]"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-[var(--pc-gray-500)] mb-1">
            Max Selections
          </label>
          <input
            type="number"
            min="1"
            value={group.maxSelections}
            onChange={(e) =>
              onChange({
                ...group,
                maxSelections: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[var(--pc-amber-400)]"
          />
        </div>

        <div className="flex items-center pt-4">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--pc-gray-600)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={group.required}
              onChange={(e) => onChange({ ...group, required: e.target.checked })}
              className="w-4 h-4 rounded text-[var(--pc-red-500)] accent-[var(--pc-red-500)] cursor-pointer"
            />
            Required Group
          </label>
        </div>

        <div className="flex items-center pt-4">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--pc-gray-600)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={group.allowDuplicates}
              onChange={(e) => onChange({ ...group, allowDuplicates: e.target.checked })}
              className="w-4 h-4 rounded text-[var(--pc-red-500)] accent-[var(--pc-red-500)] cursor-pointer"
            />
            Allow Duplicates
          </label>
        </div>
      </div>

      {/* Allowed Products Selection */}
      <div className="border-t border-gray-200/60 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-black tracking-wider text-[var(--pc-gray-500)]">
              Allowed Options ({group.optionItemIds.length})
            </span>
            {group.optionItemIds.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
                <CheckCircle2 size={12} /> Ready
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOptionSelectorOpen(true)}
            className="text-[11px] font-black text-[var(--pc-red-500)] hover:text-[var(--pc-amber-500)] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus size={13} />
            {group.optionItemIds.length === 0 ? "Select Options" : "Edit Options"}
          </button>
        </div>

        {/* Selected Items Pills Preview */}
        {selectedItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
            {selectedItems.map((item) => (
              <span
                key={item._id}
                className="inline-flex items-center gap-1 text-[10px] font-bold bg-white text-[var(--pc-gray-700)] px-2.5 py-1 rounded-full border border-gray-200"
              >
                <span>{item.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...group,
                      optionItemIds: group.optionItemIds.filter((id) => id !== item._id),
                    })
                  }
                  className="text-gray-400 hover:text-red-500 ml-0.5"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic">
            No products assigned yet. Click &ldquo;Select Options&rdquo; to choose from your menu.
          </p>
        )}
      </div>

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800 space-y-1">
          {validationWarnings.map((warn, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <AlertCircle size={13} className="shrink-0 text-amber-600" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Option Selector Modal */}
      <BundleOptionSelector
        isOpen={isOptionSelectorOpen}
        onClose={() => setIsOptionSelectorOpen(false)}
        menuItems={menuItems}
        selectedOptionItemIds={group.optionItemIds}
        onChange={(ids) => onChange({ ...group, optionItemIds: ids })}
        groupTitle={group.title}
      />
    </div>
  );
};
