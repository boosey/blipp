import { APP_STORE_URL } from "../config/app-store";

interface AppStoreBadgeProps {
  height?: number;
  className?: string;
}

export function AppStoreBadge({ height = 48, className = "" }: AppStoreBadgeProps) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-[0.98] ${className}`}
      aria-label="Download Blipp on the App Store"
    >
      <img
        src="/app-store-badge.svg"
        alt="Download on the App Store"
        height={height}
        style={{ height: `${height}px`, width: "auto" }}
      />
    </a>
  );
}
