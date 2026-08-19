import { describe, it, expect, afterEach } from "vitest";
import {
  formatSupportPhone,
  getSupportPhone,
  getSupportHours,
  isSupportPhoneConfigured,
  SUPPORT_PHONE_PLACEHOLDER,
} from "./support.js";

///  +-----------------------------------------------------------------+
///  |          THE NUMBER AND THE HOURS ON THE ESCAPE BLOCKS          |
///  +-----------------------------------------------------------------+
//
//  Both come from a .env somebody types by hand, and both are read by a
//  person who is already having a bad day. The failures worth catching are
//  a number regrouped into something that is not the number, and a set of
//  hours invented for a deployment that never gave any.
///  +-----------------------------------------------------------------+

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("formatting the number", () => {
  it("groups a landline as 07 3436 8686", () => {
    expect(formatSupportPhone("0734368686")).toBe("07 3436 8686");
  });

  it("does not care how the separators were typed", () => {
    // The same number reaches the page the same way whether whoever set the
    // variable typed it as digits, spaced, hyphenated or bracketed.
    for (const raw of ["0734368686", "07 3436 8686", "(07) 3436-8686", "07-3436-8686"]) {
      expect(formatSupportPhone(raw), raw).toBe("07 3436 8686");
    }
  });

  it("groups a mobile 4-3-3, not as a landline", () => {
    // 04 is a valid landline prefix nowhere, but a naive 2-4-4 rule would
    // still claim it and produce "04 1234 5678".
    expect(formatSupportPhone("0412345678")).toBe("0412 345 678");
  });

  it("groups the service numbers", () => {
    expect(formatSupportPhone("1300975707")).toBe("1300 975 707");
    expect(formatSupportPhone("1800123456")).toBe("1800 123 456");
    expect(formatSupportPhone("131234")).toBe("13 12 34");
  });

  it("keeps the + on an international number", () => {
    expect(formatSupportPhone("+61734368686")).toBe("+61 7 3436 8686");
    expect(formatSupportPhone("+61412345678")).toBe("+61 412 345 678");
  });

  it("leaves a shape it does not recognise exactly as typed", () => {
    // The important half. A confident wrong grouping reads as deliberate,
    // which is worse than the raw digits — and an extension or an internal
    // number is not something to guess the shape of.
    for (const raw of ["8686", "07 3436 8686 ext 12", "+1 415 555 0123", "112"]) {
      expect(formatSupportPhone(raw), raw).toBe(raw);
    }
  });

  it("never loses or invents a digit", () => {
    // Whatever the grouping, dialling what is displayed has to dial the
    // number that was configured — the frontend strips it back to digits.
    for (const raw of ["0734368686", "0412345678", "1300975707", "+61734368686"]) {
      const digits = (s: string) => s.replace(/[^\d]/g, "");
      expect(digits(formatSupportPhone(raw)), raw).toBe(digits(raw));
    }
  });
});

describe("the unconfigured number", () => {
  it("serves the placeholder and says it is not configured", () => {
    delete process.env.SUPPORT_PHONE;

    expect(getSupportPhone()).toBe(SUPPORT_PHONE_PLACEHOLDER);
    expect(isSupportPhoneConfigured()).toBe(false);
  });

  it("is not mistaken for a number by the formatter", () => {
    // The placeholder is deliberately number-shaped, and the formatter runs
    // over free text — it must not try to regroup a row of X's.
    expect(formatSupportPhone(SUPPORT_PHONE_PLACEHOLDER)).toBe(SUPPORT_PHONE_PLACEHOLDER);
  });

  it("counts a configured number as configured once formatted", () => {
    // isSupportPhoneConfigured compares against the placeholder AFTER
    // formatting, so a formatter that returned something odd could make a
    // real number read as unset.
    process.env.SUPPORT_PHONE = "0734368686";

    expect(getSupportPhone()).toBe("07 3436 8686");
    expect(isSupportPhoneConfigured()).toBe(true);
  });
});

describe("the hours", () => {
  it("is null when nobody said, so the line is dropped", () => {
    delete process.env.SUPPORT_HOURS;
    expect(getSupportHours()).toBeNull();
  });

  it("treats whitespace as unset rather than as empty hours", () => {
    process.env.SUPPORT_HOURS = "   ";
    expect(getSupportHours()).toBeNull();
  });

  it("passes free text through untouched", () => {
    // The whole point of a string over a schedule: this has to survive.
    process.env.SUPPORT_HOURS = "Mon–Fri 7am–7pm, closed public holidays";
    expect(getSupportHours()).toBe("Mon–Fri 7am–7pm, closed public holidays");
  });
});
