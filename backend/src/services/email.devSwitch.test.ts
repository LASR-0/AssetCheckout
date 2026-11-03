import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |        "SEND NO EMAIL" MEANS NOTHING REACHES THE TRANSPORT      |
///  +-----------------------------------------------------------------+

const sendMail = vi.fn(async () => ({ messageId: "x" }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail })) } }));

let suppressEmail = false;
vi.mock("./devSettings.js", () => ({ getDevSettings: async () => ({ suppressEmail, allowSelfApproval: false }) }));

process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_FROM = "checkout@example.invalid";
const { sendEmail } = await import("./email.js");

beforeEach(() => {
  sendMail.mockClear();
});

describe("sendEmail and the dev switch", () => {
  it("sends when the switch is off", async () => {
    suppressEmail = false;
    await sendEmail({ to: "a@example.invalid", subject: "Hi", text: "Hi" });
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("logs instead of sending when it's on", async () => {
    suppressEmail = true;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail({ to: ["a@example.invalid", "b@example.invalid"], subject: "Hi", text: "Hi" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("NOT sent"));
    log.mockRestore();
  });
});
