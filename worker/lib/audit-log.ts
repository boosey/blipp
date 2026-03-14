export interface AuditLogEntry {
  actorId: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Fire-and-forget — must not fail the parent request.
 */
export async function writeAuditLog(
  prisma: any,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await prisma.auditLog.create({ data: entry });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      action: "audit_log_write_failed",
      auditAction: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      error: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
  }
}
