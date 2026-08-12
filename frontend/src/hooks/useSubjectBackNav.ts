import { useLocation, useNavigate } from "react-router-dom";
import {
  FROM_SYMPTOM_LIST,
  troubleshootingSubjectPath,
  type TroubleshootingLinkState,
} from "@/lib/troubleshootingRoutes";

///  +-----------------------------------------------------------------+
///  |           GOING BACK TO THE SYMPTOM LIST, PROPERLY              |
///  +-----------------------------------------------------------------+
//
//  "← All symptoms" and the breadcrumb look like Back and are expected to
//  behave like it — returning the reader to the list as they left it, with
//  the same sections open and the same scroll position. As ordinary links
//  they do the opposite: a link PUSHES a new history entry, and a new entry
//  has no saved view, so the page rebuilds itself from scratch. The browser's
//  own Back button worked and the on-page ones didn't, which is worse than if
//  neither had.
//
//  SO THEY ONLY ACT AS BACK WHEN BACK IS ACTUALLY WHERE THEY POINT. The
//  symptom links on the index tag their navigation with FROM_SYMPTOM_LIST; if
//  that tag is on the current entry then the previous entry IS the list, and
//  navigate(-1) returns to it exactly. Without the tag the reader arrived
//  some other way — a deep link from IT, a branch out of another article, a
//  bookmark — and there is no list behind them to go back to. Then it stays
//  an ordinary link and pushes, which is right: navigate(-1) there would take
//  somebody out of the site entirely.
//
//  IT STAYS AN <a> EITHER WAY. Middle-click, open-in-new-tab and copy link
//  address all have to keep working — the same reasoning that made the
//  symptom rows links rather than buttons — so this returns props to spread
//  onto a Link rather than replacing it with a button.
///  +-----------------------------------------------------------------+

/**
 * Props for a link that returns to a subject's symptom list.
 *
 * Spread onto a `<Link>`; style it at the call site, since the three places
 * this is used look nothing like each other.
 */
export function useSubjectBackNav(subjectKey: string | null | undefined): {
  to: string;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();

  const cameFromList = Boolean(
    (location.state as TroubleshootingLinkState | null)?.[FROM_SYMPTOM_LIST]
  );

  return {
    to: troubleshootingSubjectPath(subjectKey ?? ""),
    onClick: (event) => {
      if (!cameFromList) return;

      // Leave anything that isn't a plain left-click alone: those are the
      // gestures for opening in a new tab or window, and hijacking them
      // would navigate this tab instead, which is never what was meant.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigate(-1);
    },
  };
}
