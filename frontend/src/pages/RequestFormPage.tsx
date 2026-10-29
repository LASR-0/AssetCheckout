import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { apiFetch } from "@/api/client";
import { assetCategoriesQuery, invalidateWorkflow } from "@/api/queries";
import { iconForCategory, isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";
import { resolveMobileNumber } from "@/lib/mobileNumber";
import { previewRoute } from "@/lib/formRoute";
import { useMobileFilterConfig } from "@/hooks/useMobileFilterConfig";
import type { User } from "@/components/request-form/UserSelect";
import type { AssetCategory } from "@/types/categoriesType";
import { FormLayout, type FormError } from "@/components/forms/FormLayout";
import { goToSection } from "@/components/forms/helpers";
import { FieldError, FormSection, Question } from "@/components/forms/FormSection";
import { ChoiceCard, OptionRows } from "@/components/forms/Choices";
import { PersonPicker } from "@/components/forms/PersonPicker";
import { WhoFor, type ForMode } from "@/components/forms/WhoFor";
import { ApprovalSection, SpecSection, type Spec } from "@/components/forms/sections";
import { nounFor } from "@/components/forms/helpers";
import { useDirectory } from "@/components/forms/useDirectory";
import { submitErrorText } from "@/components/forms/submit";

///  +-----------------------------------------------------------------+
///  |                     REQUEST AN ASSET                            |
///  +-----------------------------------------------------------------+
//
//  What kind of device, who it's for, the phone options when it is a phone
//  or tablet, standard or not, and who approves it. Sections appear as they
//  become relevant: nothing past "who" until a device type is picked.
//
//  PHONES AND TABLETS. A phone always has call & text (which implies data)
//  and must say what happens about a number: new, reuse someone's, or none.
//  A tablet may have call & text, or data alone; either one means a SIM, so
//  a number decision is needed, without "none". Changing the device type
//  resets all of this, since the answers belonged to the old type.
//
//  ?categoryId= pre-selects the type (Home's catalogue links here).
///  +-----------------------------------------------------------------+

type NumberOption = "NEW" | "REUSE" | "NONE";

const NUMBER_OPTIONS: { value: NumberOption; label: string; sub: string }[] = [
  { value: "NEW", label: "New number required", sub: "IT orders a new SIM and number." },
  { value: "REUSE", label: "Use an existing number", sub: "Move a number someone already has." },
  { value: "NONE", label: "No number required", sub: "Data only." },
];

const NO_CATEGORIES: AssetCategory[] = [];

export default function RequestFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectId = Number(searchParams.get("categoryId")) || null;
  const mobileConfig = useMobileFilterConfig();
  const { users, me } = useDirectory();
  const categories = useQuery(assetCategoriesQuery);
  const cats = categories.data ?? NO_CATEGORIES;

  const [pickedCat, setPickedCat] = useState<AssetCategory | null>(null);
  const [catQ, setCatQ] = useState("");
  const [forMode, setForMode] = useState<ForMode>("me");
  const [other, setOther] = useState<User | null>(null);
  const [callText, setCallText] = useState(false);
  const [needsData, setNeedsData] = useState(false);
  const [numberOption, setNumberOption] = useState<NumberOption | null>(null);
  const [reuseUser, setReuseUser] = useState<User | null>(null);
  const [spec, setSpec] = useState<Spec>("STANDARD");
  const [reason, setReason] = useState("");
  const [model, setModel] = useState("");
  const [approver, setApprover] = useState<User | null>(null);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The link's choice stands until somebody picks for themselves.
  const category = pickedCat ?? (preselectId ? cats.find((c) => c.id === preselectId) ?? null : null);
  const isPhone = !!category && isPhoneCategory(category.name);
  const isTablet = !!category && isTabletCategory(category.name);
  const phoneCall = isPhone || callText;
  const simImplied = isPhone || (isTablet && (callText || needsData));
  const requestee = forMode === "me" ? me : other;
  const autoApproved = !!me && !!requestee && requestee.managerId != null && requestee.managerId === Number(me.id);
  const non = spec === "NON_STANDARD";

  function pickCategory(c: AssetCategory) {
    if (c.id !== category?.id) {
      setCallText(isPhoneCategory(c.name));
      setNeedsData(false);
      setNumberOption(null);
      setReuseUser(null);
    }
    setPickedCat(c);
    setSubmitError(null);
  }

  // ---- what's missing -------------------------------------------------
  const errors: FormError[] = [];
  if (!category) errors.push({ section: "type", message: "Please pick an asset type." });
  if (!requestee) errors.push({ section: "who", message: "Please select a requester." });
  if (category && simImplied && !numberOption) errors.push({ section: "phone", message: "Please choose a phone number option." });
  else if (category && numberOption === "REUSE" && !reuseUser)
    errors.push({ section: "phone", message: "Please pick whose number is being reused." });
  if (category && non && !reason.trim())
    errors.push({ section: "spec", message: "Please provide a reason for the non-standard request." });
  if (!approver) errors.push({ section: "appr", message: "Please select an approver." });
  const errorFor = (section: string) => (tried ? errors.find((e) => e.section === section)?.message : undefined);

  const numberLabel = { NEW: "New number", REUSE: "Existing number", NONE: "No number" } as const;
  const steps = [
    { id: "type", label: "Asset type", value: category?.name, done: !!category },
    { id: "who", label: "Who it's for", value: requestee?.name, done: !!requestee },
    ...(isPhone || isTablet
      ? [
          {
            id: "phone",
            label: isPhone ? "Phone number" : "Call & text",
            value: simImplied ? (numberOption ? numberLabel[numberOption] : null) : "Off",
            done: !simImplied || (!!numberOption && (numberOption !== "REUSE" || !!reuseUser)),
          },
        ]
      : []),
    {
      id: "spec",
      label: "Specification",
      value: category ? (non ? "Non-standard" : "Standard") : null,
      done: !!category && (!non || !!reason.trim()),
    },
    { id: "appr", label: "Approval", value: approver?.name, done: !!approver },
  ].map((s) => ({ ...s, error: !!errorFor(s.id) }));

  const route = previewRoute({
    kind: "asset",
    nonStandard: non,
    forMe: forMode === "me",
    forName: requestee?.name ?? null,
    site: requestee?.locationName ?? null,
    approverName: approver?.name ?? null,
    autoApproved,
    noun: nounFor(category?.name),
    deviceName: null,
    start: null,
    end: null,
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
      const data = await apiFetch<{ request: unknown }>("/api/requests", {
        method: "POST",
        body: {
          userId: requestee!.id,
          userName: requestee!.name,
          categoryId: category!.id,
          categoryName: category!.name,
          requestType: spec,
          reason: non ? reason : "",
          preferredModel: non ? model : "",
          callText: phoneCall,
          // Call & text implies data; the column stores the effective value.
          needsData: phoneCall || needsData,
          numberOption: simImplied ? numberOption : null,
          // The resolved mobile, checked against the configured mobile
          // prefix rules — never a raw landline.
          reuseNumberFromEmail: numberOption === "REUSE" ? reuseUser?.email ?? null : null,
          reuseNumberPhone: numberOption === "REUSE" && reuseUser ? resolveMobileNumber(reuseUser, mobileConfig) : null,
          newNumber: numberOption === "NEW",
          manager: approver!.name,
          managerId: approver!.id,
        },
      });
      void invalidateWorkflow();
      navigate("/success", { state: { request: data.request } });
    } catch (err) {
      setSubmitError(submitErrorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  const shownCats = cats.filter((c) => c.name.toLowerCase().includes(catQ.trim().toLowerCase()));

  return (
    <FormLayout
      kind="asset"
      title="Request an asset"
      intro="Pick a device type and who it's for. Their manager approves it, then IT sets it up and the site stock keeper hands it over."
      steps={steps}
      route={route}
      pill={non ? { label: "Non-standard", accent: "id2" } : { label: "Standard", accent: "id1" }}
      errors={errors}
      tried={tried}
      submitError={submitError}
      submitting={submitting}
      submitLabel="Send request"
      onSubmit={submit}
    >
      <FormSection
        id="type"
        label="Asset type"
        aside={
          categories.isSuccess && (
            <InputGroup className="h-7 w-36 rounded-8 border-line phone:w-45">
              <InputGroupAddon align="inline-start" className="pl-2">
                <Icon name="search" size={16} />
              </InputGroupAddon>
              <InputGroupInput
                value={catQ}
                onChange={(e) => setCatQ(e.target.value)}
                placeholder="Search types"
                aria-label="Search device types"
                className="fs-12.5"
              />
            </InputGroup>
          )
        }
      >
        <Question hint="Only the types IT lets staff request are shown.">What kind of device?</Question>
        {categories.isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))] gap-2">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div key={k} className="h-22 rounded-10 bg-track" />
            ))}
          </div>
        ) : categories.isError ? (
          <div className="flex flex-wrap items-center gap-2.5 rounded-10 border border-line2 bg-subtle p-3">
            <Icon name="cloud_off" size={19} className="text-mut" />
            <span className="flex-[1_1_15rem] fs-12.5 leading-normal text-tx2">
              Looks like Snipe-IT is unreachable, so we can't list device types right now. Try again in a minute.
            </span>
            <Button variant="secondary" className="h-11 fs-12 phone:h-8.5" onClick={() => void categories.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))] gap-2">
              {shownCats.map((c) => (
                <ChoiceCard
                  key={c.id}
                  selected={category?.id === c.id}
                  icon={iconForCategory(c.name)}
                  name={c.name}
                  onClick={() => pickCategory(c)}
                />
              ))}
            </div>
            {shownCats.length === 0 && <p className="m-0 fs-12.5 text-tx3">No device types match “{catQ}”.</p>}
          </>
        )}
        <FieldError>{errorFor("type")}</FieldError>
      </FormSection>

      <FormSection id="who" label="Who it's for">
        <Question>Who will use this device?</Question>
        <WhoFor
          mode={forMode}
          onMode={(m) => {
            setForMode(m);
            setSubmitError(null);
          }}
          me={me}
          users={users}
          other={other}
          onOther={setOther}
          invalid={!!errorFor("who")}
        />
        <FieldError>{errorFor("who")}</FieldError>
      </FormSection>

      {(isPhone || isTablet) && (
        <FormSection id="phone" label={isPhone ? "Phone and data" : "Call & text"} sheetClassName="gap-3.5">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="fs-13.5 font-semibold">Call &amp; text</div>
              <div className="mt-0.5 fs-12 leading-[1.45] text-pretty text-tx3">
                {isPhone
                  ? "Always on for phones. It also turns on mobile data."
                  : "Optional for tablets. Turning it on also turns on mobile data."}
              </div>
            </div>
            <Switch
              checked={phoneCall}
              disabled={isPhone}
              title={isPhone ? "Always on for phones" : undefined}
              aria-label="Call & text"
              onCheckedChange={(on) => {
                setCallText(on);
                if (!on && !needsData) {
                  setNumberOption(null);
                  setReuseUser(null);
                }
              }}
            />
          </div>

          {isTablet && (
            <div className="flex items-center gap-3 border-t border-line2 pt-3">
              <div className="min-w-0 flex-1">
                <div className={cn("fs-13.5 font-semibold", callText && "text-tx3")}>Data required</div>
                <div className="mt-0.5 fs-12 leading-[1.45] text-pretty text-tx3">
                  {callText ? "Included with call & text." : "Mobile data without calls, for people who travel to sites."}
                </div>
              </div>
              <Switch
                checked={callText || needsData}
                disabled={callText}
                aria-label="Data required"
                onCheckedChange={(on) => {
                  setNeedsData(on);
                  if (!on) {
                    setNumberOption(null);
                    setReuseUser(null);
                  }
                }}
              />
            </div>
          )}

          {simImplied && (
            <div className="flex flex-col gap-2 border-t border-line2 pt-3">
              <div className="fs-13.5 font-semibold">Phone number</div>
              <OptionRows
                label="Phone number"
                value={numberOption}
                onChange={(v) => {
                  setNumberOption(v);
                  if (v !== "REUSE") setReuseUser(null);
                }}
                options={NUMBER_OPTIONS.filter((o) => isPhone || o.value !== "NONE")}
              />
            </div>
          )}

          {simImplied && numberOption === "REUSE" && (
            <div className="flex flex-col gap-2">
              <div className="fs-13.5 font-semibold">Whose number is being reused?</div>
              <PersonPicker
                users={users}
                value={reuseUser}
                onChange={setReuseUser}
                placeholder="Search by name"
                label="Whose number is being reused"
                sub={(u) => {
                  const n = resolveMobileNumber(u, mobileConfig);
                  return n ? { text: n, mono: true } : { text: "No mobile phone number on record", muted: true };
                }}
              />
            </div>
          )}
          <FieldError>{errorFor("phone")}</FieldError>
        </FormSection>
      )}

      {category && (
        <SpecSection
          kind="asset"
          value={spec}
          onChange={setSpec}
          hint={
            non
              ? "Tell IT why the standard option won't do. It takes longer, because IT has to source it."
              : `The pre-agreed ${nounFor(category.name) ?? "model"} IT keeps in stock. Quickest to arrive.`
          }
          reason={reason}
          onReason={setReason}
          model={model}
          onModel={setModel}
          error={errorFor("spec")}
        />
      )}

      {category && (
        <ApprovalSection
          question="Who manages the user of this device?"
          users={users}
          approver={approver}
          onApprover={setApprover}
          requestee={requestee}
          autoApproved={autoApproved}
          error={errorFor("appr")}
        />
      )}
    </FormLayout>
  );
}
