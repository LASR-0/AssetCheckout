/** A person from the Snipe-IT directory (GET /api/users), as the pickers
 *  and forms use them. */
export type User = {
  /** Snipe-IT user id. A number on the wire, so a number here: typed as a
   *  string, every `=== String(...)` comparison against it silently failed. */
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  /** Their Snipe-IT location: where they collect. */
  locationId?: number | null;
  locationName?: string | null;
  /** Their manager in Snipe-IT. Filing as that manager auto-approves. */
  managerId?: number | null;
};
