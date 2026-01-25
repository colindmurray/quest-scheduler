import { Bell } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationDropdown } from "./notification-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export function NotificationBell() {
  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    dismiss,
    markAllRead,
    dismissAll,
    removeLocal,
  } =
    useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <NotificationDropdown
          notifications={notifications}
          loading={loading}
          onMarkRead={markRead}
          onDismiss={dismiss}
          onMarkAllRead={markAllRead}
          onDismissAll={dismissAll}
          onRemoveLocal={removeLocal}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
