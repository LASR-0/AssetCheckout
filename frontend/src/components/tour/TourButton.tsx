import { ICON_BUTTON } from "@/components/nav/iconButton";
import { useTour } from "./TourProvider";

///  +-----------------------------------------------------------------+
///  |                    "SHOW ME AROUND"                             |
///  +-----------------------------------------------------------------+
//
//  Re-runs whichever tour belongs to the page you are on, whether or not you
//  have already had it. It is the answer to both "I closed that by accident"
//  and "I've forgotten where the thing was", and the home tour's last step
//  exists to teach it.
//
//  IT RENDERS NOTHING WHERE THERE IS NO TOUR — the request forms, the
//  feedback page, and every page for an admin. A disabled chip would be worse:
//  it invites a press, does nothing, and explains nothing. The cost is that
//  the right-hand cluster is one chip narrower on those routes, which is
//  invisible unless you are looking for it.
//
//  NOT GATED ON `mounted`, unlike the theme toggle beside it. That gate exists
//  so the sun/moon cannot flash the wrong icon before the theme resolves; this
//  icon does not depend on the theme, and gating it would make the button pop
//  in late on the very page whose tour points at it.
///  +-----------------------------------------------------------------+

export default function TourButton() {
  const { tourId, isRunning, run } = useTour();

  if (!tourId) return null;

  return (
    <button
      type="button"
      onClick={run}
      disabled={isRunning}
      aria-label="Show me around this page"
      title="Show me around this page"
      data-tour="nav-tour"
      className={`${ICON_BUTTON} text-nav-tab hover:text-nav-tab-selected disabled:opacity-50 disabled:hover:cursor-default`}
    >
      <span
        className="material-symbols-outlined !text-[22px]"
        style={{ fontVariationSettings: `'FILL' 1` }}
      >
        map
      </span>
    </button>
  );
}
