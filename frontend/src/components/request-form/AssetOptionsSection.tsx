import { useEffect } from "react";
import { isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import UserSelect, { type User } from "./UserSelect";

///  +-----------------------------------------------------------------+
///  |                   ASSET SPECIFIC OPTIONS                        |
///  +-----------------------------------------------------------------+
//
//  Produces the number/data model shared with the HRT integration:
//    callText   — phones: implicitly true (no checkbox); tablets: a choice
//    needsData  — the user's MANUAL choice only. The EFFECTIVE value is
//                 derived (callText || needsData): call & text implies data
//                 one-way, so the checkbox shows the derived state and is
//                 disabled while callText forces it. Untick callText and the
//                 display falls back to the user's own intent — auto-ticked
//                 data disappears, manually-ticked data survives.
//    numberOption — "NEW" | "REUSE" | "NONE" | null.
//                 Phones: all three options. Tablets: only rendered when a
//                 SIM is implied (callText or data), and without "NONE" — a
//                 SIM needs a number decision. null when no SIM.
//    reuseUser  — the person whose number is inherited (REUSE); mapped to
//                 reuseNumberFromEmail / reuseNumberPhone at submit.
//
//  Changing category ALWAYS resets this section — no state carries over
//  between asset types. Phones re-apply their implicit callText on entry.
///  +-----------------------------------------------------------------+

type NumberOptionValue = "NEW" | "REUSE" | "NONE";

type Props = {
  formState: any;
  setFormState: React.Dispatch<React.SetStateAction<any>>;
  users: User[];
};

const RADIO_LABELS: Record<NumberOptionValue, string> = {
  NEW: "New number required",
  REUSE: "Use an existing number",
  NONE: "No number required",
};

export default function AssetOptionsSection({ formState, setFormState, users }: Props) {
  const isPhone = isPhoneCategory(formState.categoryName ?? "");
  const isTablet = isTabletCategory(formState.categoryName ?? "");
  const showOptions = isPhone || isTablet;

  // Effective data state: call & text implies data (one-way).
  const effectiveData = formState.callText || formState.needsData;

  // Tablets only show the number radio when a SIM is implied.
  const simImplied = isTablet && effectiveData;

  // Which radio options are legal right now.
  const radioOptions: NumberOptionValue[] = isPhone
    ? ["NEW", "REUSE", "NONE"]
    : ["NEW", "REUSE"];

  // FIXED: category change always resets the section — previously tablets
  // inherited callText/needsData from a prior phone selection (carriedSim).
  // Now every category starts clean; phones get their implicit callText.
  useEffect(() => {
    setFormState((prev: any) => ({
      ...prev,
      callText: isPhone,
      needsData: false,
      numberOption: null,
      reuseUser: null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.categoryName]);

  function handleCallTextChange(checked: boolean) {
    setFormState((prev: any) => {
      const next = { ...prev, callText: checked };
      // Turning call & text OFF with no manual data → SIM no longer implied →
      // the number decision no longer applies.
      if (!checked && !prev.needsData) {
        next.numberOption = null;
        next.reuseUser = null;
      }
      return next;
    });
  }

  function handleDataChange(checked: boolean) {
    setFormState((prev: any) => {
      const next = { ...prev, needsData: checked };
      if (!checked && !prev.callText) {
        next.numberOption = null;
        next.reuseUser = null;
      }
      return next;
    });
  }

  function handleNumberOption(value: NumberOptionValue) {
    setFormState((prev: any) => ({
      ...prev,
      numberOption: value,
      // Leaving REUSE discards the picked person.
      reuseUser: value === "REUSE" ? prev.reuseUser : null,
    }));
  }

  return (
    <div>
      <h3 className="text-xs font-medium tracking-wider mb-5 uppercase text-on-surface-variant">
        3. Asset Specific Options
      </h3>

      <div className="p-6 bg-surface-container/40 rounded-xl border border-outline space-y-5">
        {!showOptions && (
          <p className="text-sm text-on-surface-variant opacity-60 italic">
            Not Applicable
          </p>
        )}

        {/* Tablet: capability checkboxes */}
        {isTablet && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formState.callText}
                onChange={(e) => handleCallTextChange(e.target.checked)}
                className="w-5 h-5 hover:cursor-pointer rounded"
              />
              <label className="text-sm font-medium text-on-surface-variant">
                Call and Text capabilities
                <span className="ml-2 text-xs font-normal text-info-light">
                  (Regular technicians don't usually need this option)
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={effectiveData}
                disabled={formState.callText}
                onChange={(e) => handleDataChange(e.target.checked)}
                className="w-5 h-5 hover:cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-60"
              />
              <label
                className={`text-sm font-medium text-on-surface-variant ${
                  formState.callText ? "opacity-60" : ""
                }`}
              >
                Data required
                <span className="ml-2 text-xs font-normal text-info-light">
                  {formState.callText
                    ? "(included with call & text)"
                    : "(for users who travel to sites)"}
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Number decision — phones always; tablets when a SIM is implied */}
        {(isPhone || simImplied) && (
          <div className={isTablet ? "pt-2 border-t border-outline/30" : ""}>
            <p className="text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
              Phone number
            </p>

            <RadioGroup
              value={formState.numberOption ?? ""}
              onValueChange={(v) => handleNumberOption(v as NumberOptionValue)}
              className="space-y-3"
            >
              {radioOptions.map((opt) => {
                const selected = formState.numberOption === opt;
                return (
                  <div key={opt} className="flex items-center gap-3">
                    <RadioGroupItem value={opt} id={`num-${opt}`} />
                    <label
                      htmlFor={`num-${opt}`}
                      className={`text-sm font-medium text-info-light hover:cursor-pointer transition-opacity ${
                        selected ? "opacity-100" : "opacity-40"
                      }`}
                    >
                      {RADIO_LABELS[opt]}
                    </label>
                  </div>
                );
              })}
            </RadioGroup>

            {/* Whose number is being inherited? */}
            {formState.numberOption === "REUSE" && (
              <div className="mt-4">
                {/* FIXED: reuse picker shows each user's number (or the
                    no-number fallback) — the number is the decision here. */}
                <UserSelect
                  users={users}
                  value={formState.reuseUser ?? null}
                  placeholder="Whose number is being reused?"
                  showPhone
                  onSelect={(user) =>
                    setFormState((prev: any) => ({ ...prev, reuseUser: user }))
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}