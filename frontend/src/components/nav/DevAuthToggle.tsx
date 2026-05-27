import { useState, useEffect } from "react";
import {
  getDevUserName,
  setDevUserName,
  getDevUserEmail,
  setDevUserEmail,
} from "@/hooks/useAuth";

export default function DevAuthToggle() {
  const [currentName, setCurrentName] = useState<string>("");
  const [currentEmail, setCurrentEmail] = useState<string>("");
  const [customName, setCustomName] = useState<string>("");
  const [customEmail, setCustomEmail] = useState<string>("");

  useEffect(() => {
    setCurrentName(getDevUserName());
    setCurrentEmail(getDevUserEmail());
  }, []);

  const apply = (name: string, email: string) => {
    setDevUserName(name);
    setDevUserEmail(email);
    setCurrentName(name);
    setCurrentEmail(email);
    setCustomName("");
    setCustomEmail("");
  };

  return (
    <div className="space-y-3 p-3 border-t border-outline/20 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider">
        Dev auth
      </div>

      <div className="space-y-2">
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Display name — e.g. Alice Smith"
          className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-container-lowest border border-outline/40 outline-none focus:border-primary"
        />
        <input
          value={customEmail}
          onChange={(e) => setCustomEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply(customName, customEmail);
          }}
          placeholder="Email — required for admin access"
          className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-container-lowest border border-outline/40 outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button
            onClick={() => apply(customName, customEmail)}
            disabled={!customName.trim()}
            className="flex-1 px-3 py-1.5 text-xs rounded-md bg-filter/30 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => apply("", "")}
            className="px-3 py-1.5 text-xs rounded-md bg-surface text-info-light hover:cursor-pointer transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {currentName && (
        <div className="text-xs text-info-light space-y-0.5">
          <div>Name: <span className="font-mono">{currentName}</span></div>
          {currentEmail && (
            <div>Email: <span className="font-mono">{currentEmail}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
