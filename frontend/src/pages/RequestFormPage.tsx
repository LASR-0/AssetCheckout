import { useState, useEffect } from "react";
import AssetTypeSelector from "@/components/request-form/AssetTypeSelector";
import AssetOptionsSection from "@/components/request-form/AssetOptionsSection";
import ApprovalInput from "@/components/request-form/ApprovalInput";
import SpecLevelToggle from "@/components/request-form/SpecLevelToggle";
import UserDetailsInput from "@/components/request-form/UserDetailsInput";
import { fetchUsers } from "@/api/users";
import { isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";
import { useNavigate } from "react-router-dom";

const INITIAL_STATE = {
  userId: "",
  userName: "",
  categoryId: 0,
  categoryName: "",
  requestType: "STANDARD",
  reason: "",
  callText: false,
  newNumber: false,
  manager: "",
  managerId: "",
};

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

export default function RequestFormPage() {
  const [formState, setFormState] = useState(INITIAL_STATE);
  const [formKey, setFormKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formState.categoryId) {
      setError("Please select an asset type.");
      return;
    }
    if (!formState.userId) {
      setError("Please select a requester.");
      return;
    }
    if (!formState.managerId) {
      setError("Please select an approver.");
      return;
    }
    // if (formState.userId === formState.managerId) {
    //   setError("Requester cannot be the same as the approver.");
    //   return;
    // }
    if (formState.requestType === "NON_STANDARD" && !formState.reason.trim()) {
      setError("Please provide a reason for the non-standard request.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create request");
      }

      const data = await res.json();
      console.log("REQUEST CREATED:", data);

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
    setError(null);
  };

  useEffect(() => {
    fetchUsers().then((data) => {
      const formatted = data.map((u: any) => ({
        id: u.id,
        name: u.name,
      }));
      setUsers(formatted);
    });
  }, []);

  return (
    <main className="min-h-screen bg-landing-bg text-on-background flex flex-col">
      <div className="flex-grow pt-24 pb-12 px-4 md:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <div className="flex flex-row">
              <span className="material-symbols-outlined mx-3 !text-4xl"> list_alt </span>
              <h1 className="text-4xl font-bold flex tracking-tight mb-2">Checkout Asset</h1>
            </div>
            <p className="text-info-light ml-5">
              Submit a request for organizational hardware. Ensure all specifications are accurate before final approval.
            </p>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-8 shadow-md">
            <form onSubmit={handleSubmit} key={formKey} className="space-y-10"
            >

              <AssetTypeSelector
                value={formState.categoryId}
                onChange={(id, name) => {
                  setFormState((prev) => {
                    const next = { ...prev, categoryId: id, categoryName: name };
                    const isPhone = isPhoneCategory(name);
                    const isTablet = isTabletCategory(name);
                    if (isPhone) {
                      next.callText = true;
                    } else if (!isTablet) {
                      next.callText = false;
                      next.newNumber = false;
                    }
                    return next;
                  });
                }}
              />

              <UserDetailsInput
                users={users}
                onSelected={(userID, userName) => {
                  setFormState((prev) => ({ ...prev, userId: userID, userName }));
                }}
              />

              <AssetOptionsSection
                formState={formState}
                setFormState={setFormState}
              />

              <SpecLevelToggle
                value={formState.requestType}
                reason={formState.reason}
                onChange={(val) =>
                  setFormState((prev) => ({ ...prev, requestType: val }))
                }
                onReasonChange={(val) =>
                  setFormState((prev) => ({ ...prev, reason: val }))
                }
              />

              <ApprovalInput
                users={users}
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

      <footer className="w-full py-6 bg-nav px-8 font-semibold text-xs text-nav-tab">
        © {COMPANY}
      </footer>
    </main>
  );
}