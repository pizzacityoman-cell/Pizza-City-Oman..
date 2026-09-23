import React from "react";
import { Plus, Layers, Sparkles } from "lucide-react";
import { BundleConfig, BundleGroup, MenuItem } from "../../types";
import { BundleGroupEditor } from "./BundleGroupEditor";

interface BundleConfigEditorProps {
  bundleConfig: BundleConfig | undefined;
  onChange: (config: BundleConfig | undefined) => void;
  menuItems: MenuItem[];
}

export const BundleConfigEditor: React.FC<BundleConfigEditorProps> = ({
  bundleConfig,
  onChange,
  menuItems,
}) => {
  const isEnabled = Boolean(bundleConfig?.enabled);
  const groups = bundleConfig?.groups || [];

  const handleToggleEnabled = (enabled: boolean) => {
    if (enabled) {
      onChange({
        enabled: true,
        groups: groups.length > 0 ? groups : [
          {
            id: `group_${Date.now()}`,
            title: "Choose Pizzas",
            description: "Pick your preferred pizza flavors",
            minSelections: 1,
            maxSelections: 1,
            required: true,
            allowDuplicates: false,
            optionItemIds: [],
          },
        ],
      });
    } else {
      onChange({
        enabled: false,
        groups,
      });
    }
  };

  const handleAddGroup = () => {
    const newGroup: BundleGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: `Selection Group ${groups.length + 1}`,
      description: "",
      minSelections: 1,
      maxSelections: 1,
      required: true,
      allowDuplicates: false,
      optionItemIds: [],
    };
    onChange({
      enabled: true,
      groups: [...groups, newGroup],
    });
  };

  const handleUpdateGroup = (index: number, updatedGroup: BundleGroup) => {
    const newGroups = [...groups];
    newGroups[index] = updatedGroup;
    onChange({
      enabled: true,
      groups: newGroups,
    });
  };

  const handleDeleteGroup = (index: number) => {
    const newGroups = groups.filter((_, i) => i !== index);
    onChange({
      enabled: true,
      groups: newGroups,
    });
  };

  return (
    <div className="border-t border-dashed border-gray-200 pt-4 space-y-4">
      {/* Bundle Header & Toggle */}
      <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-[var(--pc-red-500)]/5 to-[var(--pc-amber-400)]/10 rounded-2xl border border-[var(--pc-amber-400)]/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--pc-red-500)] to-[var(--pc-amber-400)] flex items-center justify-center text-white shadow-xs">
            <Layers size={16} />
          </div>
          <div>
            <h4 className="text-xs font-black text-[var(--pc-gray-700)] flex items-center gap-1.5">
              Customizable Bundle Mode
              {isEnabled && (
                <span className="text-[10px] font-black bg-[var(--pc-amber-400)] text-white px-2 py-0.5 rounded-full uppercase">
                  Active
                </span>
              )}
            </h4>
            <p className="text-[11px] text-[var(--pc-gray-500)]">
              Allow customers to build this item from menu groups (e.g. 1 Meter Pizza, Combos)
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--pc-red-500)]"></div>
        </label>
      </div>

      {/* Bundle Configuration Body */}
      {isEnabled && (
        <div className="space-y-4 pl-1">
          {groups.length === 0 ? (
            <div className="text-center py-8 bg-[var(--pc-gray-50)] rounded-2xl border border-dashed border-gray-300 space-y-2">
              <Sparkles size={24} className="mx-auto text-[var(--pc-amber-400)]" />
              <p className="text-xs font-bold text-[var(--pc-gray-600)]">
                No selection groups defined yet
              </p>
              <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                Add groups like &ldquo;Choose 3 Pizzas&rdquo; or &ldquo;Choose 1 Side&rdquo; to build your bundle.
              </p>
              <button
                type="button"
                onClick={handleAddGroup}
                className="mt-2 px-4 py-2 bg-[var(--pc-red-500)] text-white text-xs font-bold rounded-full hover:bg-[var(--pc-red-600)] transition-colors inline-flex items-center gap-1.5"
              >
                <Plus size={14} /> Add First Group
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group, index) => (
                <BundleGroupEditor
                  key={group.id}
                  group={group}
                  index={index}
                  onChange={(updated) => handleUpdateGroup(index, updated)}
                  onDelete={() => handleDeleteGroup(index)}
                  menuItems={menuItems}
                />
              ))}

              <div className="flex justify-between items-center pt-2">
                <span className="text-[11px] text-[var(--pc-gray-500)] font-medium">
                  {groups.length} selection group{groups.length === 1 ? "" : "s"} configured
                </span>
                <button
                  type="button"
                  onClick={handleAddGroup}
                  className="px-4 py-2 border-2 border-dashed border-[var(--pc-red-500)]/30 text-[var(--pc-red-500)] text-xs font-black rounded-xl hover:bg-[var(--pc-red-500)]/5 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={14} /> Add Another Selection Group
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
