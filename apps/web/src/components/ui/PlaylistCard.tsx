import { Link } from "react-router-dom";

const GRADIENTS: Record<string, string> = {
  liked: "linear-gradient(135deg, #5038a0, #121212)",
  dungeon: "linear-gradient(135deg, #1a472a, #121212)",
  battle: "linear-gradient(135deg, #8b2635, #121212)",
  default: "linear-gradient(135deg, #1ed76044, #282828)",
};

interface PlaylistCardProps {
  id: string;
  title: string;
  description?: string;
  coverSeed?: string;
}

export function PlaylistCard({ id, title, description, coverSeed = "default" }: PlaylistCardProps) {
  const bg = GRADIENTS[coverSeed] ?? GRADIENTS.default;

  return (
    <Link to={`/playlist/${id}`} className="group card-hover block">
      <div
        className="mb-4 aspect-square w-full rounded-md shadow-lg"
        style={{ background: bg }}
      />
      <p className="truncate font-semibold text-white">{title}</p>
      <p className="truncate text-sm text-spotify-muted">
        {description ?? "Playlist"}
      </p>
    </Link>
  );
}
