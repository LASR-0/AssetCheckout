import { isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";

type Props = {
  formState: any;
  setFormState: React.Dispatch<React.SetStateAction<any>>;
};

export default function AssetOptionsSection({ formState, setFormState }: Props) {
  const isPhone = isPhoneCategory(formState.categoryName ?? "");
  const isTablet = isTabletCategory(formState.categoryName ?? "");
  const showOptions = isPhone || isTablet;

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

        {/* Tablet only: Call/Text */}
        {isTablet && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formState.callText}
              onChange={(e) =>
                setFormState((prev: any) => ({
                  ...prev,
                  callText: e.target.checked,
                  newNumber: e.target.checked ? prev.newNumber : false,
                }))
              }
              className="w-5 h-5 hover:cursor-pointer rounded"
            />
            <label className="text-sm font-medium text-on-surface-variant">
              Call and Text capabilities
            </label>
          </div>
        )}

        {/* New Number — phones always; tablets only when callText is on */}
        {(isPhone || (isTablet && formState.callText)) && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formState.newNumber}
              onChange={(e) =>
                setFormState((prev: any) => ({
                  ...prev,
                  newNumber: e.target.checked,
                }))
              }
              className="w-5 h-5 hover:cursor-pointer rounded"
            />
            <label className="text-sm font-medium text-on-surface-variant">
              New Number Required
            </label>
          </div>
        )}
      </div>
    </div>
  );
}