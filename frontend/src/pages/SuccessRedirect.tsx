import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { buttonVariants } from "@/components/ui/variants";
import { Tray, Sheet } from "@/components/ui/tray";
import { HolderChip } from "@/components/ui/pills";
import { Page } from "@/components/shell/Page";
import { RoutePreview } from "@/components/forms/RoutePreview";
import { nounFor } from "@/components/forms/helpers";
import { useAuth } from "@/hooks/useAuth";
import { previewRoute, weekdayDate } from "@/lib/formRoute";
import { countDays, shortDate } from "@/lib/format";
import { isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";
import { isRequestee } from "@/lib/permissions";
import { kindOf } from "@/lib/route";
import { requestTitle } from "@/lib/requestDisplay";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                      IT'S ON ITS WAY                            |
///  +-----------------------------------------------------------------+
//
//  Where the request just sent goes from here, and a record of what was
//  sent. The request arrives in the navigation state from the form that
//  created it; landing here any other way (a reload, a bookmark) goes home,
//  since there is nothing to confirm.
///  +-----------------------------------------------------------------+

/** A picked day stored as UTC midnight, as a local Date for the same day. */
function utcDay(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

type Fact = { k: string; v: string; mono?: boolean; muted?: boolean };

function factsFor(r: Request, deviceName: string | null): Fact[] {
  const kind = kindOf(r);
  const non = r.requestType === "NON_STANDARD";
  const out: (Fact | false)[] = [];
  if (kind === "LOAN") {
    const start = utcDay(r.loan?.startDate);
    const end = utcDay(r.loan?.endDate);
    const days = start ? countDays(start, end ?? undefined) : 0;
    out.push(
      { k: "Device", v: deviceName ?? requestTitle(r) },
      { k: "Requested", v: r.userName },
      !!start && {
        k: "Dates",
        v: end && end.getTime() !== start.getTime() ? `${weekdayDate(start)} → ${weekdayDate(end)}` : weekdayDate(start),
      },
      days > 0 && { k: "Length", v: `${days} day${days > 1 ? "s" : ""}` },
      !!r.reason && { k: "Reason", v: r.reason },
      !!r.loan?.eventName && { k: "Event or site", v: r.loan.eventName },
      { k: "Collect at", v: r.userLocationName?.trim() || "Their site" }
    );
    return out.filter((f): f is Fact => !!f);
  }

  const phoneish = isPhoneCategory(r.categoryName) || isTabletCategory(r.categoryName);
  const reused = r.numberOption === "REUSE" || !!r.reuseNumberPhone || !!r.reuseNumberFromEmail;
  out.push(
    { k: "Category", v: r.categoryName },
    kind === "ACCESSORY" && !!r.accessoryOption && { k: "Option", v: r.accessoryOption },
    { k: "Specification", v: non ? "Non-standard" : "Standard" },
    { k: "Requested", v: r.userName },
    non && !!r.reason && { k: "Reason", v: r.reason },
    phoneish && kind === "ASSET" && { k: "Text call", v: r.callText ? "Yes" : "No" },
    phoneish && kind === "ASSET" && !!r.newNumber && { k: "New number", v: "Yes" },
    reused && {
      k: "Existing number",
      v: r.reuseNumberPhone ?? r.reuseNumberFromEmail ?? "Yes",
      mono: !!r.reuseNumberPhone,
    },
    non && { k: "Model in mind", v: r.preferredModel?.trim() || "No preference" },
    non && kind === "ASSET" && { k: "Manufacturer, model", v: "Filled in by IT when it creates the model", muted: true },
    { k: "Approver", v: r.autoApproved ? `${r.manager ?? "You"} (you)` : r.manager ?? "—" }
  );
  return out.filter((f): f is Fact => !!f);
}

export default function SuccessRedirect() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const request: Request | undefined = state?.request;
  const deviceName: string | null = state?.deviceName ?? null;

  useEffect(() => {
    if (!request) navigate("/", { replace: true });
  }, [request, navigate]);
  if (!request) return null;

  const kind = kindOf(request);
  const isLoan = kind === "LOAN";
  const forMe = isRequestee(request, auth.userId, auth.name);
  const site = request.userLocationName?.trim() || null;
  const first = request.userName.split(" ")[0];
  const route = previewRoute(
    {
      kind: isLoan ? "loan" : kind === "ACCESSORY" ? "accessory" : "asset",
      nonStandard: request.requestType === "NON_STANDARD",
      forMe,
      forName: request.userName,
      site,
      approverName: request.manager ?? null,
      autoApproved: !!request.autoApproved,
      noun: nounFor(request.categoryName),
      deviceName: (deviceName ?? requestTitle(request)).toLowerCase(),
      start: utcDay(request.loan?.startDate),
      end: utcDay(request.loan?.endDate),
    },
    true
  );
  const holder = route.find((s) => s.state === "current")?.holder ?? "With IT";
  const intro = isLoan
    ? `IT will assign a ${(deviceName ?? requestTitle(request)).toLowerCase()} and the ${site ? `${site} ` : ""}stock keeper will email ${forMe ? "you" : first} when it's ready.`
    : request.autoApproved
      ? "You approved it as the manager, so it has gone straight to IT."
      : `We've emailed ${request.manager ?? "their manager"} to approve it. You'll get an email at each step.`;
  const again = isLoan ? "/loan" : kind === "ACCESSORY" ? "/accessories" : "/assets";
  const action = "h-11 flex-1 fs-12.5 phone:h-8.5 phone:flex-none";

  return (
    <Page max={1320} className="flex flex-col gap-3.5 px-3 pt-5 pb-10 phone:gap-4 phone:px-8 phone:pt-7 phone:pb-40">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-[1_1_20rem]">
          <div className="flex items-center gap-2 font-title fs-10 font-medium tracking-label text-mut uppercase">
            Request <span className="font-mono fs-12 tracking-normal text-tx2 normal-case">#{request.id}</span>
          </div>
          <h1 className="mt-2 font-head fs-19 leading-[1.25] font-medium tracking-[-0.01em] phone:fs-21">
            {isLoan ? "Loan booked" : "Request sent"}
          </h1>
          <p className="mt-1 max-w-[38.75rem] fs-13 leading-normal text-pretty text-tx3">{intro}</p>
        </div>
        <div className="flex flex-[1_1_100%] flex-wrap gap-2 phone:flex-none">
          <Link to={again} className={cn(buttonVariants({ variant: "secondary" }), action)}>
            {isLoan ? "Borrow something else" : "Request another device"}
          </Link>
          <Link to={`/requests?requestId=${request.id}`} className={cn(buttonVariants({ variant: "primary" }), action, "gap-1.5 px-4")}>
            Track it
            <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-3.5 phone:grid-cols-[minmax(0,1fr)_minmax(0,26.25rem)] phone:gap-4">
        <Tray
          label="Route"
          aside={
            <HolderChip icon={holder === "With IT" ? "support_agent" : "person"} className="h-6">
              {holder}
            </HolderChip>
          }
        >
          <Sheet className="px-3.5 pt-1.5 pb-2">
            <RoutePreview steps={route} sentOn={shortDate(request.createdAt)} />
          </Sheet>
        </Tray>

        <Tray label="What you sent">
          <Sheet className="px-3.5">
            {factsFor(request, deviceName).map((f, i) => (
              <div key={f.k} className={cn("flex justify-between gap-4 py-2.75 fs-12", i > 0 && "border-t border-line2")}>
                <span className="flex-none text-mut">{f.k}</span>
                <span className={cn("text-right fs-13.5 text-pretty", f.mono && "font-mono", f.muted ? "text-mut" : "text-tx")}>
                  {f.v}
                </span>
              </div>
            ))}
          </Sheet>
        </Tray>
      </div>
    </Page>
  );
}
