import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceChip } from "@/components/ui/pills";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/api/client";
import { companiesQuery, locationsQuery, priceAveragesQuery, statusesQuery, tiersQuery } from "@/api/queries";
import type { SnipeNamedRecord } from "@/types/snipeTypes";
import { FieldGrid, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  Non-standard asset, model linked: fill in the skeleton asset in
///  Snipe-IT. Partial saves are fine. The server re-checks the asset after
///  every save and checks it out the moment it's complete, so "Save and
///  check out" is the same save with a serial insisted on first.

type SnipeAsset = {
  company?: { id: number } | null;
  serial?: string | null;
  status_label?: { id: number } | null;
  location?: { id: number } | null;
  custom_fields?: { Tier?: { value?: string } };
  asset_tag?: string | null;
};

const NONE: SnipeNamedRecord[] = [];

function RecordSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number | null;
  onChange: (id: number) => void;
  options: SnipeNamedRecord[];
}) {
  return (
    <StepField label={label}>
      <Select value={value == null ? "" : String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StepField>
  );
}

export function DetailsStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const assetId = r.modelRequest?.linkedAssetId ?? null;
  const { data: companies = NONE } = useQuery(companiesQuery);
  const { data: locations = NONE } = useQuery(locationsQuery);
  const { data: statuses = NONE } = useQuery(statusesQuery);
  const { data: tiers = [] } = useQuery(tiersQuery);
  const asset = useQuery({
    queryKey: ["snipe", "asset", assetId],
    queryFn: () => apiFetch<{ asset?: SnipeAsset }>(`/api/snipe/asset/${assetId}`).then((d) => d.asset ?? null),
    enabled: assetId != null,
    staleTime: 0,
  });

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [serial, setSerial] = useState("");
  const [statusId, setStatusId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(r.userLocationId ?? null);
  const [tier, setTier] = useState("");
  const [price, setPrice] = useState(r.modelRequest?.price != null ? String(r.modelRequest.price) : "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Prefill once from what Snipe-IT already holds for the skeleton asset,
  // during render so the first frame with data already shows it.
  const [filled, setFilled] = useState(false);
  if (!filled && !asset.isPending && statuses.length > 0) {
    const a = asset.data;
    const ready = statuses.find((s) => s.name.trim().toLowerCase() === "ready to deploy");
    setFilled(true);
    setCompanyId(a?.company?.id ?? null);
    setSerial(a?.serial ?? "");
    setStatusId(a?.status_label?.id ?? ready?.id ?? null);
    if (a?.location?.id) setLocationId(a.location.id);
    setTier(a?.custom_fields?.Tier?.value ?? "");
  }

  const averages = useQuery({ ...priceAveragesQuery(tier.toLowerCase()), enabled: !!tier });
  const avg = averages.data?.averages[r.categoryId];
  const p = parseFloat(price.replace(/[$,]/g, ""));
  const cat = r.categoryName.toLowerCase();
  const avgText =
    !tier || avg == null
      ? tier
        ? `No ${tier} ${cat} average yet`
        : "Pick a tier to compare with its average"
      : Number.isFinite(p) && p > 0
        ? `${Math.abs(Math.round((p / avg - 1) * 100))}% ${p >= avg ? "above" : "below"} the ${tier} ${cat} average of $${Math.round(avg).toLocaleString()}`
        : `${tier} ${cat} average $${Math.round(avg).toLocaleString()}`;

  async function save(checkout: boolean) {
    if (checkout && !serial.trim()) {
      setError("Add a serial to complete the asset. Use Save for later to keep what you have.");
      return;
    }
    if (price && (!Number.isFinite(p) || p < 0)) {
      setError("Enter the price as a number, 0 or more.");
      return;
    }
    setError(null);
    setSaved(false);
    setPending(checkout ? "Saving and checking out…" : "Saving…");
    try {
      const data = await apiFetch<{ modelRequest?: { assetReady?: boolean } }>(`/api/approval/${r.id}/asset-details`, {
        method: "POST",
        body: {
          companyId,
          serial: serial.trim(),
          statusId,
          locationId,
          tier: tier.trim(),
          price: price === "" ? undefined : p,
        },
      });
      if (data?.modelRequest?.assetReady) {
        onDone(`#${r.id}: asset details saved and checked out to ${r.userName}.`);
        return;
      }
      setPending(null);
      if (checkout) setError("Saved, but Snipe-IT still has the asset as incomplete. Fill in the rest, then try again.");
      else setSaved(true);
    } catch (err) {
      setError(errorText(err, "Couldn't save the asset details."));
      setPending(null);
    }
  }

  if (assetId == null) {
    return <StepError>This request has no linked asset yet. Link or create the model first.</StepError>;
  }

  return (
    <>
      <StepError>{error}</StepError>
      <StepNote className="font-medium text-tx">{r.modelRequest?.modelName ?? "Linked model"}</StepNote>
      <FieldGrid>
        <StepField label="Asset tag">
          <Input value={asset.data?.asset_tag ?? (asset.isPending ? "Loading…" : "Assigned by Snipe-IT")} readOnly className="bg-subtle font-mono text-tx3" />
        </StepField>
        <StepField label="Serial">
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="From the box or device" className="font-mono" />
        </StepField>
        <RecordSelect label="Company" value={companyId} onChange={setCompanyId} options={companies} />
        <RecordSelect label="Default location" value={locationId} onChange={setLocationId} options={locations} />
        <RecordSelect label="Status" value={statusId} onChange={setStatusId} options={statuses} />
        <div className="flex min-w-0 flex-col gap-1.25 fs-12.5 text-tx3">
          Tier
          <div role="radiogroup" aria-label="Tier" className="flex flex-wrap gap-1.5">
            {tiers.map((t) => (
              <ChoiceChip key={t} selected={tier.toLowerCase() === t.toLowerCase()} onClick={() => setTier(t)}>
                {t}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <StepField label="Price (AUD)">
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" inputMode="decimal" />
          <span className="fs-12 text-mut">{avgText}</span>
        </StepField>
      </FieldGrid>
      <StepFoot
        hint={saved ? "Saved. You can finish the details later." : "Fill in what you know now. Emptied fields will be cleared."}
        pending={pending}
        onCancel={onCancel}
        extra={
          <Button variant="secondary" className="h-9 px-3.5" onClick={() => void save(false)}>
            Save for later
          </Button>
        }
        primary={{ label: "Save and check out", onClick: () => void save(true) }}
      />
    </>
  );
}
