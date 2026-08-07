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
//  obvious blank, because it looks like it works.
//
//  WHAT THIS DOESN'T DO YET. It carries no context. A user who has worked
//  through four steps still has to re-explain all of it on the call, and the
//  brief calls that the most valuable thing this block could do. Carrying
//  the device, article and step reached is a later increment.
///  +-----------------------------------------------------------------+

/** Strips spacing so `tel:` gets digits, keeping a leading +. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`;
}

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
    <a href={telHref(config.supportPhone)} className={`${className} text-primary hover:underline`}>
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
export function SupportEscapeSection({ config }: { config: TroubleshootingConfig }) {
  return (
    <section
      id="help"
      className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-lg border border-outline bg-surface p-5 scroll-mt-24"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10">
        <span className="material-symbols-outlined text-primary">call</span>
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <strong className="text-base font-bold text-on-background">
          Still not working?
        </strong>
        <span className="text-sm text-info-light">
          Call <PhoneNumber config={config} className="font-semibold" /> to speak to an
          IT support admin. Have your asset tag ready.
        </span>
      </div>
    </section>
  );
}
