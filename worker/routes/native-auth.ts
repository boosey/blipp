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

const routes = new Hono<{ Bindings: Env }>();

interface NativeAuthRequest {
  provider: "google" | "apple";
  idToken: string;
}

interface GoogleTokenInfo {
  email: string;
  email_verified: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  sub: string; // Google user ID
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
      // Skip password requirement — user signs in via social
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
      expires_in_seconds: 300, // 5 minutes
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

  // The Clerk API returns { token, url, ... }
  // The `token` is what the frontend needs for signIn.create({ strategy: "ticket", ticket })
  return data.token;
}

/**
 * POST /api/auth/native
 *
 * Body: { provider: "google" | "apple", idToken: "..." }
 * Returns: { ticket: "...", userId: "..." }
 */
routes.post("/native", async (c) => {
  const { provider, idToken } = (await c.req.json()) as NativeAuthRequest;

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

    // Step 1: Verify the provider token
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
      // TODO: Implement Apple token verification
      // Apple sends a JWT that needs to be verified with Apple's public keys
      return c.json({ error: "Apple sign-in not yet implemented" }, 501);
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

    // Step 2: Find or create the Clerk user
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

    // Step 3: Create a sign-in ticket
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
