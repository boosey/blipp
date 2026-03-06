import { Link } from "react-router-dom";
import { StatusBadge } from "./status-badge";
import type { UserRequest } from "../types/user";
import { toStatusLabel } from "../types/user";

export function RequestItem({ request }: { request: UserRequest }) {
  const label = toStatusLabel(request.status);
  const isPlayable = request.status === "COMPLETED" && request.briefingId;

  const content = (
    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      {request.podcastImageUrl ? (
        <img
          src={request.podcastImageUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-zinc-800 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {request.episodeTitle || request.podcastTitle || "Briefing"}
        </p>
        <p className="text-xs text-zinc-500">
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      <StatusBadge label={label} />
    </div>
  );

  if (isPlayable) {
    return <Link to={`/briefing/${request.id}`}>{content}</Link>;
  }

  return content;
}
