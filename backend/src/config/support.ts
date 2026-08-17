///  +-----------------------------------------------------------------+
///  |                     IT SUPPORT CONTACT                          |
///  +-----------------------------------------------------------------+
//
//  The number on the troubleshooting page's escape blocks. Env rather than a
//  database setting: it changes about as often as the SMTP host, and putting
//  it in the Settings UI would buy an editing screen nobody opens for a value
//  nobody edits.
//
//  UNSET IS NOT A CRASH. Unlike APP_BASE_URL or the quote directory, which
//  the server refuses to boot without, a missing support number degrades to a
//  visible placeholder. The reasoning is who gets hurt: a wrong app link
//  reaches a person's inbox and wastes their time silently, whereas
//  "XXXX XXX XXX" on the page is self-evidently unconfigured to whoever sees
//  it — including the admin who forgot to set it. Taking the whole app down
//  over a phone number would be a worse trade than showing an obvious blank.
///  +-----------------------------------------------------------------+

/** Rendered when SUPPORT_PHONE is unset. Deliberately shaped like a number
 *  so the layout is honest, and deliberately not one. */
export const SUPPORT_PHONE_PLACEHOLDER = "XXXX XXX XXX";

export function getSupportPhone(): string {
  return process.env.SUPPORT_PHONE?.trim() || SUPPORT_PHONE_PLACEHOLDER;
}

/** False when the number is the placeholder, so the UI can soften the
 *  call-to-action rather than inviting someone to dial a row of X's. */
export function isSupportPhoneConfigured(): boolean {
  return getSupportPhone() !== SUPPORT_PHONE_PLACEHOLDER;
}

///  ── The Teams channel ────────────────────────────────────────────────────
//
//  Where "send a message instead" takes somebody. Env for the same reason the
//  phone number is: it changes when the channel does, which is roughly never,
//  and it is infrastructure rather than content.
//
//  A LINK, NOT A CREDENTIAL, and that is the point of choosing this over a
//  Power Automate workflow URL. Anyone holding a workflow URL can post into
//  the channel from anywhere; this is just an address, and who may post is
//  governed by Teams membership. It is served to the browser, so it could
//  never have held a secret anyway.
//
//  Copied from Teams itself — the channel's own "Copy link" — rather than
//  assembled here from ids. Teams has never documented how to build one, and
//  a link the app constructed would break the day that format changed.

/** A Teams channel deep link, as Teams' own "Copy link" produces it. */
const CHANNEL_LINK = /^https:\/\/teams\.microsoft\.com\/l\/channel\//;

export function getSupportChannelUrl(): string | null {
  const raw = process.env.SUPPORT_TEAMS_CHANNEL_URL?.trim();
  if (!raw) return null;

  // Checked rather than trusted. A wrong value here sends people to a page
  // that isn't Teams at all, and the failure is silent — they click, something
  // opens, and they assume the message went somewhere.
  if (!CHANNEL_LINK.test(raw)) {
    console.warn(
      "[support] SUPPORT_TEAMS_CHANNEL_URL is set but is not a Teams channel " +
        "link (expected https://teams.microsoft.com/l/channel/...). " +
        "The messaging option will stay hidden."
    );
    return null;
  }

  return raw;
}

/** What the channel is called, for the button and the modal — "post it in
 *  #it-support" reads better than "post it in the support channel". */
export function getSupportChannelName(): string {
  return process.env.SUPPORT_TEAMS_CHANNEL_NAME?.trim() || "the IT support channel";
}

/** False keeps the messaging option off the page entirely. Unlike the phone
 *  number there is no honest placeholder for a link: a button that opens
 *  nothing is worse than no button. */
export function isSupportChannelConfigured(): boolean {
  return getSupportChannelUrl() !== null;
}
