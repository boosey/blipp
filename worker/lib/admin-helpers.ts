import type { Context } from "hono";
import { getAuth } from "../middleware/auth";

/** Parse page/pageSize from query params with defaults and max cap. */
export function parsePagination(c: Context) {
  const page = parseInt(c.req.query("page") ?? "1");
  const pageSize = Math.min(parseInt(c.req.query("pageSize") ?? "20"), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/** Parse sort query param into Prisma orderBy object. */
export function parseSort(c: Context, defaultField = "createdAt") {
  const sort = c.req.query("sort") ?? `${defaultField}:desc`;
  const [sortField, sortDir] = sort.split(":");
  return { [sortField || defaultField]: sortDir || "desc" } as Record<
    string,
    string
  >;
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

/** Resolve the current Clerk user to a DB User record. */
export async function getCurrentUser(c: Context, prisma: any) {
  const userId = getAuth(c)!.userId!;
  return prisma.user.findUniqueOrThrow({ where: { clerkId: userId } });
}
