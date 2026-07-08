import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getSharepointSyncEnabled,
  setSharepointSyncEnabled,
} from "@/api/sharepoint";

///  +-----------------------------------------------------------------+
///  |                 SHAREPOINT SYNC SETTINGS CARD                   |
///  +-----------------------------------------------------------------+
//
//  Admin toggle for the nightly SharePoint request-ledger sync. Just the
//  enable switch — there's no table/export here (unlike feedback); the sync's
//  schedule is managed under Background Jobs, and the data lives in SharePoint,
//  not locally. Mirrors the feedback toggle's styling (red/green switch).
///  +-----------------------------------------------------------------+

export default function SharepointSyncCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSharepointSyncEnabled()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await setSharepointSyncEnabled(next);
      setEnabled(res.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="flex items-center justify-center gap-3 text-info-light text-sm py-8">
        <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline/20 bg-surface p-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-on-background text-sm">Nightly sync</h4>
          <p className="text-xs text-info-light mt-0.5">
            When on, new requests are sent to the SharePoint ordering ledger each night via
            Power Automate. Filtering (tablet/phone only) is handled in the flow.
          </p>
        </div>
        <Switch
          className="hover:cursor-pointer shrink-0 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500 bg-gray-200 dark:bg-gray-800"
          checked={enabled}
          disabled={saving}
          onCheckedChange={handleToggle}
        />
      </div>

      {error && (
        <div className="text-xs text-error bg-error/10 rounded-md p-2">{error}</div>
      )}
    </div>
  );
}