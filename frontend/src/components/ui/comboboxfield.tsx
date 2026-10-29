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
//  Keyboard selection: base-ui fires an Item's `onClick` both on pointer
//  click AND on Enter when that item is highlighted (per base-ui docs), so
//  selection lives on each item's `onClick`. `autoHighlight` on the root
//  highlights the first match so Enter has something to commit immediately.
//  The input's onKeyDown stops Enter bubbling to a surrounding <form>.
//
//  Sizing: `size="compact"` matches the dense popover-inside-popover
//  context; `size="normal"` matches the dialog form input.
///  +-----------------------------------------------------------------+

// "normal" is the requester/dialog form scale (44 design px), "compact" the
// operator scale (36) used inside settings rows and popovers.
const FIELD_SIZE = { normal: "lg", compact: "md" } as const;

/** Keys the combobox handles itself; they must not reach a surrounding form. */
const OWN_KEYS = new Set(["Enter", "ArrowDown", "ArrowUp", "Home", "End"]);

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

  // Bake the synthetic top into the items list so the combobox can find it
  // via its internal search. Distinct render branch in the list iterator
  // tells real items apart from the synthetic one.
  const fullItems = syntheticTop ? [syntheticTop.label, ...items] : items;

  return (
    <Combobox
      key={keyHint}
      items={fullItems}
      defaultValue={defaultValue}
      autoHighlight
    >
      <ComboboxInput
        disabled={disabled}
        size={FIELD_SIZE[size]}
        className="w-full"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (OWN_KEYS.has(e.key)) e.stopPropagation();
        }}
      />
      <ComboboxContent style={{ pointerEvents: "auto" }}>
        <ComboboxEmpty>No results</ComboboxEmpty>
        <ComboboxList>
          {(name: string) => {
            if (syntheticTop && name === syntheticTop.label) {
              return (
                <ComboboxItem
                  key={`__synthetic__${name}`}
                  value={name}
                  onClick={() => syntheticTop.onSelect()}
                >
                  <span className="text-mut italic">{name}</span>
                </ComboboxItem>
              );
            }

            const isDisabled = disabledValues?.has(name) ?? false;
            return (
              <ComboboxItem
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