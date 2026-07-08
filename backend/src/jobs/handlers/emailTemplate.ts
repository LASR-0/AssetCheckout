///  +-----------------------------------------------------------------+
///  |                   HTML EMAIL TEMPLATE                           |
///  +-----------------------------------------------------------------+
//
//  Email-safe HTML builder for KSB Checkout notifications. Table-based
//  layout, inline styles only, with Outlook (MSO) fallbacks — gradients
//  degrade to solid colour, the CTA uses the bulletproof-button pattern.
//
//  Every notification kind builds its plain-text body as before (kept for
//  multipart fallback) AND calls renderEmail() for the HTML alternative.
///  +-----------------------------------------------------------------+

const PURPLE = "#8b5cf6";
const PURPLE_LIGHT = "#c060f5";
const COMPANY = process.env.EMAIL_COMPANY_NAME ?? "KSB Australia";

export type EmailDetailRow = { label: string; value: string; mono?: boolean };

export type EmailContent = {
  /** Small uppercase pill above the title, e.g. "Action required". */
  eyebrow: string;
  /** Main heading. */
  title: string;
  /** Body paragraphs — plain strings, rendered as <p>. May contain simple
   *  inline HTML (already escaped/trusted by the caller). */
  paragraphs: string[];
  /** Optional key/value detail block (request summary, etc.). */
  detailRows?: EmailDetailRow[];
  /** Optional left-accent highlight block (tracking details, etc.). Rendered
   *  with a purple left border. Each line is raw HTML the caller controls. */
  highlight?: { heading: string; lines: string[] };
  /** Optional primary CTA button. */
  cta?: { label: string; url: string };
  /** Optional secondary link line under the CTA. */
  secondaryLink?: { prefix: string; label: string; url: string };
};

/** Best-effort first name from an email local-part, e.g.
 *  "luke.skywalker@ksb.com" → "Luke". Returns null when the shape isn't a
 *  recognisable name (empty, or numeric like "emp123") so callers can omit
 *  the greeting rather than print something wrong.
 *
 *  Assumes a first[.something]@domain convention. Organisations using a
 *  different scheme (initials, employee numbers, etc.) should adapt this. */
export function firstNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  if (!first || /\d/.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** First word of a display name, e.g. "Marcus Lee" → "Marcus". Null when empty. */
export function firstNameFromDisplayName(name: string | null | undefined): string | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || null;
}

/** Escape user-supplied text destined for HTML. Callers pass already-trusted
 *  markup into paragraphs/highlight, but values from Snipe/DB go through this. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

function renderDetailBlock(rows: EmailDetailRow[]): string {
  const cells = rows
    .map((r, i) => {
      const divider =
        i < rows.length - 1
          ? `<tr><td colspan="2" style="padding:0 18px;"><div style="height:1px; background:#ececf1; font-size:0; line-height:0;">&nbsp;</div></td></tr>`
          : "";
      return `
        <tr>
          <td style="padding:16px 18px; font:400 13px/1.5 ${FONT}; color:#6b6873;">${r.label}</td>
          <td style="padding:16px 18px; text-align:right; font:600 14px/1.5 ${r.mono ? MONO : FONT}; color:#27242e;">${r.value}</td>
        </tr>${divider}`;
    })
    .join("");

  return `
    <tr><td style="padding:24px 44px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf9fc; border:1px solid #ececf1; border-radius:8px;">
        ${cells}
      </table>
    </td></tr>`;
}

function renderHighlight(h: { heading: string; lines: string[] }): string {
  const lines = h.lines
    .map(
      (line) =>
        `<tr><td style="padding:0 20px 14px; font:400 14px/1.5 ${FONT}; color:#4b4854;">${line}</td></tr>`
    )
    .join("");

  return `
    <tr><td style="padding:24px 44px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf9fc; border:1px solid #ececf1; border-left:3px solid ${PURPLE}; border-radius:8px;">
        <tr><td style="padding:18px 20px 8px; font:600 11px/1 ${FONT}; letter-spacing:.07em; text-transform:uppercase; color:#8b8794;">${h.heading}</td></tr>
        ${lines}
        <tr><td style="height:6px; font-size:0; line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>`;
}

function renderCta(cta: { label: string; url: string }): string {
  // Bulletproof button: solid bg on the cell, padding on the anchor, plus an
  // MSO conditional so Outlook renders the padding/background reliably.
  return `
    <tr><td style="padding:28px 44px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta.url}" style="height:46px;v-text-anchor:middle;width:200px;" arcsize="17%" stroke="f" fillcolor="${PURPLE}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;">${cta.label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-radius:8px; background:${PURPLE};">
          <a href="${cta.url}" style="display:inline-block; padding:14px 30px; font:600 15px/1 ${FONT}; color:#ffffff; border-radius:8px;">${cta.label}</a>
        </td></tr>
      </table>
      <!--<![endif]-->
    </td></tr>`;
}

function renderSecondaryLink(s: { prefix: string; label: string; url: string }): string {
  return `
    <tr><td style="padding:16px 44px 0; font:400 13px/1.6 ${FONT}; color:#8b8794;">
      ${s.prefix} <a href="${s.url}" style="color:${PURPLE}; font-weight:500;">${s.label}</a>
    </td></tr>`;
}

/** Build the full HTML email for a notification. */
export function renderEmail(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (p, i) =>
        `<p style="margin:0 0 ${i < content.paragraphs.length - 1 ? "16px" : "0"};">${p}</p>`
    )
    .join("");

  const detail = content.detailRows ? renderDetailBlock(content.detailRows) : "";
  const highlight = content.highlight ? renderHighlight(content.highlight) : "";
  const cta = content.cta ? renderCta(content.cta) : "";
  const secondary = content.secondaryLink ? renderSecondaryLink(content.secondaryLink) : "";

  // Padding under the last content element before the footer divider.
  const bottomPad = `<tr><td style="height:36px; font-size:0; line-height:0;">&nbsp;</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>${esc(content.title)}</title>
</head>
<body style="margin:0; padding:0; background:#f1f0f4;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f0f4;">
  <tr><td align="center" style="padding:40px 16px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e7e5ee; border-radius:8px; font-family:${FONT}; color:#27242e;">

      <!-- accent bar: solid for Outlook, gradient elsewhere -->
      <tr><td style="height:4px; background:${PURPLE}; background:linear-gradient(90deg,${PURPLE},${PURPLE_LIGHT}); border-radius:8px 8px 0 0; font-size:0; line-height:0;">&nbsp;</td></tr>

      <!-- header / wordmark -->
      <tr><td style="padding:30px 44px 26px;">
        <span style="font:700 21px/1 ${FONT}; letter-spacing:-.01em; color:#1c1a22;">KSB</span><span style="font:400 21px/1 ${FONT}; letter-spacing:-.01em; color:${PURPLE};"> Checkout</span>
      </td></tr>
      <tr><td style="padding:0 44px;"><div style="height:1px; background:#ececf1; font-size:0; line-height:0;">&nbsp;</div></td></tr>

      <!-- eyebrow -->
      <tr><td style="padding:34px 44px 8px;">
        <span style="display:inline-block; font:600 11px/1 ${FONT}; letter-spacing:.08em; text-transform:uppercase; color:${PURPLE}; background:#f4efff; padding:6px 11px; border-radius:5px;">${esc(content.eyebrow)}</span>
      </td></tr>

      <!-- title -->
      <tr><td style="padding:16px 44px 0;">
        <h1 style="margin:0; font:600 27px/1.25 ${FONT}; letter-spacing:-.01em; color:#1c1a22;">${esc(content.title)}</h1>
      </td></tr>

      <!-- body -->
      <tr><td style="padding:18px 44px 0; font:400 15px/1.65 ${FONT}; color:#4b4854;">
        ${paragraphs}
      </td></tr>

      ${detail}
      ${highlight}
      ${cta}
      ${secondary}

      ${bottomPad}

      <!-- footer -->
      <tr><td style="padding:0 44px;"><div style="height:1px; background:#ececf1; font-size:0; line-height:0;">&nbsp;</div></td></tr>
      <tr><td style="padding:24px 44px 30px; font:400 12px/1.6 ${FONT}; color:#9b97a3;">
        ${esc(COMPANY)} · IT Service Desk<br>
        This is an automated message from KSB Checkout. Please do not reply to this email.
      </td></tr>

    </table>

  </td></tr>
</table>
</body>
</html>`;
}