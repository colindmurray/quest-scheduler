import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationDropdown } from "./notification-dropdown";

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

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
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
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <NotificationDropdown
            notifications={notifications}
            loading={loading}
            onMarkRead={markRead}
            onDismiss={dismiss}
            onMarkAllRead={markAllRead}
            onDismissAll={dismissAll}
            onRemoveLocal={removeLocal}
          />
        </div>
      )}
    </div>
  );
}
