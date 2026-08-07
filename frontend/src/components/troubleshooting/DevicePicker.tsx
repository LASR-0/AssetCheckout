import { iconForDeviceKey } from "@/lib/categoryIcon";
import type { DevicePickerTile } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                       DEVICE PICKER                             |
///  +-----------------------------------------------------------------+
//
//  A tile per device we can troubleshoot. Which devices appear is decided
//  server-side (requestable categories, unioned with the devices we have
//  articles for) — this only renders the answer.
//
//  NOT built on the home page's TileBody. That component hardcodes
//  "Request →" as, in its own words, "the tile's purpose", carries the
//  holdings band, and its comments are largely about keeping its two callers
//  from drifting. A picker tile needs a selected state and no request
//  affordance, so reusing it would have meant parameterising away most of
//  what it is and adding a third set of conditionals to a shared component.
//  The visual vocabulary is shared instead — same icon set, same tokens.
///  +-----------------------------------------------------------------+

type Props = {
  devices: DevicePickerTile[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

export default function DevicePicker({ devices, selectedKey, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {devices.map((device) => {
        const selected = device.key === selectedKey;

        // Disabled means requestable but nothing written yet. It stays on the
        // grid rather than being dropped, so the gap in the library is
        // visible — the same reasoning as the Draft state on a symptom.
        const disabled = !device.available;

        return (
          <button
            key={device.key}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(device.key)}
            title={
              disabled
                ? `No troubleshooting steps for ${device.label.toLowerCase()} yet`
                : `${device.articleCount} of ${device.symptomCount} symptoms covered`
            }
            className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
              disabled
                ? "border-outline/40 bg-surface-container-low/10 cursor-not-allowed opacity-55"
                : selected
                ? "border-primary bg-primary/10 cursor-pointer"
                : "border-outline bg-surface hover:bg-surface-container-low/30 hover:cursor-pointer"
            }`}
          >
            <span
              className={`material-symbols-outlined !text-2xl ${
                selected && !disabled ? "text-primary" : "text-info-light"
              }`}
            >
              {iconForDeviceKey(device.key)}
            </span>
            <span
              className={`text-sm font-semibold ${
                selected && !disabled ? "text-primary" : "text-on-background"
              }`}
            >
              {device.label}
            </span>
            {/* Says why a tile can't be clicked, in words, on the tile —
                rather than leaving the greying out to be interpreted. */}
            {disabled && (
              <span className="text-[11px] text-info-light">No steps yet</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
