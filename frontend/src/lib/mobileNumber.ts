///  +-----------------------------------------------------------------+
///  |                     MOBILE NUMBER RESOLUTION                    |
///  +-----------------------------------------------------------------+
//
//  Snipe-IT users carry two number fields — Phone (Brandon's landline use
//  case) and Mobile — and data hygiene is mid-migration: mobiles may be
//  sitting in either field, and landlines may be sitting in Mobile.
//
//  A number counts as a mobile when, after normalisation, it starts with
//  either +{countryCode}{leadingDigit} (e.g. +614...) or 0{leadingDigit}
//  (e.g. 04...). A bare "+" or country code is NOT enough — +61 7 / 02 /
//  03 / 07 are landlines.
//
//  Config is parameterised (AU defaults) so the planned admin setting
//  (country code + mobile leading digit, seeded from .env later) can be
//  passed straight in without touching this logic.
///  +-----------------------------------------------------------------+

export type MobileNumberConfig = {
  /** Country calling code, digits only — e.g. "61" for Australia. */
  countryCode: string;
  /** First digit after the prefix that marks a mobile — "4" for Australia. */
  mobileLeadingDigit: string;
};

export const DEFAULT_MOBILE_CONFIG: MobileNumberConfig = {
  countryCode: "61",
  mobileLeadingDigit: "4",
};

/** Strip spaces, dashes, dots and parentheses so prefix checks see digits. */
function normalise(value: string): string {
  return value.replace(/[\s\-().]/g, "");
}

export function isMobileNumber(
  value: string | null | undefined,
  config: MobileNumberConfig = DEFAULT_MOBILE_CONFIG
): boolean {
  if (!value) return false;
  const n = normalise(value.trim());
  if (!n) return false;
  const intlPrefix = `+${config.countryCode}${config.mobileLeadingDigit}`; // +614
  const localPrefix = `0${config.mobileLeadingDigit}`; // 04
  return n.startsWith(intlPrefix) || n.startsWith(localPrefix);
}

/**
 * The user's usable mobile number, or null if they don't have one.
 * Validates BOTH fields (worst-case data) and prefers Mobile:
 *  - a landline stored in Mobile is rejected
 *  - a mobile stored in Phone is still found
 */
export function resolveMobileNumber(
  user: { phone: string | null; mobile: string | null },
  config: MobileNumberConfig = DEFAULT_MOBILE_CONFIG
): string | null {
  if (isMobileNumber(user.mobile, config)) return user.mobile!.trim();
  if (isMobileNumber(user.phone, config)) return user.phone!.trim();
  return null;
}