import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Archive } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { db } from "../../lib/firebase";
import { useFirestoreCollection } from "../../hooks/useFirestoreCollection";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { usePollInvites } from "../../hooks/usePollInvites";
import { useNotifications } from "../../hooks/useNotifications";
import { pollInviteNotificationId } from "../../lib/data/notifications";
import { LoadingState } from "../../components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { NextSessionCard } from "./components/NextSessionCard";
import { SessionCard } from "./components/SessionCard";
import { DashboardCalendar } from "./components/DashboardCalendar";
import { MobileAgendaView } from "./components/MobileAgendaView";

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { archivedPolls, loading: settingsLoading } = useUserSettings();
  const { groups, getGroupColor } = useQuestingGroups();
  const groupIds = useMemo(
    () => (groups || []).map((group) => group.id).filter(Boolean),
    [groups]
  );
  const groupIdsKey = useMemo(() => groupIds.slice().sort().join("|"), [groupIds]);
  const { pendingInvites, loading: pendingInvitesLoading, acceptInvite, declineInvite } = usePollInvites();
  const { removeLocal: removeNotification } = useNotifications();
  const [pastSessionsTab, setPastSessionsTab] = useState("finalized");
  const [isMobile, setIsMobile] = useState(false);
  const [slotsByScheduler, setSlotsByScheduler] = useState({});
  const [votesByScheduler, setVotesByScheduler] = useState({});
  const [votersByScheduler, setVotersByScheduler] = useState({});
  const [groupSchedulers, setGroupSchedulers] = useState([]);
  const [groupPollsLoading, setGroupPollsLoading] = useState(false);
  const [pendingInviteOpen, setPendingInviteOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!groupIds.length) {
      setGroupSchedulers([]);
      setGroupPollsLoading(false);
      return undefined;
    }

    const chunks = chunkArray(groupIds, 10);
    const byChunk = new Map();
    const loadedChunks = new Set();
    setGroupPollsLoading(true);

    const unsubscribes = chunks.map((chunk, index) => {
      const q = query(
        collection(db, "schedulers"),
        where("questingGroupId", "in", chunk)
      );
      return onSnapshot(
        q,
        (snapshot) => {
          byChunk.set(
            index,
            snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          );
          loadedChunks.add(index);
          const merged = Array.from(byChunk.values()).flat();
          const deduped = new Map();
          merged.forEach((doc) => {
            deduped.set(doc.id, doc);
          });
          setGroupSchedulers(Array.from(deduped.values()));
          if (loadedChunks.size === chunks.length) {
            setGroupPollsLoading(false);
          }
        },
        (err) => {
          console.error("Failed to load questing group polls:", err);
          loadedChunks.add(index);
          if (loadedChunks.size === chunks.length) {
            setGroupPollsLoading(false);
          }
        }
      );
    });

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [groupIdsKey]);

  // Query for all polls user participates in
  const allParticipatingQuery = useMemo(() => {
    if (!user?.email) return null;
    return query(
      collection(db, "schedulers"),
      where("participants", "array-contains", user.email)
    );
  }, [user?.email]);

  const allParticipatingIdsQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, "schedulers"),
      where("participantIds", "array-contains", user.uid)
    );
  }, [user?.uid]);

  // Query for polls user created
  const myQuery = useMemo(() => {
    if (!user?.uid) return null;
    return query(collection(db, "schedulers"), where("creatorId", "==", user.uid));
  }, [user?.uid]);

  const allParticipating = useFirestoreCollection(allParticipatingQuery);
  const allParticipatingById = useFirestoreCollection(allParticipatingIdsQuery);
  const mine = useFirestoreCollection(myQuery);
  const groupMembersById = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((group) => {
      const members = (group.members || [])
        .filter(Boolean)
        .map((email) => email.toLowerCase());
      map.set(group.id, members);
    });
    return map;
  }, [groups]);
  const participatingSchedulers = useMemo(() => {
    const deduped = new Map();
    [...allParticipating.data, ...allParticipatingById.data, ...groupSchedulers].forEach((scheduler) => {
      deduped.set(scheduler.id, scheduler);
    });
    return Array.from(deduped.values());
  }, [allParticipating.data, allParticipatingById.data, groupSchedulers]);

  // Fetch slots and votes for all schedulers to get winning slots and vote counts
  useEffect(() => {
    if (!participatingSchedulers.length) return;

    const fetchSlotsAndVotes = async () => {
      const slotsMap = {};
      const votesMap = {};
      const votersMap = {};

      await Promise.all(
        participatingSchedulers.map(async (scheduler) => {
          try {
            // Fetch slots
            const slotsSnap = await getDocs(
              collection(db, "schedulers", scheduler.id, "slots")
            );
            const slots = slotsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            slotsMap[scheduler.id] = slots;

            // Fetch votes - store voter emails and avatars
            const votesSnap = await getDocs(
              collection(db, "schedulers", scheduler.id, "votes")
            );
            const voteDocs = votesSnap.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            votesMap[scheduler.id] = voteDocs;
            votersMap[scheduler.id] = voteDocs
              .map((voteDoc) => ({
                email: voteDoc.userEmail,
                avatar: voteDoc.userAvatar,
              }))
              .filter((v) => v.email);
          } catch (err) {
            console.error(`Failed to fetch data for scheduler ${scheduler.id}:`, err);
          }
        })
      );

      setSlotsByScheduler(slotsMap);
      setVotesByScheduler(votesMap);
      setVotersByScheduler(votersMap);
    };

    fetchSlotsAndVotes();
  }, [participatingSchedulers]);

  // Enrich schedulers with slot data and voters
  const enrichedSchedulers = useMemo(() => {
    return participatingSchedulers.map((scheduler) => {
      const slots = slotsByScheduler[scheduler.id] || [];
      const voteDocs = votesByScheduler[scheduler.id] || [];
      const winningSlot = scheduler.winningSlotId
        ? slots.find((s) => s.id === scheduler.winningSlotId)
        : null;

      // Get the first future slot for open polls
      const now = new Date();
      const futureSlots = slots
        .filter((s) => s.start && new Date(s.start) > now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));

      const voters = votersByScheduler[scheduler.id] || [];
      const groupMemberEmails = scheduler.questingGroupId
        ? groupMembersById.get(scheduler.questingGroupId) || []
        : [];
      const participantEmails = Array.from(
        new Set(
          [
            ...(scheduler.participants || []),
            ...groupMemberEmails,
          ]
            .map((email) => email?.toLowerCase())
            .filter(Boolean)
        )
      );
      const respondedEmails = voteDocs
        .map((voteDoc) => voteDoc.userEmail?.toLowerCase())
        .filter(Boolean);
      const respondedSet = new Set(respondedEmails);
      const confirmed = [];
      const unavailable = [];
      if (scheduler.status === "FINALIZED" && scheduler.winningSlotId) {
        voteDocs.forEach((voteDoc) => {
          const email = voteDoc.userEmail?.toLowerCase();
          if (!email) return;
          if (voteDoc.noTimesWork) {
            unavailable.push(email);
            return;
          }
          const voteValue = voteDoc.votes?.[scheduler.winningSlotId];
          if (voteValue === "PREFERRED" || voteValue === "FEASIBLE") {
            confirmed.push(email);
          } else {
            unavailable.push(email);
          }
        });
      }
      const unresponded = participantEmails.filter((email) => !respondedSet.has(email));

      return {
        ...scheduler,
        effectiveParticipants: participantEmails,
        winningSlot,
        firstSlot: futureSlots[0] || null,
        votedCount: voteDocs.length,
        voters,
        attendanceSummary: {
          confirmed,
          unavailable,
          unresponded,
        },
      };
    });
  }, [participatingSchedulers, slotsByScheduler, votesByScheduler, votersByScheduler, groupMembersById]);

  // Filter into categories
  const upcomingOpen = useMemo(() => {
    return enrichedSchedulers.filter(
      (s) => s.status === "OPEN" && !archivedPolls.includes(s.id)
    );
  }, [enrichedSchedulers, archivedPolls]);

  const upcomingFinalized = useMemo(() => {
    const now = new Date();
    return enrichedSchedulers.filter((s) => {
      if (s.status !== "FINALIZED" || archivedPolls.includes(s.id)) return false;
      if (!s.winningSlot?.start) return false;
      return new Date(s.winningSlot.start) > now;
    });
  }, [enrichedSchedulers, archivedPolls]);

  const pastFinalized = useMemo(() => {
    const now = new Date();
    return enrichedSchedulers.filter((s) => {
      if (s.status !== "FINALIZED" || archivedPolls.includes(s.id)) return false;
      if (!s.winningSlot?.start) return true; // No date = past
      return new Date(s.winningSlot.start) <= now;
    });
  }, [enrichedSchedulers, archivedPolls]);

  const archivedSessions = useMemo(() => {
    return enrichedSchedulers.filter((s) => archivedPolls.includes(s.id));
  }, [enrichedSchedulers, archivedPolls]);

  const mySessions = useMemo(() => {
    return mine.data.filter((s) => !archivedPolls.includes(s.id));
  }, [mine.data, archivedPolls]);

  // Find the next upcoming finalized session
  const nextSession = useMemo(() => {
    const sorted = [...upcomingFinalized].sort((a, b) => {
      const aDate = a.winningSlot?.start ? new Date(a.winningSlot.start) : new Date(9999, 0);
      const bDate = b.winningSlot?.start ? new Date(b.winningSlot.start) : new Date(9999, 0);
      return aDate - bDate;
    });
    return sorted[0] || null;
  }, [upcomingFinalized]);

  // Sessions that need user's vote - check if user has actually voted
  const needsVote = useMemo(() => {
    if (!user?.email) return new Set();
    const userEmailLower = user.email.toLowerCase();
    return new Set(
      upcomingOpen
        .filter((s) => {
          const voters = s.voters || [];
          const hasVoted = voters.some(
            (v) => v.email?.toLowerCase() === userEmailLower
          );
          return !hasVoted;
        })
        .map((s) => s.id)
    );
  }, [upcomingOpen, user?.email]);

  // All sessions for calendar view
  const calendarSessions = useMemo(() => {
    return [...upcomingFinalized, ...pastFinalized];
  }, [upcomingFinalized, pastFinalized]);

  // Detect conflicts between finalized sessions
  const conflictMap = useMemo(() => {
    const conflicts = new Map();
    const finalizedWithDates = upcomingFinalized.filter((s) => s.winningSlot?.start && s.winningSlot?.end);

    for (let i = 0; i < finalizedWithDates.length; i++) {
      for (let j = i + 1; j < finalizedWithDates.length; j++) {
        const a = finalizedWithDates[i];
        const b = finalizedWithDates[j];
        const aStart = new Date(a.winningSlot.start);
        const aEnd = new Date(a.winningSlot.end);
        const bStart = new Date(b.winningSlot.start);
        const bEnd = new Date(b.winningSlot.end);

        // Check if they overlap
        if (aStart < bEnd && bStart < aEnd) {
          if (!conflicts.has(a.id)) conflicts.set(a.id, []);
          if (!conflicts.has(b.id)) conflicts.set(b.id, []);
          conflicts.get(a.id).push(b.title || "Untitled");
          conflicts.get(b.id).push(a.title || "Untitled");
        }
      }
    }
    return conflicts;
  }, [upcomingFinalized]);

  // Create a lookup map for groups by ID
  const groupsById = useMemo(() => {
    const map = {};
    (groups || []).forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [groups]);

  const isLoading = allParticipating.loading || groupPollsLoading || mine.loading || settingsLoading || pendingInvitesLoading;
  const normalizedEmail = user?.email?.toLowerCase() || "";

  const handleOpenInvite = (invite) => {
    setSelectedInvite(invite);
    setPendingInviteOpen(true);
  };

  const handleDeclineInvite = async () => {
    if (!selectedInvite) return;
    try {
      await declineInvite(selectedInvite.id);
      removeNotification(pollInviteNotificationId(selectedInvite.id));
    } catch (err) {
      console.error("Failed to decline poll invite:", err);
    } finally {
      setPendingInviteOpen(false);
      setSelectedInvite(null);
    }
  };

  const handleAcceptInvite = async () => {
    if (!selectedInvite) return;
    try {
      await acceptInvite(selectedInvite.id);
      removeNotification(pollInviteNotificationId(selectedInvite.id));
      setPendingInviteOpen(false);
      setSelectedInvite(null);
      window.location.assign(`/scheduler/${selectedInvite.id}`);
    } catch (err) {
      console.error("Failed to accept poll invite:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <LoadingState message="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Next Session Highlight */}
      {nextSession && (
        <NextSessionCard
          scheduler={nextSession}
          winningSlot={nextSession.winningSlot}
          groupColor={
            nextSession.questingGroupId
              ? getGroupColor(nextSession.questingGroupId)
              : null
          }
          participants={nextSession.effectiveParticipants || nextSession.participants || []}
        />
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar / Upcoming Sessions - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Calendar Section */}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader
              title="Upcoming Sessions"
              subtitle="Session polls and finalized sessions"
            />

            <div className="mt-4">
              {isMobile ? (
                <MobileAgendaView
                  sessions={calendarSessions}
                  getGroupColor={getGroupColor}
                />
              ) : (
                <DashboardCalendar
                  sessions={calendarSessions}
                  getGroupColor={getGroupColor}
                  height={400}
                />
              )}
            </div>

            {/* Session List Below Calendar */}
            {!isMobile && (upcomingOpen.length > 0 || upcomingFinalized.length > 0) && (
              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Finalized Sessions
                  </p>
                  {upcomingFinalized.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No finalized sessions yet.
                    </p>
                  )}
                  {upcomingFinalized.map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      winningSlot={scheduler.winningSlot}
                      conflictsWith={conflictMap.get(scheduler.id) || []}
                        attendanceSummary={scheduler.attendanceSummary}
                        groupColor={
                          scheduler.questingGroupId
                            ? getGroupColor(scheduler.questingGroupId)
                            : null
                        }
                        participants={scheduler.effectiveParticipants || scheduler.participants || []}
                        voters={scheduler.voters || []}
                        questingGroup={
                          scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                        }
                      />
                    ))}
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Pending Sessions
                  </p>
                  {upcomingOpen.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No pending session polls right now.
                    </p>
                  )}
                  {upcomingOpen.map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      showVoteNeeded={needsVote.has(scheduler.id)}
                      attendanceSummary={scheduler.attendanceSummary}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                          : null
                      }
                      participants={scheduler.effectiveParticipants || scheduler.participants || []}
                      voters={scheduler.voters || []}
                      votedCount={scheduler.votedCount}
                      questingGroup={
                        scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {upcomingOpen.length === 0 && upcomingFinalized.length === 0 && (
              <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                No upcoming sessions. Create a new poll to get started!
              </div>
            )}
          </section>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {pendingInvites.length > 0 && (
            <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
              <SectionHeader
                title="Pending poll invites"
                subtitle="Session polls waiting for your response"
              />
              <div className="mt-4 space-y-2">
                {pendingInvites.map((invite) => {
                  const meta = invite.pendingInviteMeta?.[normalizedEmail] || {};
                  return (
                    <button
                      key={invite.id}
                      type="button"
                      onClick={() => handleOpenInvite(invite)}
                      className="flex w-full items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      <div>
                        <p className="text-sm font-semibold">{invite.title || "Session Poll"}</p>
                        <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-200/80">
                          Invited by {meta.invitedByEmail || invite.creatorEmail || "Unknown"}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-800/60 dark:text-amber-200">
                        Review
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {/* My Session Polls */}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader
              title="My Session Polls"
              subtitle="Polls you created"
              action={
                <Link
                  to="/create"
                  className="flex items-center gap-1 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
                >
                  <Plus className="h-3 w-3" />
                  New poll
                </Link>
              }
            />

            <div className="mt-4 space-y-2">
              {mySessions.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You haven't created any polls yet.
                </p>
              )}
              {mySessions.slice(0, 5).map((scheduler) => {
                // Find enriched version if available
                const enriched = enrichedSchedulers.find((s) => s.id === scheduler.id);
                return (
                  <SessionCard
                    key={scheduler.id}
                    scheduler={scheduler}
                    groupColor={
                      scheduler.questingGroupId
                        ? getGroupColor(scheduler.questingGroupId)
                        : null
                    }
                    attendanceSummary={enriched?.attendanceSummary}
                    participants={enriched?.effectiveParticipants || scheduler.participants || []}
                    voters={enriched?.voters || []}
                    questingGroup={scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null}
                  />
                );
              })}
              {mySessions.length > 5 && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  +{mySessions.length - 5} more
                </p>
              )}
            </div>
          </section>

          {/* Past Sessions */}
          <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
            <SectionHeader title="Past Sessions" subtitle="Finalized and archived" />

            {/* Tabs */}
            <div className="mt-3 flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 w-fit dark:border-slate-600 dark:bg-slate-700">
              <TabButton
                active={pastSessionsTab === "finalized"}
                onClick={() => setPastSessionsTab("finalized")}
              >
                Finalized
              </TabButton>
              <TabButton
                active={pastSessionsTab === "archived"}
                onClick={() => setPastSessionsTab("archived")}
              >
                <span className="flex items-center gap-1">
                  <Archive className="h-3 w-3" />
                  Archived ({archivedSessions.length})
                </span>
              </TabButton>
            </div>

            <div className="mt-4 space-y-2">
              {pastSessionsTab === "finalized" && (
                <>
                  {pastFinalized.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No past sessions yet.
                    </p>
                  )}
                  {pastFinalized.slice(0, 5).map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      winningSlot={scheduler.winningSlot}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                          : null
                      }
                      attendanceSummary={scheduler.attendanceSummary}
                      participants={scheduler.effectiveParticipants || scheduler.participants || []}
                      voters={scheduler.voters || []}
                      questingGroup={scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null}
                    />
                  ))}
                </>
              )}

              {pastSessionsTab === "archived" && (
                <>
                  {archivedSessions.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No archived polls. Archive polls from the poll page.
                    </p>
                  )}
                  {archivedSessions.slice(0, 5).map((scheduler) => (
                    <SessionCard
                      key={scheduler.id}
                      scheduler={scheduler}
                      isArchived
                      winningSlot={scheduler.winningSlot}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                          : null
                      }
                      attendanceSummary={scheduler.attendanceSummary}
                      participants={scheduler.effectiveParticipants || scheduler.participants || []}
                      voters={scheduler.voters || []}
                      questingGroup={scheduler.questingGroupId ? groupsById[scheduler.questingGroupId] : null}
                    />
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={pendingInviteOpen} onOpenChange={setPendingInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session poll invite</DialogTitle>
            <DialogDescription>
              {selectedInvite
                ? `You've been invited to join "${selectedInvite.title || "Session Poll"}".`
                : "Review your pending invite."}
            </DialogDescription>
          </DialogHeader>
          {selectedInvite && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200">
              Invited by{" "}
              {selectedInvite.pendingInviteMeta?.[normalizedEmail]?.invitedByEmail ||
                selectedInvite.creatorEmail ||
                "Unknown"}
            </div>
          )}
          <DialogFooter className="mt-6">
            <button
              type="button"
              onClick={handleDeclineInvite}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAcceptInvite}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Accept &amp; view poll
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
