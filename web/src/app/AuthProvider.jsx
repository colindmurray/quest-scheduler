import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { ensureUserProfile } from "../lib/data/users";

const AuthContext = createContext(null);
const bannedEmailKey = "qs_banned_email";
const bannedReasonKey = "qs_banned_reason";

function encodeEmailId(email) {
  return encodeURIComponent(String(email || "").trim().toLowerCase());
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [banned, setBanned] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return null;
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    setRefreshTick((prev) => prev + 1);
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

        const email = nextUser.email?.toLowerCase();
        if (email) {
          const bannedRef = doc(db, "bannedEmails", encodeEmailId(email));
          const snap = await getDoc(bannedRef);
          if (snap.exists()) {
            const reason = snap.data()?.reason || "suspended";
            localStorage.setItem(bannedEmailKey, email);
            localStorage.setItem(bannedReasonKey, reason);
            setBanned({ email, reason });
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
    [user, loading, banned, profileReady, refreshUser, refreshTick]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
