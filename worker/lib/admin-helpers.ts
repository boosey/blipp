import type { Context } from "hono";
import { createClerkClient } from "@clerk/backend";
import { getAuth } from "../middleware/auth";
import type { Env } from "../types";

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
    return await prisma.user.findUniqueOrThrow({ where: { clerkId } });
  } catch {
    // User missing from DB — fetch from Clerk and create
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(clerkId);

    const defaultPlan = await prisma.plan.findFirst({ where: { isDefault: true } });
    if (!defaultPlan) throw new Error("No default plan configured");

    return prisma.user.create({
      data: {
        clerkId,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@unknown.com`,
        name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
        imageUrl: clerkUser.imageUrl ?? null,
        planId: defaultPlan.id,
      },
    });
  }
}
