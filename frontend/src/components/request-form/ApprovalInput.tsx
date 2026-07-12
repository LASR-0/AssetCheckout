"use client";

import UserSelect, { type User } from "./UserSelect";

type Props = {
  users: User[];
  value: User | null;
  onSelected: (managerId: string, managerName: string) => void;
};

export default function ApprovalInput({ users, value, onSelected }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        5. Approval Authority
      </label>

      <UserSelect
        users={users}
        value={value}
        placeholder="Who manages the user of this device?"
        onSelect={(user) => onSelected(user.id, user.name)}
      />
    </div>
  );
}