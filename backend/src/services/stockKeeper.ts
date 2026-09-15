import type { Request as ExpressRequest } from "express";
import { getActorEmail, type StockKeeperActor } from "../config/auth.js";
import { isAdminEmail } from "../config/auth.js";
import { resolveActorUserId } from "./snipeitassets.js";
import { getStockKeeperLocationIdsForUser } from "./settings.js";

///  +-----------------------------------------------------------------+
///  |        RESOLVING WHO THE CALLER IS, STOCK-KEEPER-WISE            |
///  +-----------------------------------------------------------------+
//
//  canActAsStockKeeper (config/auth.ts) is pure so the client can mirror it
//  exactly. This is the impure half the routes need: turning a request's
//  headers into the two facts that predicate consumes.
//
//  ADMINS SHORT-CIRCUIT. They can act at every location, so their assignment
//  list is never consulted — which also means an admin acting on a request
//  never costs a Snipe lookup or a settings read.
//
//  A FAILED SNIPE LOOKUP YIELDS NO LOCATIONS, never a thrown error. Stock
//  keeping is an additional capability layered on whatever role the actor
//  already has; an outage should cost them that capability and leave
//  everything else working, rather than failing the whole request. Admins are
//  unaffected either way, so the backstop still holds during an outage.
///  +-----------------------------------------------------------------+

export async function resolveStockKeeperActor(
  req: ExpressRequest
): Promise<StockKeeperActor> {
  const email = getActorEmail(req);

  if (isAdminEmail(email)) {
    return { isAdmin: true, stockKeeperLocationIds: [] };
  }
  if (!email) {
    return { isAdmin: false, stockKeeperLocationIds: [] };
  }

  try {
    const actorId = await resolveActorUserId(email);
    if (actorId === null) {
      return { isAdmin: false, stockKeeperLocationIds: [] };
    }
    return {
      isAdmin: false,
      stockKeeperLocationIds: await getStockKeeperLocationIdsForUser(actorId),
    };
  } catch (err) {
    console.error(
      "[stockKeeper] could not resolve actor's assignments; treating as none:",
      err
    );
    return { isAdmin: false, stockKeeperLocationIds: [] };
  }
}
