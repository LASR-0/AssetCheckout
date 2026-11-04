import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChoiceChip } from "@/components/ui/pills";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { locationsQuery } from "@/api/queries";
import {
  createAccessoryForRequest,
  searchAccessoriesForRequest,
  // Not a hook, whatever the name says: it links a record to the request.
  useExistingAccessory as linkAccessory,
  type AccessorySearchMatch,
} from "@/api/accessories";
import { markUserProcured } from "@/api/selfProcurement";
import { FieldGrid, RadioList, RadioRow, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  Non-standard accessory, quote accepted (or skipped): pick the Snipe-IT
///  accessory record it comes from, make one, or hand it to the requester to
///  buy themselves. Records are per location, so the same accessory can
///  appear once per site. One with stock checks out straight away; one
///  without waits at "Add stock".

type Tab = "existing" | "new";

export function SelectStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const { data: locations = [] } = useQuery(locationsQuery);
  const [tab, setTab] = useState<Tab>("existing");
  const [q, setQ] = useState(r.modelRequest?.modelName ?? r.preferredModel ?? "");
  const [matches, setMatches] = useState<AccessorySearchMatch[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [name, setName] = useState(r.modelRequest?.modelName ?? r.preferredModel ?? "");
  const [mfr, setMfr] = useState(r.modelRequest?.manufacturer ?? "");
  const [loc, setLoc] = useState<number | null>(r.userLocationId ?? null);
  const [handing, setHanding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!q.trim()) return setError("Enter an accessory name to search.");
    setError(null);
    setPending("Searching…");
    try {
      const found = await searchAccessoriesForRequest(r.id, { name: q.trim() });
      setMatches(found);
      setPick(found[0]?.id ?? null);
    } catch (err) {
      setError(errorText(err, "Couldn't search Snipe-IT."));
    } finally {
      setPending(null);
    }
  }

  async function select() {
    const m = matches?.find((x) => x.id === pick);
    if (!m) return setError("Pick the record the stock will come from.");
    setError(null);
    setPending("Selecting…");
    try {
      await linkAccessory(r.id, m.id);
      onDone(m.hasAvailable ? `#${r.id}: ${m.name} selected and checked out.` : `#${r.id}: ${m.name} selected. Add stock once it arrives.`);
    } catch (err) {
      setError(errorText(err, "Couldn't select that accessory."));
      setPending(null);
    }
  }

  async function create() {
    if (!name.trim()) return setError("Name the new accessory.");
    if (loc == null) return setError("Choose where its stock lives.");
    setError(null);
    setPending("Creating accessory…");
    try {
      await createAccessoryForRequest(r.id, { name: name.trim(), locationId: loc, manufacturer: mfr.trim() || null });
      onDone(`#${r.id}: ${name.trim()} created with no stock. Add stock once it arrives.`);
    } catch (err) {
      setError(errorText(err, "Couldn't create the accessory."));
      setPending(null);
    }
  }

  async function handOff() {
    setError(null);
    setPending("Handing off…");
    try {
      await markUserProcured(r.id);
      onDone(`#${r.id} handed to ${r.userName} to buy.`);
    } catch (err) {
      setError(errorText(err, "Couldn't hand it off."));
      setPending(null);
    }
  }

  if (handing) {
    return (
      <>
        <StepError>{error}</StepError>
        <div className="flex flex-col gap-1 rounded-9 bg-subtle px-3 py-2.5 fs-13 leading-normal text-tx2 shadow-[inset_0_0_0_1px_var(--line)]">
          <div className="font-semibold text-tx">Hand it to {r.userName} to buy?</div>
          <div>They buy it themselves and enter what it cost. IT then reviews the purchase, and records it in Snipe-IT or keeps it in Checkout only.</div>
        </div>
        <StepFoot pending={pending} cancelLabel="Back" onCancel={() => setHanding(false)} primary={{ label: "Hand off", onClick: () => void handOff() }} />
      </>
    );
  }

  return (
    <>
      <StepError>{error}</StepError>
      <div role="radiogroup" aria-label="Accessory" className="flex flex-wrap gap-1.5">
        <ChoiceChip selected={tab === "existing"} onClick={() => setTab("existing")}>
          Existing accessory
        </ChoiceChip>
        <ChoiceChip selected={tab === "new"} onClick={() => setTab("new")}>
          Create new
        </ChoiceChip>
      </div>

      {tab === "existing" ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accessories by name" aria-label="Accessory name" />
            <Button type="submit" variant="secondary" className="h-9 px-3.5">
              Search
            </Button>
          </form>
          {matches &&
            (matches.length === 0 ? (
              <StepNote>No accessories match. Try another name, or create a new one.</StepNote>
            ) : (
              <>
                <RadioList label="Accessory record">
                  {matches.map((m) => (
                    <RadioRow
                      key={m.id}
                      selected={pick === m.id}
                      onClick={() => setPick(m.id)}
                      title={m.name}
                      sub={[m.manufacturer, m.locationName ?? "No location"].filter(Boolean).join(" · ")}
                      aside={
                        <span className={m.remaining > 0 ? "fs-12 whitespace-nowrap text-ok" : "fs-12 whitespace-nowrap text-prog"}>
                          {m.remaining > 0 ? `${m.remaining} in stock` : "No stock"}
                        </span>
                      }
                    />
                  ))}
                </RadioList>
                <StepNote>Records are per location. Pick the one the stock will come from.</StepNote>
              </>
            ))}
        </>
      ) : (
        <FieldGrid>
          <StepField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spigen rugged case" />
          </StepField>
          <StepField label="Manufacturer (optional)">
            <Input value={mfr} onChange={(e) => setMfr(e.target.value)} />
          </StepField>
          <StepField label="Stock location">
            <Select value={loc == null ? "" : String(loc)} onValueChange={(v) => setLoc(Number(v))}>
              <SelectTrigger aria-label="Stock location">
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StepField>
        </FieldGrid>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="h-9 px-3" onClick={() => setHanding(true)} disabled={!!pending}>
          Hand to requester to buy
        </Button>
        <span className="flex-1" />
        <StepFoot
          pending={pending}
          onCancel={onCancel}
          primary={
            tab === "new"
              ? { label: "Create accessory", onClick: () => void create() }
              : { label: "Select", onClick: () => void select(), disabled: !matches?.length }
          }
        />
      </div>
    </>
  );
}
