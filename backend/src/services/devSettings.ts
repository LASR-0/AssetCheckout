import { getSetting, setSetting } from "./settings.js";

///  +-----------------------------------------------------------------+
///  |                  DEV SETTINGS (development only)                |
///  +-----------------------------------------------------------------+
//
//  Switches that take a guard out of the way while testing on a dev
//  instance: stop email going out, and let someone approve their own
//  request so one person can walk a request through every step.
//
//  INERT OUTSIDE DEVELOPMENT, the same rule as the x-dev-user-* headers:
//  in any other NODE_ENV they read as off whatever the table says, and the
//  routes that read and write them answer 404. Read at call time rather than
//  import time, so the tests can flip the environment.
//
//  NOT SEEDED. They are deliberately absent from SETTING_DEFAULTS, so a
//  production database never grows a row for them. A missing row is off.
///  +-----------------------------------------------------------------+

export type DevSettings = {
  /** Log each email instead of sending it. */
  suppressEmail: boolean;
  /** Let the requester be their own approver. */
  allowSelfApproval: boolean;
};

const KEYS: Record<keyof DevSettings, string> = {
  suppressEmail: "dev.suppressEmail",
  allowSelfApproval: "dev.allowSelfApproval",
};

const OFF: DevSettings = { suppressEmail: false, allowSelfApproval: false };

export function devSettingsAvailable(): boolean {
  return process.env.NODE_ENV === "development";
}

export async function getDevSettings(): Promise<DevSettings> {
  if (!devSettingsAvailable()) return OFF;
  const [suppressEmail, allowSelfApproval] = await Promise.all([
    getSetting(KEYS.suppressEmail),
    getSetting(KEYS.allowSelfApproval),
  ]);
  return { suppressEmail: suppressEmail === "true", allowSelfApproval: allowSelfApproval === "true" };
}

export async function setDevSettings(patch: Partial<DevSettings>, actorEmail: string): Promise<DevSettings> {
  if (!devSettingsAvailable()) return OFF;
  for (const key of Object.keys(KEYS) as (keyof DevSettings)[]) {
    const value = patch[key];
    if (typeof value === "boolean") await setSetting(KEYS[key], String(value), actorEmail);
  }
  return getDevSettings();
}
