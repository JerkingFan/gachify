import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: EmptyStateProps) {
  const action =
    actionLabel &&
    (actionTo ? (
      <Link
        to={actionTo}
        className="mt-6 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black hover:scale-105"
      >
        {actionLabel}
      </Link>
    ) : onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="mt-6 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black hover:scale-105"
      >
        {actionLabel}
      </button>
    ) : null);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-spotify-highlight">
        <Icon className="h-8 w-8 text-spotify-muted" />
      </div>
      <h3 className="text-xl font-bold text-white">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-spotify-muted">{description}</p>
      )}
      {action}
    </div>
  );
}
