import { useEffect, useState, useMemo } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * Hook to fetch user profiles (including avatars) for a list of emails.
 * Fetches from the usersPublic collection where photoURL is stored.
 */
export function useUserProfiles(emails = []) {
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);

  // Normalize and dedupe emails
  const normalizedEmails = useMemo(() => {
    const unique = new Set(
      emails.filter(Boolean).map((e) => e.toLowerCase())
    );
    return Array.from(unique);
  }, [emails]);

  useEffect(() => {
    if (normalizedEmails.length === 0) {
      setProfiles({});
      return;
    }

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        // Firestore 'in' queries have a limit of 30 items
        const chunks = [];
        for (let i = 0; i < normalizedEmails.length; i += 30) {
          chunks.push(normalizedEmails.slice(i, i + 30));
        }

        const allProfiles = {};

        await Promise.all(
          chunks.map(async (chunk) => {
            const q = query(
              collection(db, "usersPublic"),
              where("email", "in", chunk)
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (data.email) {
                allProfiles[data.email.toLowerCase()] = {
                  email: data.email,
                  displayName: data.displayName,
                  photoURL: data.photoURL,
                };
              }
            });
          })
        );

        setProfiles(allProfiles);
      } catch (err) {
        console.error("Failed to fetch user profiles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [normalizedEmails]);

  // Helper to get avatar for an email
  const getAvatar = (email) => {
    if (!email) return null;
    return profiles[email.toLowerCase()]?.photoURL || null;
  };

  // Helper to get display name for an email
  const getDisplayName = (email) => {
    if (!email) return null;
    return profiles[email.toLowerCase()]?.displayName || null;
  };

  // Helper to enrich a list of emails with profile data
  const enrichUsers = (emailList) => {
    return (emailList || []).map((email) => ({
      email: email,
      avatar: getAvatar(email),
      displayName: getDisplayName(email),
    }));
  };

  return {
    profiles,
    loading,
    getAvatar,
    getDisplayName,
    enrichUsers,
  };
}
