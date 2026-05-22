import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

///  +-----------------------------------------------------------------+
///  |                       COMBOBOX FIELD                            |
///  +-----------------------------------------------------------------+
//
//  Shared wrapper around the base-ui Combobox that encodes the patterns
//  we hammered out for AssetDetailsDialog + the settings selectors:
//
//    - String items (not objects). Lookups happen in the parent's
//      `onSelect` callback.
//    - Uncontrolled with `defaultValue`. Combobox owns its visual
//      selection state; the parent owns the domain state.
//    - `keyHint` forces remount when the underlying domain value
//      changes, so `defaultValue` is re-applied (async-load case).
//    - Optional synthetic item at the top (e.g. "(none)" /
//      "(use default: Pending)") whose selection calls a separate
//      callback. Visually italicized.
//    - `pointerEvents: 'auto'` baked into the popup content so this
//      works inside Dialogs and Popovers without per-call workarounds.
//    - Per-item disabled support (for the "primary can't equal
//      backup" use case).
//
//  Sizing: `size="compact"` matches the dense popover-inside-popover
//  context; `size="normal"` matches the dialog form input.
///  +-----------------------------------------------------------------+

const INPUT_CLASS_NORMAL =
  "text-on-surface-variant bg-success-form !ring-purple-900 p-2 h-12 border-1 !border-outline w-full";
const INPUT_CLASS_COMPACT =
  "text-on-surface-variant bg-surface border border-outline/20 !ring-purple-900 px-2 py-1.5 text-sm w-full";

const CONTENT_CLASS_NORMAL =
  "bg-surface !outline-0 !ring-0 !border-1 !border-gray-200 !text-gray-400 mt-3 hover:cursor-pointer";
const CONTENT_CLASS_COMPACT =
  "bg-surface !outline-0 !ring-0 !border-1 !border-gray-200 mt-2 hover:cursor-pointer";

const ITEM_CLASS_NORMAL =
  "hover:cursor-pointer hover:text-shadcn-text hover:bg-shadcn-background";
const ITEM_CLASS_COMPACT =
  "hover:cursor-pointer hover:text-shadcn-text hover:bg-shadcn-background text-sm";

type Size = "normal" | "compact";

type SyntheticTop = {
  /** The label shown for the synthetic item in the list and as the input value. */
  label: string;
  /** Called when the synthetic item is clicked. Typically `() => onClear()`. */
  onSelect: () => void;
};

type Props = {
  /** The list of items to choose from. Items are plain strings. */
  items: string[];
  /** Initial input value (display text). Use the friendly name of the saved item. */
  defaultValue: string;
  /** Called with the chosen string when a real item is clicked. */
  onSelect: (value: string) => void;
  /** Placeholder for the input. */
  placeholder?: string;
  /** Disables the input + items. */
  disabled?: boolean;
  /** Sizing — defaults to "normal" (dialog-form scale). */
  size?: Size;
  /** Optional synthetic item rendered at the top of the list. */
  syntheticTop?: SyntheticTop;
  /** Values to render as disabled (e.g. value already used in a sibling field). */
  disabledValues?: Set<string>;
  /**
   * Hint for the remount key. Combobox is uncontrolled, so when the saved
   * value changes externally we need to force a remount to re-apply
   * `defaultValue`. Pass any string that changes when the saved value changes
   * (e.g. the saved value itself, or `${field}-${value}`).
   */
  keyHint: string;
};

export default function ComboboxField({
  items,
  defaultValue,
  onSelect,
  placeholder,
  disabled,
  size = "normal",
  syntheticTop,
  disabledValues,
  keyHint,
}: Props) {
  const inputClass = size === "compact" ? INPUT_CLASS_COMPACT : INPUT_CLASS_NORMAL;
  const contentClass = size === "compact" ? CONTENT_CLASS_COMPACT : CONTENT_CLASS_NORMAL;
  const itemClass = size === "compact" ? ITEM_CLASS_COMPACT : ITEM_CLASS_NORMAL;

  // Bake the synthetic top into the items list so the combobox can find it
  // via its internal search. Distinct render branch in the list iterator
  // tells real items apart from the synthetic one.
  const fullItems = syntheticTop ? [syntheticTop.label, ...items] : items;

  return (
    <Combobox
      key={keyHint}
      items={fullItems}
      defaultValue={defaultValue}
    >
      <ComboboxInput
        disabled={disabled}
        className={inputClass}
        placeholder={placeholder}
      />
      <ComboboxContent
        className={contentClass}
        style={{ pointerEvents: "auto" }}
      >
        <ComboboxEmpty>No results</ComboboxEmpty>
        <ComboboxList>
          {(name: string) => {
            if (syntheticTop && name === syntheticTop.label) {
              return (
                <ComboboxItem
                  className={itemClass}
                  key={`__synthetic__${name}`}
                  value={name}
                  onClick={() => syntheticTop.onSelect()}
                >
                  <span className="italic text-info-light">{name}</span>
                </ComboboxItem>
              );
            }

            const isDisabled = disabledValues?.has(name) ?? false;
            return (
              <ComboboxItem
                className={itemClass}
                key={name}
                value={name}
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(name);
                }}
              >
                {name}
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}