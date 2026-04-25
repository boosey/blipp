export interface AudioTokenEnv {
  AUDIO_TOKEN_SECRET?: string;
  CLERK_WEBHOOK_SECRET?: string;
}

export interface SignArgs {
  briefingId: string;
  userId: string;
  ttlSeconds: number;
}

export interface VerifyArgs {
  briefingId: string;
  userId: string;
  token: string;
  exp: number;
}

export type VerifyResult = "ok" | "expired" | "invalid";

export async function signAudioToken(
  env: AudioTokenEnv,
  args: SignArgs,
): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + args.ttlSeconds;
  const payload = `${args.briefingId}.${args.userId}.${exp}`;
  const token = await sign(env, payload);
  return { token, exp };
}

export async function verifyAudioToken(
  env: AudioTokenEnv,
  args: VerifyArgs,
): Promise<VerifyResult> {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(args.exp) || args.exp <= now) return "expired";
  const payload = `${args.briefingId}.${args.userId}.${args.exp}`;
  const expected = await sign(env, payload);
  if (!constantTimeEq(args.token, expected)) return "invalid";
  return "ok";
}

function getSecret(env: AudioTokenEnv): string {
  if (env.AUDIO_TOKEN_SECRET) return env.AUDIO_TOKEN_SECRET;
  if (env.CLERK_WEBHOOK_SECRET) return `audio-token:${env.CLERK_WEBHOOK_SECRET}`;
  return "audio-token:default-dev-secret";
}

async function sign(env: AudioTokenEnv, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return base64UrlEncode(new Uint8Array(buf));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
