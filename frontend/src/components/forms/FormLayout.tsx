import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Tray, Sheet } from "@/components/ui/tray";
import { IdentityPill, type Accent } from "@/components/ui/pills";
import { SegmentedControl } from "@/components/ui/segmented";
import { Page } from "@/components/shell/Page";
import type { PreviewStep } from "@/lib/formRoute";
import { RouteDotsPreview, RoutePreview } from "./RoutePreview";
import { StepsRail, type Step } from "./StepsRail";
import { goToSection } from "./helpers";

///  +-----------------------------------------------------------------+
///  |                  ONE LAYOUT FOR EVERY FORM                      |
///  +-----------------------------------------------------------------+
//
//  Assets, Accessories and Loan share it, so the three read as one system:
//
//    wide (1160 design px)  steps rail · sections · what happens next
//    desktop                sections · what happens next
//    phone                  sections, then a bar pinned to the bottom with
//                           the route as dots, the next step, and Send
//
//  The switch at the top moves between the three forms (they are separate
//  pages, so each keeps its own address for links from Home).
//
//  Errors wait for the first Send, then show both where they are and as a
//  list beside the button; each list entry jumps to its section.
//
//  The foot of the page is deliberately roomy (and the phone's submit bar
//  sits well below the last section): the last section is a person search,
//  and its results open downward, so the page has to be able to scroll far
//  enough to show them. See PersonPicker.
///  +-----------------------------------------------------------------+

export type FormKind = "asset" | "accessory" | "loan";

const KINDS: { value: FormKind; label: string; icon: string; to: string }[] = [
  { value: "asset", label: "Asset", icon: "laptop_windows", to: "/assets" },
  { value: "accessory", label: "Accessory", icon: "headphones", to: "/accessories" },
  { value: "loan", label: "Loan", icon: "event_available", to: "/loan" },
];

export type FormError = { section: string; message: string };

type Props = {
  kind: FormKind;
  title: string;
  intro: string;
  steps: Step[];
  /** Null hides the side panel and the submit (loans switched off). */
  route: PreviewStep[] | null;
  pill: { label: string; accent: Accent };
  errors: FormError[];
  /** Errors are shown only after the first attempt to send. */
  tried: boolean;
  submitError: string | null;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
};

export function FormLayout({
  kind,
  title,
  intro,
  steps,
  route,
  pill,
  errors,
  tried,
  submitError,
  submitting,
  submitLabel,
  onSubmit,
  children,
}: Props) {
  const navigate = useNavigate();
  const shown = tried ? errors : [];
  const errorHead = shown.length === 1 ? "1 thing to fix before sending" : `${shown.length} things to fix before sending`;
  const next = route?.find((s) => s.state !== "now" && s.state !== "done");
  const label = submitting ? "Sending…" : submitError ? "Try again" : submitLabel;

  return (
    // No bottom padding on phones: the submit bar is the page's last thing.
    <Page max={1320} className={cn("px-3 pt-5 phone:px-8 phone:pt-7 phone:pb-72", route ? "pb-0" : "pb-10")}>
      <div className="flex flex-col gap-3.5 phone:gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-[1_1_20rem]">
            <div className="font-title fs-10 font-medium tracking-label text-mut uppercase">New request</div>
            <h1 className="mt-2 font-head fs-19 leading-[1.25] font-medium tracking-[-0.01em] phone:fs-21">{title}</h1>
            <p className="mt-1 max-w-[38.75rem] fs-13 leading-normal text-pretty text-tx3">{intro}</p>
          </div>
          <SegmentedControl
            label="Kind of request"
            size="md"
            value={kind}
            onValueChange={(k) => navigate(KINDS.find((x) => x.value === k)!.to)}
            options={KINDS.map((k) => ({ value: k.value, label: k.label, icon: k.icon }))}
            className="flex-[1_1_100%] *:h-10 phone:flex-none phone:*:h-8 [&_[data-state=on]_.material-symbols-outlined]:text-brand [&_[data-state=on]_.material-symbols-outlined]:[font-variation-settings:'FILL'_1,'wght'_300]!"
          />
        </div>

        <div
          className={cn(
            "grid items-start gap-x-5 gap-y-3.5 phone:gap-y-4",
            "phone:grid-cols-[minmax(0,1fr)_20rem]",
            route && "min-[58rem]:grid-cols-[13.75rem_minmax(0,1fr)_21.25rem]"
          )}
        >
          {route && (
            <aside className="sticky top-7 hidden min-w-0 self-start min-[58rem]:block">
              <StepsRail label={kind === "loan" ? "Booking" : "Steps"} steps={steps} onGo={goToSection} />
            </aside>
          )}

          <div className="flex min-w-0 flex-col gap-3.5 phone:gap-4">{children}</div>

          {route && (
            <aside className="flex min-w-0 flex-col gap-3 phone:sticky phone:top-7 phone:self-start">
              <Tray
                label="What happens next"
                aside={
                  <IdentityPill accent={pill.accent} className="h-5.5 fs-11.5">
                    {pill.label}
                  </IdentityPill>
                }
              >
                <Sheet className="px-3.5 pt-1.5 pb-2">
                  <RoutePreview steps={route} />
                </Sheet>
              </Tray>

              <div className="hidden flex-col gap-2.5 phone:flex">
                {shown.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-10 bg-stop-bg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--stop-line)]">
                    <span className="fs-12.5 font-semibold text-stop">{errorHead}</span>
                    {shown.map((e) => (
                      <button
                        key={e.section + e.message}
                        type="button"
                        onClick={() => goToSection(e.section)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left font-sans fs-12 leading-[1.45] text-tx underline decoration-stop-line underline-offset-3"
                      >
                        {e.message}
                      </button>
                    ))}
                  </div>
                )}
                {submitError && (
                  <div className="flex items-start gap-2 rounded-10 bg-stop-bg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--stop-line)]">
                    <Icon name="cloud_off" size={18} className="text-stop" />
                    <span className="fs-12.5 leading-normal text-pretty text-tx">{submitError}</span>
                  </div>
                )}
                <Button
                  variant="primary"
                  className="h-10 w-full rounded-10 fs-13.5"
                  disabled={submitting}
                  onClick={onSubmit}
                >
                  {label}
                </Button>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Phone: the submit bar stays at the bottom of the screen. */}
      {route && (
        <div className="sticky bottom-0 z-10 -mx-3 mt-40 flex flex-col gap-2 border-t border-line bg-sheet px-3 pt-2.5 pb-3.5 shadow-[0_-0.5rem_1.25rem_var(--shade)] phone:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <RouteDotsPreview steps={route} />
            <span className="min-w-0 flex-1 truncate fs-12.5 text-tx2">{next ? `Next: ${next.title}` : ""}</span>
          </div>
          {shown.length > 0 && <span className="fs-12 font-medium text-stop">{errorHead}</span>}
          {submitError && <span className="fs-12 leading-[1.45] text-stop">{submitError}</span>}
          <Button variant="primary" className="h-12 w-full rounded-10 fs-13.5" disabled={submitting} onClick={onSubmit}>
            {label}
          </Button>
        </div>
      )}
    </Page>
  );
}
