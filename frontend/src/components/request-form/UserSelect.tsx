"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { resolveMobileNumber, type MobileNumberConfig } from "@/lib/mobileNumber";
import { useMobileFilterConfig } from "@/hooks/useMobileFilterConfig";

///  +-----------------------------------------------------------------+
///  |                        USER SELECT                              |
///  +-----------------------------------------------------------------+
//
//  Bare, controlled, label-less user picker — the shared combobox guts
//  behind the requester, approver, and reuse-number selectors. Each caller
//  supplies its own label/section framing and does what it likes with the
//  selected user via onSelect (which hands back the whole User, so callers
//  can pull id / name / email as needed).
//
//  Controlled by the User object (value), so it can be driven from parent
//  state — e.g. auto-selecting the requester from the signed-in user.
//
//  showPhone (opt-in, default off): appends the user's resolved MOBILE
//  number to each list item in hint styling — used by the reuse-number
//  picker, where the number IS the decision. Resolution checks both the
//  Phone and Mobile Snipe-IT fields against the ADMIN-CONFIGURED mobile
//  prefix rules (settings → Mobile Number Filtering, AU defaults until
//  loaded); users with no valid mobile show the fallback message.
//  Only affects the dropdown list; the input's selected text stays
//  name-only (itemToStringLabel is a plain string, can't be two-toned).
///  +-----------------------------------------------------------------+

export type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

type Props = {
  users: User[];
  value: User | null;
  onSelect: (user: User) => void;
  placeholder?: string;
  disabled?: boolean;
  showPhone?: boolean;
};

// FIXED: config now flows in from the server setting rather than the
// hardcoded default — same resolver, dynamic rules.
function phoneLabel(user: User, config: MobileNumberConfig): string {
  return resolveMobileNumber(user, config) ?? "No mobile phone number on record";
}

export default function UserSelect({
  users,
  value,
  onSelect,
  placeholder = "Search users...",
  disabled = false,
  showPhone = false,
}: Props) {
  // AU defaults immediately, server-configured values once loaded.
  // Cheap no-op for the requester/approver pickers that never showPhone.
  const mobileConfig = useMobileFilterConfig();

  return (
    <Combobox<User>
      items={users}
      value={value}
      onValueChange={(user) => {
        if (user) onSelect(user);
      }}
      itemToStringLabel={(user) => user.name}
      itemToStringValue={(user) => user.name}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput
        className="text-on-surface-variant bg-surface-container/40 !ring-purple-900 p-2 h-12 border-1 !border-outline"
        placeholder={placeholder}
        disabled={disabled}
      />

      <ComboboxContent className="bg-surface !outline-0 !ring-0 !border-1 !border-gray-200 !text-gray-400 mt-3 hover:cursor-pointer">
        <ComboboxEmpty>No users found</ComboboxEmpty>

        <ComboboxList>
          {(user: User) => (
            <ComboboxItem
              className="hover:cursor-pointer hover:text-shadcn-text hover:bg-shadcn-background"
              key={user.id}
              value={user}
            >
              {user.name}
              {/* phone shown in the same styling as the radio hints */}
              {showPhone && (
                <span className="ml-2 text-xs font-normal text-info-light">
                  - {phoneLabel(user, mobileConfig)}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}