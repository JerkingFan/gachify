import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";

export function PlaylistJoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const joinPlaylist = useLibraryStore((s) => s.joinPlaylistByInvite);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    setJoining(true);
    void joinPlaylist(token)
      .then((p) => navigate(`/playlist/${p.id}`, { replace: true }))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not join playlist");
        setJoining(false);
      });
  }, [token, isAuthenticated, joinPlaylist, navigate]);

  if (!isAuthenticated) {
    const returnTo = token ? `/playlist/join/${encodeURIComponent(token)}` : "/library";
    return (
      <>
        <TopBar title="Join playlist" />
        <EmptyState
          icon={Users}
          title="Log in to join"
          description="You need an account to collaborate on this playlist."
          actionLabel="Log in"
          actionTo={`/login?returnTo=${encodeURIComponent(returnTo)}`}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <TopBar title="Join playlist" />
        <EmptyState
          icon={Users}
          title="Invite not valid"
          description={error}
          actionLabel="Your library"
          actionTo="/library"
        />
      </>
    );
  }

  return (
    <>
      <TopBar title="Join playlist" />
      <p className="p-8 text-spotify-muted">
        {joining ? "Joining collaborative playlist…" : "Redirecting…"}
      </p>
      <p className="px-8 text-sm">
        <Link to="/library" className="text-spotify-green hover:underline">
          Back to library
        </Link>
      </p>
    </>
  );
}
