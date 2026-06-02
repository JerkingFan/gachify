import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** /me → own public profile (личный кабинет). */
export function MyProfileRedirectPage() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/profile/${user.id}`} replace />;
}
