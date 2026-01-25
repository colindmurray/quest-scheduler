# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quest Scheduler is a Firebase-backed scheduling application for tabletop sessions. Users create schedulers with time slots, invite participants via email or shareable links, collect votes (Feasible/Preferred), and finalize sessions by creating Google Calendar events.

## Commands

### Development
```bash
cd web && npm install && npm run dev   # Start dev server at localhost:5173
```

### Build & Lint
```bash
npm --prefix web run build             # Production build to web/dist/
npm --prefix web run lint              # ESLint
```

### Firebase Deployment
```bash
firebase deploy --only hosting,firestore,extensions --project studio-473406021-87ead
firebase deploy --only hosting --project studio-473406021-87ead   # Hosting only
```

## Architecture

### Frontend Stack
- React 19 + Vite + React Router v7
- Tailwind CSS + Radix UI primitives + Lucide icons
- react-big-calendar for calendar views
- date-fns + date-fns-tz for timezone handling
- Framer Motion for animations

### Backend
- Firebase Auth (Google OAuth with `calendar.events` scope)
- Firestore for data persistence
- Firebase Hosting
- Firebase Extensions (firestore-send-email for notifications)

### Directory Structure
```
web/src/
  app/          # App shell, routing, auth guards
  features/     # Feature modules (dashboard, scheduler, settings, landing)
  components/   # Shared UI components
  hooks/        # Custom React hooks (Firestore wrappers, useUserSettings)
  lib/          # Firebase SDK, auth helpers, data access layer
  styles/       # Global styles, Tailwind config
```

### Key Patterns
- **Feature-first organization:** UI + logic co-located in `src/features/<feature>`
- **Centralized data layer:** All Firestore operations go through `src/lib/data/`
- **Real-time listeners:** Firestore `onSnapshot` for live updates via custom hooks
- **Auth context:** `useAuth()` hook provides user state throughout the app

### Firestore Data Model
- `users/{userId}` - Profile, settings, address book
- `schedulers/{schedulerId}` - Scheduler metadata (status: OPEN/FINALIZED)
  - `slots/{slotId}` - Time slots with UTC timestamps and vote stats
  - `votes/{userId}` - User's votes mapping slotId → FEASIBLE/PREFERRED

## Critical Conventions

### Timestamps
- **Store in UTC** in Firestore
- **Render in local time** at the UI layer using date-fns-tz

### Naming
- Files/folders: `kebab-case`
- Components: `PascalCase`
- Hooks: `useXxx`
- Firestore docs/fields: `camelCase`

### Voting Logic
- Preferred implies Feasible (selecting Preferred auto-selects Feasible)
- Slots are the unit of voting, not dates

### UX Rules
- Calendar view and list view must stay in sync
- Creator actions are always visually distinct from participant actions
