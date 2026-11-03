import { useQuery } from "@tanstack/react-query";
import { devSettingsQuery } from "@/api/queries";
import type { DevSettings } from "@/api/settings";

const OFF: DevSettings = { suppressEmail: false, allowSelfApproval: false };

/** The dev switches, all off until they load and in any non-dev build. */
export function useDevSettings(): DevSettings {
  return useQuery(devSettingsQuery).data ?? OFF;
}
