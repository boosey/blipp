/**
 * Native authentication endpoint for Capacitor mobile apps.
 *
 * Accepts a provider ID token (Google, Apple, etc.) from a native sign-in
 * plugin, verifies it with the provider, finds or creates the Clerk user,
 * and returns a sign-in ticket that the app can use with
 * `signIn.create({ strategy: "ticket", ticket })`.
 */
import { Hono } from "hono";
import type { Env } from "../types";
import { resolveApiKey } from "../lib/service-key-resolver";

const CLERK_API = "https://api.clerk.com/v1";

// Apple Sign in with Apple token validation constants.
// aud must match the iOS bundle identifier that requested the token.
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_AUDIENCE = "com.podblipp.app";

const routes = new Hono<{ Bindings: Env }>();

interface NativeAuthRequest {
  provider: "google" | "apple";
  idToken: string;
  givenName?: string;
  familyName?: string;
}

interface GoogleTokenInfo {
  email: string;
  email_verified: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  sub: string;
}

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

/**
 * Verify a Google ID token and extract user info.
 */
async function verifyGoogleToken(idToken: string): Promise<GoogleTokenInfo> {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Google token verification failed: ${resp.status} ${body}`);
  }

  return resp.json() as Promise<GoogleTokenInfo>;
}

function base64UrlToBytes(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToString(str: string): string {
  return new TextDecoder().decode(base64UrlToBytes(str));
}

/**
 * Verify an Apple ID token. Fetches Apple's JWKS, validates the RS256
 * signature against the key whose `kid` matches the token header, and
 * checks iss/aud/exp before returning the payload.
 */
async function verifyAppleToken(idToken: string): Promise<AppleIdTokenPayload> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Apple ID token format");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlToString(headerB64)) as { kid: string; alg: string };
  const payload = JSON.parse(base64UrlToString(payloadB64)) as AppleIdTokenPayload;

  const jwksResp = await fetch(APPLE_JWKS_URL);
  if (!jwksResp.ok) {
    throw new Error(`Failed to fetch Apple JWKS: ${jwksResp.status}`);
  }
  const jwks = (await jwksResp.json()) as {
    keys: Array<{ kty: string; kid: string; use: string; alg: string; n: string; e: string }>;
  };
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) {
    throw new Error(`Apple public key not found for kid: ${header.kid}`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: key.kty, n: key.n, e: key.e, alg: key.alg, use: key.use, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature as BufferSource,
    signedData as BufferSource
  );

  if (!valid) throw new Error("Apple ID token signature verification failed");
  if (payload.iss !== APPLE_ISSUER) throw new Error(`Invalid issuer: ${payload.iss}`);
  if (payload.aud !== APPLE_AUDIENCE) {
    throw new Error(`Invalid audience: ${payload.aud} (expected ${APPLE_AUDIENCE})`);
  }
  if (payload.exp * 1000 < Date.now()) throw new Error("Apple ID token expired");
  if (!payload.email) throw new Error("Apple ID token missing email claim");

  return payload;
}

/**
 * Find a Clerk user by email address.
 */
async function findClerkUser(
  email: string,
  secretKey: string
): Promise<{ id: string } | null> {
  const resp = await fetch(
    `${CLERK_API}/users?email_address=${encodeURIComponent(email)}&limit=1`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Clerk user lookup failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as any[];
  return data.length > 0 ? { id: data[0].id } : null;
}

/**
 * Create a new Clerk user from provider profile info.
 */
async function createClerkUser(
  profile: {
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  },
  secretKey: string
): Promise<{ id: string }> {
  const resp = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: [profile.email],
      first_name: profile.firstName || undefined,
      last_name: profile.lastName || undefined,
      skip_password_requirement: true,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Clerk user creation failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as any;
  return { id: data.id };
}

/**
 * Create a sign-in ticket for a Clerk user.
 * The frontend uses this with `signIn.create({ strategy: "ticket", ticket })`.
 */
async function createSignInTicket(
  userId: string,
  secretKey: string
): Promise<string> {
  const resp = await fetch(`${CLERK_API}/sign_in_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      expires_in_seconds: 300,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Clerk sign-in token creation failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as any;

  console.log(JSON.stringify({
    action: "sign_in_token_response",
    status: resp.status,
    hasToken: !!data.token,
    tokenPrefix: data.token?.substring(0, 20),
    url: data.url,
    keys: Object.keys(data),
  }));

  return data.token;
}

/**
 * POST /api/auth/native
 *
 * Body: { provider: "google" | "apple", idToken: "...", givenName?: string, familyName?: string }
 * Returns: { ticket: "...", userId: "..." }
 */
routes.post("/native", async (c) => {
  const body = (await c.req.json()) as NativeAuthRequest;
  const { provider, idToken, givenName, familyName } = body;

  if (!provider || !idToken) {
    return c.json({ error: "Missing provider or idToken" }, 400);
  }

  const prisma = c.get("prisma") as any;
  const secretKey = await resolveApiKey(prisma, c.env, "CLERK_SECRET_KEY", "auth.clerk");
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY not configured");
    return c.json({ error: "Server configuration error" }, 500);
  }

  try {
    let email: string;
    let firstName: string | undefined;
    let lastName: string | undefined;
    let imageUrl: string | undefined;

    if (provider === "google") {
      const googleUser = await verifyGoogleToken(idToken);

      if (googleUser.email_verified !== "true") {
        return c.json({ error: "Email not verified with Google" }, 400);
      }

      email = googleUser.email;
      firstName = googleUser.given_name;
      lastName = googleUser.family_name;
      imageUrl = googleUser.picture;
    } else if (provider === "apple") {
      const applePayload = await verifyAppleToken(idToken);
      email = applePayload.email!;
      // Apple only returns the user's name on the first sign-in, and it
      // comes from the authorization response (not the JWT) — the client
      // passes it through as givenName/familyName.
      firstName = givenName;
      lastName = familyName;
    } else {
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    }

    console.log(
      JSON.stringify({
        action: "native_auth",
        provider,
        email,
        step: "token_verified",
      })
    );

    let user = await findClerkUser(email, secretKey);

    if (!user) {
      console.log(
        JSON.stringify({
          action: "native_auth",
          provider,
          email,
          step: "creating_user",
        })
      );
      user = await createClerkUser(
        { email, firstName, lastName, imageUrl },
        secretKey
      );
    }

    console.log(
      JSON.stringify({
        action: "native_auth",
        provider,
        email,
        userId: user.id,
        step: "user_found",
      })
    );

    const ticket = await createSignInTicket(user.id, secretKey);

    console.log(
      JSON.stringify({
        action: "native_auth",
        provider,
        userId: user.id,
        step: "ticket_created",
      })
    );

    return c.json({ ticket, userId: user.id });
  } catch (err: any) {
    console.error(
      JSON.stringify({
        action: "native_auth_error",
        provider,
        error: err.message,
      })
    );
    return c.json({ error: "Authentication failed" }, 500);
  }
});

export default routes;
