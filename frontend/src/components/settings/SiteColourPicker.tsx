import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { siteColoursQuery } from "@/api/queries";
import { setSiteColour } from "@/api/settings";

///  +-----------------------------------------------------------------+
///  |                     A SITE'S COLOUR                             |
///  +-----------------------------------------------------------------+
//
//  The dot drawn beside a site's name wherever a request names it. Chosen
//  here by an admin, because sites are whatever this organisation's
//  Snipe-IT holds and no theme can know them in advance.
//
//  The swatches are mid-tones that read as a dot on both light and dark
//  grounds; the first four are the designs' own site colours. Any other
//  colour can be typed or picked, and "None" leaves the neutral dot.
///  +-----------------------------------------------------------------+

const SWATCHES = [
  "#3f8a8c",
  "#a8843a",
  "#8b6bb8",
  "#5b7ba8",
  "#b0585c",
  "#5e8f4e",
  "#c07a3a",
  "#a35c9a",
  "#4f8fb8",
  "#7a7f87",
];

export default function SiteColourPicker({ locationId, locationName }: { locationId: number; locationName: string }) {
  const { data: colours } = useQuery(siteColoursQuery);
  const colour = colours?.[String(locationId)] ?? null;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      await setSiteColour(locationId, next);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the colour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${locationName}: site colour${colour ? ` ${colour}` : ", none"}. Change`}
          title="Site colour"
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span
            className={cn("size-3 rounded-full", !colour && "border-[1.5px] border-dashed border-strong")}
            style={colour ? { background: colour } : undefined}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-3">
        <div className="fs-12 font-medium text-tx">Colour for {locationName}</div>
        <div className="grid grid-cols-5 gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={saving}
              onClick={() => void pick(s)}
              aria-label={s}
              aria-pressed={colour === s}
              className={cn(
                "size-8 cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                colour === s && "shadow-[0_0_0_2px_var(--sheet),0_0_0_4px_var(--tx)]"
              )}
              style={{ background: s }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex flex-1 cursor-pointer items-center gap-2 fs-12 text-tx2">
            <input
              type="color"
              value={colour ?? "#7a7f87"}
              disabled={saving}
              onChange={(e) => void pick(e.target.value)}
              className="size-6 cursor-pointer rounded-6 border border-line bg-transparent p-0"
            />
            Other…
          </label>
          <button
            type="button"
            disabled={saving || !colour}
            onClick={() => void pick(null)}
            className="flex cursor-pointer items-center gap-1 rounded-6 px-1.5 py-1 fs-12 text-tx3 outline-none hover:bg-hover hover:text-tx disabled:cursor-default disabled:opacity-50"
          >
            <Icon name="block" size={14} />
            None
          </button>
        </div>
        {error && <p className="m-0 fs-11.5 text-stop">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
