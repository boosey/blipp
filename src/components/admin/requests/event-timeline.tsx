import type { PipelineEventSummary, PipelineStepStatus } from "@/types/admin";

const EVENT_LEVEL_COLORS: Record<string, string> = {
  ERROR: "#EF4444",
  WARN: "#F59E0B",
  INFO: "#9CA3AF",
  DEBUG: "#6B7280",
};

const SUCCESS_KEYWORDS = ["saved", "extracted", "generated", "completed", "found", "fetched", "created", "linked", "assembly complete"];

function isSuccessEvent(event: PipelineEventSummary): boolean {
  if (event.level !== "INFO") return false;
  const lower = event.message.toLowerCase();
  return SUCCESS_KEYWORDS.some((kw) => lower.includes(kw));
}

function eventColor(event: PipelineEventSummary): string {
  if (event.level === "ERROR") return EVENT_LEVEL_COLORS.ERROR;
  if (event.level === "WARN") return EVENT_LEVEL_COLORS.WARN;
  if (isSuccessEvent(event)) return "#22C55E";
  if (event.level === "DEBUG") return EVENT_LEVEL_COLORS.DEBUG;
  return EVENT_LEVEL_COLORS.INFO;
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatEventDataValue(value: unknown): string {
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "number") {
    if (value > 10_000) return value.toLocaleString();
    return String(value);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" && value.length > 120) return value.slice(0, 120) + "\u2026";
  return String(value);
}

export interface EventTimelineProps {
  events: PipelineEventSummary[];
  stepStatus: PipelineStepStatus;
  showDebug: boolean;
  showDetails: boolean;
}

export function EventTimeline({
  events,
  stepStatus,
  showDebug,
  showDetails,
}: EventTimelineProps) {
  const filtered = showDebug ? events : events.filter((e) => e.level !== "DEBUG");

  const borderColor =
    stepStatus === "FAILED" ? "#EF4444" :
    stepStatus === "IN_PROGRESS" ? "#3B82F6" :
    stepStatus === "COMPLETED" ? "#22C55E" :
    "#6B7280";

  return (
    <div className="py-1">
      <div
        className="border-l-2 pl-3 space-y-0.5"
        style={{ borderColor }}
      >
        {filtered.map((event) => (
          <div key={event.id}>
            <div className="flex items-start gap-2 text-[10px]">
              <span className="text-[#6B7280] font-mono text-[9px] shrink-0 tabular-nums">
                {formatEventTime(event.createdAt)}
              </span>
              <span style={{ color: eventColor(event) }}>
                {event.message}
              </span>
            </div>
            {showDetails && event.data && Object.keys(event.data).length > 0 && (
              <div className="ml-[70px] mt-0.5 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(event.data).map(([key, val]) => (
                  <span key={key} className="text-[9px]">
                    <span className="text-[#6B7280]">{key}:</span>{" "}
                    <span className="text-[#A1A1AA] font-mono">{formatEventDataValue(val)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <span className="text-[9px] text-[#6B7280] italic">No events recorded</span>
        )}
      </div>
    </div>
  );
}
