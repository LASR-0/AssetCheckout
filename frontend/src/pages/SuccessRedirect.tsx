import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Request } from "@/types/requestType";

/**
 * Post-submission confirmation page. Reads the full submitted Request from
 * navigation state and shows a summary of what was requested.
 *
 * Conditional rendering rules:
 *   - Spec level + Category: always shown (core facts)
 *   - Reason: non-standard only (not meaningful for standard requests)
 *   - Manufacturer / Model name / Model number: non-standard only
 *   - New number / Text call: only when true (opt-in features)
 *
 * If state.request is missing (e.g., user reloaded the page), redirect home.
 */
export default function SuccessRedirect() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const request: Request | undefined = state?.request;

  // Page only works as a destination immediately after submission — bounce
  // home if the user landed here without state (reload, direct link, etc.).
  useEffect(() => {
    if (!request) {
      navigate("/", { replace: true });
    }
  }, [request, navigate]);

  if (!request) return null;

  const isStandard = request.requestType === "STANDARD";
  const specLabel = isStandard ? "Standard" : "Non-standard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-xl w-full bg-success-form rounded-xl p-10 text-center shadow-sm">

        {/* Icon */}
        <div className="mb-6 flex mx-auto bg-surface w-32 h-32 rounded-full justify-center">
          <span className="my-auto material-symbols-outlined !text-6xl text-purple-700">
            check_circle
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl text-on-surface-variant font-bold mb-3">
          You're all set!
        </h1>

        {/* Subtitle — mentions asset category instead of model */}
        <p className="text-on-surface-variant mb-8">
          Your{" "}
          <span className="font-semibold text-nav-text">
            {specLabel.toLowerCase()}
          </span>{" "}
          request for a{" "}
          <span className="font-semibold text-nav-text">
            {request.categoryName}
          </span>{" "}
          has been submitted and is being processed.
        </p>

        {/* Details card */}
        <div className="bg-surface rounded-lg p-5 text-left mb-8 space-y-3">

          <DetailRow label="Specification">
            <SpecBadge isStandard={isStandard} label={specLabel} />
          </DetailRow>

          <DetailRow label="Category">
            <span className="text-on-surface-variant font-semibold">{request.categoryName}</span>
          </DetailRow>

          {/* Non-standard-only fields */}
          {!isStandard && request.modelRequest && (
            <>
              {request.modelRequest.manufacturer && (
                <DetailRow label="Manufacturer">
                  <span className="text-on-surface-variant">
                    {request.modelRequest.manufacturer}
                  </span>
                </DetailRow>
              )}

              {request.modelRequest.modelName && (
                <DetailRow label="Model name">
                  <span className="text-on-surface-variant">
                    {request.modelRequest.modelName}
                  </span>
                </DetailRow>
              )}

              {request.modelRequest.modelNumber && (
                <DetailRow label="Model number">
                  <span className="text-on-surface-variant">
                    {request.modelRequest.modelNumber}
                  </span>
                </DetailRow>
              )}

              {request.reason && (
                <DetailRow label="Reason">
                  <span className="text-on-surface-variant">{request.reason}</span>
                </DetailRow>
              )}
            </>
          )}

          {/* Opt-in extras — only render if true */}
          {request.newNumber && (
            <DetailRow label="New number">
              <YesPill />
            </DetailRow>
          )}

          {request.callText && (
            <DetailRow label="Text call">
              <YesPill />
            </DetailRow>
          )}

        </div>

        {/* Action */}
        <button
          onClick={() => navigate("/")}
          className="w-full text-white twilight-gradient py-3 rounded-2xl font-semibold hover:cursor-pointer hover:brightness-110"
        >
          <span className="flex items-center twilight-gradient justify-center">
            <span className="mr-2">Request another device</span>
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: `'FILL' 1` }}
            >
              reply
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                       INLINE COMPONENTS                         |
///  +-----------------------------------------------------------------+
//
//  Kept inline since they're only used here. If a similar details card
//  appears elsewhere later, extract these into a shared layout file.
///  +-----------------------------------------------------------------+

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant pt-0.5 shrink-0">
        {label}:
      </span>
      <div className="text-sm text-right">{children}</div>
    </div>
  );
}

/**
 * Color-coded badge for the spec level. Standard = a calmer color since it's
 * the common path; non-standard = a more attention-grabby color since it
 * needs admin review.
 */
function SpecBadge({
  isStandard,
  label,
}: {
  isStandard: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
        isStandard
          ? "bg-purple-600/10 text-purple-700"
          : "bg-amber-400/20 text-amber-700"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Simple "Yes" pill for opt-in boolean fields. Implies "this was requested"
 * (we only render the row when true, so no "No" variant needed).
 */
function YesPill() {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-700">
      Yes
    </span>
  );
}