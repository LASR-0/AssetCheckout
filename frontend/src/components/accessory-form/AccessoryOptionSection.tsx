import { useEffect, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getAccessoryOptions, type AccessoryOptionChoice } from "@/api/accessories";

///  +-----------------------------------------------------------------+
///  |                 ACCESSORY SPECIFIC OPTIONS                      |
///  +-----------------------------------------------------------------+
//
//  The accessory counterpart of AssetOptionsSection. Where assets carry
//  phone/number logic here, accessories carry the "what do you need?"
//  decision: admin-configured option labels for the chosen category
//  (fetched per category), plus an always-present "Something else"
//  escape hatch.
//
//    selectedOptionId — the chosen option's STABLE ID, or null. The id, not
//                       the label: the label is what an admin renames, and a
//                       request bound to a name came unbound the moment one
//                       did. onChange reports the label too, purely so the
//                       request can record what the requester actually read.
//    somethingElse  — the escape hatch. One-way implication, mirroring
//                     the callText→data mechanic on the asset form:
//                     while ticked, the spec level is locked to
//                     NON_STANDARD (the parent derives the effective
//                     type); untick and the user's own standard/
//                     non-standard choice comes back.
//
//  Categories with a single configured option auto-select it — nothing
//  to decide, but the label still shows so the requester knows what
//  they're getting a decision ABOUT (not which product it resolves to).
//  Categories with no configured options render an informational line;
//  the parent skips option validation for those.
//
//  Changing category ALWAYS resets this section — the parent clears
//  selectedOption/somethingElse in its category onChange, and the
//  fetch here re-runs per categoryId.
///  +-----------------------------------------------------------------+

const SOMETHING_ELSE = "__something_else__";

type Props = {
  categoryId: number;
  selectedOptionId: string | null;
  somethingElse: boolean;
  onChange: (
    selectedOptionId: string | null,
    selectedOptionLabel: string | null,
    somethingElse: boolean
  ) => void;
  /** Reports the loaded options so the parent can validate proportionally. */
  onOptionsLoaded: (options: AccessoryOptionChoice[]) => void;
  /** Section heading. Defaults to the accessory form's numbered one; the edit
   *  dialog has no numbered sequence to fit into. */
  label?: string;
};

export default function AccessoryOptionsSection({
  categoryId,
  selectedOptionId,
  somethingElse,
  onChange,
  onOptionsLoaded,
  label = "3. What Do You Need?",
}: Props) {
  const [options, setOptions] = useState<AccessoryOptionChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setOptions([]);
      onOptionsLoaded([]);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getAccessoryOptions(categoryId);
        if (!cancelled) {
          setOptions(data);
          onOptionsLoaded(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Couldn't load the options for this accessory type.");
          setOptions([]);
          onOptionsLoaded([]);
          console.error("Failed to load accessory options", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Single configured option → auto-select it. There's nothing to decide,
  // and requiring a click on the only choice is just friction.
  useEffect(() => {
    if (options.length === 1 && !selectedOptionId && !somethingElse) {
      onChange(options[0].id, options[0].label, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  function handlePick(value: string) {
    if (value === SOMETHING_ELSE) {
      onChange(null, null, true);
      return;
    }
    // The radio's value is the option id, so the label is looked up rather
    // than carried by the control — the id is the thing being chosen.
    const picked = options.find((o) => o.id === value);
    onChange(picked?.id ?? null, picked?.label ?? null, false);
  }

  const radioValue = somethingElse ? SOMETHING_ELSE : selectedOptionId ?? "";

  return (
    <div>
      <h3 className="text-xs font-medium tracking-wider mb-2 uppercase text-on-surface-variant">
        {label}
      </h3>
      <p className="mb-5 text-xs text-info-light">
        (if your expected option is not listed, then state your needs with "Something else" in the reasoning text field)
      </p>

      <div className="p-6 bg-surface-container/40 rounded-xl border border-outline space-y-5">
        {!categoryId && (
          <p className="text-sm text-on-surface-variant opacity-60 italic">
            Select an accessory type first
          </p>
        )}

        {categoryId > 0 && loading && (
          <div className="flex items-center font-semibold text-info-light text-sm">
            <span className="animate-spin h-4 w-4 border-2 border-info-light border-t-transparent rounded-full mr-3" />
            Loading options...
          </div>
        )}

        {categoryId > 0 && !loading && error && (
          <div className="flex items-center gap-2 text-sm text-error bg-error-background rounded-xl p-3">
            <span className="material-symbols-outlined !text-[18px]">info</span>
            <span>{error}</span>
          </div>
        )}

        {categoryId > 0 && !loading && !error && options.length === 0 && (
          <p className="text-sm text-on-surface-variant opacity-60 italic">
            No specific options for this accessory type — the standard item will
            be supplied.
          </p>
        )}

        {categoryId > 0 && !loading && !error && options.length > 0 && (
          <RadioGroup
            value={radioValue}
            onValueChange={handlePick}
            className="space-y-3"
          >
            {options.map((option) => {
              const selected = radioValue === option.id;
              return (
                <div key={option.id} className="flex items-center gap-3">
                  <RadioGroupItem value={option.id} id={`opt-${option.id}`} />
                  <label
                    htmlFor={`opt-${option.id}`}
                    className={`text-sm font-medium text-info-light hover:cursor-pointer transition-opacity ${
                      selected ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    {option.label}
                  </label>
                </div>
              );
            })}

            {/* The escape hatch — anything not on the list is by
                definition non-standard, so picking this locks the spec
                level (one-way, released on unpick). */}
            <div className="flex items-center gap-3 pt-2">
              <RadioGroupItem value={SOMETHING_ELSE} id="opt-something-else" />
              <label
                htmlFor="opt-something-else"
                className={`text-sm font-medium text-info-light hover:cursor-pointer transition-opacity ${
                  somethingElse ? "opacity-100" : "opacity-40"
                }`}
              >
                Something else
                <span className="ml-2 text-xs font-normal text-info-light">
                  (describe what you need in the reason below)
                </span>
              </label>
            </div>
          </RadioGroup>
        )}
      </div>
    </div>
  );
}