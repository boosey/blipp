/**
 * Thin ZeptoMail Send Template API wrapper.
 *
 * API: POST https://api.zeptomail.com/v1.1/email/template
 * Docs: https://www.zoho.com/zeptomail/help/api/email-templates.html
 *
 * Merge variables in the template are referenced as `{{slot_name}}` and
 * substituted server-side from the `mergeInfo` object we send.
 */

const ZEPTOMAIL_TEMPLATE_ENDPOINT = "https://api.zeptomail.com/v1.1/email/template";

export type SendTemplateResult =
  | { ok: true }
  | { ok: false; status: number; permanent: boolean; body: string };

export interface SendTemplateArgs {
  token: string;
  templateKey: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  toName: string | null;
  mergeInfo?: Record<string, string>;
}

/**
 * Send a templated transactional email through ZeptoMail.
 *
 * Classifies failures as `permanent` (auth, validation — don't retry) or
 * transient (5xx, network — retry). The queue consumer uses this flag
 * to decide between msg.ack() and msg.retry().
 */
export async function sendTemplateEmail(args: SendTemplateArgs): Promise<SendTemplateResult> {
  const body = {
    template_key: args.templateKey,
    from: { address: args.fromAddress, name: args.fromName },
    to: [
      {
        email_address: {
          address: args.toAddress,
          ...(args.toName ? { name: args.toName } : {}),
        },
      },
    ],
    ...(args.mergeInfo ? { merge_info: args.mergeInfo } : {}),
  };

  let res: Response;
  try {
    res = await fetch(ZEPTOMAIL_TEMPLATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        // ZeptoMail auth scheme — literal string "Zoho-enczapikey" prefix
        "Authorization": `Zoho-enczapikey ${args.token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network error — always treat as transient so we retry
    return {
      ok: false,
      status: 0,
      permanent: false,
      body: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.ok) return { ok: true };

  // 401/403 = bad token, 400/422 = bad payload — no point retrying, human fix needed
  const permanent = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422;
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, permanent, body: text.slice(0, 1000) };
}
