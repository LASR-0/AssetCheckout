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
//  "XX XXXX XXXX" on the page is self-evidently unconfigured to whoever sees
//  it — including the admin who forgot to set it. Taking the whole app down
//  over a phone number would be a worse trade than showing an obvious blank.
///  +-----------------------------------------------------------------+

/** Rendered when SUPPORT_PHONE is unset. Deliberately shaped like a number
 *  so the layout is honest, and deliberately not one. Grouped 2-4-4 to match
 *  what a configured landline formats to, so the space it reserves is the
 *  space the real number takes. */
export const SUPPORT_PHONE_PLACEHOLDER = "XX XXXX XXXX";

///  ── Formatting ───────────────────────────────────────────────────────────
//
//  FORMATTED HERE, NOT IN THE BROWSER. The number is served to the page
//  ready to read, so the grouping rules live in one place rather than being
//  reimplemented wherever a number is shown. The frontend still strips it
//  back to digits for `tel:` — see dialDigits — so spaces cost nothing there.
//
//  WHY FORMAT AT ALL. SUPPORT_PHONE is typed into a .env by whoever deploys,
//  and "0734368686" is what people type. Ten unbroken digits is not a phone
//  number to a reader; it is a number they have to group themselves before
//  they can read it back to somebody or check they dialled it right.
//
//  UNRECOGNISED SHAPES PASS THROUGH UNTOUCHED, which is the important half.
//  Guessing at a grouping for a number this does not recognise would produce
//  a confidently wrong one — worse than the raw digits, because it looks
//  deliberate. An international number, an extension, a five-digit internal:
//  all of them come out exactly as they were typed.

/** Australian groupings, longest match first. */
const PHONE_FORMATS: { test: RegExp; group: (d: string) => string }[] = [
  // Mobile: 0412 345 678. Checked before the general landline rule, which
  // would otherwise claim it and group it 2-4-4.
  {
    test: /^04\d{8}$/,
    group: (d) => `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`,
  },
  // 13/18 service numbers: 1300 975 707, 1800 123 456.
  {
    test: /^1[38]00\d{6}$/,
    group: (d) => `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`,
  },
  // The short 13 numbers: 13 12 34.
  {
    test: /^13\d{4}$/,
    group: (d) => `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4)}`,
  },
  // Landline with area code: 07 3436 8686. The area codes are 02, 03, 07
  // and 08 and nothing else — spelling them out rather than writing [2-9]
  // keeps this rule off 04, which is a mobile and grouped differently, and
  // off the 05/06/09 prefixes that are not numbers at all. Those fall
  // through to being shown as typed rather than confidently regrouped.
  {
    test: /^0[2378]\d{8}$/,
    group: (d) => `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`,
  },
  // Written internationally: +61 7 3436 8686. The leading 0 is dropped in
  // this form, so there are nine digits after the country code, not ten.
  {
    test: /^\+61[2378]\d{8}$/,
    group: (d) => `+61 ${d.slice(3, 4)} ${d.slice(4, 8)} ${d.slice(8)}`,
  },
  // Mobile written internationally: +61 412 345 678.
  {
    test: /^\+614\d{8}$/,
    group: (d) => `+61 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`,
  },
];

/**
 * Group a phone number for reading.
 *
 * Exported for the tests, and because "what will this look like on the page"
 * is a question worth being able to ask directly.
 */
export function formatSupportPhone(raw: string): string {
  // Whatever separators were typed are discarded before matching, so
  // "07 3436 8686", "(07) 3436-8686" and "0734368686" are the same input.
  const digits = raw.replace(/(?!^\+)[^\d]/g, "");

  const format = PHONE_FORMATS.find((f) => f.test.test(digits));

  return format ? format.group(digits) : raw.trim();
}

export function getSupportPhone(): string {
  const raw = process.env.SUPPORT_PHONE?.trim();
  if (!raw) return SUPPORT_PHONE_PLACEHOLDER;

  return formatSupportPhone(raw);
}

/** False when the number is the placeholder, so the UI can soften the
 *  call-to-action rather than inviting someone to dial a row of X's. */
export function isSupportPhoneConfigured(): boolean {
  return getSupportPhone() !== SUPPORT_PHONE_PLACEHOLDER;
}

///  ── When the line is answered ─────────────────────────────────────────────
//
//  Free text, not a parsed schedule. "Mon–Fri, 7am–7pm" was hardcoded into
//  the escape card, which was wrong the moment anybody's hours differed from
//  ours, but the fix is a string rather than open/close times because every
//  structured version has to answer questions this does not: public holidays,
//  a half day on Christmas Eve, an on-call number after six. A deployment
//  that wants "Mon–Fri 7am–7pm, closed public holidays" can write exactly
//  that, and one with an unusual arrangement is not fighting a model.
//
//  It buys nothing that a live "open now / closed" badge would, and that is
//  the deliberate limit: telling somebody the line is open when it is not
//  needs a timezone, a holiday calendar and a way to be wrong, and none of
//  that was asked for. The reader compares the hours to their own clock, the
//  way they do on any other contact page.
//
//  OPTIONAL, and absent means the line simply is not shown. An empty string
//  is honest — we do not know the hours — where an invented default is not.

export function getSupportHours(): string | null {
  return process.env.SUPPORT_HOURS?.trim() || null;
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
