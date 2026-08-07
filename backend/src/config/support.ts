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
