import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Check, X, Users, Calendar, Vote, Bell, UserPlus } from "lucide-react";
import { useQuestingGroups } from "../../hooks/useQuestingGroups";
import { useFriends } from "../../hooks/useFriends";
import { usePollInvites } from "../../hooks/usePollInvites";
import { NOTIFICATION_TYPES } from "../../lib/data/notifications";

function NotificationIcon({ type }) {
  switch (type) {
    case NOTIFICATION_TYPES.FRIEND_REQUEST:
      return <UserPlus className="h-4 w-4 text-indigo-500" />;
    case NOTIFICATION_TYPES.FRIEND_ACCEPTED:
      return <Users className="h-4 w-4 text-emerald-500" />;
    case NOTIFICATION_TYPES.POLL_INVITE:
      return <Calendar className="h-4 w-4 text-amber-500" />;
    case NOTIFICATION_TYPES.GROUP_INVITE:
      return <Users className="h-4 w-4 text-purple-500" />;
    case NOTIFICATION_TYPES.GROUP_INVITE_ACCEPTED:
      return <Users className="h-4 w-4 text-emerald-500" />;
    case NOTIFICATION_TYPES.SESSION_INVITE:
      return <Calendar className="h-4 w-4 text-blue-500" />;
    case NOTIFICATION_TYPES.SESSION_FINALIZED:
      return <Calendar className="h-4 w-4 text-emerald-500" />;
    case NOTIFICATION_TYPES.VOTE_REMINDER:
      return <Vote className="h-4 w-4 text-amber-500" />;
    case NOTIFICATION_TYPES.VOTE_SUBMITTED:
      return <Vote className="h-4 w-4 text-emerald-500" />;
    case NOTIFICATION_TYPES.GROUP_MEMBER_CHANGE:
      return <Users className="h-4 w-4 text-blue-500" />;
    case NOTIFICATION_TYPES.SESSION_JOINED:
      return <Users className="h-4 w-4 text-indigo-500" />;
    default:
      return <Bell className="h-4 w-4 text-slate-500" />;
  }
}

function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
  onNavigate,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onAcceptPollInvite,
  onDeclinePollInvite,
  onRemoveLocal,
}) {
  const isGroupInvite = notification.type === NOTIFICATION_TYPES.GROUP_INVITE;
  const isFriendRequest = notification.type === NOTIFICATION_TYPES.FRIEND_REQUEST;
  const isPollInvite = notification.type === NOTIFICATION_TYPES.POLL_INVITE;
  const timeAgo = notification.createdAt?.toDate
    ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true })
    : "";

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    if (notification.actionUrl && !isGroupInvite && !isFriendRequest && !isPollInvite) {
      onNavigate(notification.actionUrl);
    }
  };

  const handleAccept = async (e) => {
    e.stopPropagation();
    try {
      if (isGroupInvite && notification.metadata?.groupId) {
        await onAcceptGroupInvite(notification.metadata.groupId);
      }
      if (isFriendRequest && notification.metadata?.requestId) {
        await onAcceptFriendRequest(notification.metadata.requestId);
      }
      if (isPollInvite && notification.metadata?.schedulerId) {
        await onAcceptPollInvite(notification.metadata.schedulerId);
        onNavigate(`/scheduler/${notification.metadata.schedulerId}`);
      }
    } finally {
      onRemoveLocal?.(notification.id);
    }
  };

  const handleDecline = async (e) => {
    e.stopPropagation();
    try {
      if (isGroupInvite && notification.metadata?.groupId) {
        await onDeclineGroupInvite(notification.metadata.groupId);
      }
      if (isFriendRequest && notification.metadata?.requestId) {
        await onDeclineFriendRequest(notification.metadata.requestId);
      }
      if (isPollInvite && notification.metadata?.schedulerId) {
        await onDeclinePollInvite(notification.metadata.schedulerId);
      }
    } finally {
      onRemoveLocal?.(notification.id);
    }
  };

  return (
    <div
      className={`flex gap-3 border-b border-slate-200/70 p-3 transition-colors last:border-b-0 dark:border-slate-700 ${
        notification.read
          ? "bg-white dark:bg-slate-800"
          : "bg-blue-50/50 dark:bg-blue-900/20"
      } ${!isGroupInvite ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50" : ""}`}
      onClick={handleClick}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
        <NotificationIcon type={notification.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {notification.title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
          {notification.body}
        </p>
        {(isGroupInvite || isFriendRequest || isPollInvite) && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
              aria-label="Accept group invitation"
            >
              <Check className="h-3 w-3" />
              Accept
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              aria-label="Decline group invitation"
            >
              <X className="h-3 w-3" />
              Decline
            </button>
          </div>
        )}
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
          {timeAgo}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        aria-label="Dismiss notification"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function NotificationDropdown({
  notifications,
  loading,
  onMarkRead,
  onDismiss,
  onMarkAllRead,
  onDismissAll,
  onRemoveLocal,
}) {
  const navigate = useNavigate();
  const { acceptInvite, declineInvite } = useQuestingGroups();
  const { acceptFriendRequest, declineFriendRequest } = useFriends();
  const { acceptInvite: acceptPollInvite, declineInvite: declinePollInvite } = usePollInvites();

  const handleNavigate = (url) => {
    navigate(url);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
              ({unreadCount} unread)
            </span>
          )}
        </h3>
        {notifications.length > 0 && (
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs text-brand-primary hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onDismissAll}
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-300"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              No notifications
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              You're all caught up!
            </p>
          </div>
        )}

        {!loading &&
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={onMarkRead}
              onDismiss={onDismiss}
              onNavigate={handleNavigate}
              onAcceptGroupInvite={acceptInvite}
              onDeclineGroupInvite={declineInvite}
              onAcceptFriendRequest={acceptFriendRequest}
              onDeclineFriendRequest={declineFriendRequest}
              onAcceptPollInvite={acceptPollInvite}
              onDeclinePollInvite={declinePollInvite}
              onRemoveLocal={onRemoveLocal}
            />
          ))}
      </div>
    </div>
  );
}
