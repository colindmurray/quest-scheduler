# Code Health Audit Verification Report

Date: 2026-01-29
Reviewer: Gemini CLI

## 1. Confirmed Findings
I have verified the findings in `docs/code-health-audit.md` and confirm they are accurate.

### P1 (High Priority)
- **Incorrect `HttpsError` in `functions/src/discord/nudge.js`**: Confirmed. Lines 52 and 56 use `functions.https.functions.https.HttpsError`, which will throw a runtime `TypeError` instead of a proper error to the client.
- **Direct Firestore Usage in UI**: Confirmed.
  - `web/src/features/dashboard/DashboardPage.jsx` constructs queries and `onSnapshot` listeners directly inside components.
  - `web/src/features/scheduler/SchedulerPage.jsx` and `CreateSchedulerPage.jsx` perform direct `getDocs`, `setDoc`, `updateDoc`, and `deleteDoc` operations.
- **Monolithic Scheduler Pages**: Confirmed.
  - `SchedulerPage.jsx` is ~2840 lines.
  - `CreateSchedulerPage.jsx` is ~1166 lines.
  - Both mix UI, complex business logic (sorting, attendance summary), and data persistence.
- **Inconsistent Email Normalization**: Confirmed.
  - `CreateSchedulerPage.jsx` uses an unsafe inline definition: `value.trim().toLowerCase()` which can crash on null/undefined.
  - `SchedulerPage.jsx` uses a similar inline definition.
  - `functions/src/legacy.js` and `web/src/lib/auth.js` use a safe version: `String(value || "").trim().toLowerCase()`.

### P2 (Medium)
- **Monolithic Cloud Functions**: Confirmed.
  - `functions/src/legacy.js` (2262 lines) handles unrelated domains: Google Calendar OAuth, Friend Requests, Poll Invites, Blocking, and Username Registration.
  - `functions/src/discord/worker.js` handles all Discord interaction types in one file.

## 2. Disagreements / Corrections
- **None.** The audit accurately reflects the state of the codebase.

## 3. Additional Findings

### [P2] Unsafe `normalizeEmail` Definition in `CreateSchedulerPage.jsx`
- **File**: `web/src/features/scheduler/CreateSchedulerPage.jsx` (Line 64)
- **Issue**: `function normalizeEmail(value) { return value.trim().toLowerCase(); }`
- **Risk**: While current usage points appear to filter `null`/`undefined` before calling this, any future usage that passes a nullable value will crash the React render loop.
- **Recommendation**: Replace with the safe implementation from `web/src/lib/auth.js` or `web/src/lib/utils.js`.

### [P2] Domain Mixing in `functions/src/legacy.js`
- **File**: `functions/src/legacy.js`
- **Issue**: This file exports multiple independent callable functions (`sendFriendRequest`, `googleCalendarStartAuth`, `registerQsUsername`).
- **Risk**: Increases cold start time (loading all dependencies) and makes maintenance difficult. Modifying calendar logic requires redeploying friend request logic.
- **Recommendation**: Split into `calendar.js`, `friends.js`, `users.js` and export them from `index.js`.

### [P3] Redundant `normalizeEmail` definitions
- **Files**: `functions/src/legacy.js`, `functions/src/discord/worker.js`, `web/src/lib/auth.js`, `web/src/features/scheduler/*.jsx`.
- **Issue**: The same logic is redefined in at least 5 places.
- **Recommendation**: Centralize in `web/src/lib/utils.js` (for frontend) and `functions/src/utils/string.js` (for backend) or a shared package.

## 4. Suggested Next Steps

1.  **Immediate Fix (P0)**: Fix the `HttpsError` typo in `functions/src/discord/nudge.js`.
2.  **Safety Fix (P1)**: Create a central `normalizeEmail` utility and replace all inline definitions, especially the unsafe ones in `web/src/features/scheduler/`.
3.  **Refactor (P1)**: Create `web/src/lib/data/scheduler.js` and move the complex Firestore logic (fetching slots/votes, saving votes, creating polls) out of the React components. This prepares the code for splitting the UI components later.
4.  **Refactor (P2)**: Split `functions/src/legacy.js` into domain-specific files.
