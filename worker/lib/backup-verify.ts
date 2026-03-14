export interface BackupStatus {
  status: "ok" | "warning" | "error" | "unchecked";
  lastCheckedAt: string | null;
  message: string;
}

/**
 * Checks if the Neon database backup is recent.
 * Uses the Neon API if credentials are available, otherwise returns "unchecked".
 */
export async function verifyBackupStatus(env: {
  NEON_API_KEY?: string;
  NEON_PROJECT_ID?: string;
}): Promise<BackupStatus> {
  if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID) {
    return {
      status: "unchecked",
      lastCheckedAt: null,
      message: "Neon API credentials not configured",
    };
  }

  try {
    const resp = await fetch(
      `https://console.neon.tech/api/v2/projects/${env.NEON_PROJECT_ID}`,
      { headers: { Authorization: `Bearer ${env.NEON_API_KEY}` } }
    );

    if (!resp.ok) {
      return {
        status: "error",
        lastCheckedAt: new Date().toISOString(),
        message: `Neon API error: ${resp.status}`,
      };
    }

    const data = (await resp.json()) as { project: { updated_at: string } };
    const lastActivity = new Date(data.project.updated_at);
    const hoursSince =
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

    return {
      status: hoursSince > 24 ? "warning" : "ok",
      lastCheckedAt: new Date().toISOString(),
      message:
        hoursSince > 24
          ? `Last Neon activity was ${Math.round(hoursSince)} hours ago`
          : `Neon project active (${Math.round(hoursSince)}h ago)`,
    };
  } catch (err) {
    return {
      status: "error",
      lastCheckedAt: new Date().toISOString(),
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
