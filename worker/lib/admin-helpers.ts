import type { Context } from "hono";
import { createClerkClient } from "@clerk/backend";
import { getAuth } from "../middleware/auth";
import type { Env } from "../types";
import { resolveApiKey } from "./service-key-resolver";

/** Parse page/pageSize from query params with defaults and max cap. */
export function parsePagination(c: Context) {
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/** Parse sort query param into Prisma orderBy object. */
export function parseSort(
  c: Context,
  defaultField = "createdAt",
  allowedFields?: string[]
) {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [rawField, rawDir] = sort.split(":");
  const sortField = rawField || defaultField;
  const sortDir = rawDir === "asc" ? "asc" : "desc";

  // If an allowlist is provided, validate the field
  if (allowedFields && !allowedFields.includes(sortField)) {
    return { [defaultField]: sortDir };
  }

  return { [sortField]: sortDir } as Record<string, string>;
}

/** Standard paginated response shape. */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** Resolve the current Clerk user to a DB User record, creating if missing. */
export async function getCurrentUser(c: Context<{ Bindings: Env }>, prisma: any) {
  const clerkId = getAuth(c)!.userId!;

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId } });
    if (user.status === "suspended" || user.status === "banned") {
      throw new Error("Account suspended");
    }
    return user;
  } catch (err: any) {
    // Re-throw suspension errors — don't fall through to user creation
    if (err?.message === "Account suspended") throw err;
    // User missing from DB — fetch from Clerk and create
    const clerk = createClerkClient({ secretKey: await resolveApiKey(prisma, c.env, "CLERK_SECRET_KEY", "auth.clerk") });
    const clerkUser = await clerk.users.getUser(clerkId);

    const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
    if (!defaultPlan) throw new Error("No default plan configured");

    const email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@unknown.com`;

    // Use upsert to handle the case where a user with this email already exists
    // (e.g., created via webhook with a different clerkId, or re-created Clerk account)
    return prisma.user.upsert({
      where: { email },
      update: {
        clerkId,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
        imageUrl: clerkUser.imageUrl ?? null,
      },
      create: {
        clerkId,
        email,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
        imageUrl: clerkUser.imageUrl ?? null,
        planId: defaultPlan.id,
      },
    });
  }
}
