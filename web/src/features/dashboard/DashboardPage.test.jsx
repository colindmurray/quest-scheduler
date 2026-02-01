import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DashboardPage from "./DashboardPage";
import {
  pollInviteNotificationId,
  pollInviteLegacyNotificationId,
} from "../../lib/data/notifications";

const acceptInviteMock = vi.fn();
const declineInviteMock = vi.fn();
const removeLocalMock = vi.fn();

vi.mock("../../app/useAuth", () => ({
  useAuth: () => ({ user: { uid: "user-1", email: "invitee@example.com" } }),
}));

vi.mock("../../hooks/useUserSettings", () => ({
  useUserSettings: () => ({ archivedPolls: [], loading: false }),
}));

vi.mock("../../hooks/useQuestingGroups", () => ({
  useQuestingGroups: () => ({ groups: [], getGroupColor: () => null }),
}));

vi.mock("../../hooks/usePollInvites", () => ({
  usePollInvites: () => ({
    pendingInvites: [
      {
        id: "sched-1",
        title: "Invite Poll",
        creatorEmail: "creator@example.com",
        pendingInviteMeta: {
          "invitee@example.com": { invitedByEmail: "inviter@example.com" },
        },
      },
    ],
    loading: false,
    acceptInvite: acceptInviteMock,
    declineInvite: declineInviteMock,
  }),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: () => ({ removeLocal: removeLocalMock }),
}));

vi.mock("../../hooks/useSchedulers", () => ({
  useSchedulersByCreator: () => ({ data: [], loading: false }),
  useSchedulersByGroupIds: () => ({ data: [], loading: false, error: null }),
  useSchedulersByParticipant: () => ({ data: [], loading: false }),
}));

vi.mock("../../hooks/useUserProfiles", () => ({
  useUserProfiles: () => ({
    enrichUsers: (emails = []) => emails.map((email) => ({ email })),
  }),
  useUserProfilesByIds: () => ({ profiles: {}, loading: false }),
}));

vi.mock("./hooks/useSchedulerAttendance", () => ({
  useSchedulerAttendance: () => ({
    slotsByScheduler: {},
    votesByScheduler: {},
    votersByScheduler: {},
  }),
}));

describe("DashboardPage pending invite actions", () => {
  beforeEach(() => {
    acceptInviteMock.mockResolvedValue(undefined);
    declineInviteMock.mockResolvedValue(undefined);
    removeLocalMock.mockReset();
    acceptInviteMock.mockClear();
    declineInviteMock.mockClear();
  });

  test("accept button accepts invite without redirect", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

    await waitFor(() => {
      expect(acceptInviteMock).toHaveBeenCalledWith("sched-1");
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteNotificationId("sched-1", "invitee@example.com")
      );
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteLegacyNotificationId("sched-1")
      );
    });
  });

  test("decline button declines invite without redirect", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /decline invite/i }));

    await waitFor(() => {
      expect(declineInviteMock).toHaveBeenCalledWith("sched-1");
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteNotificationId("sched-1", "invitee@example.com")
      );
      expect(removeLocalMock).toHaveBeenCalledWith(
        pollInviteLegacyNotificationId("sched-1")
      );
    });
  });
});
