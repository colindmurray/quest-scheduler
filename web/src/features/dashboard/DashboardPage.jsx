import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import { useAuth } from "../../app/useAuth";
import { useSchedulersByCreator, useSchedulersByGroupIds, useSchedulersByParticipant } from "../../hooks/useSchedulers";
import { useUserSettings } from "../../hooks/useUserSettings";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { usePollInvites } from "../../hooks/usePollInvites";
import { useNotifications } from "../../hooks/useNotifications";
import {
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "../../lib/data/notifications";
import { LoadingState } from "../../components/ui/spinner";
import { useUserProfiles, useUserProfilesByIds } from "../../hooks/useUserProfiles";
import { UserIdentity } from "../../components/UserIdentity";
import { useSchedulerAttendance } from "./hooks/useSchedulerAttendance";
import { normalizeEmail } from "../../lib/utils";
import { NextSessionCard } from "./components/NextSessionCard";
import { SessionCard } from "./components/SessionCard";
import { DashboardCalendar } from "./components/DashboardCalendar";
import { MobileAgendaView } from "./components/MobileAgendaView";
import { buildAttendanceSummary } from "./lib/attendance";
import { PastSessionsSection } from "./components/past-sessions-section";
import { SectionHeader } from "./components/section-header";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { archivedPolls, loading: settingsLoading } = useUserSettings();
  const { groups, getGroupColor } = useQuestingGroups();
  const normalizedUserEmail = normalizeEmail(user?.email) || "";
  const groupIds = useMemo(
    () => (groups || []).map((group) => group.id).filter(Boolean),
    [groups]
  );
  const { pendingInvites, loading: pendingInvitesLoading, acceptInvite, declineInvite } = usePollInvites();
  const { removeLocal: removeNotification } = useNotifications();
  const [pastSessionsTab, setPastSessionsTab] = useState("finalized");
  const [isMobile, setIsMobile] = useState(false);
  const {
    data: groupSchedulers,
    loading: groupPollsLoading,
    error: groupPollsError,
  } = useSchedulersByGroupIds(groupIds);
  const [pendingInviteHandledIds, setPendingInviteHandledIds] = useState(() => new Set());
  const [pendingInviteBusy, setPendingInviteBusy] = useState({});

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (groupPollsError) {
    console.error("Failed to load questing group polls:", groupPollsError);
  }

  const allParticipatingById = useSchedulersByParticipant(user?.uid || null);
  const mine = useSchedulersByCreator(user?.uid || null);
  const groupMembersById = useMemo(() => {
    const map = new Map();
    (groups || []).forEach((group) => {
      const members = (group.memberIds || []).filter(Boolean);
      map.set(group.id, members);
    });
    return map;
  }, [groups]);
  const participatingSchedulers = useMemo(() => {
    const deduped = new Map();
    [...allParticipatingById.data, ...groupSchedulers].forEach((scheduler) => {
      deduped.set(scheduler.id, scheduler);
    });
    return Array.from(deduped.values());
  }, [allParticipatingById.data, groupSchedulers]);
  const pendingInvitesFromSchedulers = useMemo(
    () =>
      participatingSchedulers.filter((scheduler) => {
        const pending = scheduler.pendingInvites || [];
        return pending.some((email) => normalizeEmail(email) === normalizedUserEmail);
      }),
    [participatingSchedulers, normalizedUserEmail]
  );
  const effectivePendingInvites =
    pendingInvites && pendingInvites.length > 0
      ? pendingInvites
      : pendingInvitesFromSchedulers;
  const pendingInviteIdSet = useMemo(
    () => new Set((effectivePendingInvites || []).map((invite) => invite.id)),
    [effectivePendingInvites]
  );
  const inviterEmails = useMemo(
    () =>
      (effectivePendingInvites || [])
        .map((invite) => {
          const meta = invite.pendingInviteMeta?.[normalizedUserEmail || ""] || {};
          return meta.invitedByEmail || invite.creatorEmail || null;
        })
        .filter(Boolean),
    [effectivePendingInvites, normalizedUserEmail]
  );
  const { enrichUsers } = useUserProfiles(inviterEmails);
  const inviterMap = useMemo(() => {
    const map = new Map();
    const enriched = enrichUsers(inviterEmails);
    enriched.forEach((entry) => {
      if (entry?.email) {
        map.set(normalizeEmail(entry.email), entry);
      }
    });
    return map;
  }, [enrichUsers, inviterEmails]);
  const visiblePendingInvites = useMemo(() => {
    return (effectivePendingInvites || []).filter(
      (invite) => !pendingInviteHandledIds.has(invite.id)
    );
  }, [effectivePendingInvites, pendingInviteHandledIds]);
  const activeSchedulers = useMemo(
    () =>
      participatingSchedulers.filter(
        (scheduler) => !pendingInviteIdSet.has(scheduler.id)
      ),
    [participatingSchedulers, pendingInviteIdSet]
  );
  const allParticipantIds = useMemo(() => {
    const ids = new Set();
    activeSchedulers.forEach((scheduler) => {
      (scheduler.participantIds || []).forEach((id) => {
        if (id) ids.add(id);
      });
      if (scheduler.questingGroupId) {
        const groupMembers = groupMembersById.get(scheduler.questingGroupId) || [];
        groupMembers.forEach((id) => {
          if (id) ids.add(id);
        });
      }
    });
    return Array.from(ids);
  }, [activeSchedulers, groupMembersById]);
  const { profiles: participantProfilesById } = useUserProfilesByIds(allParticipantIds);

  const { slotsByScheduler, votesByScheduler, votersByScheduler } =
    useSchedulerAttendance(activeSchedulers);

  // Enrich schedulers with slot data and voters
  const enrichedSchedulers = useMemo(() => {
    return activeSchedulers.map((scheduler) => {
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

      const voters = (votersByScheduler[scheduler.id] || []).map((voter) => ({
        ...voter,
        email: voter.email ? normalizeEmail(voter.email) : voter.email,
      }));
      const groupMemberIds = scheduler.questingGroupId
        ? groupMembersById.get(scheduler.questingGroupId) || []
        : [];
      const participantIds = Array.from(
        new Set(
          [...(scheduler.participantIds || []), ...groupMemberIds].filter(Boolean)
        )
      );
      const participantProfiles = participantIds
        .map((id) => participantProfilesById[id])
        .filter(Boolean);
      const participantEmails = Array.from(
        new Set(
          participantProfiles
            .map((profile) => normalizeEmail(profile.email))
            .filter(Boolean)
        )
      );
      const participantEmailById = new Map(
        participantProfiles
          .filter((profile) => profile?.email)
          .map((profile) => [profile.id, normalizeEmail(profile.email)])
      );
      const respondedIds = voteDocs.map((voteDoc) => voteDoc.id).filter(Boolean);
      const respondedSet = new Set(respondedIds);
      const { confirmed, unavailable } = buildAttendanceSummary({
        status: scheduler.status,
        winningSlotId: scheduler.winningSlotId,
        voteDocs,
        participantEmailById,
      });
      const unresponded = participantIds
        .filter((id) => !respondedSet.has(id))
        .map((id) => participantEmailById.get(id))
        .filter(Boolean);

      return {
        ...scheduler,
        effectiveParticipants: participantEmails,
        winningSlot,
        slots,
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
  }, [
    activeSchedulers,
    slotsByScheduler,
    votesByScheduler,
    votersByScheduler,
    groupMembersById,
    participantProfilesById,
  ]);

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

  const cancelledSessions = useMemo(() => {
    return enrichedSchedulers.filter(
      (s) => s.status === "CANCELLED" && !archivedPolls.includes(s.id)
    );
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
    if (!user?.uid) return new Set();
    return new Set(
      upcomingOpen
        .filter((s) => {
          const voters = s.voters || [];
          const hasVoted = voters.some((v) => v.id === user.uid);
          return !hasVoted;
        })
        .map((s) => s.id)
    );
  }, [upcomingOpen, user?.uid]);

  // All sessions for calendar view
  const calendarSessions = useMemo(() => {
    return [...upcomingFinalized, ...pastFinalized];
  }, [upcomingFinalized, pastFinalized]);

  // Sessions for mobile agenda view (includes open polls)
  const mobileAgendaSessions = useMemo(() => {
    return [...upcomingOpen, ...upcomingFinalized];
  }, [upcomingOpen, upcomingFinalized]);

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

  const isLoading =
    allParticipatingById.loading ||
    groupPollsLoading ||
    mine.loading ||
    settingsLoading ||
    pendingInvitesLoading;
  const handleOpenInvite = (inviteId) => {
    const target = `/scheduler/${inviteId}`;
    navigate(target);
    setTimeout(() => {
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }, 50);
  };

  const markPendingInviteHandled = (inviteId) => {
    setPendingInviteHandledIds((prev) => {
      const next = new Set(prev);
      next.add(inviteId);
      return next;
    });
  };

  const setInviteBusy = (inviteId, isBusy) => {
    setPendingInviteBusy((prev) => ({
      ...prev,
      [inviteId]: isBusy,
    }));
  };

  const handleDeclineInvite = async (invite) => {
    if (!invite) return;
    setInviteBusy(invite.id, true);
    try {
      await declineInvite(invite.id);
      [
        pollInviteNotificationId(invite.id, user?.email),
        pollInviteLegacyNotificationId(invite.id),
      ]
        .filter(Boolean)
        .forEach((id) => removeNotification(id));
      markPendingInviteHandled(invite.id);
    } catch (err) {
      console.error("Failed to decline poll invite:", err);
    } finally {
      setInviteBusy(invite.id, false);
    }
  };

  const handleAcceptInvite = async (invite) => {
    if (!invite) return;
    setInviteBusy(invite.id, true);
    try {
      await acceptInvite(invite.id);
      [
        pollInviteNotificationId(invite.id, user?.email),
        pollInviteLegacyNotificationId(invite.id),
      ]
        .filter(Boolean)
        .forEach((id) => removeNotification(id));
      markPendingInviteHandled(invite.id);
    } catch (err) {
      console.error("Failed to accept poll invite:", err);
    } finally {
      setInviteBusy(invite.id, false);
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
          participants={nextSession.effectiveParticipants || []}
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
                  sessions={mobileAgendaSessions}
                  getGroupColor={getGroupColor}
                  needsVote={needsVote}
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
            {(upcomingOpen.length > 0 || upcomingFinalized.length > 0) && (
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
                      slots={scheduler.slots}
                      conflictsWith={conflictMap.get(scheduler.id) || []}
                      attendanceSummary={scheduler.attendanceSummary}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                            : null
                        }
                        participants={scheduler.effectiveParticipants || []}
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
                      slots={scheduler.slots}
                      attendanceSummary={scheduler.attendanceSummary}
                      groupColor={
                        scheduler.questingGroupId
                          ? getGroupColor(scheduler.questingGroupId)
                          : null
                      }
                      participants={scheduler.effectiveParticipants || []}
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
          {visiblePendingInvites.length > 0 && (
            <section className="rounded-3xl bg-white p-6 shadow-xl shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-900/50">
              <SectionHeader
                title="Pending poll invites"
                subtitle="Session polls waiting for your response"
              />
              <div className="mt-4 space-y-2">
                {visiblePendingInvites.map((invite) => {
                  const meta = invite.pendingInviteMeta?.[normalizedUserEmail] || {};
                  const inviterEmail = meta.invitedByEmail || invite.creatorEmail || null;
                  const inviterProfile = inviterEmail
                    ? inviterMap.get(normalizeEmail(inviterEmail)) || { email: inviterEmail }
                    : null;
                  const isBusy = Boolean(pendingInviteBusy[invite.id]);
                  return (
                    <div
                      key={invite.id}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200 dark:hover:bg-amber-900/40"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenInvite(invite.id)}
                        className="flex flex-1 flex-col text-left"
                      >
                        <p className="text-sm font-semibold">{invite.title || "Session Poll"}</p>
                        <p className="mt-1 text-xs text-amber-700/90 dark:text-amber-200/80">
                          Invited by{" "}
                          {inviterProfile ? (
                            <UserIdentity user={inviterProfile} />
                          ) : (
                            "Unknown"
                          )}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-800/60 dark:text-amber-200">
                          Review
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Accept invite"
                            onClick={() => handleAcceptInvite(invite)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Decline invite"
                            onClick={() => handleDeclineInvite(invite)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
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
                    winningSlot={enriched?.winningSlot}
                    slots={enriched?.slots || []}
                    groupColor={
                      scheduler.questingGroupId
                        ? getGroupColor(scheduler.questingGroupId)
                        : null
                    }
                    attendanceSummary={enriched?.attendanceSummary}
                    participants={enriched?.effectiveParticipants || []}
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

          <PastSessionsSection
            pastSessionsTab={pastSessionsTab}
            onTabChange={setPastSessionsTab}
            pastFinalized={pastFinalized}
            cancelledSessions={cancelledSessions}
            archivedSessions={archivedSessions}
            getGroupColor={getGroupColor}
            groupsById={groupsById}
          />
        </div>
      </div>

    </div>
  );
}
