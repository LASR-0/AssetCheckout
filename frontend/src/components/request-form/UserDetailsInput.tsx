"use client";

import UserSelect, { type User } from "./UserSelect";

type Props = {
  users: User[];
  value: User | null;
  onSelected: (userId: string, userName: string) => void;
};

export default function UserDetailsInput({ users, value, onSelected }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        2. User Details
      </label>

      <UserSelect
        users={users}
        value={value}
        placeholder="Who will use this device?"
        onSelect={(user) => onSelected(user.id, user.name)}
      />
    </div>
  );
}