import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Users, UserPlus, X } from "lucide-react";
import { useFriends } from "../../hooks/useFriends";
import { useBlockedUsers } from "../../hooks/useBlockedUsers";
import { normalizeFriendRequestId } from "../../lib/data/friends";
import { resolveIdentifier } from "../../lib/identifiers";
import { APP_URL } from "../../lib/config";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { QuestingGroupsTab } from "../settings/components/QuestingGroupsTab";
import { UserAvatar } from "../../components/ui/avatar";
import { LoadingState } from "../../components/ui/spinner";
import { UserIdentity } from "../../components/UserIdentity";
import { useAuth } from "../../app/AuthProvider";
import { useNotifications } from "../../hooks/useNotifications";
import { friendRequestNotificationId } from "../../lib/data/notifications";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "friends";
  const requestId = searchParams.get("request");
  const inviteCode = searchParams.get("invite");
  const { user } = useAuth();

  const {
    friends,
    friendRequestMap,
    incomingRequests,
    outgoingRequests,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    getInviteCode,
    acceptInviteLink,
  } = useFriends();
  const { removeLocal: removeNotification } = useNotifications();

  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [inviteLink, setInviteLink] = useState("");
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [removeFriendEmail, setRemoveFriendEmail] = useState(null);
  const [removeFriendOpen, setRemoveFriendOpen] = useState(false);
  const [hiddenFriends, setHiddenFriends] = useState(() => new Set());
  const [blockEmail, setBlockEmail] = useState("");
  const [blockError, setBlockError] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const [unblocking, setUnblocking] = useState(null);

  const normalizedRequestId = useMemo(
    () => normalizeFriendRequestId(requestId),
    [requestId]
  );

  const highlightedRequest = useMemo(
    () => incomingRequests.find((request) => request.id === normalizedRequestId),
    [incomingRequests, normalizedRequestId]
  );
  const outgoingMatch = useMemo(
    () => outgoingRequests.find((request) => request.id === normalizedRequestId),
    [outgoingRequests, normalizedRequestId]
  );

  const profileEmails = useMemo(() => {
    const set = new Set([
      ...friends,
      ...incomingRequests.map((request) => request.fromEmail),
      ...outgoingRequests.map((request) => request.toEmail),
    ]);
    return Array.from(set).filter(Boolean);
  }, [friends, incomingRequests, outgoingRequests]);

  const { enrichUsers, profiles: profileMap } = useUserProfiles(profileEmails);
  const friendProfiles = enrichUsers(friends);
  const visibleFriends = useMemo(
    () => friendProfiles.filter((friend) => !hiddenFriends.has(friend.email)),
    [friendProfiles, hiddenFriends]
  );
  const {
    blockedUsers,
    loading: blockedLoading,
    blockUser,
    unblockUser,
  } = useBlockedUsers();
  const blockedEmailSet = useMemo(() => {
    const set = new Set();
    blockedUsers.forEach((entry) => {
      if (entry?.email) {
        set.add(entry.email.toLowerCase());
      }
    });
    return set;
  }, [blockedUsers]);

  const resolveProfile = (email) => {
    if (!email) return null;
    const normalized = String(email).toLowerCase();
    return profileMap[normalized] || { email };
  };

  useEffect(() => {
    setHiddenFriends((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set();
      friends.forEach((email) => {
        if (prev.has(email)) next.add(email);
      });
      return next;
    });
  }, [friends]);

  const handleTabChange = (tab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === "friends") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    setSearchParams(params);
  };

  useEffect(() => {
    if (!requestId || activeTab === "friends") return;
    const params = new URLSearchParams(searchParams);
    params.delete("tab");
    setSearchParams(params);
  }, [requestId, activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    if (!requestId) return;
    setRequestModalOpen(true);
  }, [requestId]);

  useEffect(() => {
    if (!user?.uid) return;
    getInviteCode()
      .then((code) => {
        if (!code) return;
        setInviteLink(`${APP_URL}/friends?invite=${code}`);
      })
      .catch((err) => {
        console.error("Failed to generate invite link:", err);
      });
  }, [user?.uid, getInviteCode]);

  useEffect(() => {
    if (!inviteCode || !user?.uid) return;
    const params = new URLSearchParams(searchParams);
    params.delete("invite");
    params.delete("tab");
    const run = async () => {
      try {
        const result = await acceptInviteLink(inviteCode);
        if (result?.senderEmail) {
          const label = result.senderDisplayName || result.senderEmail;
          toast.success(`You're now friends with ${label}`);
        } else {
          toast.success("Friend request accepted");
        }
      } catch (err) {
        console.error("Failed to accept invite link:", err);
        toast.error(err.message || "Failed to accept invite link");
      } finally {
        setSearchParams(params);
      }
    };
    run();
  }, [inviteCode, acceptInviteLink, searchParams, setSearchParams]);

  const handleSendRequest = async () => {
    const raw = email.trim();
    setError(null);
    if (!raw) {
      setError("Enter an email or Discord username.");
      return;
    }
    let resolved;
    try {
      resolved = await resolveIdentifier(raw);
    } catch (err) {
      setError(err.message || "Enter a valid email or Discord username.");
      return;
    }
    const normalized = resolved.email.toLowerCase();
    if (friends.includes(normalized)) {
      setError("You are already friends.");
      return;
    }
    if (blockedEmailSet.has(normalized)) {
      setError("You have blocked this user.");
      return;
    }
    if (incomingRequests.some((request) => request.fromEmail === normalized)) {
      setError("You already have a pending request from this person.");
      return;
    }
    if (outgoingRequests.some((request) => request.toEmail === normalized)) {
      setError("You already sent a request to this person.");
      return;
    }
    setSending(true);
    try {
      await sendFriendRequest(raw);
      setEmail("");
      toast.success("Friend request sent");
    } catch (err) {
      console.error("Failed to send friend request:", err);
      toast.error(err.message || "Failed to send friend request");
    } finally {
      setSending(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("Invite link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy invite link:", err);
      toast.error("Failed to copy invite link");
    }
  };

  const handleBlockUser = async () => {
    const raw = blockEmail.trim();
    setBlockError(null);
    if (!raw) {
      setBlockError("Enter an email, Discord username, or @username.");
      return;
    }
    let resolved;
    try {
      resolved = await resolveIdentifier(raw);
    } catch (err) {
      setBlockError(err.message || "Enter a valid email or username.");
      return;
    }
    const normalized = resolved.email.toLowerCase();
    if (normalized === user?.email?.toLowerCase()) {
      setBlockError("You cannot block yourself.");
      return;
    }
    if (blockedEmailSet.has(normalized)) {
      setBlockError("That user is already blocked.");
      return;
    }
    setBlocking(true);
    try {
      await blockUser(raw);
      setBlockEmail("");
      toast.success("User blocked");
    } catch (err) {
      console.error("Failed to block user:", err);
      toast.error(err?.message || "Failed to block user");
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblockUser = async (identifierToUnblock) => {
    if (!identifierToUnblock) return;
    setUnblocking(identifierToUnblock);
    try {
      await unblockUser(identifierToUnblock);
      toast.success("User unblocked");
    } catch (err) {
      console.error("Failed to unblock user:", err);
      toast.error(err?.message || "Failed to unblock user");
    } finally {
      setUnblocking(null);
    }
  };

  const handleAccept = async (request) => {
    if (!request?.id) return;
    setProcessing(request.id);
    try {
      await acceptFriendRequest(request.id);
      toast.success("Friend request accepted");
      removeNotification(friendRequestNotificationId(request.id));
      if (request.id === normalizedRequestId) {
        handleRequestModalChange(false);
      }
    } catch (err) {
      console.error("Failed to accept friend request:", err);
      toast.error(err.message || "Failed to accept friend request");
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (request) => {
    if (!request?.id) return;
    setProcessing(request.id);
    try {
      await declineFriendRequest(request.id);
      toast.success("Friend request declined");
      removeNotification(friendRequestNotificationId(request.id));
      if (request.id === normalizedRequestId) {
        handleRequestModalChange(false);
      }
    } catch (err) {
      console.error("Failed to decline friend request:", err);
      toast.error(err.message || "Failed to decline friend request");
    } finally {
      setProcessing(null);
    }
  };

  const handleRequestModalChange = (open) => {
    setRequestModalOpen(open);
    if (!open && requestId) {
      const params = new URLSearchParams(searchParams);
      params.delete("request");
      setSearchParams(params);
    }
  };

  const handleRemoveFriend = async () => {
    if (!removeFriendEmail) return;
    const requestIdToRemove = friendRequestMap.get(removeFriendEmail);
    if (!requestIdToRemove) {
      toast.error("Unable to remove friend. Please refresh and try again.");
      return;
    }
    setProcessing(requestIdToRemove);
    try {
      await removeFriend(requestIdToRemove);
      toast.success("Friend removed");
      if (removeFriendEmail) {
        setHiddenFriends((prev) => new Set([...prev, removeFriendEmail]));
      }
      setRemoveFriendOpen(false);
      setRemoveFriendEmail(null);
    } catch (err) {
      console.error("Failed to remove friend:", err);
      toast.error(err.message || "Failed to remove friend");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState message="Loading friends..." />
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-8 shadow-xl shadow-slate-200 dark:bg-slate-900 dark:shadow-slate-900/50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Friends & Groups</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage your friends and questing groups in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Back
        </button>
      </div>

      <div className="mt-6 flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 w-fit dark:border-slate-700 dark:bg-slate-800">
        <TabButton
          active={activeTab === "friends"}
          onClick={() => handleTabChange("friends")}
        >
          Friends
        </TabButton>
        <TabButton
          active={activeTab === "groups"}
          onClick={() => handleTabChange("groups")}
        >
          Questing Groups
        </TabButton>
      </div>

      {activeTab === "groups" && (
        <div className="mt-6">
          <QuestingGroupsTab friends={friends} />
        </div>
      )}

      {activeTab === "friends" && (
        <div className="mt-6 grid gap-6">
          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Your invite link
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Share this link to let someone instantly accept your friend request.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                value={inviteLink || "Generating link..."}
                readOnly
              />
              <button
                type="button"
                onClick={handleCopyInviteLink}
                disabled={!inviteLink}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Copy
              </button>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Add a friend
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Send a friend request by email, Discord username, or @username. They can accept after logging in.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="friend@example.com, discord_username, or @username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSendRequest();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendRequest}
                disabled={sending}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {sending ? "Sending..." : "Send request"}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Pending incoming requests
            </h3>
            {incomingRequests.length === 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No incoming friend requests.
              </p>
            )}
            {incomingRequests.length > 0 && (
              <div className="mt-3 space-y-2">
                {incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-3 text-xs ${
                      request.id === normalizedRequestId
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/10"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    }`}
                  >
                    <span className="text-slate-600 dark:text-slate-300">
                      <UserIdentity user={resolveProfile(request.fromEmail)} /> sent you a request
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAccept(request)}
                        disabled={processing === request.id}
                        className="flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecline(request)}
                        disabled={processing === request.id}
                        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <X className="h-3 w-3" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Pending outgoing requests
            </h3>
            {outgoingRequests.length === 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No outgoing friend requests.
              </p>
            )}
            {outgoingRequests.length > 0 && (
              <div className="mt-3 space-y-2">
                {outgoingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs dark:border-slate-700 dark:bg-slate-900/40"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      Waiting for <UserIdentity user={resolveProfile(request.toEmail)} /> to accept
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Your friends
            </h3>
            {visibleFriends.length === 0 && (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                No friends yet. Send a request to get started.
              </div>
            )}
            {visibleFriends.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {visibleFriends.map((friend) => (
                  <div
                    key={friend.email}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                      <UserAvatar email={friend.email} src={friend.avatar} size={32} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <UserIdentity user={friend} />
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveFriendEmail(friend.email);
                          setRemoveFriendOpen(true);
                        }}
                        className="rounded-full border border-red-200 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Blocked users
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Block people you don’t want to receive invites from. Use email, Discord username, or @username.
              Blocking removes any pending invites they sent you.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="email@example.com, discord_username, or @username"
                value={blockEmail}
                onChange={(event) => setBlockEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleBlockUser();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleBlockUser}
                disabled={blocking}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {blocking ? "Blocking..." : "Block"}
              </button>
            </div>
            {blockError && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-400">{blockError}</p>
            )}
            {!blockedLoading && blockedUsers.length === 0 && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No blocked users.
              </p>
            )}
            {blockedUsers.length > 0 && (
              <div className="mt-3 space-y-2">
                {blockedUsers.map((block) => {
                  const blockLabel = block.qsUsernameLower
                    ? `@${block.qsUsernameLower}`
                    : block.discordUsernameLower || block.email;
                  return (
                  <div
                    key={block.id || block.email}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {blockLabel}
                      </p>
                      {block.penalized && (
                        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          Penalty applied
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblockUser(blockLabel)}
                      disabled={unblocking === blockLabel}
                      className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {unblocking === blockLabel ? "Unblocking..." : "Unblock"}
                    </button>
                  </div>
                );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={requestModalOpen} onOpenChange={handleRequestModalChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Welcome to Quest Scheduler</DialogTitle>
            <DialogDescription>
              {highlightedRequest ? (
                <>
                  <UserIdentity user={resolveProfile(highlightedRequest.fromEmail)} /> sent you a
                  friend request.
                </>
              ) : outgoingMatch ? (
                <>
                  You're waiting on{" "}
                  <UserIdentity user={resolveProfile(outgoingMatch.toEmail)} /> to accept your
                  request.
                </>
              ) : (
                "This friend request is intended for another account or has already been handled."
              )}
            </DialogDescription>
          </DialogHeader>

          {highlightedRequest && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
              Accept to add them to your friends list. You can always remove friends later.
            </div>
          )}

          <DialogFooter className="mt-6">
            {highlightedRequest ? (
              <>
                <button
                  type="button"
                  onClick={() => handleDecline(highlightedRequest)}
                  disabled={processing === highlightedRequest.id}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => handleAccept(highlightedRequest)}
                  disabled={processing === highlightedRequest.id}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  Accept request
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleRequestModalChange(false)}
                className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
              >
                Got it
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeFriendOpen} onOpenChange={setRemoveFriendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove friend</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              {removeFriendEmail ? (
                <UserIdentity user={resolveProfile(removeFriendEmail)} />
              ) : (
                "this friend"
              )}{" "}
              from your friends list?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={() => setRemoveFriendOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveFriend}
              disabled={!removeFriendEmail || Boolean(processing)}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {processing ? "Removing..." : "Remove"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
