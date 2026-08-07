import { Link } from "react-router-dom";
import { troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";

///  +-----------------------------------------------------------------+
///  |                       SYMPTOM LINK                              |
///  +-----------------------------------------------------------------+
//
//  Both ways an article sends you to another symptom:
//
//    branch  a mid-step exit — "Company Portal won't sign in at all" — for
//            when the step you're on has revealed the real problem is a
//            different one. Weightier, because taking it abandons the
//            article you're in.
//    chip    a sibling in the same category, offered at the foot once the
//            steps have run out. Lighter, because by then you're browsing.
//
//  One component rather than two: the destination is built the same way for
//  both, and that construction is the thing worth having in a single place.
///  +-----------------------------------------------------------------+

type Props = {
  deviceKey: string;
  symptomId: string;
  label: string;
  variant: "branch" | "chip";
};

export default function SymptomLink({ deviceKey, symptomId, label, variant }: Props) {
  const to = troubleshootingArticlePath(deviceKey, symptomId);

  if (variant === "chip") {
    return (
      <Link
        to={to}
        className="rounded-full border border-outline bg-surface px-3.5 py-2 text-[13px] font-semibold text-info-light hover:border-primary hover:text-primary transition-colors"
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 self-start rounded-lg border border-outline bg-surface px-4 py-2.5 text-sm font-semibold text-on-background hover:border-primary hover:text-primary transition-colors"
    >
      {label}
      <span aria-hidden className="font-bold text-primary">
        →
      </span>
    </Link>
  );
}
