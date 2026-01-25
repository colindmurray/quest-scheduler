# Session Forge Dashboard Redesign - Design Document

## Table of Contents
1. [Overview](#overview)
2. [Feature Requirements](#feature-requirements)
3. [Technical Architecture](#technical-architecture)
4. [Data Model Changes](#data-model-changes)
5. [UI/UX Design](#uiux-design)
6. [Library Selection](#library-selection)
7. [Implementation Checklist](#implementation-checklist)

---

## Overview

This document outlines the comprehensive redesign of the Session Forge dashboard and related features. The redesign centers around three major initiatives:

1. **Dashboard Overhaul** - Calendar-centric view with enhanced session cards
2. **Questing Groups** - Named groups for organizing adventuring parties with color coding
3. **Notifications System** - In-app bell notifications with real-time updates
4. **Google Calendar Sync** - Bidirectional sync detection and preference handling

---

## Feature Requirements

### 1. Dashboard Redesign

#### 1.1 Calendar View (Primary Focus)
- Large, prominent calendar showing upcoming and past sessions
- Week/Month toggle for view granularity
- Color-coded events by Questing Group
- Past sessions displayed with muted styling
- Click event to navigate to session poll details
- Mobile: Agenda-style list view fallback on narrow screens (<768px)

#### 1.2 Session Cards
- **Response progress**: "4/6 responded" indicator
- **Pending vote badge**: Highlight polls awaiting YOUR vote
- **Time until session**: Relative time ("in 3 days", "Tomorrow at 7pm")
- **Participant avatars**: Small avatar stack (max 4-5)
- **Finalized date/time**: Show settled date prominently on finalized sessions
- **Questing Group color**: Left border or badge indicating group
- **Google Calendar indicator**: Icon if synced to calendar

#### 1.3 "Next Session" Highlight
- Prominent card/banner showing the next upcoming finalized session
- Large date/time display
- Countdown or relative time
- Quick link to session details and Google Calendar event

#### 1.4 Sections
- **Upcoming Sessions** - Open polls + Finalized future sessions (calendar + list)
- **My Session Polls** - Polls created by user
- **Past Sessions** - Tabs: Finalized | Archived

#### 1.5 Actions
- "New poll" button prominently displayed
- Week/Month calendar toggle
- Archive toggle in Past Sessions

---

### 2. Questing Groups Feature

#### 2.1 Group Management (Settings > Questing Groups tab)
- Create named groups (e.g., "Tuesday Night Crew", "Weekend Warriors")
- Invite members via email (sends email + in-app notification)
- Accept/decline invitations
- Owner toggle for permissions:
  - **Owner-managed**: Only creator can add/remove members
  - **Member-managed**: Any member can manage
- Personal color selection per group (not shared, stored in user doc)
- Remove members (with confirmation: "This will remove them from all polls using this group")
- Delete group (confirmation required)

#### 2.2 Group Invitations
- Email notification via `firestore-send-email` extension
- In-app notification (bell icon)
- Accept/Decline buttons in notification dropdown
- Pending invitations visible in Questing Groups tab

#### 2.3 Using Groups in Polls
- When creating/editing a poll, option to select a Questing Group
- Auto-populates participants from group members
- Can still add individual emails on top
- Max 1 group per poll (for now)
- Group stored as reference on scheduler document

#### 2.4 Color Coding
- User's personal color for each group stored in user settings
- Calendar events colored by group
- Session cards show color indicator (left border)
- Default color palette provided, user can customize

---

### 3. Notifications System

#### 3.1 Bell Icon (Header)
- Bell icon in AppLayout header (next to account dropdown)
- Unread count badge (red dot or number)
- Click opens dropdown with notification list
- "Mark all read" and "Clear all" actions

#### 3.2 Notification Types
- **Group invitation**: "[User] invited you to join [Group Name]"
- **Vote reminder**: "[Poll Name] is waiting for your vote"
- **Session finalized**: "[Poll Name] has been finalized for [Date]"
- **Group member added/removed**: "You were added to [Group Name]"

#### 3.3 Notification Actions
- Click notification to navigate to relevant page
- Accept/Decline inline for group invitations
- Dismiss individual notifications

#### 3.4 Storage
- `users/{userId}/notifications/{notificationId}` subcollection
- Fields: `type`, `title`, `body`, `read`, `createdAt`, `actionUrl`, `metadata`
- Real-time listener for live updates

---

### 4. Google Calendar Sync Detection

#### 4.1 Sync Status
- When dashboard loads, fetch Google Calendar event details for finalized sessions
- Compare event date/time/duration with poll's winning slot
- Visual indicator if discrepancy detected:
  - Warning icon on session card
  - Tooltip explaining the difference

#### 4.2 User Preference
- Settings option: "When calendar differs from poll, prefer:"
  - **Poll data** (default) - Show what was voted on
  - **Google Calendar data** - Show current calendar event details
- This affects display on dashboard calendar and session cards

#### 4.3 "Add to Calendar" for Non-Creators
- If session is finalized but has no linked Google Calendar event
- Show "Add to my calendar" button
- Generates Google Calendar add link (no attendees, just the event)
- Does NOT link to the poll (creator's event is the official one)

#### 4.4 Link to Google Calendar Event
- If session has `googleEventId`, show "View in Calendar" link
- Opens Google Calendar event page

---

### 5. Conflict Detection

#### 5.1 Overlapping Sessions
- When displaying calendar, detect if any finalized sessions overlap
- Show warning indicator on overlapping events
- Tooltip: "This session overlaps with [Other Session Name]"

---

## Technical Architecture

### Component Structure

```
src/
├── app/
│   └── AppLayout.jsx              # Add notification bell
├── features/
│   ├── dashboard/
│   │   ├── DashboardPage.jsx      # Main redesigned page
│   │   ├── components/
│   │   │   ├── DashboardCalendar.jsx
│   │   │   ├── NextSessionCard.jsx
│   │   │   ├── SessionCard.jsx
│   │   │   ├── UpcomingSessions.jsx
│   │   │   ├── MyPolls.jsx
│   │   │   ├── PastSessions.jsx
│   │   │   └── MobileAgendaView.jsx
│   │   └── hooks/
│   │       └── useCalendarEvents.js
│   ├── settings/
│   │   ├── SettingsPage.jsx       # Add Questing Groups tab
│   │   └── components/
│   │       ├── QuestingGroupsTab.jsx
│   │       ├── GroupCard.jsx
│   │       ├── CreateGroupModal.jsx
│   │       ├── InviteMemberModal.jsx
│   │       └── GroupColorPicker.jsx
│   └── scheduler/
│       └── SchedulerPage.jsx      # Add group selector
├── components/
│   └── ui/
│       ├── notification-bell.jsx
│       ├── notification-dropdown.jsx
│       └── notification-item.jsx
├── hooks/
│   ├── useNotifications.js
│   ├── useQuestingGroups.js
│   └── useCalendarSync.js
└── lib/
    └── data/
        ├── notifications.js
        └── questingGroups.js
```

### State Management

- **Notifications**: Real-time Firestore listener via `useNotifications` hook
- **Questing Groups**: Real-time listener for user's groups + invitations
- **Calendar Sync**: On-demand fetch when dashboard mounts, cached for session

---

## Data Model Changes

### New Collections

#### `questingGroups/{groupId}`
```javascript
{
  name: string,                    // "Tuesday Night Crew"
  creatorId: string,               // userId of creator
  creatorEmail: string,
  memberManaged: boolean,          // true = any member can manage
  members: string[],               // Array of email addresses
  pendingInvites: string[],        // Emails of pending invitations
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `users/{userId}/notifications/{notificationId}`
```javascript
{
  type: "GROUP_INVITE" | "VOTE_REMINDER" | "SESSION_FINALIZED" | "GROUP_MEMBER_CHANGE",
  title: string,
  body: string,
  read: boolean,
  dismissed: boolean,
  actionUrl: string,               // e.g., "/scheduler/abc123" or "/settings?tab=groups"
  metadata: {
    groupId?: string,
    schedulerId?: string,
    inviterEmail?: string
  },
  createdAt: Timestamp
}
```

### Modified Collections

#### `users/{userId}` (additions)
```javascript
{
  // ... existing fields ...
  groupColors: {                   // Personal color per group
    [groupId]: string              // Hex color, e.g., "#7C3AED"
  },
  calendarSyncPreference: "poll" | "calendar",  // Default: "poll"
}
```

#### `schedulers/{schedulerId}` (additions)
```javascript
{
  // ... existing fields ...
  questingGroupId: string | null,  // Reference to questingGroups collection
  questingGroupName: string | null // Denormalized for display
}
```

### Firestore Security Rules Updates

```javascript
// questingGroups rules
match /questingGroups/{groupId} {
  // Read: members or pending invites can read
  allow read: if request.auth != null && (
    resource.data.members.hasAny([request.auth.token.email]) ||
    resource.data.pendingInvites.hasAny([request.auth.token.email]) ||
    resource.data.creatorId == request.auth.uid
  );

  // Create: any authenticated user
  allow create: if request.auth != null;

  // Update: creator always, members if memberManaged
  allow update: if request.auth != null && (
    resource.data.creatorId == request.auth.uid ||
    (resource.data.memberManaged && resource.data.members.hasAny([request.auth.token.email]))
  );

  // Delete: creator only
  allow delete: if request.auth != null && resource.data.creatorId == request.auth.uid;
}

// Notifications rules (user's subcollection)
match /users/{userId}/notifications/{notificationId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

---

## UI/UX Design

### Dashboard Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header (Session Forge logo | Notification Bell | Account)           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ NEXT SESSION                                                 │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ 🎲 Tuesday Night Crew          in 3 days                │ │   │
│  │ │ Saturday, Jan 11 · 7:00 PM - 11:00 PM                   │ │   │
│  │ │ [View details] [Open in Calendar]                       │ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────────────────────┐ ┌──────────────────┐   │
│  │ UPCOMING SESSIONS                      │ │ MY SESSION POLLS │   │
│  │ [Week] [Month]                         │ │ [+ New poll]     │   │
│  │ ┌──────────────────────────────────┐   │ │                  │   │
│  │ │        CALENDAR VIEW             │   │ │ • Poll 1 (Open)  │   │
│  │ │   (react-big-calendar)           │   │ │   3/5 responded  │   │
│  │ │   Shows both open polls &        │   │ │                  │   │
│  │ │   finalized sessions             │   │ │ • Poll 2 (Final) │   │
│  │ │   Color-coded by group           │   │ │   Jan 15, 7pm    │   │
│  │ └──────────────────────────────────┘   │ │                  │   │
│  │                                        │ │ • Poll 3 (Open)  │   │
│  │ SESSION LIST                           │ │   ⚠️ Needs vote   │   │
│  │ ┌──────────────────────────────────┐   │ └──────────────────┘   │
│  │ │ Session Card (with avatars,      │   │                        │
│  │ │ response progress, time)         │   │ ┌──────────────────┐   │
│  │ └──────────────────────────────────┘   │ │ PAST SESSIONS    │   │
│  │ ┌──────────────────────────────────┐   │ │ [Finalized]      │   │
│  │ │ Session Card                     │   │ │ [Archived (3)]   │   │
│  │ └──────────────────────────────────┘   │ │                  │   │
│  └────────────────────────────────────────┘ │ • Past session 1 │   │
│                                             │ • Past session 2 │   │
│                                             └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Dashboard Layout (Mobile <768px)

```
┌─────────────────────────┐
│ Header                  │
├─────────────────────────┤
│ NEXT SESSION            │
│ ┌─────────────────────┐ │
│ │ Saturday, Jan 11    │ │
│ │ 7:00 PM             │ │
│ │ Tuesday Night Crew  │ │
│ └─────────────────────┘ │
│                         │
│ UPCOMING (Agenda View)  │
│ ┌─────────────────────┐ │
│ │ Jan 11 - Session 1  │ │
│ │ Jan 15 - Poll 2     │ │
│ │ Jan 18 - Poll 3     │ │
│ └─────────────────────┘ │
│                         │
│ [My Polls] [Past]       │
│ (Collapsible sections)  │
└─────────────────────────┘
```

### Session Card Design

```
┌─────────────────────────────────────────────────────────────┐
│ ▌ Tuesday Night Crew              ⚠️ Needs your vote        │ (color bar left)
│   Campaign Session #12                                      │
│                                                             │
│   📅 Jan 11, 2026 · 7:00 PM      in 3 days                 │
│   👥 ○○○○ +2                     4/6 responded             │
│                                                             │
│   [Open] ────────────────────────────────────  📆           │ (calendar sync icon)
└─────────────────────────────────────────────────────────────┘
```

### Notification Dropdown

```
┌─────────────────────────────────────┐
│ Notifications           [Clear all] │
├─────────────────────────────────────┤
│ 🔔 Sarah invited you to join        │
│    "Weekend Warriors"               │
│    [Accept] [Decline]     2h ago    │
├─────────────────────────────────────┤
│ 📊 "Tuesday Session" was finalized  │
│    Saturday, Jan 11 at 7:00 PM      │
│                           1d ago    │
├─────────────────────────────────────┤
│ ⚠️ "Friday Game" needs your vote    │
│    3 days remaining                 │
│                           2d ago    │
└─────────────────────────────────────┘
```

### Questing Groups Tab (Settings)

```
┌─────────────────────────────────────────────────────────────┐
│ QUESTING GROUPS                            [+ Create group] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎲 Tuesday Night Crew                    [Color: ████]  │ │
│ │ 5 members · Owner-managed                               │ │
│ │ ○ alice@... ○ bob@... ○ carol@... +2                    │ │
│ │ [Invite member] [Settings] [Leave/Delete]               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🎲 Weekend Warriors                      [Color: ████]  │ │
│ │ 3 members · Member-managed                              │ │
│ │ ○ dave@... ○ eve@... ○ you                              │ │
│ │ [Invite member] [Settings] [Leave]                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ PENDING INVITATIONS                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ "Dragon Slayers" - invited by frank@...                 │ │
│ │ [Accept] [Decline]                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Library Selection

### Already Installed (Keep Using)
| Library | Purpose | Notes |
|---------|---------|-------|
| `react-big-calendar` | Calendar views | Already in use, supports week/month/day |
| `date-fns` | Date formatting | Use `formatDistanceToNow` for relative time |
| `date-fns-tz` | Timezone handling | Already configured |
| `framer-motion` | Animations | Card hover effects, transitions |
| `@radix-ui/*` | UI primitives | Dialog, Dropdown, Popover, Switch |
| `lucide-react` | Icons | Bell, Calendar, etc. |
| `sonner` | Toast notifications | Already in use |
| `tailwindcss-animate` | CSS animations | Pulse for notification badge |

### No New Libraries Needed

After research, the existing stack covers all requirements:

1. **Calendar**: `react-big-calendar` already supports week/month views
2. **Relative time**: `date-fns` has `formatDistanceToNow()` - no new library needed
3. **Avatar stacks**: Already have `voter-avatars.jsx` component
4. **Animations**: `framer-motion` for hover effects, `tailwindcss-animate` for badge pulse
5. **Notifications dropdown**: Build with Radix `DropdownMenu` (already installed)

### date-fns Usage for Relative Time

```javascript
import { formatDistanceToNow } from 'date-fns';

// "in 3 days"
formatDistanceToNow(sessionDate, { addSuffix: true });

// "3 days ago"
formatDistanceToNow(pastDate, { addSuffix: true });
```

---

## Implementation Checklist

### Phase 1: Foundation & Data Model

- [ ] **1.1** Update Firestore security rules for new collections
- [ ] **1.2** Create `questingGroups` collection structure
- [ ] **1.3** Add `notifications` subcollection under users
- [ ] **1.4** Update `users` document schema (groupColors, calendarSyncPreference)
- [ ] **1.5** Update `schedulers` document schema (questingGroupId, questingGroupName)
- [ ] **1.6** Create `useNotifications` hook with real-time listener
- [ ] **1.7** Create `useQuestingGroups` hook with real-time listener
- [ ] **1.8** Create notification helper functions in `lib/data/notifications.js`
- [ ] **1.9** Create questing group helper functions in `lib/data/questingGroups.js`

### Phase 2: Notifications System

- [ ] **2.1** Create `NotificationBell` component (bell icon + badge)
- [ ] **2.2** Create `NotificationDropdown` component with Radix DropdownMenu
- [ ] **2.3** Create `NotificationItem` component for each notification type
- [ ] **2.4** Add notification bell to `AppLayout.jsx` header
- [ ] **2.5** Implement "Mark all read" functionality
- [ ] **2.6** Implement "Clear all" functionality
- [ ] **2.7** Implement individual notification dismiss
- [ ] **2.8** Add notification click handlers (navigate to relevant page)
- [ ] **2.9** Add pulse animation for unread notifications
- [ ] **2.10** Test notification real-time updates

### Phase 3: Questing Groups Feature

- [ ] **3.1** Add "Questing Groups" tab to Settings page
- [ ] **3.2** Create `QuestingGroupsTab` component
- [ ] **3.3** Create `GroupCard` component for displaying groups
- [ ] **3.4** Create `CreateGroupModal` component
- [ ] **3.5** Create `InviteMemberModal` component
- [ ] **3.6** Create `GroupColorPicker` component
- [ ] **3.7** Implement group creation flow
- [ ] **3.8** Implement member invitation flow (Firestore + email)
- [ ] **3.9** Create notification when user is invited to group
- [ ] **3.10** Implement accept/decline invitation in notifications
- [ ] **3.11** Implement pending invitations section in Questing Groups tab
- [ ] **3.12** Implement owner/member-managed toggle
- [ ] **3.13** Implement remove member functionality with confirmation
- [ ] **3.14** Implement leave group functionality
- [ ] **3.15** Implement delete group functionality (owner only)
- [ ] **3.16** Add group color persistence to user settings
- [ ] **3.17** Test group invitation email delivery

### Phase 4: Dashboard Redesign

- [ ] **4.1** Create new `DashboardPage` layout structure
- [ ] **4.2** Create `NextSessionCard` component (prominent next session display)
- [ ] **4.3** Create `DashboardCalendar` component wrapper
- [ ] **4.4** Add week/month toggle to calendar
- [ ] **4.5** Implement calendar event color coding by Questing Group
- [ ] **4.6** Create `SessionCard` component with new design
- [ ] **4.7** Add response progress indicator to session cards ("4/6 responded")
- [ ] **4.8** Add "Needs your vote" badge for pending polls
- [ ] **4.9** Add relative time display using `formatDistanceToNow`
- [ ] **4.10** Add participant avatar stack to session cards
- [ ] **4.11** Add finalized date/time display on session cards
- [ ] **4.12** Add group color indicator (left border) to session cards
- [ ] **4.13** Create `UpcomingSessions` section component
- [ ] **4.14** Create `MyPolls` section component
- [ ] **4.15** Create `PastSessions` section with Finalized/Archived tabs
- [ ] **4.16** Implement session list below calendar
- [ ] **4.17** Create `MobileAgendaView` component for narrow screens
- [ ] **4.18** Add responsive breakpoint detection
- [ ] **4.19** Implement empty states for each section
- [ ] **4.20** Add Framer Motion hover animations to session cards
- [ ] **4.21** Test responsive layout on various screen sizes

### Phase 5: Google Calendar Integration

- [ ] **5.1** Create `useCalendarSync` hook for fetching event details
- [ ] **5.2** Implement calendar event fetch on dashboard load
- [ ] **5.3** Compare event data with poll winning slot
- [ ] **5.4** Add sync status indicator to session cards (warning icon if mismatched)
- [ ] **5.5** Add tooltip explaining discrepancy
- [ ] **5.6** Add "Calendar sync preference" setting in Settings page
- [ ] **5.7** Implement preference-based display logic on dashboard
- [ ] **5.8** Add "View in Calendar" link for sessions with googleEventId
- [ ] **5.9** Add "Add to my calendar" button for finalized sessions without linked event
- [ ] **5.10** Generate Google Calendar add link (no attendees)
- [ ] **5.11** Test sync detection with modified calendar events

### Phase 6: Conflict Detection

- [ ] **6.1** Implement overlap detection algorithm for calendar events
- [ ] **6.2** Add warning indicator on overlapping events in calendar
- [ ] **6.3** Add tooltip showing conflicting session name
- [ ] **6.4** Test with multiple overlapping sessions

### Phase 7: Poll Creation Updates

- [ ] **7.1** Add Questing Group selector to CreateSchedulerPage
- [ ] **7.2** Auto-populate participants when group selected
- [ ] **7.3** Allow adding individual emails on top of group
- [ ] **7.4** Store questingGroupId and questingGroupName on scheduler
- [ ] **7.5** Update edit flow to handle group selection
- [ ] **7.6** Test poll creation with and without groups

### Phase 8: Polish & Testing

- [ ] **8.1** Add loading states for all async operations
- [ ] **8.2** Add error handling and user feedback
- [ ] **8.3** Test dark mode compatibility
- [ ] **8.4** Performance testing with many sessions/groups
- [ ] **8.5** Cross-browser testing
- [ ] **8.6** Mobile responsiveness final review
- [ ] **8.7** Accessibility review (keyboard navigation, screen readers)
- [ ] **8.8** Run lint and fix any issues
- [ ] **8.9** Build and deploy test

---

## Animation Specifications

### Session Card Hover (Framer Motion)
```javascript
<motion.div
  whileHover={{
    scale: 1.02,
    boxShadow: "0 10px 40px -10px rgba(0,0,0,0.15)"
  }}
  transition={{ duration: 0.15 }}
>
```

### Notification Badge Pulse (Tailwind)
```css
.notification-badge {
  @apply animate-pulse;
}
```

### Calendar Event Transitions
```javascript
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
```

---

## Color Palette for Questing Groups

Default colors users can choose from:

```javascript
const GROUP_COLORS = [
  "#7C3AED", // Purple
  "#2563EB", // Blue
  "#0891B2", // Cyan
  "#059669", // Emerald
  "#CA8A04", // Yellow
  "#EA580C", // Orange
  "#DC2626", // Red
  "#DB2777", // Pink
  "#7C3AED", // Violet
  "#4F46E5", // Indigo
];
```

---

## API Reference

### Google Calendar API Endpoints Used

1. **List calendars**: `GET /calendar/v3/users/me/calendarList`
2. **Get event**: `GET /calendar/v3/calendars/{calendarId}/events/{eventId}`
3. **Create event**: `POST /calendar/v3/calendars/{calendarId}/events`
4. **Delete event**: `DELETE /calendar/v3/calendars/{calendarId}/events/{eventId}`

### Google Calendar Add Link Format
```
https://calendar.google.com/calendar/render?action=TEMPLATE&text={title}&dates={startISO}/{endISO}&details={description}
```

---

## Estimated Complexity

| Phase | Complexity | Estimated Tasks |
|-------|------------|-----------------|
| Phase 1: Foundation | Medium | 9 tasks |
| Phase 2: Notifications | Medium | 10 tasks |
| Phase 3: Questing Groups | High | 17 tasks |
| Phase 4: Dashboard | High | 21 tasks |
| Phase 5: Calendar Sync | Medium | 11 tasks |
| Phase 6: Conflict Detection | Low | 4 tasks |
| Phase 7: Poll Updates | Medium | 6 tasks |
| Phase 8: Polish | Medium | 9 tasks |
| **Total** | | **87 tasks** |

---

## Success Criteria

1. Dashboard prominently displays calendar with all upcoming sessions
2. Users can see at a glance which polls need their vote
3. Next session is clearly highlighted with countdown
4. Questing Groups can be created, managed, and used in polls
5. Notifications appear in real-time when invited to groups
6. Calendar sync discrepancies are detected and clearly indicated
7. Mobile users have a usable agenda-style fallback view
8. All existing functionality continues to work
9. No performance regression with typical usage patterns

---

## Sources & References

### Libraries Documentation
- [react-big-calendar](https://github.com/jquense/react-big-calendar)
- [date-fns formatDistanceToNow](https://date-fns.org/v2.2.1/docs/formatDistanceToNow)
- [Framer Motion Gestures](https://www.framer.com/motion/gestures/)
- [Radix UI DropdownMenu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)

### Design Inspiration
- [Builder.io React Calendar Components](https://www.builder.io/blog/best-react-calendar-component-ai)
- [Novu React Notifications](https://novu.co/blog/react-notifications)
- [Motion.dev Examples](https://motion.dev/examples)
