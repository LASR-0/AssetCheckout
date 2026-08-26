import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import AssetOptionsSection from "@/components/request-form/AssetOptionsSection";
import AccessoryOptionsSection from "@/components/accessory-form/AccessoryOptionSection";
import SpecLevelToggle from "@/components/request-form/SpecLevelToggle";
import ApprovalInput from "@/components/request-form/ApprovalInput";
import type { User } from "@/components/request-form/UserSelect";
import { editRequest, type EditRequestPayload } from "@/api/requests";
import { getAssetCategories } from "@/api/categories";
import { getAccessoryCategoriesForUser } from "@/api/accessories";
import { fetchUsers } from "@/api/users";
import { canEditRequestShape } from "@/lib/permissions";
import { iconForCategory } from "@/lib/categoryIcon";
import { resolveMobileNumber } from "@/lib/mobileNumber";
import { useMobileFilterConfig } from "@/hooks/useMobileFilterConfig";
import type { Request, RequestChange } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                     EDIT REQUEST DIALOG                         |
///  +-----------------------------------------------------------------+
//
//  Correcting a request that was filed wrong — the phone that was meant to be
//  a phone case, the approver who isn't the requester's manager.
//
//  IT IS THE TWO REQUEST FORMS, NARROWED. Every control here is the same
//  component the create forms use (AssetOptionsSection, AccessoryOptionsSection,
//  SpecLevelToggle, ApprovalInput), driven from the same shape of state. That
//  is the point: an edited request has to end up indistinguishable from one
//  that was filed correctly, and the surest way to get there is to edit it
//  through the same controls that would have produced it. The pieces the forms
//  don't share — the kind toggle and the category picker — are the only two
//  built here, and the category picker is deliberately a denser thing than the
//  forms' tile grid, because it sits inside a modal.
//
//  WHAT IS NOT HERE: the requester. Who a request is FOR is its identity —
//  the approver list, the accessory catalogue and the whole visibility filter
//  all hang off it — so a request for the wrong person is a different request,
//  not a mis-typed one. It stays a reject-and-refile.
//
//  TWO PANELS, NOT A PREVIEW. Rather than diffing the form against the request
//  to show what WILL change, the dialog saves and then shows what DID: the
//  server's own change list, which is the exact text the requester is emailed.
//  A preview computed here could disagree with the email; this cannot.
///  +-----------------------------------------------------------------+

type Kind = "ASSET" | "ACCESSORY";

type EditState = {
  requestKind: Kind;
  categoryId: number;
  categoryName: string;
  /** The admin's OWN spec-level choice. For accessories the effective value is
   *  derived from the option below, exactly as on the accessory form. */
  requestType: "STANDARD" | "NON_STANDARD";
  reason: string;
  preferredModel: string;

  // Asset options. Named to match the create form's state, because
  // AssetOptionsSection reads and writes these keys directly.
  callText: boolean;
  needsData: boolean;
  numberOption: "NEW" | "REUSE" | "NONE" | null;
  reuseUser: User | null;

  // Accessory options.
  accessoryOption: string | null;
  somethingElse: boolean;

  manager: string;
  managerId: string;
};

type Category = { id: number; name: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refetch the log. Called once, when the dialog is dismissed after a save. */
  onSuccess: () => void;
};

///  +-----------------------------------------------------------------+
///  |                     COMPACT CATEGORY PICKER                     |
///  +-----------------------------------------------------------------+
//
//  The forms' AssetTypeSelector / AccessoryTypeSelector render a grid of
//  large tiles, which is right on a full page and far too tall inside a
//  modal that also has to hold four other sections. Same information, same
//  icon lookup, a third of the height.
///  +-----------------------------------------------------------------+

function CategoryPicker({
  categories,
  value,
  loading,
  error,
  emptyMessage,
  onChange,
}: {
  categories: Category[];
  value: number;
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  onChange: (id: number, name: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center py-6 font-semibold text-info-light text-sm">
        <span className="animate-spin h-4 w-4 border-2 border-info-light border-t-transparent rounded-full mr-3" />
        Loading types...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-error bg-error-background rounded-xl p-3">
        <span className="material-symbols-outlined !text-[18px]">info</span>
        <span>{error}</span>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-sm text-on-surface-variant opacity-60 italic py-4">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {categories.map((cat) => {
        const selected = value === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(cat.id, cat.name)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all hover:cursor-pointer
              ${
                selected
                  ? "border-primary border-2 bg-surface-container-lowest"
                  : "border-outline-variant/20 hover:bg-surface-container hover:border-outline"
              }`}
          >
            <span className="material-symbols-outlined !text-[20px] shrink-0 text-on-surface-variant">
              {iconForCategory(cat.name)}
            </span>
            <span className="text-sm font-medium text-on-background truncate">
              {cat.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Section heading, matching the forms' small-caps label without their
 *  numbering — the dialog has no fixed sequence to number against. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium tracking-wider mb-4 uppercase text-on-surface-variant">
      {children}
    </h3>
  );
}

export default function EditRequestDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [state, setState] = useState<EditState | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [assetCategories, setAssetCategories] = useState<Category[]>([]);
  const [accessoryCategories, setAccessoryCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [optionLabels, setOptionLabels] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Non-null once a save has landed — flips the dialog to the result panel. */
  const [result, setResult] = useState<RequestChange[] | null>(null);
  /** Whether anything was actually written, so dismissing knows whether the
   *  log needs refetching. */
  const savedRef = useRef(false);

  const mobileConfig = useMobileFilterConfig();

  // Whether WHAT is being requested can still move. False once IT has built
  // something from it — see canEditRequestShape.
  const shapeEditable = request ? canEditRequestShape(request) : false;

  // ---------------------------------------------------------------
  // SEEDING
  // ---------------------------------------------------------------
  //
  // Re-seeded every time the dialog opens against a request, so reopening
  // after a cancel starts from the row rather than from the abandoned edit.
  // Keyed on the id as well as `open` because the log reuses one dialog
  // instance for every row.
  useEffect(() => {
    if (!open || !request) return;

    const kind: Kind = request.requestKind === "ACCESSORY" ? "ACCESSORY" : "ASSET";

    setState({
      requestKind: kind,
      categoryId: request.categoryId,
      categoryName: request.categoryName,
      requestType:
        request.requestType === "NON_STANDARD" ? "NON_STANDARD" : "STANDARD",
      reason: request.reason ?? "",
      preferredModel: request.preferredModel ?? "",
      callText: request.callText ?? false,
      needsData: request.needsData ?? false,
      numberOption: request.numberOption ?? null,
      // Filled in once the directory loads — the row stores the email, and the
      // picker is driven by the whole User.
      reuseUser: null,
      accessoryOption: kind === "ACCESSORY" ? request.accessoryOption ?? null : null,
      // "Something else" is the null option on an accessory request, but null
      // ALSO means "this category offers no options at all". The two are only
      // distinguishable once the option labels arrive, so this is settled in
      // onOptionsLoaded below rather than guessed here.
      somethingElse: false,
      manager: request.manager ?? "",
      managerId: String(request.managerId),
    });
    setOptionLabels([]);
    setResult(null);
    setError(null);
    savedRef.current = false;
  }, [open, request?.id]);

  // The directory, for the approver and reuse-number pickers. Loaded once and
  // kept — it is the same list the forms fetch and it does not change while a
  // dialog is open.
  useEffect(() => {
    if (!open || users.length > 0) return;
    fetchUsers()
      .then((data) =>
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
        )
      )
      .catch((err) => console.error("Failed to load users", err));
  }, [open, users.length]);

  // Resolve the stored reuse email back to a User, once both are available.
  // Only ever fills a blank: an admin who has since picked somebody else must
  // not have their choice overwritten when this re-runs.
  useEffect(() => {
    if (!open || !request?.reuseNumberFromEmail || users.length === 0) return;
    setState((prev) => {
      if (!prev || prev.reuseUser) return prev;
      const match = users.find(
        (u) =>
          u.email?.toLowerCase() === request.reuseNumberFromEmail?.toLowerCase()
      );
      return match ? { ...prev, reuseUser: match } : prev;
    });
  }, [open, request?.reuseNumberFromEmail, users]);

  // Categories for whichever side the request is currently on. The accessory
  // list is derived from the REQUESTER's devices, the same rule the accessory
  // form applies — the requester never changes here, so it is fetched once per
  // open rather than per keystroke.
  useEffect(() => {
    if (!open || !request || !state) return;

    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesError(null);

    const load =
      state.requestKind === "ACCESSORY"
        ? getAccessoryCategoriesForUser(request.userId)
        : getAssetCategories();

    load
      .then((cats) => {
        if (cancelled) return;
        const mapped = cats.map((c) => ({ id: c.id, name: c.name }));
        if (state.requestKind === "ACCESSORY") setAccessoryCategories(mapped);
        else setAssetCategories(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        setCategoriesError(
          state.requestKind === "ACCESSORY"
            ? "Couldn't load the accessories available for this user."
            : "Couldn't load asset types — Snipe-IT may be unreachable."
        );
        console.error("Failed to load categories", err);
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id, state?.requestKind]);

  // ---------------------------------------------------------------
  // DERIVED
  // ---------------------------------------------------------------

  // Accessories derive their spec level from the option, exactly as the
  // accessory form does: "Something else" is non-standard by definition, a
  // catalogued option is standard by definition, and with neither picked the
  // admin's own choice stands. Assets always take the admin's own choice.
  const hasNamedOption = !!state?.accessoryOption;
  const effectiveRequestType: "STANDARD" | "NON_STANDARD" = !state
    ? "STANDARD"
    : state.requestKind === "ACCESSORY"
    ? state.somethingElse
      ? "NON_STANDARD"
      : hasNamedOption
      ? "STANDARD"
      : state.requestType
    : state.requestType;

  const categories =
    state?.requestKind === "ACCESSORY" ? accessoryCategories : assetCategories;

  const selectedManager = useMemo(
    () => users.find((u) => u.id === state?.managerId) ?? null,
    [users, state?.managerId]
  );

  // ---------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------

  function switchKind(kind: Kind) {
    setState((prev) => {
      if (!prev || prev.requestKind === kind) return prev;
      // Crossing the asset/accessory line invalidates the category (the two
      // sides are separate Snipe trees) and every per-kind option with it.
      // Cleared here rather than left to be filtered out on submit, so the
      // dialog can't show a phone's number decision under a phone case.
      return {
        ...prev,
        requestKind: kind,
        categoryId: 0,
        categoryName: "",
        callText: false,
        needsData: false,
        numberOption: null,
        reuseUser: null,
        accessoryOption: null,
        somethingElse: false,
      };
    });
    setOptionLabels([]);
  }

  function validate(s: EditState): string | null {
    if (!s.categoryId) {
      return s.requestKind === "ACCESSORY"
        ? "Pick which accessory this request is for."
        : "Pick which asset this request is for.";
    }
    if (!s.managerId) return "Pick an approver.";
    if (request && s.managerId === String(request.userId)) {
      return "The requester can't be their own approver.";
    }
    if (
      s.requestKind === "ACCESSORY" &&
      optionLabels.length > 0 &&
      !s.somethingElse &&
      !s.accessoryOption
    ) {
      return "Pick which option this request is for.";
    }
    if (effectiveRequestType === "NON_STANDARD" && !s.reason.trim()) {
      return "A non-standard request needs a reason.";
    }
    if (s.requestKind === "ASSET" && s.numberOption === "REUSE" && !s.reuseUser) {
      return "Pick whose number is being reused.";
    }
    return null;
  }

  async function handleSave() {
    if (!request || !state) return;

    const problem = validate(state);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);

    // The whole shape is sent, not just what moved: the backend normalises it
    // through the same rules the create paths use and computes the diff
    // itself, so a field that didn't change simply produces no change entry.
    const payload: EditRequestPayload = {
      requestKind: state.requestKind,
      categoryId: state.categoryId,
      categoryName: state.categoryName,
      requestType: effectiveRequestType,
      manager: state.manager,
      managerId: Number(state.managerId),
      // Both are non-standard-only fields, and the toggle hides them the
      // moment the request resolves to STANDARD — so anything still in state
      // was typed against a spec level this request no longer has. Same rule
      // the create forms apply.
      reason: effectiveRequestType === "NON_STANDARD" ? state.reason : "",
      preferredModel:
        effectiveRequestType === "NON_STANDARD" ? state.preferredModel : "",
      ...(state.requestKind === "ACCESSORY"
        ? {
            accessoryOption: state.somethingElse ? null : state.accessoryOption,
          }
        : {
            callText: state.callText,
            // The effective value, matching the form's one-way call&text → data
            // implication. AssetOptionsSection shows the derived state; this is
            // what makes the row agree with it.
            needsData: state.callText || state.needsData,
            numberOption: state.numberOption,
            reuseNumberFromEmail:
              state.numberOption === "REUSE"
                ? state.reuseUser?.email ?? null
                : null,
            // The RESOLVED mobile, validated against the admin-configured
            // prefix rules — never a raw landline. Same call the asset form
            // makes at submit.
            reuseNumberPhone:
              state.numberOption === "REUSE" && state.reuseUser
                ? resolveMobileNumber(state.reuseUser, mobileConfig)
                : null,
          }),
    };

    try {
      const data = await editRequest(request.id, payload);
      savedRef.current = data.changes.length > 0;
      setResult(data.changes);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save those changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  /** Dismiss. Refetches the log only when something was actually written —
   *  a cancelled edit, or a save that turned out to change nothing, leaves
   *  the table alone. */
  function handleClose() {
    onOpenChange(false);
    if (savedRef.current) {
      savedRef.current = false;
      onSuccess();
    }
  }

  if (!request) return null;

  const requesterFirstName = request.userName.trim().split(/\s+/)[0] || "them";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
    >
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border/20 rounded-xl shadow-md md:min-w-2xl md:max-w-2xl">
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">
              {result ? "mark_email_read" : "edit_note"}
            </span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            {result ? "Request updated" : "Edit request"}
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {result ? (
              result.length > 0 ? (
                <>
                  {request.userName} has been emailed a summary of what changed.
                  The request keeps its place in the queue.
                </>
              ) : (
                <>
                  Nothing was different, so nothing was saved and no email was
                  sent.
                </>
              )
            ) : (
              <>
                Correct {request.userName}'s request in place. It keeps its
                place in the queue — anything already approved stays approved —
                and {requesterFirstName} will be emailed exactly what you
                changed.
              </>
            )}
          </p>
        </ResponsiveDialogHeader>

        {/* ── RESULT PANEL ── */}
        {result ? (
          <div className="px-8 py-6">
            {result.length > 0 ? (
              <div className="rounded-lg border border-modal-border/20 bg-modal-surface-elevated/40 divide-y divide-modal-border/10">
                {result.map((c) => (
                  <div
                    key={c.field}
                    className="flex items-start justify-between gap-4 px-4 py-3"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary shrink-0 pt-0.5">
                      {c.label}
                    </span>
                    <span className="text-sm text-right text-modal-text-primary">
                      <span className="text-info-light line-through">{c.from}</span>
                      <span className="text-info-light"> &rarr; </span>
                      <span className="font-semibold">{c.to}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-info-light text-center py-4">
                The request is already exactly as you left it.
              </p>
            )}
          </div>
        ) : (
          /* ── FORM PANEL ── */
          <div className="px-8 py-6 space-y-8 max-h-[58vh] overflow-y-auto">
            {!shapeEditable && (
              <div className="flex items-start gap-3 text-sm text-info-light bg-surface-container/40 border border-outline rounded-xl p-4">
                <span className="material-symbols-outlined !text-[18px] shrink-0 mt-0.5">
                  lock
                </span>
                <span>
                  IT has already started fulfilling this request — a model,
                  asset or accessory is linked to it, or a quote has gone out.
                  What's being requested can no longer be changed here, only the
                  approver and the supporting detail. If the wrong thing was
                  ordered, reject it and ask for a new request.
                </span>
              </div>
            )}

            {shapeEditable && state && (
              <>
                <section>
                  <SectionLabel>Request type</SectionLabel>
                  <div className="inline-flex p-1 bg-surface-container rounded-lg">
                    {(["ASSET", "ACCESSORY"] as const).map((kind) => {
                      const active = state.requestKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => switchKind(kind)}
                          className={`px-6 py-2 rounded-md text-sm font-medium transition-all hover:cursor-pointer
                            ${
                              active
                                ? "bg-surface-container-lowest text-on-background shadow-sm"
                                : "text-on-surface-variant/25"
                            }`}
                        >
                          {kind === "ASSET" ? "Asset" : "Accessory"}
                        </button>
                      );
                    })}
                  </div>
                  {state.requestKind !== (request.requestKind ?? "ASSET") && (
                    <p className="text-xs text-info-light mt-3 ml-1">
                      Switching sides clears the item and its options — pick
                      them again below.
                    </p>
                  )}
                </section>

                <section>
                  <SectionLabel>
                    {state.requestKind === "ACCESSORY"
                      ? "Accessory"
                      : "Asset"}
                  </SectionLabel>
                  <CategoryPicker
                    categories={categories}
                    value={state.categoryId}
                    loading={categoriesLoading}
                    error={categoriesError}
                    emptyMessage={
                      state.requestKind === "ACCESSORY"
                        ? "No accessories are available based on this user's devices."
                        : "No asset types are available for requests."
                    }
                    onChange={(id, name) =>
                      setState((prev) =>
                        prev
                          ? {
                              ...prev,
                              categoryId: id,
                              categoryName: name,
                              // A new category always resets its own options —
                              // the same rule both create forms apply.
                              accessoryOption: null,
                              somethingElse: false,
                            }
                          : prev
                      )
                    }
                  />
                </section>
              </>
            )}

            {/* Per-kind options. The accessory option is part of the shape (it
                decides which accessory gets resolved), so it is withheld once
                the shape is locked. The phone mechanics are not — they are
                fulfilment detail IT reads, and correcting them late is exactly
                the sort of fix this dialog exists for. */}
            {state && state.requestKind === "ACCESSORY" && shapeEditable && (
              <AccessoryOptionsSection
                label="What do they need?"
                categoryId={state.categoryId}
                selectedOption={state.accessoryOption}
                somethingElse={state.somethingElse}
                onChange={(selectedOption, somethingElse) =>
                  setState((prev) =>
                    prev ? { ...prev, accessoryOption: selectedOption, somethingElse } : prev
                  )
                }
                onOptionsLoaded={(labels) => {
                  setOptionLabels(labels);
                  // Settle the ambiguity the seed couldn't: a null option on a
                  // category that DOES offer options means the requester chose
                  // "Something else". On a category with none, null just means
                  // there was nothing to choose. Only ever applied to the row's
                  // own untouched option, so it can't overwrite an admin's pick.
                  setState((prev) => {
                    if (!prev || prev.somethingElse || prev.accessoryOption) return prev;
                    if (labels.length === 0) return prev;
                    if (prev.categoryId !== request.categoryId) return prev;
                    if (request.requestKind !== "ACCESSORY") return prev;
                    if (request.accessoryOption) return prev;
                    return { ...prev, somethingElse: true };
                  });
                }}
              />
            )}

            {state && state.requestKind === "ASSET" && (
              <AssetOptionsSection
                label="Asset specific options"
                formState={state}
                setFormState={
                  setState as React.Dispatch<React.SetStateAction<any>>
                }
                users={users}
              />
            )}

            {state && (
              <SpecLevelToggle
                label="Specification level"
                value={effectiveRequestType}
                reason={state.reason}
                preferredModel={state.preferredModel}
                lockedTo={
                  !shapeEditable
                    ? effectiveRequestType
                    : state.requestKind === "ACCESSORY"
                    ? state.somethingElse
                      ? "NON_STANDARD"
                      : hasNamedOption
                      ? "STANDARD"
                      : undefined
                    : undefined
                }
                lockedHint={
                  !shapeEditable
                    ? "IT has already started fulfilling this request, so the specification level is fixed."
                    : state.somethingElse
                    ? '"Something else" is always a non-standard request.'
                    : `${state.accessoryOption} is a standard option, so this request is standard.`
                }
                onChange={(val) =>
                  setState((prev) => (prev ? { ...prev, requestType: val } : prev))
                }
                onReasonChange={(val) =>
                  setState((prev) => (prev ? { ...prev, reason: val } : prev))
                }
                onPreferredModelChange={(val) =>
                  setState((prev) =>
                    prev ? { ...prev, preferredModel: val } : prev
                  )
                }
              />
            )}

            {state && (
              <div>
                <ApprovalInput
                  label="Approver"
                  users={users}
                  value={selectedManager}
                  onSelected={(managerId, manager) =>
                    setState((prev) => (prev ? { ...prev, manager, managerId } : prev))
                  }
                />
                {/* Changing the approver on a request nobody has answered yet
                    re-sends the approval email, because otherwise the original
                    approver was asked and the new one never was. Past that
                    point the approval has already happened and is not asked
                    for again. */}
                {request.status === "PENDING" &&
                  state.managerId !== String(request.managerId) && (
                    <p className="text-xs text-info-light mt-3 ml-1">
                      {state.manager || "The new approver"} will be emailed to
                      approve this request.
                    </p>
                  )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-error bg-error-background rounded-xl p-3">
                <span className="material-symbols-outlined !text-[18px]">info</span>
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          {result ? (
            <button
              onClick={handleClose}
              autoFocus
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving || !state}
                className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center justify-center">
                    <span className="mr-2">Saving...</span>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  </span>
                ) : (
                  "Save changes"
                )}
              </button>
              <button
                onClick={handleClose}
                disabled={saving}
                className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          )}
        </ResponsiveDialogFooter>
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
