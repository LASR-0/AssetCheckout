import { useEffect, useState } from "react";
import ComboboxField from "@/components/ui/comboboxfield";
import { getStatuses } from "@/api/snipe";
import {
  getSkeletonStatusId,
  setSkeletonStatusId,
} from "@/api/settings";
import type { SnipeNamedRecord } from "@/types/snipeTypes";

/**
 * Admin-managed setting: which Snipe-IT status to assign to newly-created
 * skeleton assets. Falls back to looking up "Pending" by name on the backend
 * if not configured.
 */

const DEFAULT_LABEL = "(use default: Pending)";

export default function SkeletonStatusSelector() {
  const [statuses, setStatuses] = useState<SnipeNamedRecord[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [statusesData, savedId] = await Promise.all([
          getStatuses(),
          getSkeletonStatusId(),
        ]);

        if (cancelled) return;
        setStatuses(statusesData);
        setSelected(savedId);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load skeleton status setting");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateSelection(newValue: number | null) {
    const previous = selected;
    setSelected(newValue);

    try {
      setSaving(true);
      setError(null);
      const saved = await setSkeletonStatusId(newValue);
      setSelected(saved);
    } catch (err: any) {
      setSelected(previous);
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const initialName =
    selected !== null
      ? statuses.find((s) => s.id === selected)?.name ?? ""
      : DEFAULT_LABEL;

  return (
    <div className="space-y-2 border-t border-outline/20 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Skeleton status
      </div>

      <div className="px-3 text-xs text-info-light/80 leading-relaxed">
        The status applied to newly-created skeleton assets. If unset, defaults
        to "Pending."
      </div>

      <div className="px-3">
        {loading ? (
          <div className="text-sm text-info-light italic py-2">Loading...</div>
        ) : (
          <ComboboxField
            size="compact"
            keyHint={`skeleton-${selected ?? "default"}`}
            items={statuses.map((s) => s.name)}
            defaultValue={initialName}
            placeholder="Select a status..."
            disabled={saving}
            syntheticTop={{
              label: DEFAULT_LABEL,
              onSelect: () => updateSelection(null),
            }}
            onSelect={(name) => {
              const status = statuses.find((s) => s.name === name);
              updateSelection(status?.id ?? null);
            }}
          />
        )}
      </div>

      {error && (
        <div className="text-xs text-error bg-error-background rounded-md p-2 mx-3">
          {error}
        </div>
      )}

      {saving && (
        <div className="text-xs text-info-light px-3">Saving...</div>
      )}
    </div>
  );
}