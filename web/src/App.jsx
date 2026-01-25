import { Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "sonner";
import LandingPage from "./features/landing/LandingPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import SettingsPage from "./features/settings/SettingsPage";
import FriendsPage from "./features/friends/FriendsPage";
import SchedulerPage from "./features/scheduler/SchedulerPage";
import CreateSchedulerPage from "./features/scheduler/CreateSchedulerPage";
import PrivacyPage from "./features/legal/PrivacyPage";
import TermsPage from "./features/legal/TermsPage";
import ProtectedRoute from "./app/ProtectedRoute";
import { useAuth } from "./app/AuthProvider";
import AppLayout from "./app/AppLayout";
import { useTheme } from "./app/ThemeProvider";

function RedirectWhenSignedIn({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      const redirectPath = localStorage.getItem("postLoginRedirect");
      if (redirectPath) {
        localStorage.removeItem("postLoginRedirect");
        const [pathname, search] = redirectPath.split("?");
        const isPollRoute = /^\/scheduler\/[^/]+$/.test(pathname);
        const searchParams = new URLSearchParams(search || "");
        const isFriendRequestRoute = pathname === "/friends" && searchParams.has("request");
        const isFriendInviteRoute = pathname === "/friends" && searchParams.has("invite");
        if (isPollRoute || isFriendRequestRoute || isFriendInviteRoute) {
          navigate(redirectPath, { replace: true });
          return;
        }
      }
      navigate("/dashboard", { replace: true });
    }
  }, [loading, navigate, user]);

  return children;
}

export default function App() {
  const { darkMode } = useTheme();
  const location = useLocation();

  return (
    <>
      <Toaster
        theme={darkMode ? "dark" : "light"}
        position="top-right"
        toastOptions={{
          className: "font-sans",
          duration: 4000,
        }}
      />
      <Routes location={location} key={location.pathname}>
      <Route
        path="/"
        element={
          <RedirectWhenSignedIn>
            <LandingPage />
          </RedirectWhenSignedIn>
        }
      />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <AppLayout>
              <FriendsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler/:id"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SchedulerPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduler/:id/edit"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CreateSchedulerPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CreateSchedulerPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
