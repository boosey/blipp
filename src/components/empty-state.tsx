import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    to: string;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold text-foreground/80">{title}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-xs">{description}</p>
      {action && (
        <Link
          to={action.to}
          className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
