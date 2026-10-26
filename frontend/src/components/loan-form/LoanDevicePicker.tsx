import { iconForCategory } from "@/lib/categoryIcon";
import type { LoanDeviceChoice } from "@/api/loans";

///  +-----------------------------------------------------------------+
///  |                     WHAT TO BORROW                              |
///  +-----------------------------------------------------------------+
//
//  The tile grid the accessory form uses, over the loan whitelist instead of
//  a category list — same look, so the three request forms read as one app.
//
//  AVAILABILITY IS SHOWN, NEVER ENFORCED. "None free today" says nothing about
//  next week, which is when most loans start, so an exhausted device stays
//  selectable. IT sees the real clash when it assigns. An unknown count (Snipe
//  unreachable) shows nothing rather than a guess.
//
//  The empty state is the cutover state: the whitelist starts empty, so a
//  requester can land here before an admin has set anything up.
///  +-----------------------------------------------------------------+

type Props = {
  devices: LoanDeviceChoice[];
  value: string | null;
  onChange: (id: string) => void;
  loading: boolean;
  error: string | null;
};

function availability(d: LoanDeviceChoice): { text: string; tone: string } | null {
  if (d.remaining === null || d.qty === null) return null;
  if (d.remaining <= 0) return { text: "None free today", tone: "text-intent-stop" };
  return { text: `${d.remaining} of ${d.qty} free today`, tone: "text-intent-done" };
}

export default function LoanDevicePicker({ devices, value, onChange, loading, error }: Props) {
  const selected = devices.find((d) => d.id === value) ?? null;

  return (
    <section>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-6">
        1. What do you need?
      </label>

      {loading && (
        <div className="flex items-center justify-center py-12 font-semibold text-info-light text-sm">
          <span className="animate-spin h-5 w-5 border-2 border-info-light border-t-transparent rounded-full mr-3" />
          Loading devices...
        </div>
      )}

      {error && (
        <div className="flex align-top gap-2 text-sm text-error bg-error-background rounded-xl p-3">
          <span className="material-symbols-outlined !text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <div className="text-sm text-info-light italic py-6 text-center">
          Loans aren't set up yet — IT needs to choose which devices can be
          borrowed.
        </div>
      )}

      {!loading && !error && devices.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {devices.map((d) => {
              const isSelected = value === d.id;
              const stock = availability(d);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onChange(d.id)}
                  aria-pressed={isSelected}
                  className={`
                    relative flex hover:cursor-pointer flex-col items-center justify-center p-6 rounded-lg border border-outline transition-all
                    ${isSelected
                      ? "border-primary border-2 bg-surface-container-lowest"
                      : "border-outline-variant/20 hover:bg-surface-container hover:border-outline"}
                  `}
                >
                  <span className="material-symbols-outlined pb-4 text-3xl text-on-surface-variant">
                    {iconForCategory(d.displayName)}
                  </span>
                  <span className="text-sm font-medium text-on-background text-center">
                    {d.displayName}
                  </span>
                  {stock && (
                    <span className={`mt-1 text-[11px] font-semibold ${stock.tone}`}>
                      {stock.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selected?.description && (
            <p className="mt-3 ml-1 text-xs text-info-light">{selected.description}</p>
          )}
        </>
      )}
    </section>
  );
}
