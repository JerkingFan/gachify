import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api } from "@/api/client";

/** Resolves @handle URLs to profile pages. */
export function UserHandleRedirectPage() {
  const { handle } = useParams<{ handle: string }>();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!handle) return;
    void api
      .getUserByHandle(handle.toLowerCase())
      .then((u) => setProfileId(u.id))
      .catch(() => setMissing(true));
  }, [handle]);

  if (missing) {
    return (
      <div className="p-8 text-center text-spotify-muted">
        User @{handle} not found.
      </div>
    );
  }

  if (profileId) {
    return <Navigate to={`/profile/${profileId}`} replace />;
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-spotify-green" />
    </div>
  );
}
