import { useState } from "react";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import type { TroubleshootingConfig } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                      SUPPORT ESCAPE                             |
///  +-----------------------------------------------------------------+
//
//  "Nothing here is fixing it." Two placements, one component: a compact
//  card beside the page heading and a full-width block at the foot of the
//  page. Same number, same wording decisions, one place to change them.
//
//  UNCONFIGURED IS A REAL STATE. With SUPPORT_PHONE unset the backend serves
//  an "XXXX XXX XXX" placeholder, and this renders it as plain text rather
//  than a tel: link — a link that dials a row of X's is worse than an
//  obvious blank, because it looks like it works. The call button hides
//  itself for the same reason.
//
//  It carries no context to IT, by decision: somebody who has exhausted the
//  steps has a problem past what this library covers, so the article and step
//  they stopped at wouldn't help whoever answers.
//
///  ── WHY TWO BUTTONS ──────────────────────────────────────────────────
//
//  "Call IT support" is the real escape, and on a KSB desktop it is a real
//  click: tel: is handled by Teams, so pressing it actually starts the call
//  rather than being read off the screen and dialled elsewhere.
//
//  "Nothing here worked" catches everyone else — the people who will ring
//  from a mobile or a handset, or who are giving up without calling at all,
//  and who would otherwise leave no trace. Both record ESCAPE_TAKEN and are
//  told apart by `detail`, so the mix stays visible rather than being
//  averaged into one number.
///  +-----------------------------------------------------------------+

/** Strips spacing so tel: gets digits, keeping a leading +. */
function dialDigits(phone: string): string {
  return phone.replace(/(?!^\+)[^\d]/g, "");
}

/**
 * Plain tel:, deliberately.
 *
 * An earlier version used Teams' own call deep link
 * (teams.microsoft.com/l/call/0/0?users=4:...), which places a PSTN call
 * only where Teams Phone is licensed. tel: needs none of that: the OS hands
 * it to whatever is registered as the default calling app, which on a KSB
 * desktop is Teams and on a phone is the dialler. Fewer assumptions, and it
 * degrades to something sensible everywhere rather than to a Teams window
 * that refuses.
 */
function callHref(phone: string): string {
  return `tel:${dialDigits(phone)}`;
}

type EscapeContext = {
  subjectKey?: string | null;
  symptomId?: string | null;
};

function PhoneNumber({
  config,
  className = "",
}: {
  config: TroubleshootingConfig;
  className?: string;
}) {
  if (!config.supportPhoneConfigured) {
    return (
      <span
        className={`${className} text-info-light`}
        title="No support number has been configured for this deployment"
      >
        {config.supportPhone}
      </span>
    );
  }

  return (
    <a
      href={callHref(config.supportPhone)}
      className={`${className} text-primary hover:underline`}
    >
      {config.supportPhone}
    </a>
  );
}

/** The compact card beside the page heading. */
export function SupportEscapeCard({ config }: { config: TroubleshootingConfig }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg border border-outline bg-surface p-4 sm:min-w-52">
      <span className="text-[13px] font-semibold text-on-surface-variant">
        Nothing here fixing it?
      </span>
      <PhoneNumber config={config} className="text-lg font-bold" />
      <span className="text-xs text-info-light">IT support · Mon–Fri, 7am–7pm</span>
    </div>
  );
}

/** The full-width block at the foot of the page. */
export function SupportEscapeSection({
  config,
  context,
}: {
  config: TroubleshootingConfig;
  /** Which article this escape came from, when there is one. */
  context?: EscapeContext;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  function escape(detail: string) {
    trackTroubleshooting({
      type: "ESCAPE_TAKEN",
      subjectKey: context?.subjectKey ?? null,
      symptomId: context?.symptomId ?? null,
      detail,
    });
  }

  return (
    <section
      id="help"
      className="flex flex-col gap-4 rounded-lg border border-outline bg-surface p-5 scroll-mt-24 sm:flex-row sm:items-center"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10">
        <span className="material-symbols-outlined text-primary">call</span>
      </span>

      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-base font-bold text-on-background">
          Still not working?
        </strong>
        <span className="text-sm text-info-light">
          Call <PhoneNumber config={config} className="font-semibold" /> to speak to an
          IT support admin. Have your asset tag ready.
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto">
        {config.supportPhoneConfigured && (
          <a
            href={callHref(config.supportPhone)}
            onClick={() => escape("called")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined !text-[18px]">call</span>
            Call IT support
          </a>
        )}

        {/* Catches the people the call button doesn't: anyone about to ring
            from a handset, who would otherwise leave no trace at all. It
            records and then says so — a button that appears to do nothing
            gets pressed twice. */}
        <button
          type="button"
          disabled={acknowledged}
          onClick={() => {
            escape("nothing_worked");
            setAcknowledged(true);
          }}
          className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
            acknowledged
              ? "border-outline/50 text-info-light cursor-default"
              : "border-outline text-info-light hover:border-primary hover:text-primary hover:cursor-pointer"
          }`}
        >
          {acknowledged ? "Thanks — noted" : "Nothing here worked"}
        </button>
      </div>
    </section>
  );
}
