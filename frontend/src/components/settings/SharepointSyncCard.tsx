import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getSharepointSyncEnabled,
  setSharepointSyncEnabled,
  getCapexLogEnabled,
  setCapexLogEnabled,
} from "@/api/sharepoint";

///  +-----------------------------------------------------------------+
///  |                 SHAREPOINT SYNC SETTINGS CARD                   |
///  +-----------------------------------------------------------------+
//
//  Two toggles, both writing straight to the DB — there is no Save button
//  here, and each row owns its own saving/error state so a failure on one
//  can't disable or misreport the other.
//
//  They share a service mailbox and are told apart by the payload marker their
//  Power Automate flow filters on, but they are deliberately INDEPENDENT
//  settings. The ordering ledger is a nightly sweep of asset requests and
//  excludes accessories on purpose; the CAPEX log fires on quote acceptance
//  and is accessories-only in practice. Turning one on must never quietly
//  start the other mailing a flow that may not exist yet.
//
//  Neither describes the schedule: the nightly sweep's cron lives under
//  Background Jobs, and CAPEX has no schedule at all — it's enqueued the
//  moment the money is committed.
///  +-----------------------------------------------------------------+

export default function SharepointSyncCard() {
  const [sync, setSync] = useState<boolean | null>(null); // null = loading
  const [capex, setCapex] = useState<boolean | null>(null);

  useEffect(() => {
    getSharepointSyncEnabled()
      .then((r) => setSync(r.enabled))
      .catch(() => setSync(false));
    getCapexLogEnabled()
      .then((r) => setCapex(r.enabled))
      .catch(() => setCapex(false));
  }, []);

  if (sync === null || capex === null) {
    return (
      <div className="flex items-center justify-center gap-3 text-info-light text-sm py-8">
        <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ToggleRow
        title="Nightly sync"
        description="When on, new requests are sent to the SharePoint ordering ledger each night via Power Automate. Filtering (tablet/phone only) is handled in the flow."
        checked={sync}
        onChange={setSharepointSyncEnabled}
        onSaved={setSync}
      />

      <ToggleRow
        title="Capital expenditure sync"
        description="When on, a purchase over the threshold is lodged in the CAPEX ledger the moment the manager accepts the quote. Goes to the same mailbox under its own marker, so it needs its own Power Automate flow — leave this off until that flow exists."
        checked={capex}
        onChange={setCapexLogEnabled}
        onSaved={setCapex}
      />
    </div>
  );
}

/**
 * One labelled switch that persists on change.
 *
 * Own saving and error state per row: a failure writing one setting shouldn't
 * lock the other, and an error under the row that caused it is easier to act
 * on than one at the foot of the card.
 */
function ToggleRow({
  title,
  description,
  checked,
  onChange,
  onSaved,
}: {
  title: string;
  description: string;
  checked: boolean;
  /** Persists the value; resolves with what the server actually stored. */
  onChange: (next: boolean) => Promise<{ enabled: boolean }>;
  onSaved: (enabled: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await onChange(next);
      // The server's value, not the optimistic one — if it stored something
      // else the switch should show that rather than a lie.
      onSaved(res.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline bg-surface p-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-on-background text-sm">{title}</h4>
          <p className="text-xs text-info-light mt-0.5">{description}</p>
        </div>
        <Switch
          className="hover:cursor-pointer shrink-0 rounded-full border-2 border-outline/70 transition-colors data-[state=checked]:bg-status-success data-[state=unchecked]:bg-status-error"
          checked={checked}
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
