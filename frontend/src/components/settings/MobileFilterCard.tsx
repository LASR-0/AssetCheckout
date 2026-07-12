import { useEffect, useState } from "react";
import {
  fetchMobileFilterConfig,
  saveMobileFilterConfig,
} from "@/hooks/useMobileFilterConfig";
import { DEFAULT_MOBILE_CONFIG } from "@/lib/mobileNumber";

///  +-----------------------------------------------------------------+
///  |                 MOBILE FILTER SETTINGS CARD                     |
///  +-----------------------------------------------------------------+
//
//  Admin control for which numbers count as mobiles when reusing an
//  existing number: country calling code + the leading digit that marks
//  a mobile. AU: +61 / 4 → mobiles match "+61 4..." or "04...".
//
//  Explicit Save (not save-on-change) — free-text inputs auto-saving on
//  every keystroke would persist half-typed values. Save enables only
//  when the form is dirty AND valid.
///  +-----------------------------------------------------------------+

const INPUT_CLASS =
  "text-on-surface-variant bg-surface-container/40 rounded-lg p-2 h-11 border-1 border-outline focus:outline-none focus:ring-1 focus:ring-purple-900 w-full";

export default function MobileFilterCard() {
  const [countryCode, setCountryCode] = useState(DEFAULT_MOBILE_CONFIG.countryCode);
  const [leadingDigit, setLeadingDigit] = useState(DEFAULT_MOBILE_CONFIG.mobileLeadingDigit);
  const [savedConfig, setSavedConfig] = useState({
    countryCode: DEFAULT_MOBILE_CONFIG.countryCode,
    mobileLeadingDigit: DEFAULT_MOBILE_CONFIG.mobileLeadingDigit,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMobileFilterConfig().then((cfg) => {
      if (cancelled) return;
      setCountryCode(cfg.countryCode);
      setLeadingDigit(cfg.mobileLeadingDigit);
      setSavedConfig(cfg);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ccValid = /^\d{1,3}$/.test(countryCode.trim());
  const digitValid = /^\d$/.test(leadingDigit.trim());
  const isValid = ccValid && digitValid;
  const isDirty =
    countryCode.trim() !== savedConfig.countryCode ||
    leadingDigit.trim() !== savedConfig.mobileLeadingDigit;

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const saved = await saveMobileFilterConfig({
        countryCode: countryCode.trim(),
        mobileLeadingDigit: leadingDigit.trim(),
      });
      setSavedConfig(saved);
      setCountryCode(saved.countryCode);
      setLeadingDigit(saved.mobileLeadingDigit);
      setStatus({ kind: "ok", text: "Saved" });
    } catch (err: any) {
      setStatus({ kind: "error", text: err.message || "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center py-4 font-semibold text-info-light text-sm">
        <span className="animate-spin h-4 w-4 border-2 border-info-light border-t-transparent rounded-full mr-3" />
        Loading...
      </div>
    );
  }

  // Live preview from the CURRENT inputs (falls back to saved values while
  // an input is mid-edit/invalid, so the preview never shows garbage).
  const previewCc = ccValid ? countryCode.trim() : savedConfig.countryCode;
  const previewDigit = digitValid ? leadingDigit.trim() : savedConfig.mobileLeadingDigit;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
            Country code
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="61"
            className={`${INPUT_CLASS} ${
              !ccValid && countryCode ? "!border-error" : ""
            }`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
            Mobile leading digit
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={leadingDigit}
            onChange={(e) => setLeadingDigit(e.target.value)}
            placeholder="4"
            className={`${INPUT_CLASS} ${
              !digitValid && leadingDigit ? "!border-error" : ""
            }`}
          />
        </div>
      </div>

      {/* Live preview of the effective patterns */}
      <p className="text-sm text-info-light">
        Mobiles match numbers starting with{" "}
        <span className="font-mono font-semibold text-on-surface-variant">
          +{previewCc} {previewDigit}
        </span>{" "}
        or{" "}
        <span className="font-mono font-semibold text-on-surface-variant">
          0{previewDigit}
        </span>
        . Anything else is treated as a landline.
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || !isValid || saving}
          className="px-5 py-2 rounded-lg text-white text-sm font-bold twilight-gradient hover:brightness-110 hover:cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        {status && (
          <span
            className={`text-sm font-medium ${
              status.kind === "ok" ? "text-green-500" : "text-error"
            }`}
          >
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}