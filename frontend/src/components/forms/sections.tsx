import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented";
import type { User } from "@/components/request-form/UserSelect";
import { Field, FieldError, FormSection, Question } from "./FormSection";
import { PersonPicker } from "./PersonPicker";

export type Spec = "STANDARD" | "NON_STANDARD";

type SpecProps = {
  kind: "asset" | "accessory";
  value: Spec;
  onChange: (v: Spec) => void;
  /** Pins the choice: "Something else" pins non-standard, a named
   *  accessory option pins standard. */
  lockedTo?: Spec;
  /** Explains the lock, or what the current choice means. */
  hint: string;
  reason: string;
  onReason: (v: string) => void;
  model: string;
  onModel: (v: string) => void;
  error?: string;
  /** Accessories: who pays for a non-standard one, and who signs the quote. */
  budgetNote?: string | null;
};

/** Standard or non-standard, and for non-standard, why and what model. */
export function SpecSection({ kind, value, onChange, lockedTo, hint, reason, onReason, model, onModel, error, budgetNote }: SpecProps) {
  const effective = lockedTo ?? value;
  const non = effective === "NON_STANDARD";
  return (
    <FormSection id="spec" label="Specification">
      <SegmentedControl<Spec>
        label="Specification"
        size="md"
        value={effective}
        onValueChange={(v) => !lockedTo && onChange(v)}
        options={[
          { value: "STANDARD", label: "Standard", disabled: !!lockedTo && lockedTo !== "STANDARD" },
          { value: "NON_STANDARD", label: "Non-standard", disabled: !!lockedTo && lockedTo !== "NON_STANDARD" },
        ]}
        className="w-full max-w-[26.25rem] *:h-10 *:data-[state=on]:font-semibold phone:*:h-8.5"
      />
      <p className="m-0 flex items-start gap-1.5 fs-12 leading-[1.45] text-pretty text-tx3">
        {lockedTo && <Icon name="lock" size={15} className="text-mut" />}
        <span>{hint}</span>
      </p>
      {budgetNote && (
        <div className="flex items-start gap-2.5 rounded-10 bg-prog-bg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--prog-line)]">
          <Icon name="account_balance_wallet" size={18} className="text-prog" />
          <span className="fs-12.5 leading-normal text-pretty text-tx">{budgetNote}</span>
        </div>
      )}
      {non && (
        <div className="flex flex-col gap-3 border-t border-line2 pt-3">
          <Field label="Reason for non-standard request">
            <Textarea
              size="lg"
              rows={3}
              value={reason}
              onChange={(e) => onReason(e.target.value)}
              aria-invalid={!!error || undefined}
              placeholder={kind === "asset" ? "e.g. I need a bigger screen" : "e.g. A keyboard cover for the iPad, for site visits"}
            />
          </Field>
          <FieldError className="-mt-1.5">{error}</FieldError>
          <Field label="What model do you have in mind?" optional>
            <Input
              size="lg"
              value={model}
              onChange={(e) => onModel(e.target.value)}
              placeholder={
                kind === "asset"
                  ? "e.g. ThinkPad T16 Gen 1 — leave blank if you don't mind"
                  : "e.g. Logitech Combo Touch — leave blank if you don't mind"
              }
            />
          </Field>
        </div>
      )}
    </FormSection>
  );
}

type ApprovalProps = {
  question: string;
  users: User[];
  approver: User | null;
  onApprover: (u: User | null) => void;
  requestee: User | null;
  /** The person filing is the requestee's manager in Snipe-IT. */
  autoApproved: boolean;
  error?: string;
};

/** Who approves it. Shows when filing as the manager means it passes on send. */
export function ApprovalSection({ question, users, approver, onApprover, requestee, autoApproved, error }: ApprovalProps) {
  return (
    <FormSection id="appr" label="Approval">
      <Question hint="They get an email to approve it before it reaches IT.">{question}</Question>
      <PersonPicker
        users={users}
        value={approver}
        onChange={onApprover}
        placeholder="Search for their manager"
        label="Approver"
        exclude={requestee ? (u) => u.id === requestee.id : undefined}
        invalid={!!error}
      />
      {autoApproved && (
        <p className="m-0 flex items-center gap-1.5 fs-12 text-ok">
          <Icon name="bolt" size={16} />
          You're their manager, so this step passes automatically when you send it.
        </p>
      )}
      <FieldError>{error}</FieldError>
    </FormSection>
  );
}

