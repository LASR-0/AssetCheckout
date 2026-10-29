import { useState, useEffect } from "react";
import { invalidateWorkflow } from "@/api/queries";
import { queryClient } from "@/api/queryClient";
import { loanDevicesQuery, usersQuery } from "@/api/queries";
import type { DateRange } from "react-day-picker";
import { useNavigate } from "react-router-dom";
import UserDetailsInput from "@/components/request-form/UserDetailsInput";
import LoanWindowSection, {
  toDateString,
  countDays,
} from "@/components/loan-form/LoanWindowSection";
import LoanDevicePicker from "@/components/loan-form/LoanDevicePicker";
import { createLoanRequest, type LoanDeviceChoice } from "@/api/loans";
import type { User } from "@/components/request-form/UserSelect";
import { useAuth } from "@/hooks/useAuth";

///  +-----------------------------------------------------------------+
///  |                  LOAN REQUEST FORM PAGE                         |
///  +-----------------------------------------------------------------+
//
//  The shortest form in the app, and deliberately: what, who, when, what for.
//  That is the whole thing.
//
//  ONE QUESTION THE HOTSPOT FORM NEVER ASKED: WHICH DEVICE. Loans now cover
//  more than hotspots (KVMs, for remote support of iPads, were the reason), so
//  the requester picks from the devices IT has made loanable. The list is the
//  whitelist in Settings → Loans, not a Snipe category — see LoanDevice.
//
//  NO APPROVER FIELD. A loan has no manager stage — it goes straight to IT —
//  so there is nothing to ask. This is the single biggest difference from the
//  asset and accessory forms and the reason this is a page rather than a mode
//  on one of them.
//
//  NO SPEC LEVEL. Standard-versus-non-standard is a question about what to
//  BUY, and nothing is being bought — a loan hands over something already on
//  the shelf and takes it back afterwards.
//
//  THE EVENT NAME IS PER DEVICE. It is what a keeper needs on a hotspot row
//  ("Toowoomba roadshow"); on a KVM row it is a field nobody can answer.
///  +-----------------------------------------------------------------+

// Mirrors loan_max_days. The form shows the limit and the server
// enforces it; if an admin changes the setting the worst case is a submission
// refused with the real number in the message, which is why this does not
// need to be fetched.
const MAX_LOAN_DAYS = 30;

export default function LoanFormPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [range, setRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");
  const [eventName, setEventName] = useState("");

  const [devices, setDevices] = useState<LoanDeviceChoice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { email: authEmail } = useAuth();
  const selectedRequester = users.find((u) => u.id === userId) ?? null;
  const device = devices.find((d) => d.id === deviceId) ?? null;

  useEffect(() => {
    queryClient.fetchQuery(usersQuery).then((data) => {
      setUsers(
        data
          .map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            mobile: u.mobile,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    queryClient.fetchQuery(loanDevicesQuery)
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        // With only one thing to lend there is no question to ask.
        if (list.length === 1) setDeviceId(list[0].id);
      })
      .catch((err) => {
        if (!cancelled) setDevicesError(err.message ?? "Couldn't load the devices.");
      })
      .finally(() => {
        if (!cancelled) setDevicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default the requester to the signed-in user, as the accessory form does.
  // Booking on somebody else's behalf stays possible — for an event, whoever
  // is organising it books as often as the person carrying the device does.
  useEffect(() => {
    if (!authEmail || users.length === 0 || userId) return;
    const me = users.find((u) => u.email?.toLowerCase() === authEmail.toLowerCase());
    if (me) {
      setUserId(me.id);
      setUserName(me.name);
    }
  }, [authEmail, users, userId]);

  const days = countDays(range);
  const notConfigured = !devicesLoading && !devicesError && devices.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!device) return setError("Please pick what you'd like to borrow.");
    if (!userId) return setError(`Please select who the ${device.displayName} is for.`);
    if (!range?.from) return setError("Please pick the first day you need it.");
    if (days > MAX_LOAN_DAYS) {
      return setError(
        `A loan can be booked for at most ${MAX_LOAN_DAYS} days — this is ${days}.`
      );
    }
    if (!reason.trim()) {
      return setError(`Please say what you need the ${device.displayName} for.`);
    }

    setIsSubmitting(true);
    try {
      // A single-day loan is a range with no `to` — the picker only fills it
      // on the second click. Treating that as from==to is what makes one click
      // mean "just today" rather than an incomplete form.
      const data = await createLoanRequest({
        userId: Number(userId),
        userName,
        deviceOptionId: device.id,
        startDate: toDateString(range.from),
        endDate: toDateString(range.to ?? range.from),
        reason: reason.trim(),
        eventName: device.showEventName ? eventName.trim() || null : null,
      });

      void invalidateWorkflow();
      navigate("/success", { state: { request: data.request } });
    } catch (err: any) {
      console.error("ERROR:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-landing-bg text-on-background flex flex-col">
      <div className="flex-grow my-24 pb-20 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <div className="flex flex-row">
              <span className="material-symbols-outlined mx-3 !text-4xl"> devices </span>
              <h1 className="text-4xl font-bold text-nav-selected flex tracking-tight mb-2">
                Borrow a device
              </h1>
            </div>
            <p className="text-info-light ml-5">
              Borrow a hotspot, a KVM or another device IT lends out. Pick what
              you need and the days you need it, and we'll have it ready to
              collect.
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-md">
            <form onSubmit={handleSubmit} className="space-y-10">
              <LoanDevicePicker
                devices={devices}
                value={deviceId}
                onChange={setDeviceId}
                loading={devicesLoading}
                error={devicesError}
              />

              <UserDetailsInput
                users={users}
                value={selectedRequester}
                label="2. Who is it for?"
                placeholder={`Who will be using the ${device?.displayName ?? "device"}?`}
                onSelected={(id, name) => {
                  setUserId(id);
                  setUserName(name);
                }}
              />

              <LoanWindowSection
                value={range}
                onChange={setRange}
                maxDays={MAX_LOAN_DAYS}
                label="3. When do you need it?"
              />

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
                  4. What's it for?
                </label>

                {device?.showEventName && (
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Event or site name (optional)"
                    className="w-full rounded-xl border border-outline bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-info-light focus:border-primary focus:outline-none mb-3"
                  />
                )}

                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={
                    device?.showEventName
                      ? "Why do you need it? e.g. no site wifi at the Toowoomba roadshow"
                      : "Why do you need it?"
                  }
                  className="w-full rounded-xl border border-outline bg-surface-container-low px-4 py-3 text-sm text-on-surface placeholder:text-info-light focus:border-primary focus:outline-none resize-y"
                />

                <p className="mt-2 ml-1 text-xs text-info-light">
                  There's no manager approval on a loan — this goes straight to IT.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || notConfigured}
                className="w-full py-4 text-white font-bold rounded-3xl shadow-lg hover:shadow-xl hover:cursor-pointer hover:brightness-110 transition-all twilight-gradient disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center">
                  {isSubmitting ? (
                    <>
                      <span className="mr-2">Submitting...</span>
                      <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
                    </>
                  ) : (
                    <>
                      <span className="mb-0.5 mr-2">
                        {device ? `Request ${device.displayName}` : "Request loan"}
                      </span>
                      <span
                        className="material-symbols-outlined leading-none mb-0.5"
                        style={{ fontVariationSettings: `'FILL' 1` }}
                      >
                        send
                      </span>
                    </>
                  )}
                </span>
              </button>

              {error && (
                <div className="flex items-center justify-center gap-2 text-sm text-error bg-error-background rounded-xl p-3">
                  <span className="material-symbols-outlined !text-[18px]">info</span>
                  <span className="text-center">{error}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
