import { doc } from "firebase/firestore";
import { useMemo } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreDoc } from "./useFirestoreDoc";
import { db } from "../lib/firebase";

export function useUserSettings() {
  const { user } = useAuth();
  const userRef = useMemo(() => (user ? doc(db, "users", user.uid) : null), [user]);
  const { data, loading } = useFirestoreDoc(userRef);

  return {
    loading,
    settings: data?.settings,
    addressBook: data?.addressBook || [],
    timezone:
      data?.settings?.timezoneMode === "manual"
        ? data?.settings?.timezone
        : undefined,
    timezoneMode: data?.settings?.timezoneMode ?? "auto",
  };
}
