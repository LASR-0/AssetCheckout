import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";

/** Which article an escape came from, when there is one. */
export type EscapeContext = { subjectKey?: string | null; symptomId?: string | null };

/**
 * Calling, messaging and running out of steps all record ESCAPE_TAKEN, told
 * apart by `detail`, so the mix of how people leave stays visible.
 */
export function trackEscape(detail: "called" | "messaged" | "nothing_worked", context: EscapeContext = {}) {
  trackTroubleshooting({
    type: "ESCAPE_TAKEN",
    subjectKey: context.subjectKey ?? null,
    symptomId: context.symptomId ?? null,
    detail,
  });
}

/**
 * Plain tel:, digits only (a leading + kept). The OS hands it to whatever
 * places calls: Teams on a work desktop, the dialler on a phone.
 */
export function callHref(phone: string): string {
  return `tel:${phone.replace(/(?!^\+)[^\d]/g, "")}`;
}
