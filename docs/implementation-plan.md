# D&D Scheduler — Master Implementation Plan

## 1) Goals & Scope
Build a Firebase‑backed D&D scheduling app with Google login and Google Calendar event creation. Users join schedulers via shared UUID link or explicit email invites, propose time slots, vote (Feasible/Preferred), view results, and allow the creator to finalize or re‑open a session. App must be visually strong and fully responsive.

## 2) Stack
- **Frontend:** React + Vite
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives) + Lucide icons
- **Calendar UI:** react-big-calendar
- **Time zones:** date-fns + date-fns-tz
- **Animation:** Framer Motion
- **Auth:** Firebase Auth (Google provider)
- **DB:** Firestore
- **Server logic:** Cloud Functions (email notifications; optional background tasks)
- **Calendar Integration:** Google Calendar API

## 3) Core UX Flows
### 3.1 Authentication
- Google sign-in required for all access.
- Request `calendar.events` scope for calendar writes.
- Use offline access and store refresh tokens where appropriate.

### 3.2 Dashboard
- **Upcoming Sessions:** Schedulers where the user is invited or has joined via link and status is OPEN.
- **Past Sessions:** Schedulers where status is FINALIZED.
- **My Schedulers:** Schedulers created by the user.

### 3.3 Scheduler Creation
1. Creator selects date range in a calendar.
2. Clicking a day creates a **slot** (date + start time + duration). Default time pulled from user settings.
3. Creator can add **multiple slots on the same day** and edit start time/duration per slot.
4. Creator adds invitees by selecting from Address Book or entering emails.
5. App generates a shareable URL with a long UUID.

### 3.4 Voting
- Calendar view highlights days with slots.
- Clicking a day opens a modal listing all slots for that day.
- Each slot has **Feasible** and **Preferred** checkboxes. Preferred implies Feasible.
- List view shows all slots in a simple list with the same controls.
- Users can submit and later edit their vote.

### 3.5 Results & Finalization
- Results view shows counts per slot.
- Sort options:
  - **Maximize Preferred:** preferred desc, then feasible desc
  - **Maximize Attendance:** feasible desc, then preferred desc
- Creator selects a winning slot and optionally edits calendar event fields.
- Event is created on the creator’s chosen calendar. Attendee list is prefilled with all participants and editable.
- Scheduler status becomes FINALIZED.

### 3.6 Re-open Workflow
- Creator can re-open a finalized scheduler to allow re-voting.
- After selecting a new winning slot, app prompts to delete the previous Google event (checkbox defaulted on).

### 3.7 Notifications (Optional Setting)
- When enabled, creator receives email notifications on vote submissions.

## 4) Time Zone Strategy (Critical)
- **Store all timestamps in UTC** in Firestore.
- **Render in the user’s local time zone** at the UI layer.
- User default start times are stored as weekday + local time strings (e.g., `{ "1": "18:00" }`) and converted to UTC when creating specific slots.

## 5) Firestore Data Model
### 5.1 users/{userId}
```json
{
  "email": "user@gmail.com",
  "displayName": "Colin",
  "photoURL": "...",
  "addressBook": ["friend1@gmail.com"],
  "settings": {
    "defaultDurationMinutes": 240,
    "defaultTitle": "D&D Session",
    "defaultDescription": "Weekly session",
    "emailNotifications": true,
    "defaultStartTimes": { "1": "18:00", "6": "12:00" }
  }
}
```

### 5.2 schedulers/{schedulerId}
```json
{
  "title": "Campaign 1",
  "creatorId": "uid_123",
  "creatorEmail": "creator@gmail.com",
  "status": "OPEN",
  "participants": ["creator@gmail.com", "friend@gmail.com"],
  "winningSlotId": null,
  "googleEventId": null,
  "createdAt": "2026-01-06T10:00:00Z"
}
```

### 5.3 schedulers/{schedulerId}/slots/{slotId}
```json
{
  "start": "2026-01-10T18:00:00Z",
  "end": "2026-01-10T22:00:00Z",
  "stats": {
    "feasible": 3,
    "preferred": 1
  }
}
```

### 5.4 schedulers/{schedulerId}/votes/{userId}
```json
{
  "userEmail": "friend@gmail.com",
  "userAvatar": "...",
  "votes": {
    "slot_abc": "PREFERRED",
    "slot_xyz": "FEASIBLE"
  },
  "updatedAt": "2026-01-06T12:00:00Z"
}
```

## 6) Access Control & Joining
- Creator has full admin rights.
- Invited users see the scheduler in Upcoming immediately on login.
- Link joiners are added to participants on login and can then see it.
- Creator can delete scheduler to revoke access for all.

## 7) Firestore Security Rules (Summary)
- `/users/{userId}`: owner read/write.
- `/schedulers/{id}`: read for signed-in users; create by creator; update by creator; participants can only update participants list via `arrayUnion`.
- `/slots`: creator write; signed-in read.
- `/votes/{userId}`: signed-in user read/write only their own document.

## 8) Google Calendar Integration
- Request `https://www.googleapis.com/auth/calendar.events`.
- When finalizing, insert event on chosen calendar and store `googleEventId`.
- On re-finalize, optionally delete prior event using `googleEventId`.

## 9) Deployment
- Firebase Hosting for frontend.
- Firebase Functions for email notifications.
- Firestore rules deployed with `firebase deploy`.

## 10) Non-Goals (for initial release)
- Multi-calendar sync for non-creator users.
- Group chat or mutual “friend” graph.
- Complex invite acceptance workflows.
