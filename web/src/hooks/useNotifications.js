import { useMemo, useCallback, useEffect, useState } from "react";
import { useAuth } from "../app/AuthProvider";
import { useFirestoreCollection } from "./useFirestoreCollection";
import {
  allNotificationsQuery,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
  dismissAllNotifications,
} from "../lib/data/notifications";

export function useNotifications() {
  const { user } = useAuth();

  const notificationsQueryRef = useMemo(() => {
    if (!user?.uid) return null;
    return allNotificationsQuery(user.uid);
  }, [user?.uid]);

  const { data: liveNotifications, loading, error } = useFirestoreCollection(notificationsQueryRef);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    setNotifications(liveNotifications);
  }, [liveNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const markRead = useCallback(
    async (notificationId) => {
      if (!user?.uid) return;
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, read: true } : notification
        )
      );
      try {
        await markNotificationRead(user.uid, notificationId);
      } catch (err) {
        console.error("Failed to mark notification read:", err);
        setNotifications(liveNotifications);
      }
    },
    [user?.uid, liveNotifications]
  );

  const dismiss = useCallback(
    async (notificationId) => {
      if (!user?.uid) return;
      setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
      try {
        await dismissNotification(user.uid, notificationId);
      } catch (err) {
        console.error("Failed to dismiss notification:", err);
        setNotifications(liveNotifications);
      }
    },
    [user?.uid, liveNotifications]
  );

  const markAllRead = useCallback(async () => {
    if (!user?.uid || notifications.length === 0) return;
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
    try {
      await markAllNotificationsRead(user.uid, notifications);
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
      setNotifications(liveNotifications);
    }
  }, [user?.uid, notifications, liveNotifications]);

  const dismissAll = useCallback(async () => {
    if (!user?.uid || notifications.length === 0) return;
    setNotifications([]);
    try {
      await dismissAllNotifications(user.uid, notifications);
    } catch (err) {
      console.error("Failed to dismiss all notifications:", err);
      setNotifications(liveNotifications);
    }
  }, [user?.uid, notifications, liveNotifications]);

  const removeLocal = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== notificationId));
  }, []);

  return {
    notifications,
    loading,
    error,
    unreadCount,
    markRead,
    dismiss,
    markAllRead,
    dismissAll,
    removeLocal,
  };
}
