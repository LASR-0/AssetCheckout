import { useState, useEffect } from "react";
import { getDevUserName, setDevUserName } from "@/hooks/useAuth";

export default function DevAuthToggle() {
  const [current, setCurrent] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");

  useEffect(() => {
    setCurrent(getDevUserName());
  }, []);

  const apply = (name: string) => {
    setDevUserName(name);
    setCurrent(name);
    setCustomName("");
  };

  return (
    <div className="space-y-3 p-3 border-t border-outline/20 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider">
        Dev auth
      </div>

      <div className="space-y-1">
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply(customName);
          }}
          placeholder="e.g. Alice Smith"
          className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-container-lowest border border-outline/40 outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button
            onClick={() => apply(customName)}
            disabled={!customName.trim()}
            className="flex-1 px-3 py-1.5 text-xs rounded-md bg-filter/30 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => apply("")}
            className="px-3 py-1.5 text-xs rounded-md bg-surface text-info-light hover:cursor-pointer transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {current && (
        <div className="text-xs text-info-light">
          Current: <span className="font-mono capitalize">{current}</span>
        </div>
      )}
    </div>
  );
}