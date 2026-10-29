import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChoiceChip } from "@/components/ui/pills";
import { SegmentedControl } from "@/components/ui/segmented";
import { PersonPicker } from "@/components/forms/PersonPicker";
import { useDirectory } from "@/components/forms/useDirectory";
import type { User } from "@/components/request-form/UserSelect";
import { accessoryCategoriesForUserQuery, accessoryOptionsQuery, assetCategoriesQuery } from "@/api/queries";
import { editRequest, type EditRequestPayload } from "@/api/requests";
import { canEditRequestShape } from "@/lib/permissions";
import { isPhoneCategory, isTabletCategory } from "@/lib/categoryIcon";
import { resolveMobileNumber } from "@/lib/mobileNumber";
import { useMobileFilterConfig } from "@/hooks/useMobileFilterConfig";
import { originalReason } from "../facts";
import { FieldGrid, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  +-----------------------------------------------------------------+
///  |                  EDIT A REQUEST IN PLACE                        |
///  +-----------------------------------------------------------------+
//
//  IT correcting what somebody filed. The request keeps its place (nothing
//  approved is un-approved) and the requester is emailed exactly what
//  changed; the docket's "Last edit" then shows it.
//
//  WHAT it is (kind, category, spec, accessory option) locks once IT has
//  built something from it: a Snipe model or asset, a linked accessory, a
//  quote. Rewriting those then would leave the request describing one
//  thing and pointing at another. The rest stays editable.
///  +-----------------------------------------------------------------+

type Kind = "ASSET" | "ACCESSORY";
type Spec = "STANDARD" | "NON_STANDARD";
type NumberOption = "NEW" | "REUSE" | "NONE";

const SOMETHING_ELSE = "__something_else__";
const NUMBERS: { value: NumberOption; label: string }[] = [
  { value: "NEW", label: "New number" },
  { value: "REUSE", label: "Existing number" },
  { value: "NONE", label: "No number" },
];

/** A row of the step: label left, control right, wrapping on narrow docks. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 fs-12.5 text-tx3">
      {label}
      {children}
    </div>
  );
}

export function EditStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const shape = canEditRequestShape(r);
  const mobileConfig = useMobileFilterConfig();
  const { users } = useDirectory();

  const [kind, setKind] = useState<Kind>(r.requestKind === "ACCESSORY" ? "ACCESSORY" : "ASSET");
  const [cat, setCat] = useState<{ id: number; name: string } | null>({ id: r.categoryId, name: r.categoryName });
  const [spec, setSpec] = useState<Spec>(r.requestType === "NON_STANDARD" ? "NON_STANDARD" : "STANDARD");
  const [option, setOption] = useState<string | null>(
    r.requestKind === "ACCESSORY" ? (r.accessoryOptionId ?? (r.requestType === "NON_STANDARD" ? SOMETHING_ELSE : null)) : null
  );
  const [reason, setReason] = useState(originalReason(r) ?? "");
  const [model, setModel] = useState(r.preferredModel ?? "");
  const [callText, setCallText] = useState(!!r.callText);
  const [needsData, setNeedsData] = useState(!!r.needsData);
  const [numberOption, setNumberOption] = useState<NumberOption | null>(r.numberOption ?? null);
  const [reuseUser, setReuseUser] = useState<User | null>(null);
  const [approver, setApprover] = useState<User | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unchanged, setUnchanged] = useState(false);

  // The approver and a reused number's owner, found in the directory once it loads.
  const currentApprover = useMemo(() => users.find((u) => u.id === String(r.managerId)) ?? null, [users, r.managerId]);
  const currentReuse = useMemo(
    () => (r.reuseNumberFromEmail ? users.find((u) => u.email?.toLowerCase() === r.reuseNumberFromEmail?.toLowerCase()) ?? null : null),
    [users, r.reuseNumberFromEmail]
  );
  const chosenApprover = approver ?? currentApprover;
  const chosenReuse = reuseUser ?? currentReuse;

  const assetCats = useQuery({ ...assetCategoriesQuery, enabled: kind === "ASSET" });
  const accessoryCats = useQuery({ ...accessoryCategoriesForUserQuery(String(r.userId)), enabled: kind === "ACCESSORY" });
  const cats = (kind === "ASSET" ? assetCats.data : accessoryCats.data) ?? [];
  const catsLoading = kind === "ASSET" ? assetCats.isPending : accessoryCats.isPending;
  const options = useQuery({ ...accessoryOptionsQuery(cat?.id ?? 0), enabled: kind === "ACCESSORY" && !!cat });
  const opts = kind === "ACCESSORY" ? options.data ?? [] : [];

  const named = kind === "ACCESSORY" && !!option && option !== SOMETHING_ELSE ? opts.find((o) => o.id === option) ?? null : null;
  const effective: Spec =
    kind === "ACCESSORY" ? (option === SOMETHING_ELSE ? "NON_STANDARD" : named ? "STANDARD" : spec) : spec;
  const isPhone = kind === "ASSET" && !!cat && isPhoneCategory(cat.name);
  const isTablet = kind === "ASSET" && !!cat && isTabletCategory(cat.name);
  const simImplied = isPhone || (isTablet && (callText || needsData));

  function switchKind(k: Kind) {
    if (k === kind) return;
    setKind(k);
    setCat(null);
    setOption(null);
    setCallText(false);
    setNeedsData(false);
    setNumberOption(null);
    setReuseUser(null);
  }

  function pickCat(c: { id: number; name: string }) {
    setCat(c);
    setOption(null);
    if (kind === "ASSET") setCallText(isPhoneCategory(c.name));
  }

  function problem(): string | null {
    if (!cat?.id) return kind === "ACCESSORY" ? "Pick which accessory this request is for." : "Pick which asset this request is for.";
    if (!chosenApprover) return "Pick an approver.";
    if (chosenApprover.id === String(r.userId)) return "The requester can't be their own approver.";
    if (kind === "ACCESSORY" && opts.length > 0 && !option) return "Pick which option this request is for.";
    if (effective === "NON_STANDARD" && !reason.trim()) return "A non-standard request needs a reason.";
    if (kind === "ASSET" && simImplied && numberOption === "REUSE" && !chosenReuse) return "Pick whose number is being reused.";
    return null;
  }

  async function save() {
    const p = problem();
    if (p) return setError(p);
    setError(null);
    setUnchanged(false);
    setPending(true);
    const payload: EditRequestPayload = {
      requestKind: kind,
      categoryId: cat!.id,
      categoryName: cat!.name,
      requestType: effective,
      manager: chosenApprover!.name,
      managerId: Number(chosenApprover!.id),
      reason: effective === "NON_STANDARD" ? reason : "",
      preferredModel: effective === "NON_STANDARD" ? model : "",
      ...(kind === "ACCESSORY"
        ? {
            accessoryOptionId: option === SOMETHING_ELSE ? null : option,
            accessoryOption: option === SOMETHING_ELSE ? null : named?.label ?? null,
          }
        : {
            callText: isPhone || callText,
            needsData: isPhone || callText || needsData,
            numberOption: simImplied ? numberOption : null,
            reuseNumberFromEmail: simImplied && numberOption === "REUSE" ? chosenReuse?.email ?? null : null,
            reuseNumberPhone:
              simImplied && numberOption === "REUSE" && chosenReuse ? resolveMobileNumber(chosenReuse, mobileConfig) : null,
          }),
    };
    try {
      const res = await editRequest(r.id, payload);
      if (res.changes.length === 0) {
        setUnchanged(true);
        setPending(false);
        return;
      }
      onDone(`#${r.id} updated. ${r.userName} has been emailed what changed.`);
    } catch (err) {
      setError(errorText(err, "Couldn't save those changes."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>

      {!shape && (
        <div className="flex items-start gap-2 rounded-9 bg-subtle px-3 py-2.5 fs-12.5 leading-normal text-tx3 shadow-[inset_0_0_0_1px_var(--line)]">
          <Icon name="lock" size={15} className="mt-px shrink-0" />
          What they need is locked: IT has already linked a model, asset or accessory, or sent a quote.
        </div>
      )}

      <Row label="What they need">
        {shape ? (
          <>
            <SegmentedControl<Kind>
              label="Kind"
              value={kind}
              onValueChange={switchKind}
              options={[
                { value: "ASSET", label: "Asset" },
                { value: "ACCESSORY", label: "Accessory" },
              ]}
              className="self-start"
            />
            {catsLoading ? (
              <StepNote>Loading types…</StepNote>
            ) : cats.length === 0 ? (
              <StepNote>{kind === "ACCESSORY" ? "Nothing this person holds unlocks an accessory." : "No asset types available."}</StepNote>
            ) : (
              <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <ChoiceChip key={c.id} selected={cat?.id === c.id} onClick={() => pickCat({ id: c.id, name: c.name })}>
                    {c.name}
                  </ChoiceChip>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="fs-13.5 text-tx">
            {r.requestKind === "ACCESSORY" ? "Accessory" : "Asset"} · {r.categoryName}
          </span>
        )}
      </Row>

      {shape && cat && (kind === "ASSET" || opts.length === 0) && (
        <Row label="Specification">
          <SegmentedControl<Spec>
            label="Specification"
            value={spec}
            onValueChange={setSpec}
            options={[
              { value: "STANDARD", label: "Standard" },
              { value: "NON_STANDARD", label: "Non-standard" },
            ]}
            className="self-start"
          />
        </Row>
      )}

      {shape && kind === "ACCESSORY" && opts.length > 0 && (
        <Row label="Option">
          <div role="radiogroup" aria-label="Option" className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <ChoiceChip key={o.id} selected={option === o.id} onClick={() => setOption(o.id)}>
                {o.label}
              </ChoiceChip>
            ))}
            <ChoiceChip selected={option === SOMETHING_ELSE} onClick={() => setOption(SOMETHING_ELSE)}>
              Something else
            </ChoiceChip>
          </div>
        </Row>
      )}

      {(isPhone || isTablet) && (
        <Row label={isPhone ? "Phone and data" : "Call & text"}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 fs-13 text-tx">
            <label className="flex items-center gap-2">
              <Switch checked={isPhone || callText} disabled={isPhone} onCheckedChange={setCallText} aria-label="Call & text" />
              Call &amp; text
            </label>
            {isTablet && (
              <label className="flex items-center gap-2">
                <Switch checked={callText || needsData} disabled={callText} onCheckedChange={setNeedsData} aria-label="Data" />
                Data
              </label>
            )}
          </div>
          {simImplied && (
            <div role="radiogroup" aria-label="Phone number" className="flex flex-wrap gap-1.5">
              {NUMBERS.filter((n) => isPhone || n.value !== "NONE").map((n) => (
                <ChoiceChip key={n.value} selected={numberOption === n.value} onClick={() => setNumberOption(n.value)}>
                  {n.label}
                </ChoiceChip>
              ))}
            </div>
          )}
          {simImplied && numberOption === "REUSE" && (
            <PersonPicker
              users={users}
              value={chosenReuse}
              onChange={setReuseUser}
              placeholder="Whose number is being reused?"
              label="Whose number is being reused"
              sub={(u) => {
                const n = resolveMobileNumber(u, mobileConfig);
                return n ? { text: n, mono: true } : { text: "No mobile phone number on record", muted: true };
              }}
            />
          )}
        </Row>
      )}

      {effective === "NON_STANDARD" && (
        <FieldGrid className="grid-cols-1">
          <StepField label="Reason">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why the standard option won't do" />
          </StepField>
          <StepField label="Model in mind (optional)">
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </StepField>
        </FieldGrid>
      )}

      <Row label="Approver">
        <PersonPicker
          users={users}
          value={chosenApprover}
          onChange={setApprover}
          placeholder="Search for their manager"
          label="Approver"
          exclude={(u) => u.id === String(r.userId)}
        />
      </Row>

      <StepFoot
        hint={unchanged ? "Nothing was different, so nothing was saved and no email was sent." : `${r.userName} is emailed what you change.`}
        pending={pending ? "Saving…" : null}
        onCancel={onCancel}
        primary={{ label: "Save changes", onClick: () => void save() }}
      />
    </>
  );
}
