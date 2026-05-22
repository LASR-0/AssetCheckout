"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { User } from "lucide-react";


type User = {
  id: string;
  name: string;
};

type Props = {
  users: User[];
  onSelected: (managerID: string, manager: string) => void;
};

export default function ApprovalInput({ users, onSelected }: Props) {


  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        5. Approval Authority
      </label>

      <Combobox<User>
        items={users}
        itemToStringValue={(users) => users.name}
      >
        <ComboboxInput className="text-on-surface-variant bg-surface-container/40 !ring-purple-900 p-2 h-12 border-1 !border-outline" placeholder="Who manages the user of this device?" />

        <ComboboxContent className="bg-surface !outline-0 !ring-0 !border-1 !border-gray-200 !text-gray-400 mt-3  hover:cursor-pointer">
          <ComboboxEmpty>No users found</ComboboxEmpty>

          <ComboboxList>
            {(users: User) => (
              <ComboboxItem className="hover:cursor-pointer hover:text-shadcn-text hover:bg-shadcn-background" key={users.id} value={users.name} 
                  onClick={() => {
                    onSelected(users.id, users.name);
                  }}>
                {users.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}