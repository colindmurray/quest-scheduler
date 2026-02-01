import { useAuth } from "../app/useAuth";

export function useNotificationSync() {
  useAuth();
  // Friend/group/poll invites are now handled by notification events + router.
}
