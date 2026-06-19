import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import tls from "node:tls";

///  +-----------------------------------------------------------------+
///  |                        EMAIL SERVICE                            |
///  +-----------------------------------------------------------------+
//
//  Thin wrapper around a single pooled Nodemailer transporter pointed at
//  the internal relay. Configuration is env-only (infrastructure, not
//  runtime settings). Supports LOGIN auth (SMTP_USER/SMTP_PASS set) or
//  IP-allowlisted anonymous relay (both unset).
//
//  STARTTLS on 587: secure:false + requireTLS:true means "connect plain,
//  then upgrade and refuse to continue unencrypted."
///  +-----------------------------------------------------------------+

const IS_DEV = process.env.NODE_ENV === "development";
const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? "";

export function isEmailConfigured(): boolean {
  return SMTP_HOST.length > 0 && SMTP_FROM.length > 0;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured — SMTP_HOST and SMTP_FROM are required in the environment."
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,        // 587 = STARTTLS, not implicit TLS
      requireTLS: true,     // refuse to send if upgrade fails
      pool: true,
      maxConnections: 3,
      ...(SMTP_USER && SMTP_PASS
        ? { auth: { user: SMTP_USER, pass: SMTP_PASS } }
        : {}),
      tls: { minVersion: "TLSv1.2",
        ...(IS_DEV //Server Identity check is only required for development enviroment
        ? {
          checkServerIdentity: (hostname, cert) => {
            const ok = /^ksb00exc\d{4}(\.EMEA\.KSB\.intern)?$/i;

            const cn = cert.subject?.CN;
            const cnNames = Array.isArray(cn) ? cn : cn ? [cn] : [];

            const sanNames = String(cert.subjectaltname ?? "")
              .split(",")
              .map((s) => s.trim().replace(/^DNS:/i, ""));

            const names = [...cnNames, ...sanNames].filter(Boolean);

            if (names.some((n) => ok.test(n))) {
              return undefined; // accept — it's one of our relay nodes
            }
            return tls.checkServerIdentity(hostname, cert);
          },
        }
      : {} ),
      }
    });
  }

  return transporter;
}

/** Verifies connectivity + auth against the relay without sending. */
export async function verifyEmailTransport(): Promise<void> {
  await getTransporter().verify();
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const info = await getTransporter().sendMail({
    from: SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });

  console.log(
    `[email] sent "${input.subject}" to ${Array.isArray(input.to) ? input.to.join(", ") : input.to} (${info.messageId})`
  );
}