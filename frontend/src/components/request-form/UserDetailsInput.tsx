"use client";

import UserSelect, { type User } from "./UserSelect";

type Props = {
  users: User[];
  value: User | null;
  onSelected: (userId: string, userName: string) => void;
  /** Section heading — defaults to the asset form's "2. User Details". */
  label?: string;
  placeholder?: string;
};

export default function UserDetailsInput({
  users,
  value,
  onSelected,
  label = "2. User Details",
  placeholder = "Who will use this device?",
}: Props) {
  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        {label}
      </label>

      <UserSelect
        users={users}
        value={value}
        placeholder={placeholder}
        onSelect={(user) => onSelected(user.id, user.name)}
      />
    </div>
  );
}