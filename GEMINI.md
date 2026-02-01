# Quest Scheduler

**Quest Scheduler** is a Firebase-backed scheduling application designed to streamline coordinating tabletop game sessions. It features slot-based voting (Feasible/Preferred), Google Calendar integration, and real-time updates.

## Research & Reasoning Workflow (Expert Mode)
- Start with repo docs: `AGENTS.md`, `docs/decisions.md`, `docs/task-list.md`, `docs/testing.md`, and feature-specific design docs under `docs/`.
- If external research is required, prioritize official docs and primary sources first.
- Summarize findings as actionable steps, note assumptions, and update `docs/decisions.md` if new conventions are introduced.
- Prefer small, verifiable changes with explicit acceptance criteria and tests.

## Pragmatic Delivery Priorities
- **Ship robust features first.** This is a small project (~10 users) with limited budget; keep scope lean.
- **Avoid YAGNI and over‑engineering.** Only add complexity when it solves a current, real need.
- **Cost‑aware by default.** Avoid recommendations that introduce paid services, heavy infra, or ongoing ops burden.
- **Forward‑looking, not premature scaling.** Prefer designs that can grow later without forcing it now.
- **Actionable > informative.** Prioritize changes that unblock user actions and reduce confusion.

## Project Structure

The project is organized as a monorepo with distinct frontend and backend directories:

- **`web/`**: The frontend application.
    - **`src/app/`**: App shell, routing (React Router v7), and authentication guards.
    - **`src/features/`**: Feature-based modules (e.g., `dashboard`, `scheduler`, `settings`, `friends`). This is where UI and specific logic reside.
    - **`src/components/`**: Shared, reusable UI components (built with Radix UI primitives).
    - **`src/lib/`**: Core infrastructure including Firebase SDK initialization (`firebase.js`), authentication helpers, and the centralized data access layer (`data/`).
    - **`src/hooks/`**: Custom React hooks, primarily for Firestore data fetching and synchronization.
- **`functions/`**: Firebase Cloud Functions for backend logic (e.g., email notifications).
- **`docs/`**: Project documentation, design decisions, and runbooks.

## Tech Stack

### Frontend
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS + Radix UI + Lucide React (icons)
- **State Management:** React Context + Custom Hooks
- **Calendar:** `react-big-calendar`
- **Dates:** `date-fns` + `date-fns-tz`
- **Testing:** Vitest

### Backend (Firebase)
- **Auth:** Firebase Authentication (Google OAuth)
- **Database:** Cloud Firestore
- **Hosting:** Firebase Hosting
- **Logic:** Cloud Functions (Node.js 20)

## Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- npm

### Development
1.  Navigate to the web directory:
    ```bash
    cd web
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

### Building
To build the frontend for production:
```bash
npm --prefix web run build
```
Output is generated in `web/dist/`.

### Testing & Linting
- **Run Tests:** `npm --prefix web run test`
- **Lint Code:** `npm --prefix web run lint`

### Deployment
Deploy to Firebase (requires `firebase-tools` CLI):
```bash
# Deploy everything
firebase deploy --project studio-473406021-87ead

# Deploy specific services
firebase deploy --only hosting --project studio-473406021-87ead
```

## Development Conventions

### Code Organization
- **Feature-First:** Keep related UI and logic together in `src/features/<feature_name>`.
- **Data Layer:** All direct Firestore interactions should be encapsulated within `src/lib/data/`. Avoid raw Firestore calls in components.
- **Naming:**
    - Files/Folders: `kebab-case` (e.g., `dashboard-page.jsx`)
    - Components: `PascalCase` (e.g., `DashboardPage`)
    - Hooks: `useCamelCase` (e.g., `useUserProfiles`)
    - Firestore Fields: `camelCase`

### Date & Time Handling
- **Storage:** Always store timestamps in **UTC** in Firestore.
- **Display:** Convert to **local time** only at the UI layer using `date-fns-tz`.
- **Voting:** Users vote on specific *Time Slots*, not generic dates.

### UX Guidelines
- **Sync:** Ensure Calendar and List views reflect the same state.
- **Visual Distinction:** Clearly differentiate actions available to the *Creator* vs. *Participants*.
- **Voting:** "Preferred" vote implies "Feasible".

## Durable State (Long Tasks)
- Progress + checkpoints: `docs/task-list.md`
- Decisions + conventions: `docs/decisions.md`
- Test setup + emulator: `docs/testing.md`
