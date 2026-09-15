export type Role = "ADMIN" | "MANAGER" | "REQUESTER" | null;

///  +-----------------------------------------------------------------+
///  |                  STOCK KEEPING IS NOT A ROLE                    |
///  +-----------------------------------------------------------------+
//
//  Deliberately NOT a fourth value of Role. A stock keeper is almost always
//  also a requester, and often an approver — and every gate in this app
//  switches on that single Role value, so making it a fifth branch would take
//  those capabilities away. The requester who keeps stock would lose the
//  button to confirm they collected their own device.
//
//  It travels alongside Role instead: an assignment to zero or more Snipe
//  locations, which composes with whatever role the actor already has. See
//  canActAsStockKeeper in lib/permissions.
///  +-----------------------------------------------------------------+

export type StockKeeperLocation = {
  id: number;
  /**
   * The location's name when the assignment was written. Null for an
   * assignment made before names were snapshotted — the id is what carries
   * the authority, so a nameless entry is still a valid one.
   */
  name: string | null;
};
