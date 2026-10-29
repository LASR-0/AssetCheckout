import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { apiFetch } from "@/api/client";
import {
  accessoryCategoriesForUserQuery,
  accessoryOptionsQuery,
  allAssetCategoriesQuery,
  holdingsQuery,
  invalidateWorkflow,
} from "@/api/queries";
import type { AccessoryOptionChoice } from "@/api/accessories";
import { iconForCategory } from "@/lib/categoryIcon";
import { previewRoute } from "@/lib/formRoute";
import type { User } from "@/components/request-form/UserSelect";
import type { AccessoryCategory } from "@/types/accessoriesType";
import { FormLayout, type FormError } from "@/components/forms/FormLayout";
import { goToSection } from "@/components/forms/helpers";
import { FieldError, FormSection, Question } from "@/components/forms/FormSection";
import { ChoiceCard, OptionRows } from "@/components/forms/Choices";
import { WhoFor, type ForMode } from "@/components/forms/WhoFor";
import { ApprovalSection, SpecSection, type Spec } from "@/components/forms/sections";
import { nounFor } from "@/components/forms/helpers";
import { useDirectory } from "@/components/forms/useDirectory";
import { submitErrorText } from "@/components/forms/submit";

///  +-----------------------------------------------------------------+
///  |                   REQUEST AN ACCESSORY                          |
///  +-----------------------------------------------------------------+
//
//  Device-driven, so WHO comes first: the accessory types offered are the
//  ones that person's devices unlock (L3 ∩ L1, worked out by the server).
//  Changing who it's for clears the type and option, since another person's
//  devices unlock a different set.
//
//  THE OPTION DECIDES THE SPEC. A named option is in the catalogue, so it is
//  standard by definition; "Something else" is non-standard by definition.
//  Only a category with no options configured leaves the choice free.
//  A category with exactly one option picks it without asking.
//
//  Non-standard accessories come out of the requester's department budget
//  and the manager approves a quote, which is said up front here.
///  +-----------------------------------------------------------------+

const SOMETHING_ELSE = "__something_else__";
const NO_CATEGORIES: AccessoryCategory[] = [];
const NO_OPTIONS: AccessoryOptionChoice[] = [];

/** "For your laptop" / "For their laptops", from the categories that unlock it. */
function fitsText(c: AccessoryCategory, names: Map<number, string>, forMe: boolean): string | null {
  const nouns = [...new Set((c.unlockedBy ?? []).map((id) => nounFor(names.get(id))).filter(Boolean))];
  if (nouns.length === 0) return null;
  const list = nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(", ")} or ${nouns.at(-1)}`;
  return `For ${forMe ? "your" : "their"} ${list}`;
}

export default function AccessoryRequestFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectId = Number(searchParams.get("categoryId")) || null;
  const { users, me } = useDirectory();

  const [forMode, setForMode] = useState<ForMode>("me");
  const [other, setOther] = useState<User | null>(null);
  // Keyed by whom (and by category) so a change upstream drops the choice
  // below it, without an effect to reset it.
  const [pick, setPick] = useState<{ forId: string; cat: AccessoryCategory } | null>(null);
  const [opt, setOpt] = useState<{ catId: number; value: string } | null>(null);
  const [spec, setSpec] = useState<Spec>("STANDARD");
  const [reason, setReason] = useState("");
  const [model, setModel] = useState("");
  const [approver, setApprover] = useState<User | null>(null);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const requestee = forMode === "me" ? me : other;
  const forMe = forMode === "me";
  const autoApproved = !!me && !!requestee && requestee.managerId != null && requestee.managerId === Number(me.id);

  const available = useQuery({
    ...accessoryCategoriesForUserQuery(requestee?.id ?? ""),
    enabled: !!requestee,
  });
  const avail = requestee ? available.data ?? NO_CATEGORIES : NO_CATEGORIES;
  const { data: assetCats } = useQuery(allAssetCategoriesQuery);
  const assetNames = new Map((assetCats ?? []).map((c) => [c.id, c.name]));
  const { data: myHoldings } = useQuery({ ...holdingsQuery, enabled: forMe });

  const category =
    (pick && requestee && pick.forId === requestee.id ? pick.cat : null) ??
    (preselectId ? avail.find((c) => c.id === preselectId) ?? null : null);

  const options = useQuery({ ...accessoryOptionsQuery(category?.id ?? 0), enabled: !!category });
  const opts = category ? options.data ?? NO_OPTIONS : NO_OPTIONS;
  const hasOpts = opts.length > 0;
  const chosen =
    (opt && category && opt.catId === category.id ? opt.value : null) ?? (opts.length === 1 ? opts[0].id : null);
  const somethingElse = chosen === SOMETHING_ELSE;
  const named = hasOpts && !!chosen && !somethingElse ? opts.find((o) => o.id === chosen) ?? null : null;
  const effective: Spec = somethingElse ? "NON_STANDARD" : named ? "STANDARD" : spec;
  const non = effective === "NON_STANDARD";

  // ---- what's missing -------------------------------------------------
  const errors: FormError[] = [];
  if (!requestee) errors.push({ section: "who", message: "Please select a requester." });
  else if (available.isSuccess && avail.length === 0)
    errors.push({ section: "type", message: "No accessories are available based on this user's devices." });
  else if (!category) errors.push({ section: "type", message: "Please pick an accessory type." });
  if (category && hasOpts && !chosen) errors.push({ section: "opt", message: "Please pick an option." });
  if (category && non && !reason.trim())
    errors.push({
      section: "spec",
      message: somethingElse
        ? "Please describe what you need in the reason."
        : "Please provide a reason for the non-standard request.",
    });
  if (!approver) errors.push({ section: "appr", message: "Please select an approver." });
  const errorFor = (section: string) => (tried ? errors.find((e) => e.section === section)?.message : undefined);

  const showSpec = !!category && (!hasOpts || !!chosen);
  const steps = [
    { id: "who", label: "Who it's for", value: requestee?.name, done: !!requestee },
    { id: "type", label: "Accessory type", value: category?.name, done: !!category },
    ...(hasOpts
      ? [{ id: "opt", label: "Option", value: somethingElse ? "Something else" : named?.label, done: !!chosen }]
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
    kind: "accessory",
    nonStandard: non,
    forMe,
    forName: requestee?.name ?? null,
    site: requestee?.locationName ?? null,
    approverName: approver?.name ?? null,
    autoApproved,
    noun: null,
    deviceName: null,
    start: null,
    end: null,
  });

  const whose = forMe ? "your" : requestee ? `${requestee.name.split(" ")[0]}'s` : "the requester's";
  const has = forMe ? "you have" : requestee ? `${requestee.name.split(" ")[0]} has` : "";
  const heldModels = forMe ? (myHoldings?.assets ?? []).map((a) => a.model?.trim()).filter(Boolean) : [];

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
          requestKind: "ACCESSORY",
          requestType: effective,
          // The id is the binding; the label rides along as the snapshot.
          accessoryOptionId: named?.id ?? null,
          accessoryOption: named?.label ?? null,
          // Non-standard-only fields. Anything typed before a named option
          // was picked no longer describes the request, so it isn't sent.
          reason: non ? reason : "",
          preferredModel: non ? model : "",
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

  return (
    <FormLayout
      kind="accessory"
      title="Request an accessory"
      intro="Pick who it's for first and we'll show the accessories that fit their devices."
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
      <FormSection id="who" label="Who it's for">
        <Question hint="The accessories we can offer depend on what this person already has.">
          Who needs this accessory?
        </Question>
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
        {forMe && heldModels.length > 0 && avail.length > 0 && (
          <p className="m-0 flex items-start gap-1.5 fs-12 leading-[1.45] text-tx3">
            <Icon name="devices" size={15} className="text-mut" />
            <span>
              You have {heldModels.length === 1 ? heldModels[0] : `${heldModels.slice(0, -1).join(", ")} and ${heldModels.at(-1)}`}.
            </span>
          </p>
        )}
        <FieldError>{errorFor("who")}</FieldError>
      </FormSection>

      <FormSection id="type" label="Accessory type">
        {!requestee ? (
          <p className="m-0 flex items-center gap-2 fs-12.5 text-tx3">
            <Icon name="arrow_upward" size={17} className="text-mut" />
            Pick a requester above to see the accessories available for their devices.
          </p>
        ) : available.isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))] gap-2">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-23 rounded-10 bg-track" />
            ))}
          </div>
        ) : available.isError ? (
          <p className="m-0 flex items-center gap-2 fs-12.5 text-tx2">
            <Icon name="cloud_off" size={18} className="text-mut" />
            Couldn't load the accessories available for this person. Try again in a minute.
          </p>
        ) : avail.length === 0 ? (
          <div className="flex flex-col gap-1">
            <span className="fs-13.5 font-semibold">No accessories are available based on this user's devices.</span>
            <span className="fs-12.5 leading-normal text-pretty text-tx3">
              Accessories unlock from the devices someone holds. If {has} a device that isn't in our records, report it
              from Home first.
            </span>
          </div>
        ) : (
          <>
            <Question hint={`Based on the devices ${has}.`}>What do they need?</Question>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))] gap-2">
              {avail.map((c) => (
                <ChoiceCard
                  key={c.id}
                  selected={category?.id === c.id}
                  icon={iconForCategory(c.name)}
                  name={c.name}
                  note={fitsText(c, assetNames, forMe)}
                  onClick={() => {
                    setPick({ forId: requestee.id, cat: c });
                    setSubmitError(null);
                  }}
                />
              ))}
            </div>
          </>
        )}
        <FieldError>{errorFor("type")}</FieldError>
      </FormSection>

      {category && hasOpts && (
        <FormSection id="opt" label="Option" sheetClassName="gap-2">
          <div className="mb-1 fs-13.5 font-semibold">Which one?</div>
          <OptionRows
            label="Which one?"
            value={chosen}
            onChange={(v) => setOpt({ catId: category.id, value: v })}
            options={[
              ...opts.map((o) => ({ value: o.id, label: o.label })),
              { value: SOMETHING_ELSE, label: "Something else", sub: "Describe what you need in the reason below." },
            ]}
          />
          <FieldError>{errorFor("opt")}</FieldError>
        </FormSection>
      )}

      {showSpec && (
        <SpecSection
          kind="accessory"
          value={effective}
          onChange={(v) => {
            // Standard from "Something else" means going back to the list.
            if (somethingElse && v === "STANDARD") setOpt(null);
            else setSpec(v);
          }}
          lockedTo={named ? "STANDARD" : undefined}
          hint={
            named
              ? "A listed option, from stock, so it's a standard request. Quickest to arrive."
              : somethingElse
                ? "“Something else” is always a non-standard request. Choose Standard to pick a listed option."
                : non
                  ? "Tell IT why the standard option won't do. It takes longer, because IT has to source it."
                  : "The option you picked, from stock. Quickest to arrive."
          }
          reason={reason}
          onReason={setReason}
          model={model}
          onModel={setModel}
          error={errorFor("spec")}
          budgetNote={
            non
              ? `Non-standard accessories are paid from ${whose} department budget, not IT's. ${approver?.name ?? "The manager"} will be asked to approve a quote before anything is ordered.`
              : null
          }
        />
      )}

      {category && (
        <ApprovalSection
          question="Who manages the person this is for?"
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
