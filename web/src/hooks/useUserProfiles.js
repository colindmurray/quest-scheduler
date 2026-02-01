import { useEffect, useState, useMemo } from "react";
import { fetchPublicProfilesByEmails, fetchPublicProfilesByIds } from "../lib/data/users";
import { normalizeEmail } from "../lib/utils";

/**
 * Hook to fetch user profiles (including avatars) for a list of emails.
 * Fetches from the usersPublic collection where photoURL is stored.
 */
export function useUserProfiles(emails = []) {
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);

  // Normalize and dedupe emails
  const normalizedEmails = useMemo(() => {
    const unique = new Set(emails.filter(Boolean).map((email) => normalizeEmail(email)));
    return Array.from(unique);
  }, [emails]);
  const normalizedKey = useMemo(() => normalizedEmails.join("|"), [normalizedEmails]);

  useEffect(() => {
    if (normalizedEmails.length === 0) {
      setProfiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const allProfiles = await fetchPublicProfilesByEmails(normalizedEmails);
        setProfiles(allProfiles);
      } catch (err) {
        console.error("Failed to fetch user profiles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [normalizedKey, normalizedEmails]);

  // Helper to get avatar for an email
  const getAvatar = (email) => {
    if (!email) return null;
    return profiles[normalizeEmail(email)]?.photoURL || null;
  };

  // Helper to get display name for an email
  const getDisplayName = (email) => {
    if (!email) return null;
    return profiles[normalizeEmail(email)]?.displayName || null;
  };

  // Helper to enrich a list of emails with profile data
  const enrichUsers = (emailList) => {
    return (emailList || []).map((email) => {
      const key = normalizeEmail(email);
      return {
        email: email,
        avatar: getAvatar(email),
        displayName: getDisplayName(email),
        publicIdentifier: profiles[key]?.publicIdentifier || null,
        publicIdentifierType: profiles[key]?.publicIdentifierType || null,
        qsUsername: profiles[key]?.qsUsername || null,
        discordUsername: profiles[key]?.discordUsername || null,
      };
    });
  };

  return {
    profiles,
    loading,
    getAvatar,
    getDisplayName,
    enrichUsers,
  };
}

export function useUserProfilesByIds(userIds = []) {
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(false);

  const normalizedIds = useMemo(() => {
    const unique = new Set((userIds || []).filter(Boolean));
    return Array.from(unique);
  }, [userIds]);
  const normalizedKey = useMemo(() => normalizedIds.join("|"), [normalizedIds]);

  useEffect(() => {
    if (normalizedIds.length === 0) {
      setProfiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const allProfiles = await fetchPublicProfilesByIds(normalizedIds);
        setProfiles(allProfiles);
      } catch (err) {
        console.error("Failed to fetch user profiles by id:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [normalizedKey, normalizedIds]);

  return {
    profiles,
    loading,
  };
}
