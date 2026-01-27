import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingState } from "../components/ui/spinner";

export default function ProtectedRoute({ children }) {
  const { user, loading, profileReady } = useAuth();
  const location = useLocation();

  if (loading || (user && !profileReady)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading..." />
      </div>
    );
  }

  if (!user) {
    localStorage.setItem("postLoginRedirect", location.pathname + location.search);
    return <Navigate to="/auth" replace />;
  }

  return children;
}
