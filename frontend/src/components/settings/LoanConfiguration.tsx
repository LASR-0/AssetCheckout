import { useEffect, useMemo, useState } from "react";
import ComboboxField from "@/components/ui/comboboxfield";
import { Switch } from "@/components/ui/switch";
import { getAllAccessoryCategories, getAccessoriesByCategory } from "@/api/accessories";
import { getLoanConfig, setLoanConfig, type LoanDevice } from "@/api/settings";
import type { AccessoryCategory, AccessorySummary } from "@/types/accessoriesType";
import { iconForCategory } from "@/lib/categoryIcon";

///  +-----------------------------------------------------------------+
///  |                  LOAN CONFIGURATION                             |
///  +-----------------------------------------------------------------+
//
//  Two settings: what may be borrowed, and how long somebody may book it for.
//
//  WHAT MAY BE BORROWED IS A LIST OF SNIPE RECORDS, not a category. Each entry
//  is one accessory record (a hotspot, a KVM) with the name the request form
//  shows for it, optional help text, and whether the form asks for an event
//  name. The requester picks from these; IT can hand over any of them.
//
//  ADDING IS TWO STEPS — category, then record — because Snipe accessories
//  are per-location rows, and a flat list of every accessory in Snipe is not
//  something anybody can pick from. Records already on the list are greyed
//  out rather than hidden, so it is obvious why one cannot be added twice.
//
//  AN EMPTY LIST TURNS LOANS OFF, and says so. The backend refuses new loans
//  with a 503 in that state, and the form tells the requester IT has not set
//  it up yet.
//
//  Writes are optimistic with rollback, and adopt the config the PUT echoes
//  back — the same shape as StockKeepersSelector. Text fields save on blur.
///  +-----------------------------------------------------------------+

const PICK_CATEGORY = "Pick a category first";

function recordLabel(a: AccessorySummary): string {
  return `${a.name} · ${a.locationName ?? "no location"} (#${a.id})`;
}

export default function LoanConfiguration() {
  const [devices, setDevices] = useState<LoanDevice[]>([]);
  const [maxLoanDays, setMaxLoanDays] = useState(30);
  const [daysDraft, setDaysDraft] = useState("30");

  // Snipe names for the records on the list, so a row can say which record it
  // is rather than only "#53". Best-effort: a failure just shows the id.
  const [recordNames, setRecordNames] = useState<Record<number, AccessorySummary>>({});

  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [addCategoryId, setAddCategoryId] = useState<number | null>(null);
  const [addRecords, setAddRecords] = useState<AccessorySummary[]>([]);
  const [addRecordId, setAddRecordId] = useState<number | null>(null);
  const [addName, setAddName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRecordNames(list: LoanDevice[]) {
    const categoryIds = [
      ...new Set(list.map((d) => d.categoryId).filter((c): c is number => !!c)),
    ];
    try {
      const rows = (await Promise.all(categoryIds.map(getAccessoriesByCategory))).flat();
      setRecordNames((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.id] = r;
        return next;
      });
    } catch (err) {
      console.error("[loans] couldn't resolve record names:", err);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [cats, config] = await Promise.all([
          getAllAccessoryCategories(),
          getLoanConfig(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setDevices(config.devices);
        setMaxLoanDays(config.maxLoanDays);
        setDaysDraft(String(config.maxLoanDays));
        void loadRecordNames(config.devices);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load the loan settings");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: { devices?: LoanDevice[]; maxLoanDays?: number }) {
    const previous = { devices, maxLoanDays };
    if (next.devices !== undefined) setDevices(next.devices);
    if (next.maxLoanDays !== undefined) setMaxLoanDays(next.maxLoanDays);

    try {
      setSaving(true);
      setError(null);
      const saved = await setLoanConfig(next);
      setDevices(saved.devices);
      setMaxLoanDays(saved.maxLoanDays);
      setDaysDraft(String(saved.maxLoanDays));
      return true;
    } catch (err) {
      // Roll back to what the server last confirmed, so the card never shows
      // a value that was not saved.
      setDevices(previous.devices);
      setMaxLoanDays(previous.maxLoanDays);
      setDaysDraft(String(previous.maxLoanDays));
      setError(err instanceof Error ? err.message : "Couldn't save the loan settings");
      console.error(err);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateDevice(index: number, patch: Partial<LoanDevice>) {
    const current = devices[index];
    const merged = { ...current, ...patch };
    if (JSON.stringify(merged) === JSON.stringify(current)) return;
    void save({ devices: devices.map((d, i) => (i === index ? merged : d)) });
  }

  function moveDevice(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= devices.length) return;
    const next = [...devices];
    [next[index], next[target]] = [next[target], next[index]];
    void save({ devices: next });
  }

  function removeDevice(index: number) {
    void save({ devices: devices.filter((_, i) => i !== index) });
  }

  async function pickCategory(name: string) {
    const match = categories.find((c) => c.name === name) ?? null;
    setAddCategoryId(match?.id ?? null);
    setAddRecordId(null);
    setAddRecords([]);
    if (!match) return;
    try {
      setAddRecords(await getAccessoriesByCategory(match.id));
    } catch (err) {
      setError("Couldn't load that category's accessories from Snipe-IT");
      console.error(err);
    }
  }

  function pickRecord(label: string) {
    const match = addRecords.find((r) => recordLabel(r) === label) ?? null;
    setAddRecordId(match?.id ?? null);
    // Start from the category's name ("Wi-Fi Hotspot") rather than the
    // record's model string — it is what a requester recognises.
    if (match && !addName.trim()) {
      setAddName(categories.find((c) => c.id === addCategoryId)?.name ?? match.name);
    }
  }

  async function addDevice() {
    const record = addRecords.find((r) => r.id === addRecordId);
    if (!record || !addName.trim()) return;
    const ok = await save({
      devices: [
        ...devices,
        {
          kind: "ACCESSORY",
          snipeId: record.id,
          categoryId: record.categoryId,
          displayName: addName.trim(),
          description: null,
          showEventName: false,
        },
      ],
    });
    if (ok) {
      setRecordNames((prev) => ({ ...prev, [record.id]: record }));
      setAddRecordId(null);
      setAddName("");
    }
  }

  function commitDays() {
    const parsed = Number(daysDraft.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDaysDraft(String(maxLoanDays));
      return;
    }
    if (parsed === maxLoanDays) return;
    void save({ maxLoanDays: parsed });
  }

  const onList = useMemo(() => new Set(devices.map((d) => d.snipeId)), [devices]);
  const addCategoryName =
    categories.find((c) => c.id === addCategoryId)?.name ?? PICK_CATEGORY;
  const addRecord = addRecords.find((r) => r.id === addRecordId) ?? null;
  const busy = loading || saving;

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
          Loanable devices
        </label>

        {!loading && devices.length === 0 && (
          <p className="rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-sm text-on-surface">
            <strong className="text-status-pending">Loans are currently disabled.</strong>{" "}
            Add at least one device below and the Loan form opens up.
          </p>
        )}

        <ul className="space-y-3">
          {devices.map((d, i) => {
            const rec = recordNames[d.snipeId];
            return (
              <li
                key={d.id ?? d.snipeId}
                className="rounded-lg border border-outline bg-surface-container-low p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined mt-2 text-info-light">
                    {iconForCategory(d.displayName)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      type="text"
                      defaultValue={d.displayName}
                      key={`name-${d.id}-${d.displayName}`}
                      disabled={busy}
                      aria-label="Name shown on the form"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) e.target.value = d.displayName;
                        else updateDevice(i, { displayName: v });
                      }}
                      className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
                    />
                    <input
                      type="text"
                      defaultValue={d.description ?? ""}
                      key={`desc-${d.id}-${d.description ?? ""}`}
                      disabled={busy}
                      placeholder="Help text on the form (optional), e.g. For remote support of iPads"
                      aria-label="Help text"
                      onBlur={(e) => updateDevice(i, { description: e.target.value.trim() || null })}
                      className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-xs text-on-surface placeholder:text-info-light focus:border-primary focus:outline-none disabled:opacity-50"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-info-light">
                      <span className="truncate">
                        Snipe-IT: {rec ? recordLabel(rec) : `accessory #${d.snipeId}`}
                      </span>
                      <label className="flex items-center gap-2">
                        Ask for an event name
                        <Switch
                          className="hover:cursor-pointer shrink-0 rounded-full border-2 transition-colors data-[state=checked]:bg-status-success border-outline/70 data-[state=unchecked]:bg-surface-container-high"
                          checked={d.showEventName}
                          disabled={busy}
                          onCheckedChange={(checked) => updateDevice(i, { showEventName: checked })}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      title="Move up"
                      disabled={busy || i === 0}
                      onClick={() => moveDevice(i, -1)}
                      className="rounded p-1 text-info-light hover:bg-surface-container-high hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined !text-[18px]">arrow_upward</span>
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={busy || i === devices.length - 1}
                      onClick={() => moveDevice(i, 1)}
                      className="rounded p-1 text-info-light hover:bg-surface-container-high hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined !text-[18px]">arrow_downward</span>
                    </button>
                    <button
                      type="button"
                      title="Stop lending this — loans already out are unaffected"
                      disabled={busy}
                      onClick={() => removeDevice(i)}
                      className="rounded p-1 text-info-light hover:bg-modal-error/10 hover:text-error hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined !text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* ADD */}
        <div className="mt-4 rounded-lg border border-dashed border-outline p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Add a device
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ComboboxField
              items={categories.map((c) => c.name)}
              defaultValue={addCategoryName}
              keyHint={`loan-add-category-${addCategoryId ?? "none"}`}
              disabled={busy}
              placeholder="Accessory category"
              onSelect={(name) => void pickCategory(name)}
            />
            <ComboboxField
              items={addRecords.map(recordLabel)}
              defaultValue={addRecord ? recordLabel(addRecord) : ""}
              keyHint={`loan-add-record-${addCategoryId ?? "none"}-${addRecordId ?? "none"}`}
              disabled={busy || addCategoryId === null}
              placeholder={addCategoryId === null ? PICK_CATEGORY : "Accessory record"}
              disabledValues={new Set(addRecords.filter((r) => onList.has(r.id)).map(recordLabel))}
              onSelect={pickRecord}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={addName}
              disabled={busy}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name on the form, e.g. KVM"
              className="flex-1 rounded-lg border border-outline bg-surface-container-low px-3 py-2 text-sm text-on-surface placeholder:text-info-light focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || !addRecord || !addName.trim()}
              onClick={() => void addDevice()}
              className="inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm font-bold text-white twilight-gradient hover:opacity-90 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined !text-[18px]">add</span>
              Add device
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
          Longest booking
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={daysDraft}
            disabled={busy}
            onChange={(e) => setDaysDraft(e.target.value)}
            onBlur={commitDays}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-24 rounded-lg border border-outline bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <span className="text-sm text-info-light">days</span>
        </div>
        <p className="mt-2 text-xs text-info-light">
          A backstop against a mis-typed date turning into an indefinite
          checkout, not a policy — IT can still assign whatever was asked for.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-error bg-error-background rounded-lg p-3">
          <span className="material-symbols-outlined !text-[18px]">info</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
