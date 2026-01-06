# D&D Scheduler — Task List

## Phase 0 — Repo + Tooling
- [x] Initialize Vite React app in repo root (web/)
- [x] Add Tailwind CSS setup
- [x] Add shadcn/ui setup (components.json + utils + base Button)
- [ ] Add ESLint/Prettier (optional but recommended)

## Phase 1 — Firebase Wiring
- [x] Add Firebase config module
- [x] Add Auth provider (Google)
- [x] Set up Firestore client and base hooks
- [x] Add Firebase CLI config (`firebase.json`, `.firebaserc`)

## Phase 2 — Data Model + Rules
- [ ] Define Firestore collections and document shapes
- [x] Implement security rules
- [ ] Seed minimal test data (local only)

## Phase 3 — App Shell
- [x] App layout, theme tokens, fonts
- [x] Router (Dashboard, Scheduler, Settings)
- [x] Protected route guard

## Phase 4 — Scheduler Creation
- [x] Date range picker
- [x] Calendar selection (basic slot picking)
- [x] Slot creation + multi-slot per day
- [x] Invitee selection (manual input placeholder)
- [x] Create scheduler + shareable UUID link (basic flow)

## Phase 5 — Voting Experience
- [x] Calendar view with slot chips
- [x] Modal vote editor per day
- [x] List view with Feasible/Preferred
- [x] Submit/edit vote flows

## Phase 6 — Results + Finalization
- [x] Results view with sorting modes
- [x] Creator finalization modal
- [x] Google Calendar event creation (client-side)

## Phase 7 — Re-open Workflow
- [x] Re-open finalized scheduler
- [x] Re-finalize with delete-old-event checkbox

## Phase 8 — Settings
- [x] Address Book management
- [x] Default session times per weekday
- [x] Default duration/title/description
- [x] Notifications toggle

## Phase 9 — Notifications
- [ ] Install Firebase Trigger Email extension (SMTP placeholders, deploy pending)

## Phase 10 — QA + Deployment
- [ ] Manual test plan + bug fixes
- [x] Deploy setup config (hosting predeploy + runbook)
- [ ] Deploy Firestore rules + hosting
- [ ] Verify Google OAuth scopes in production
