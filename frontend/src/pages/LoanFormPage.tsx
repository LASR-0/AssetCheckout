import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Calendar from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createLoanRequest } from "@/api/loans";
import { invalidateWorkflow, loanConfigQuery, loanDevicesQuery } from "@/api/queries";
import { iconForCategory } from "@/lib/categoryIcon";
import { countDays, toDateString } from "@/lib/format";
import { previewRoute, weekdayDate } from "@/lib/formRoute";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { User } from "@/components/request-form/UserSelect";
import { FormLayout, type FormError } from "@/components/forms/FormLayout";
import { goToSection } from "@/components/forms/helpers";
import { Field, FieldError, FormSection, Question } from "@/components/forms/FormSection";
import { WhoFor, type ForMode } from "@/components/forms/WhoFor";
import { useDirectory } from "@/components/forms/useDirectory";
import { submitErrorText } from "@/components/forms/submit";

///  +-----------------------------------------------------------------+
///  |                      BORROW A DEVICE                            |
///  +-----------------------------------------------------------------+
//
//  What, who, when, what for. That's the whole form.
//
//  NO APPROVER and NO SPEC LEVEL: a loan goes straight to IT, and nothing is
//  bought. IT assigns a unit and the site's stock keeper hands it over; the
//  loan starts on collection and is due back on the last day.
//
//  The devices are the whitelist in Settings → Loans. With exactly one,
//  there is no question to ask. Availability is today's, and advisory: a
//  booking for next week is fine even if every unit is out now.
//
//  The longest loan is a setting; the form shows it and the server enforces
//  it. A single day is a range with no end.
//
//  The event name is per device: a keeper needs it on a hotspot ("Toowoomba
//  roadshow"); on a KVM it is a field nobody can answer.
///  +-----------------------------------------------------------------+

export default function LoanFormPage() {
  const navigate = useNavigate();
  const { users, me } = useDirectory();
  const devices = useQuery(loanDevicesQuery);
  const { data: config } = useQuery(loanConfigQuery);
  const maxDays = config?.maxLoanDays ?? 30;
  const twoMonths = useMediaQuery("(min-width: 36rem)");

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [forMode, setForMode] = useState<ForMode>("me");
  const [other, setOther] = useState<User | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const [eventName, setEventName] = useState("");
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const list = devices.data ?? [];
  const device = list.find((d) => d.id === deviceId) ?? (list.length === 1 ? list[0] : null);
  const loansOff = devices.isSuccess && list.length === 0;
  const requestee = forMode === "me" ? me : other;
  const days = countDays(range?.from, range?.to);
  const over = days > maxDays;
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const availabilityUnknown = list.length > 0 && list.every((d) => d.remaining === null);

  // ---- what's missing -------------------------------------------------
  const errors: FormError[] = [];
  if (!device) errors.push({ section: "dev", message: "Please pick a device to borrow." });
  if (!requestee) errors.push({ section: "who", message: "Please select a requester." });
  if (!range?.from) errors.push({ section: "when", message: "Please pick the days you need it." });
  else if (over) errors.push({ section: "when", message: `That's ${days} days, which is longer than the ${maxDays}-day maximum.` });
  if (!reason.trim()) errors.push({ section: "why", message: "Please say what it's for." });
  // Too long is worth saying the moment it happens, not only after Send.
  const errorFor = (section: string) =>
    tried || (section === "when" && over) ? errors.find((e) => e.section === section)?.message : undefined;

  const steps = [
    { id: "dev", label: "What to borrow", value: device?.displayName, done: !!device },
    { id: "who", label: "Who it's for", value: requestee?.name, done: !!requestee },
    { id: "when", label: "When", value: days ? `${days} day${days > 1 ? "s" : ""}` : null, done: !!range?.from && !over },
    { id: "why", label: "What it's for", value: reason.trim() ? "Added" : null, done: !!reason.trim() },
  ].map((s) => ({ ...s, error: !!errorFor(s.id) }));

  const route = loansOff
    ? null
    : previewRoute({
        kind: "loan",
        nonStandard: false,
        forMe: forMode === "me",
        forName: requestee?.name ?? null,
        site: requestee?.locationName ?? null,
        approverName: null,
        autoApproved: false,
        noun: null,
        deviceName: device?.displayName.toLowerCase() ?? null,
        start: range?.from ?? null,
        end: range?.to ?? null,
      });

  async function submit() {
    setTried(true);
    if (errors.length > 0) {
      goToSection(errors[0].section);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await createLoanRequest({
        userId: Number(requestee!.id),
        userName: requestee!.name,
        deviceOptionId: device!.id,
        startDate: toDateString(range!.from!),
        endDate: toDateString(range!.to ?? range!.from!),
        reason: reason.trim(),
        eventName: device!.showEventName ? eventName.trim() || null : null,
      });
      void invalidateWorkflow();
      // The loan comes back beside the request; the success page wants both,
      // and the device's name as the requester picked it.
      navigate("/success", {
        state: { request: { ...data.request, loan: data.loan }, deviceName: device!.displayName },
      });
    } catch (err) {
      setSubmitError(submitErrorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormLayout
      kind="loan"
      title="Borrow a device"
      intro="Borrow a hotspot, a KVM or another device IT lends out. Pick what you need and the days you need it, and we'll have it ready to collect."
      steps={steps}
      route={route}
      pill={{ label: "Loan", accent: "id4" }}
      errors={errors}
      tried={tried}
      submitError={submitError}
      submitting={submitting}
      submitLabel="Book loan"
      onSubmit={submit}
    >
      <FormSection id="dev" label="What to borrow" sheetClassName="gap-0 overflow-hidden p-0">
        {devices.isPending ? (
          <div className="flex flex-col gap-2 p-3.5">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-15 rounded-10 bg-track" />
            ))}
          </div>
        ) : devices.isError ? (
          <p className="m-0 flex items-center gap-2 px-3.5 py-4 fs-12.5 text-tx2">
            <Icon name="cloud_off" size={18} className="text-mut" />
            Couldn't load the devices IT lends out. Try again in a minute.
          </p>
        ) : loansOff ? (
          <div className="flex flex-col gap-1 px-3.5 py-4">
            <span className="flex items-center gap-2 fs-13.5 font-semibold">
              <Icon name="block" size={18} className="text-mut" />
              Loans are currently disabled
            </span>
            <span className="fs-12.5 leading-normal text-tx3">
              There are no devices set up to lend. If you need something urgently, ask IT, or request a device of your
              own from Assets.
            </span>
          </div>
        ) : (
          <>
            <div className="px-3.5 pt-3.5 pb-1.5">
              <div className="fs-13.5 font-semibold">Pick a device</div>
              {availabilityUnknown && (
                <div className="mt-0.5 fs-12 text-tx3">
                  Snipe-IT is unreachable, so today's availability isn't shown. You can still book.
                </div>
              )}
            </div>
            <RadioGroup aria-label="Pick a device" value={device?.id ?? ""} onValueChange={setDeviceId} className="gap-0">
              {list.map((d) => (
                <label
                  key={d.id}
                  className="grid min-h-15 cursor-pointer grid-cols-[1.125rem_1.375rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line2 px-3.5 py-2.5 transition-colors hover:bg-subtle has-[[data-state=checked]]:bg-brand-sub"
                >
                  <RadioGroupItem value={d.id} />
                  <Icon name={iconForCategory(d.displayName)} size={20} weight={300} className="text-tx3" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="fs-13.5 font-medium">{d.displayName}</span>
                    {d.description && <span className="fs-12 leading-[1.45] text-pretty text-tx3">{d.description}</span>}
                  </span>
                  {d.remaining !== null && (
                    <span className={cn("fs-12 whitespace-nowrap", d.remaining > 0 ? "font-medium text-ok" : "text-mut")}>
                      {d.remaining > 0 ? `${d.remaining} free today` : "None free today"}
                    </span>
                  )}
                </label>
              ))}
            </RadioGroup>
          </>
        )}
        <FieldError className="px-3.5 pb-3">{errorFor("dev")}</FieldError>
      </FormSection>

      {!loansOff && (
        <>
          <FormSection id="who" label="Who it's for">
            <Question hint="They collect it, and it is booked under their name.">Who is it for?</Question>
            <WhoFor
              mode={forMode}
              onMode={setForMode}
              me={me}
              users={users}
              other={other}
              onOther={setOther}
              invalid={!!errorFor("who")}
            />
            <FieldError>{errorFor("who")}</FieldError>
          </FormSection>

          <FormSection id="when" label="When do you need it?" aside={`Up to ${maxDays} days`}>
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) => {
                setRange(r);
                setSubmitError(null);
              }}
              disabled={{ before: today }}
              startMonth={today}
              numberOfMonths={twoMonths ? 2 : 1}
              modifiers={{ over: over && range?.from ? { from: range.from, to: range.to ?? range.from } : false }}
              modifiersClassNames={{
                // Past the maximum, the whole range turns red: the ends as
                // chips, the days between as a tint.
                over:
                  "[&:not(.bg-brand-sub)>button]:bg-stop! [&:not(.bg-brand-sub)>button]:text-white! " +
                  "[&.bg-brand-sub]:bg-stop-bg! [&.bg-brand-sub>button]:text-stop!",
              }}
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-line2 pt-3 fs-13">
              <Icon name="date_range" size={17} className="text-mut" />
              <span className={cn(range?.from ? "text-tx" : "text-tx3", range?.to && "font-medium")}>
                {!range?.from
                  ? "Pick the first day you need it."
                  : range.to
                    ? `${weekdayDate(range.from)} → ${weekdayDate(range.to)}`
                    : `${weekdayDate(range.from)}. Pick the last day, or leave it for a single day.`}
              </span>
              {days > 0 && (
                <span className={over ? "font-semibold text-stop" : "text-tx3"}>
                  · {days} day{days > 1 ? "s" : ""}
                </span>
              )}
              {range?.from && (
                <button
                  type="button"
                  onClick={() => setRange(undefined)}
                  className="ml-auto cursor-pointer border-0 bg-transparent p-0 font-sans fs-12 font-medium text-tx3 hover:text-tx"
                >
                  Clear
                </button>
              )}
            </div>
            <FieldError>{errorFor("when")}</FieldError>
          </FormSection>

          <FormSection id="why" label="What's it for?">
            <Field label="Why do you need it?">
              <Textarea
                size="lg"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={!!errorFor("why") || undefined}
                placeholder="e.g. no site wifi at the Toowoomba roadshow"
              />
            </Field>
            <FieldError className="-mt-1.5">{errorFor("why")}</FieldError>
            {device?.showEventName && (
              <Field label="Event or site name" optional={`optional · ${device.displayName} asks for this`}>
                <Input size="lg" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Toowoomba roadshow" />
              </Field>
            )}
          </FormSection>
        </>
      )}
    </FormLayout>
  );
}
