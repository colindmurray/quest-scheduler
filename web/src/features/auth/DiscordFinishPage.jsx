import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { signInWithDiscordToken } from "../../lib/auth";

export default function DiscordFinishPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const storedRedirect = localStorage.getItem("postLoginRedirect");
    const returnTo = storedRedirect || params.get("returnTo") || "/dashboard";

    if (!token) {
      toast.error("Missing Discord sign-in token.");
      navigate("/auth?error=missing_token", { replace: true });
      return;
    }

    signInWithDiscordToken(token)
      .then(() => {
        if (storedRedirect) {
          localStorage.removeItem("postLoginRedirect");
        }
        navigate(returnTo, { replace: true });
      })
      .catch((err) => {
        console.error("Discord sign-in failed:", err);
        toast.error("Discord sign-in failed. Please try again.");
        navigate("/auth?error=discord_failed", { replace: true });
      });
  }, [location.search, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 text-sm">
        Completing Discord sign-in...
      </div>
    </div>
  );
}
