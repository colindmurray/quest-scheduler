import { useState } from "react";
import { toast } from "sonner";
import { Plus, Users, Check, X } from "lucide-react";
import { useQuestingGroups } from "../../../hooks/useQuestingGroups";
import { useUserProfiles } from "../../../hooks/useUserProfiles";
import { useNotifications } from "../../../hooks/useNotifications";
import { groupInviteNotificationId } from "../../../lib/data/notifications";
import { GroupCard } from "./GroupCard";
import { CreateGroupModal } from "./CreateGroupModal";
import { LoadingState } from "../../../components/ui/spinner";
import { UserIdentity } from "../../../components/UserIdentity";

export function QuestingGroupsTab({ friends = [] }) {
  const {
    groups,
    pendingInvites,
    loading,
    getGroupColor,
    setGroupColor,
    createGroup,
    updateGroup,
    inviteMember,
    acceptInvite,
    declineInvite,
    removeMember,
    revokeInvite,
    leave,
    deleteGroup,
    isOwner,
    canManage,
  } = useQuestingGroups();
  const { removeLocal: removeNotification } = useNotifications();
  const creatorEmails = (pendingInvites || [])
    .map((group) => group.creatorEmail)
    .filter(Boolean);
  const { enrichUsers } = useUserProfiles(creatorEmails);

  const [createOpen, setCreateOpen] = useState(false);
  const [processingInvite, setProcessingInvite] = useState(null);

  const handleAcceptInvite = async (groupId) => {
    setProcessingInvite(groupId);
    try {
      await acceptInvite(groupId);
      toast.success("You've joined the group!");
      removeNotification(groupInviteNotificationId(groupId));
    } catch (err) {
      console.error("Failed to accept invite:", err);
      toast.error(err.message || "Failed to accept invitation");
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (groupId) => {
    setProcessingInvite(groupId);
    try {
      await declineInvite(groupId);
      toast.success("Invitation declined");
      removeNotification(groupInviteNotificationId(groupId));
    } catch (err) {
      console.error("Failed to decline invite:", err);
      toast.error(err.message || "Failed to decline invitation");
    } finally {
      setProcessingInvite(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingState message="Loading groups..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Questing Groups
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create groups for your adventuring parties and use them when creating session polls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create group
        </button>
      </div>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Users className="h-4 w-4" />
            Pending Invitations
          </h4>
          <div className="mt-3 space-y-2">
            {pendingInvites.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 dark:bg-slate-800"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {group.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Invited by{" "}
                    <UserIdentity
                      user={enrichUsers([group.creatorEmail])[0] || { email: group.creatorEmail }}
                    />
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAcceptInvite(group.id)}
                    disabled={processingInvite === group.id}
                    className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineInvite(group.id)}
                    disabled={processingInvite === group.id}
                    className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  >
                    <X className="h-3 w-3" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Groups list */}
      {groups.length === 0 && pendingInvites.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
          <Users className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
            No questing groups yet
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create a group to organize your adventuring parties
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create your first group
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isOwner={isOwner(group)}
              canManage={canManage(group)}
              groupColor={getGroupColor(group.id)}
              onColorChange={setGroupColor}
              onInviteMember={inviteMember}
              onRemoveMember={removeMember}
              onRevokeInvite={revokeInvite}
              onLeaveGroup={leave}
              onDeleteGroup={deleteGroup}
              onUpdateGroup={updateGroup}
              friends={friends}
            />
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateGroup={createGroup}
      />
    </div>
  );
}
