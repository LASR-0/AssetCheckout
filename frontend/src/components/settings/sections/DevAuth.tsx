import { useState } from "react";
import { Input } from "@/components/ui/input";
import { btn } from "@/components/ui/variants";
import { getDevUserEmail, getDevUserName, setDevUser } from "@/hooks/useAuth";
import { Section, Sheet } from "../parts";

///  +-----------------------------------------------------------------+
///  |                  DEV AUTH (development builds only)             |
///  +-----------------------------------------------------------------+
//
//  Sign in as someone else to test their view. The email decides the role
//  (admins are an email list), so it's the field that matters.
///  +-----------------------------------------------------------------+

export function DevAuth() {
  const [current, setCurrent] = useState(() => ({ name: getDevUserName(), email: getDevUserEmail() }));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const apply = (n: string, e: string) => {
    setDevUser(n, e);
    setCurrent({ name: n, email: e });
    setName("");
    setEmail("");
  };

  return (
    <Section label="Impersonate" note="Development builds only">
      <Sheet className="flex flex-col gap-3 px-4 py-3.5">
        <p className="m-0 fs-11.5 text-tx3">
          Signed in as <b className="font-medium text-tx">{current.name || "nobody"}</b>
          {current.email && <span className="text-mut"> · {current.email}</span>}
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] gap-2.5">
          <label className="flex flex-col gap-1.25 fs-11 text-tx3">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grace O'Neill" className="fs-11.5" />
          </label>
          <label className="flex flex-col gap-1.25 fs-11 text-tx3">
            Email
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && apply(name, email)}
              placeholder="grace.oneill@example.com"
              className="fs-11.5"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => apply("", "")} className={btn({ variant: "ghost", size: "md", className: "fs-11.5" })}>
            Clear
          </button>
          <button type="button" disabled={!name.trim()} onClick={() => apply(name, email)} className={btn({ variant: "primary", size: "md", className: "fs-11.5" })}>
            Sign in as this person
          </button>
        </div>
      </Sheet>
    </Section>
  );
}
