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
  onSelected: (userID: string, userName: string) => void;
};

export default function UserDetailsInput({ users, onSelected }: Props) {


  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        2. User Details
      </label>

      <Combobox<User>
        items={users}
        itemToStringValue={(user) => user.name}
        autoHighlight
      >
        <ComboboxInput className="text-on-surface-variant bg-surface-container/40 !ring-purple-900 p-2 h-12 border-1 !border-outline" placeholder="Who will use this device?" />

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