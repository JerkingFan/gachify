import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((s) => s.init);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    void init();
  }, [init]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-spotify-black text-spotify-muted">
        Loading session…
      </div>
    );
  }

  return <>{children}</>;
}
