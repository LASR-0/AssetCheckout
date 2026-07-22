import { useState, useEffect } from "react";
import AccessoryTypeSelector from "@/components/accessory-form/AccessoryTypeSelector";
import AccessoryOptionsSection from "@/components/accessory-form/AccessoryOptionSection";
import ApprovalInput from "@/components/request-form/ApprovalInput";
import SpecLevelToggle from "@/components/request-form/SpecLevelToggle";
import UserDetailsInput from "@/components/request-form/UserDetailsInput";
import { fetchUsers } from "@/api/users";
import { getAccessoryCategoriesForUser } from "@/api/accessories";
import { apiFetch } from "@/api/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { User } from "@/components/request-form/UserSelect";
import type { AccessoryCategory } from "@/types/accessoriesType";
import { useAuth } from "@/hooks/useAuth";

///  +-----------------------------------------------------------------+
///  |                 ACCESSORY REQUEST FORM PAGE                     |
///  +-----------------------------------------------------------------+
//
//  Clone of RequestFormPage for accessories. Device-driven: the requester
//  is picked FIRST (section 1), and the accessory types shown in section 2
//  are derived from the asset categories that user holds in Snipe (L3 ∩ L1)
//  rather than the flat site-wide whitelist. Changing the requester refetches
//  the available categories and clears the current pick.
//
//  Section 3 swaps the phone/number logic for the admin-configured option
//  choice, and the whole phone/number model is absent from the payload.
//
//  Spec level follows the one-way implication pattern from the asset form's
//  call&text → data: requestType stores the user's OWN choice; "Something
//  else" locks the EFFECTIVE type to NON_STANDARD, and unpicking it restores
//  the user's choice.
//
//  POST goes through apiFetch (identity headers) — the accessory create path
//  is actor-gated, unlike the legacy asset POST.
///  +-----------------------------------------------------------------+

type FormState = {
  userId: string;
  userName: string;
  categoryId: number;
  categoryName: string;
  requestType: "STANDARD" | "NON_STANDARD"; // user's own choice
  reason: string;
  accessoryOption: string | null; // chosen named option label
  somethingElse: boolean;         // escape hatch → locks NON_STANDARD
  manager: string;
  managerId: string;
};

const INITIAL_STATE: FormState = {
  userId: "",
  userName: "",
  categoryId: 0,
  categoryName: "",
  requestType: "STANDARD",
  reason: "",
  accessoryOption: null,
  somethingElse: false,
  manager: "",
  managerId: "",
};

export default function AccessoryRequestFormPage() {
  const [formState, setFormState] = useState<FormState>(INITIAL_STATE);
  const [optionLabels, setOptionLabels] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Accessory categories derived from the selected user's devices (L3 ∩ L1).
  const [accessoryCategories, setAccessoryCategories] = useState<AccessoryCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const navigate = useNavigate();
  const selectedRequester = users.find((u) => u.id === formState.userId) ?? null;
  const selectedManager = users.find((u) => u.id === formState.managerId) ?? null;
  const { email: authEmail } = useAuth();

  // Home-page tiles can link here with ?categoryId= — validated and applied
  // by AccessoryTypeSelector once the derived category list has loaded.
  const [searchParams] = useSearchParams();
  const preselectId = Number(searchParams.get("categoryId")) || null;

  // "Something else" one-way lock — the effective type is what ships.
  const effectiveRequestType = formState.somethingElse
    ? "NON_STANDARD"
    : formState.requestType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formState.userId) {
      setError("Please select a requester.");
      return;
    }
    if (!formState.categoryId) {
      setError("Please select an accessory type.");
      return;
    }
    if (!formState.managerId) {
      setError("Please select an approver.");
      return;
    }
    // Only require a pick when this category actually offers choices.
    if (
      optionLabels.length > 0 &&
      !formState.somethingElse &&
      !formState.accessoryOption
    ) {
      setError("Please choose what you need.");
      return;
    }
    if (effectiveRequestType === "NON_STANDARD" && !formState.reason.trim()) {
      setError(
        formState.somethingElse
          ? "Please describe what you need in the reason."
          : "Please provide a reason for the non-standard request."
      );
      return;
    }

    setIsSubmitting(true);

    const payload = {
      userId: formState.userId,
      userName: formState.userName,
      categoryId: formState.categoryId,
      categoryName: formState.categoryName,
      requestKind: "ACCESSORY",
      requestType: effectiveRequestType,
      accessoryOption: formState.somethingElse ? null : formState.accessoryOption,
      reason: formState.reason,
      manager: formState.manager,
      managerId: formState.managerId,
    };

    try {
      const data = await apiFetch<{ request: unknown }>("/api/requests", {
        method: "POST",
        body: payload,
      });

      navigate("/success", {
        state: {
          request: data.request,
        },
      });

      setFormKey((k) => k + 1);
      resetForm();
    } catch (err: any) {
      console.error("ERROR:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormState(INITIAL_STATE);
    setOptionLabels([]);
    setAccessoryCategories([]);
    setError(null);
  };

  useEffect(() => {
    fetchUsers().then((data) => {
      const formatted = data.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        mobile: u.mobile,
      })).sort((a, b) => a.name.localeCompare(b.name));
      setUsers(formatted);
    });
  }, []);

  // Default the requester to the signed-in user once the list is loaded.
  useEffect(() => {
    if (!authEmail || users.length === 0 || formState.userId) return;
    const me = users.find(
      (u) => u.email?.toLowerCase() === authEmail.toLowerCase()
    );
    if (me) {
      setFormState((prev) => ({ ...prev, userId: me.id, userName: me.name }));
    }
  }, [authEmail, users, formState.userId]);

  // Derive the accessory categories from the selected user's devices. Runs on
  // every requester change: a different user's devices unlock a different set,
  // so the current category/option pick is cleared before refetching.
  useEffect(() => {
    setFormState((prev) => ({
      ...prev,
      categoryId: 0,
      categoryName: "",
      accessoryOption: null,
      somethingElse: false,
    }));
    setOptionLabels([]);

    if (!formState.userId) {
      setAccessoryCategories([]);
      setCategoriesError(null);
      setCategoriesLoading(false);
      return;
    }

    let cancelled = false;
    setCategoriesLoading(true);
    setCategoriesError(null);
    getAccessoryCategoriesForUser(formState.userId)
      .then((cats) => {
        if (!cancelled) setAccessoryCategories(cats);
      })
      .catch((err) => {
        if (!cancelled) {
          setAccessoryCategories([]);
          setCategoriesError("Couldn't load the accessories available for this user.");
          console.error("Failed to load user-derived accessory categories", err);
        }
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.userId]);

  const accessoryEmptyMessage = !formState.userId
    ? "Pick a requester above to see the accessories available for their devices."
    : "No accessories are available based on this user's devices.";

  return (
    <main className="min-h-screen bg-landing-bg text-on-background flex flex-col">
      <div className="flex-grow my-24 pb-20 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <div className="flex flex-row">
              <span className="material-symbols-outlined mx-3 !text-4xl"> keyboard </span>
              <h1 className="text-4xl font-bold flex tracking-tight mb-2">Checkout Accessory</h1>
            </div>
            <p className="text-info-light ml-5">
              Submit a request for a workplace accessory. Pick who it's for and
              we'll show the accessories available for their devices.
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-md">
            <form onSubmit={handleSubmit} key={formKey} className="space-y-10"
            >

              <UserDetailsInput
                users={users}
                value={selectedRequester}
                label="1. User Details"
                placeholder="Who needs this accessory?"
                onSelected={(userID, userName) => {
                  setFormState((prev) => ({ ...prev, userId: userID, userName }));
                }}
              />

              <AccessoryTypeSelector
                value={formState.categoryId}
                categories={accessoryCategories}
                loading={categoriesLoading}
                error={categoriesError}
                preselectId={preselectId}
                emptyMessage={accessoryEmptyMessage}
                onChange={(id, name) => {
                  // Category change always resets the option decision —
                  // no state carries over between accessory types.
                  setFormState((prev) => ({
                    ...prev,
                    categoryId: id,
                    categoryName: name,
                    accessoryOption: null,
                    somethingElse: false,
                  }));
                }}
              />

              <AccessoryOptionsSection
                categoryId={formState.categoryId}
                selectedOption={formState.accessoryOption}
                somethingElse={formState.somethingElse}
                onChange={(selectedOption, somethingElse) =>
                  setFormState((prev) => ({
                    ...prev,
                    accessoryOption: selectedOption,
                    somethingElse,
                  }))
                }
                onOptionsLoaded={setOptionLabels}
              />

              <SpecLevelToggle
                value={effectiveRequestType}
                reason={formState.reason}
                locked={formState.somethingElse}
                lockedHint={'"Something else" is always a non-standard request.'}
                onChange={(val) =>
                  setFormState((prev) => ({ ...prev, requestType: val }))
                }
                onReasonChange={(val) =>
                  setFormState((prev) => ({ ...prev, reason: val }))
                }
              />

              <ApprovalInput
                users={users}
                value={selectedManager}
                onSelected={(managerID, manager) => {
                  setFormState((prev) => ({ ...prev, manager, managerId: managerID }));
                }}
              />

              <button
                type="submit"
                disabled={isSubmitting}
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
                      <span className="mb-0.5 mr-2">Submit Request</span>
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