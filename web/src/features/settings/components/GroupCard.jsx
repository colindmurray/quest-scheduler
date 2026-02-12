import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Users, Settings, UserPlus, LogOut, Trash2, Crown } from "lucide-react";
import { GroupColorPicker } from "./GroupColorPicker";
import { InviteMemberModal } from "./InviteMemberModal";
import { AvatarBubble, AvatarStack } from "../../../components/ui/voter-avatars";
import { buildColorMap } from "../../../components/ui/voter-avatar-utils";
import { useUserProfiles } from "../../../hooks/useUserProfiles";
import { generateDiscordLinkCode, fetchDiscordGuildRoles } from "../../../lib/data/discord";
import { UserIdentity } from "../../../components/UserIdentity";
import {
  SimpleModal,
  SimpleModalDescription,
  SimpleModalFooter,
  SimpleModalHeader,
  SimpleModalTitle,
} from "../../../components/ui/simple-modal";

const toggleBaseClasses =
  "peer inline-flex h-5 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-slate-500 dark:focus-visible:ring-offset-slate-950";
const toggleThumbClasses =
  "pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-slate-100";

function SimpleToggle({ checked, onCheckedChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`${toggleBaseClasses} ${checked ? "bg-brand-accent" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      <span
        className={`${toggleThumbClasses} ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

const DEFAULT_DISCORD_ALERTS = {
  finalizationEvents: true,
  slotChanges: true,
  voteSubmitted: false,
  allVotesIn: false,
};

export function GroupCard({
  group,
  isOwner,
  canManage,
  groupColor,
  onColorChange,
  onInviteMember,
  onRemoveMember,
  onLeaveGroup,
  onDeleteGroup,
  onUpdateGroup,
  onRevokeInvite,
  friends = [],
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [saving, setSaving] = useState(false);
  const [revokeInviteEmail, setRevokeInviteEmail] = useState(null);
  const [revokeInviteOpen, setRevokeInviteOpen] = useState(false);
  const [discordLinking, setDiscordLinking] = useState(false);
  const [discordCode, setDiscordCode] = useState(null);
  const [discordCodeExpiresAt, setDiscordCodeExpiresAt] = useState(null);
  const [discordRoles, setDiscordRoles] = useState(null);
  const [discordRolesLoading, setDiscordRolesLoading] = useState(false);
  const [discordNotifyRoleId, setDiscordNotifyRoleId] = useState(null);
  const [discordAlertSaving, setDiscordAlertSaving] = useState(false);

  const members = useMemo(() => group.members || [], [group.members]);
  const pendingInvites = useMemo(() => group.pendingInvites || [], [group.pendingInvites]);
  const profileEmails = useMemo(
    () => Array.from(new Set([...members, ...pendingInvites].filter(Boolean))),
    [members, pendingInvites]
  );
  const colorMap = buildColorMap(members);
  const { enrichUsers } = useUserProfiles(profileEmails);
  const enrichedMembers = enrichUsers(members);
  const pendingInviteUsers = enrichUsers(pendingInvites);
  const memberToRemoveProfile = useMemo(
    () => enrichedMembers.find((member) => member.email === memberToRemove),
    [enrichedMembers, memberToRemove]
  );

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setSaving(true);
    try {
      await onRemoveMember(group.id, group.name, memberToRemove, true);
      setRemoveMemberOpen(false);
      setMemberToRemove(null);
      toast.success("Member removed from group and associated polls");
    } catch (err) {
      console.error("Failed to remove member:", err);
      toast.error(err.message || "Failed to remove member");
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    setSaving(true);
    try {
      await onLeaveGroup(group.id);
      setLeaveOpen(false);
      toast.success("You have left the group");
    } catch (err) {
      console.error("Failed to leave group:", err);
      toast.error(err.message || "Failed to leave group");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvite = async () => {
    if (!revokeInviteEmail) return;
    setSaving(true);
    try {
      await onRevokeInvite(group.id, revokeInviteEmail);
      setRevokeInviteOpen(false);
      setRevokeInviteEmail(null);
      toast.success("Invite removed");
    } catch (err) {
      console.error("Failed to revoke invite:", err);
      toast.error(err.message || "Failed to remove invite");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDeleteGroup(group.id);
      setDeleteOpen(false);
      toast.success("Group deleted");
    } catch (err) {
      console.error("Failed to delete group:", err);
      toast.error(err.message || "Failed to delete group");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDiscordCode = async () => {
    setDiscordLinking(true);
    try {
      const response = await generateDiscordLinkCode(group.id);
      setDiscordCode(response?.code || null);
      setDiscordCodeExpiresAt(response?.expiresAt || null);
      toast.success("Discord link code generated");
    } catch (err) {
      console.error("Failed to generate Discord link code:", err);
      toast.error(err?.message || "Failed to generate Discord link code");
    } finally {
      setDiscordLinking(false);
    }
  };

  const handleToggleMemberManaged = async (value) => {
    try {
      await onUpdateGroup(group.id, { memberManaged: value });
      toast.success(value ? "Group is now member-managed" : "Group is now owner-managed");
    } catch (err) {
      console.error("Failed to update group:", err);
      toast.error(err.message || "Failed to update group settings");
    }
  };

  const notifyRoleName = discordRoles?.find(
    (role) => role.id === (discordNotifyRoleId || group.discord?.notifyRoleId || "everyone")
  )?.name;
  const discordAlertSettings = {
    ...DEFAULT_DISCORD_ALERTS,
    ...(group.discord?.notifications || {}),
  };

  const handleNotifyRoleChange = async (roleId) => {
    setDiscordNotifyRoleId(roleId);
    try {
      await onUpdateGroup(group.id, {
        "discord.notifyRoleId": roleId,
      });
      toast.success("Discord notification role updated");
    } catch (err) {
      console.error("Failed to update Discord notification role:", err);
      toast.error(err.message || "Failed to update Discord notification role");
    }
  };

  const handleDiscordAlertChange = async (key, value) => {
    setDiscordAlertSaving(true);
    try {
      await onUpdateGroup(group.id, {
        [`discord.notifications.${key}`]: value,
      });
      toast.success("Discord alert settings updated");
    } catch (err) {
      console.error("Failed to update Discord alert settings:", err);
      toast.error(err.message || "Failed to update Discord alert settings");
    } finally {
      setDiscordAlertSaving(false);
    }
  };

  const loadDiscordRoles = useCallback(async () => {
    if (!group.discord?.guildId) return;
    setDiscordRolesLoading(true);
    try {
      const response = await fetchDiscordGuildRoles(group.id);
      const roles = response?.roles || [];
      setDiscordRoles(roles);
      setDiscordNotifyRoleId(response?.notifyRoleId || group.discord?.notifyRoleId || "everyone");
    } catch (err) {
      console.error("Failed to fetch Discord roles:", err);
      setDiscordRoles(null);
    } finally {
      setDiscordRolesLoading(false);
    }
  }, [group.discord?.guildId, group.discord?.notifyRoleId, group.id]);

  useEffect(() => {
    if (!settingsOpen) return;
    if (!canManage || !group.discord?.guildId) return;
    loadDiscordRoles();
  }, [settingsOpen, canManage, group.discord?.guildId, loadDiscordRoles]);

  return (
    <>
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: groupColor }}
            >
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  {group.name}
                </h4>
                {isOwner && (
                  <Crown className="h-4 w-4 text-amber-500" title="You own this group" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {members.length} member{members.length !== 1 ? "s" : ""} ·{" "}
                {group.memberManaged ? "Member-managed" : "Owner-managed"}
              </p>
            </div>
          </div>

          <AvatarStack
            users={enrichedMembers}
            max={4}
            size={24}
            colorMap={colorMap}
          />
        </div>

        {/* Member list */}
        <div className="mt-3 flex flex-wrap gap-2">
          {enrichedMembers.map((member) => (
            <div
              key={member.email}
              className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <AvatarBubble user={member} size={18} colorMap={colorMap} />
              <span className="text-slate-600 dark:text-slate-300">
                <UserIdentity user={member} showIdentifier={false} />
              </span>
              {canManage && member.email !== group.creatorEmail && (
                <button
                  type="button"
                  onClick={() => {
                    setMemberToRemove(member.email);
                    setRemoveMemberOpen(true);
                  }}
                  className="ml-1 hidden text-red-500 hover:text-red-600 group-hover:inline-block"
                  title="Remove member"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          {pendingInviteUsers.map((invitee) => (
            <div
              key={invitee.email}
              className="group flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs dark:border-amber-700 dark:bg-amber-900/30"
            >
              <span className="text-amber-700 dark:text-amber-300">
                <UserIdentity user={invitee} showIdentifier={false} />
              </span>
              <span className="text-amber-500 dark:text-amber-400">(pending)</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setRevokeInviteEmail(invitee.email);
                    setRevokeInviteOpen(true);
                  }}
                  className="ml-1 hidden text-amber-600 hover:text-amber-700 group-hover:inline-block"
                  title="Remove invite"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <UserPlus className="h-3 w-3" />
              Invite
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Settings className="h-3 w-3" />
            Settings
          </button>

          {!isOwner && (
            <button
              type="button"
              onClick={() => setLeaveOpen(true)}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <LogOut className="h-3 w-3" />
              Leave
            </button>
          )}

          {isOwner && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        group={group}
        onInviteMember={onInviteMember}
        friends={friends}
      />

      {/* Settings Modal */}
      <SimpleModal open={settingsOpen} onOpenChange={setSettingsOpen}>
        <div className="max-w-md">
          <SimpleModalHeader>
            <SimpleModalTitle>Group Settings</SimpleModalTitle>
            <SimpleModalDescription>
              Customize your personal settings for "{group.name}"
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Your color for this group
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                This color is personal and only visible to you
              </p>
              <div className="mt-3">
                <GroupColorPicker
                  selectedColor={groupColor}
                  onColorChange={(color) => onColorChange(group.id, color)}
                />
              </div>
            </div>

            {isOwner && (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Member-managed
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Allow any member to invite or remove others
                  </p>
                </div>
                <SimpleToggle
                  checked={group.memberManaged}
                  onCheckedChange={handleToggleMemberManaged}
                />
              </div>
            )}

            {canManage && (
              <div className="rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Discord channel
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Link a Discord channel to post poll updates for this group.
                </p>
                {group.discord?.channelId ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-emerald-700 dark:text-emerald-200">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 dark:border-emerald-700/60 dark:bg-emerald-900/30">
                      {group.discord?.channelName
                        ? `Connected to #${group.discord.channelName}`
                        : "Connected to a Discord channel"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>No Discord channel linked yet.</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateDiscordCode}
                    disabled={discordLinking}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {discordLinking ? "Generating..." : "Generate link code"}
                  </button>
                  {discordCode && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      {discordCode}
                    </span>
                  )}
                </div>
                {discordCodeExpiresAt && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Expires at {new Date(discordCodeExpiresAt).toLocaleTimeString()}.
                    Run /qs link-group {discordCode} in the target Discord channel.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
                  Private channels require adding the Quest Scheduler bot role to the channel or
                  category and allowing View Channel, Send Messages, and Embed Links.
                </p>
                {group.discord?.channelId && notifyRoleName && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Channel notification role
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Choose which role gets pinged for critical poll updates (created, finalized,
                      re-opened, cancelled, deleted).
                    </p>
                    <div className="mt-2">
                      <select
                        value={discordNotifyRoleId || group.discord?.notifyRoleId || "everyone"}
                        onChange={(event) => handleNotifyRoleChange(event.target.value)}
                        disabled={discordRolesLoading}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {(discordRoles || []).map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {group.discord?.channelId && (
                  <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Discord alerts
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Control which poll updates post extra messages in Discord.
                    </p>
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Critical lifecycle updates
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Posts channel updates for created, finalized, re-opened, cancelled, or
                            deleted polls.
                          </p>
                        </div>
                        <SimpleToggle
                          checked={discordAlertSettings.finalizationEvents}
                          onCheckedChange={(value) =>
                            handleDiscordAlertChange("finalizationEvents", value)
                          }
                          disabled={discordAlertSaving}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            All votes are in
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Posts when every participant has voted.
                          </p>
                        </div>
                        <SimpleToggle
                          checked={discordAlertSettings.allVotesIn}
                          onCheckedChange={(value) =>
                            handleDiscordAlertChange("allVotesIn", value)
                          }
                          disabled={discordAlertSaving}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Vote submissions
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Posts when someone submits or updates their votes.
                          </p>
                        </div>
                        <SimpleToggle
                          checked={discordAlertSettings.voteSubmitted}
                          onCheckedChange={(value) =>
                            handleDiscordAlertChange("voteSubmitted", value)
                          }
                          disabled={discordAlertSaving}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-700">
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            Slot set changes
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Posts when time slots are added, removed, or updated.
                          </p>
                        </div>
                        <SimpleToggle
                          checked={discordAlertSettings.slotChanges}
                          onCheckedChange={(value) =>
                            handleDiscordAlertChange("slotChanges", value)
                          }
                          disabled={discordAlertSaving}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary/90"
            >
              Done
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      {/* Remove Member Confirmation */}
      <SimpleModal open={removeMemberOpen} onOpenChange={setRemoveMemberOpen}>
        <div className="max-w-md">
          <SimpleModalHeader>
            <SimpleModalTitle>Remove member</SimpleModalTitle>
            <SimpleModalDescription>
              Are you sure you want to remove{" "}
              {memberToRemove ? (
                <UserIdentity user={memberToRemoveProfile || { email: memberToRemove }} />
              ) : (
                "this member"
              )}{" "}
              from "{group.name}"?
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              This will also remove them from all session polls that use this group.
            </p>
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => setRemoveMemberOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveMember}
              disabled={saving}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Removing..." : "Remove member"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      {/* Leave Confirmation */}
      <SimpleModal open={leaveOpen} onOpenChange={setLeaveOpen}>
        <div className="max-w-md">
          <SimpleModalHeader>
            <SimpleModalTitle>Leave group</SimpleModalTitle>
            <SimpleModalDescription>
              Are you sure you want to leave "{group.name}"?
            </SimpleModalDescription>
          </SimpleModalHeader>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => setLeaveOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLeave}
              disabled={saving}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Leaving..." : "Leave group"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      {/* Revoke Invite Confirmation */}
      <SimpleModal open={revokeInviteOpen} onOpenChange={setRevokeInviteOpen}>
        <div className="max-w-md">
          <SimpleModalHeader>
            <SimpleModalTitle>Remove invite</SimpleModalTitle>
            <SimpleModalDescription>
              Remove the pending invite for {revokeInviteEmail}?
            </SimpleModalDescription>
          </SimpleModalHeader>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => setRevokeInviteOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevokeInvite}
              disabled={saving}
              className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Removing..." : "Remove invite"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>

      {/* Delete Confirmation */}
      <SimpleModal open={deleteOpen} onOpenChange={setDeleteOpen}>
        <div className="max-w-md">
          <SimpleModalHeader>
            <SimpleModalTitle>Delete group</SimpleModalTitle>
            <SimpleModalDescription>
              Are you sure you want to delete "{group.name}"? This action cannot be undone.
            </SimpleModalDescription>
          </SimpleModalHeader>

          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {group.name}
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {members.length} members
            </p>
          </div>

          <SimpleModalFooter className="mt-6">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Deleting..." : "Delete group"}
            </button>
          </SimpleModalFooter>
        </div>
      </SimpleModal>
    </>
  );
}
