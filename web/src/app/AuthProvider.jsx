import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { ensureUserProfile } from "../lib/data/users";
import { reconcilePendingNotifications } from "../lib/data/notification-events";
import { AuthContext } from "./useAuth";
import { fetchBannedEmail } from "../lib/data/bans";
import { normalizeEmail } from "../lib/utils";

const bannedEmailKey = "qs_banned_email";
const bannedReasonKey = "qs_banned_reason";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [banned, setBanned] = useState(null);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return null;
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    return auth.currentUser;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      const run = async () => {
        if (!isMounted) return;
        setLoading(true);
        setProfileReady(false);
        if (!nextUser) {
          const storedEmail = localStorage.getItem(bannedEmailKey);
          const storedReason = localStorage.getItem(bannedReasonKey);
          if (storedEmail) {
            setBanned({ email: storedEmail, reason: storedReason || "suspended" });
          } else {
            setBanned(null);
          }
          setUser(null);
          setProfileReady(false);
          setLoading(false);
          return;
        }

        const email = normalizeEmail(nextUser?.email);
        if (email) {
          const banned = await fetchBannedEmail(email);
          if (banned) {
            localStorage.setItem(bannedEmailKey, banned.email);
            localStorage.setItem(bannedReasonKey, banned.reason);
            setBanned(banned);
            await signOut(auth);
            setUser(null);
            setProfileReady(false);
            setLoading(false);
            return;
          }
        }

        localStorage.removeItem(bannedEmailKey);
        localStorage.removeItem(bannedReasonKey);
        setBanned(null);
        try {
          await ensureUserProfile(nextUser);
          try {
            await reconcilePendingNotifications();
          } catch (err) {
            console.warn("Failed to reconcile pending notifications:", err);
          }
          setProfileReady(true);
        } catch (err) {
          console.error("Failed to ensure user profile:", err);
          setProfileReady(true);
        }
        setUser(nextUser);
        setLoading(false);
      };
      run().catch((err) => {
        console.error("Auth state check failed:", err);
        setUser(nextUser);
        setProfileReady(true);
        setLoading(false);
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, banned, profileReady, refreshUser }),
    [user, loading, banned, profileReady, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
