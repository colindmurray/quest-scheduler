# Login and Registration Flow Redesign

## Summary
Introduce an explicit registration and login flow (Google + Email/Password), require email verification for email/password accounts, ensure user profile documents are created immediately on sign-up/sign-in, and support optional Google account linking for email/password users. Preserve existing Discord and Google Calendar linking while fixing missing user records that currently block voting and profile enrichment.

## Current Issues Observed
- New users do not get `users` / `usersPublic` documents until they save Settings.
- Voting and profile enrichment rely on `usersPublic` (by email) and `users` data, so missing docs lead to sparse user data and broken UX.
- Auth gating only checks Firebase auth, not whether a user has a profile record.
- Google Calendar linking currently enforces account email match with auth email, which blocks email/password users from linking a separate Google account.

## Goals
- Require registration before access to protected routes.
- Support Google sign-in and Email/Password registration and login.
- Require email verification for Email/Password users. UX is soft-block (banner, not redirect), but if abuse prevention is required, add server-side enforcement in Firestore rules (see "Email Verification" section).
- Ensure user docs are created on first sign-in (Google or Email/Password).
- Allow email/password users to link a Google account later.
- Keep Discord linking and calendar linking functional.
- Display name is optional and not required at registration. For email/password users, default display name is the full email address until changed in Settings. For Google users, default display name is the Google name but can be changed in Settings.

## UX Flow

### Landing Page
- Primary CTA routes to a dedicated Auth page at `/auth`.
- Offer both Google sign-in (prominent) and Email/Password (secondary).

### Auth Page Design
- Single `/auth` route with two tabs: **"Log in"** and **"Create account"**
- Use distinct terminology to avoid confusion (not "Sign in" / "Sign up")
- Google sign-in button is visually prominent (better conversion)
- Email/password form below Google option

### Registration (Email/Password)
- Required: email, password, Terms/Privacy acceptance checkbox.
- Send verification email on registration.
- On success:
  - Create `users` and `usersPublic` docs immediately.
  - Redirect to dashboard with verification banner (soft-block).

### Registration (Google)
- Use Google popup sign-in.
- Clicking "Continue with Google" implies Terms/Privacy acceptance.
- Create `users` and `usersPublic` docs on success.
- Do not prompt for display name at registration; allow editing later in Settings.

### Login (Email/Password)
- Sign in normally.
- Ensure `users` / `usersPublic` docs exist (create if missing for legacy users).

### Login (Google)
- Use Google popup sign-in.
- Ensure `users` / `usersPublic` docs exist (create if missing for legacy users).

### Account Linking (Email/Password -> Google)
- Add a Settings action: "Link Google account".
- Use Firebase account linking to attach Google provider to the existing user.
- Handle provider conflicts with specific, actionable error messages.
- **Important distinction:** This is for *login purposes* (sign in with Google instead of password). Calendar linking is separate and handled independently—users don't need to link their Google account for login to use Google Calendar.

### Email Verification (Soft-Block)
- Unverified email/password users can access the app but see a persistent banner.
- Banner includes: explanation, "Resend verification email" button, "Refresh status" button.
- Google users are treated as verified by default.

**Enforcement strategy for sensitive actions:**

**Option A: UI-level only (minimal effort, no abuse protection)**
- Frontend checks `user.emailVerified` before allowing poll creation, invitations, etc.
- Show inline message: "Please verify your email to create polls."
- ⚠️ Can be bypassed by determined users via direct API calls.
- Suitable only if abuse is not a concern.

**Option B: Server-side enforcement (recommended if abuse prevention matters)**

Firestore rules can check `email_verified` from the auth token:
```
function isEmailVerified() {
  return request.auth.token.email_verified == true
      || request.auth.token.firebase.sign_in_provider == 'google.com';
}

match /schedulers/{schedulerId} {
  allow create: if isSignedIn() && isEmailVerified();
}
```

This provides enforcement that can't be bypassed. No custom claims needed - `email_verified` is already in the token.

**Recommendation:** If preventing spam/abuse from unverified accounts is a goal, implement Option B from the start. It's minimal additional effort and closes the bypass hole. UI checks are still useful for good UX messaging but should not be the only enforcement.

### Password Reset ("Forgot Password")
- Add "Forgot password?" link on the login form.
- **Always show generic success message** to avoid revealing account information.
- Send appropriate email based on account type (password reset OR informational).

**Flow:**
1. User clicks "Forgot password?" on login form.
2. User enters their email address.
3. Frontend calls `fetchSignInMethodsForEmail(email)` to check providers.
4. **Always show:** "If an account exists with this email, you'll receive an email shortly."
5. Behind the scenes:
   - **If providers include `'password'`:** Send password reset email via Firebase Auth.
   - **If providers exist but don't include `'password'` (Google-only):** Send informational email via SendGrid explaining they should use Google sign-in.
   - **If no providers (email not registered):** Do nothing (no email sent).
6. User receives appropriate email → takes action.

**Security rationale:**
- Never reveal on the UI whether an email is registered or what provider they use.
- Only the legitimate email owner sees the account-specific information.
- Prevents attackers from enumerating accounts or determining sign-in methods.

**Implementation (Hybrid Approach):**

Use a hybrid approach for efficiency:
- Frontend calls `sendPasswordResetEmail()` directly for password accounts (works for unauthenticated users)
- Cloud Function `sendPasswordResetInfo` handles Google-only accounts (writes to `mail` collection)

**Frontend:**
```js
// web/src/lib/auth.js
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

export async function handleForgotPassword(email) {
  const auth = getAuth();
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Try sending password reset - works if user has password provider
    await sendPasswordResetEmail(auth, normalizedEmail);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      // No account - do nothing, don't reveal this
    } else {
      // Might be Google-only or other error - call function to send info email
      const functions = getFunctions();
      const sendPasswordResetInfo = httpsCallable(functions, 'sendPasswordResetInfo');
      await sendPasswordResetInfo({ email: normalizedEmail }).catch(() => {});
    }
  }

  // Always return same message regardless of outcome
  return {
    success: true,
    message: "If an account exists with this email, you'll receive an email shortly."
  };
}
```

**Cloud Function (for Google-only accounts):**
```js
// functions/src/auth.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

exports.sendPasswordResetInfo = onCall(async (request) => {
  const { email } = request.data;
  if (!email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', 'Email is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const auth = getAuth();
  const db = getFirestore();

  try {
    const userRecord = await auth.getUserByEmail(normalizedEmail);
    const hasPassword = userRecord.providerData.some(p => p.providerId === 'password');

    if (!hasPassword) {
      // Google-only account - send informational email via SendGrid
      // Note: Email template is inlined here since functions/ doesn't have web/src/lib/emailTemplates.js
      await db.collection('mail').add({
        to: normalizedEmail,
        message: {
          subject: 'Password Reset Request - Quest Scheduler',
          text: `You requested a password reset, but your account is set up with Google sign-in.\n\nTo log in, visit https://questscheduler.cc/auth and click "Continue with Google".\n\nIf you didn't request this, you can safely ignore this email.`,
          html: `<p>You requested a password reset, but your account is set up with Google sign-in.</p><p>To log in, visit <a href="https://questscheduler.cc/auth">Quest Scheduler</a> and click "Continue with Google".</p><p>If you didn't request this, you can safely ignore this email.</p>`,
        },
      });
    }
    // If has password, frontend already handled it via sendPasswordResetEmail
  } catch (error) {
    // User doesn't exist or other error - do nothing
    if (error.code !== 'auth/user-not-found') {
      console.error('sendPasswordResetInfo error:', error);
    }
  }

  return { success: true };
});
```

**Note:** The email template is inlined in the Cloud Function. If you want consistent styling with other emails, create a shared `functions/src/emailTemplates.js` module or extract the template logic to a shared location.

**Email scenarios:**

| Account Type | Email Sent | Content |
|--------------|------------|---------|
| Has password | Firebase Auth email | Standard password reset link |
| Google-only | SendGrid email | "Your account uses Google sign-in" + link to login page |
| Not registered | None | (User sees generic success message anyway) |

**Email Configuration:**
- Password reset emails: Firebase Auth built-in (customizable in Firebase Console → Authentication → Templates)
- Google-only informational emails: SendGrid via `firestore-send-email` extension
- Both use sender `noreply@questscheduler.cc`

### Registration Requirement

**Clarification: "Registration" = "First Sign-In"**

In this design, registration and sign-in are effectively the same action:
- User signs in (Google or email/password)
- If no user doc exists, create it automatically
- No separate "registration complete" step or onboarding wizard

This is intentional for minimal friction. The "registration" distinction is:
- **Email/password:** User explicitly creates account with email + password + terms checkbox
- **Google:** User clicks "Continue with Google" (implicit terms acceptance)

**If you want an explicit registration gate** (e.g., onboarding wizard, required profile fields), add a `registrationComplete` flag:
```js
// In ensureUserProfile():
await setDoc(userRef, {
  // ... other fields
  registrationComplete: false, // Set true after onboarding
}, { merge: true });

// In ProtectedRoute:
if (!userProfile.registrationComplete) {
  return <Navigate to="/onboarding" />;
}
```

**Recommendation for Quest Scheduler:** Keep it simple. Auto-create docs on first sign-in, no separate registration gate. The current design is sufficient.

## Data Model Updates

### `users/{uid}`
Created or merged on first sign-in. Fields:
- `email` (lowercase)
- `displayName` (defaults to full email address for email/password, Google name for Google users)
- `photoURL`
- `emailNotifications` (default true)
- `createdAt`, `updatedAt`
- `settings.linkedCalendarEmail` - email of linked Google account for calendar (if different from auth email)
- (existing settings fields unchanged)

**Note on auth providers:** Don't store `authProvider` in Firestore. After linking, a user can have multiple providers (e.g., both `password` and `google.com`). Instead, derive this at runtime from `user.providerData`:
```js
function getAuthProviders(user) {
  return user.providerData.map(p => p.providerId);
  // Returns e.g. ['password'], ['google.com'], or ['password', 'google.com']
}

function hasPasswordProvider(user) {
  return user.providerData.some(p => p.providerId === 'password');
}

function hasGoogleProvider(user) {
  return user.providerData.some(p => p.providerId === 'google.com');
}
```

### `usersPublic/{uid}`
Created or merged on first sign-in. Fields:
- `email` (lowercase)
- `displayName`
- `photoURL`
- `emailNotifications` (default true)
- `updatedAt`

## Key Code Areas to Update

### Frontend
- `web/src/App.jsx`
  - Add route for `/auth` page.
  - Update public route list.
- `web/src/features/auth/AuthPage.jsx` (new)
  - Unified auth page with "Log in" / "Create account" tabs.
  - Google button prominent, email/password form secondary.
  - Terms/Privacy checkbox for email/password registration.
- `web/src/features/landing/LandingPage.jsx`
  - Update CTA button to navigate to `/auth`.
- `web/src/lib/auth.js`
  - Add `registerWithEmailPassword(email, password)` helper.
  - Add `signInWithEmailPassword(email, password)` helper.
  - Add `sendVerificationEmail()` helper.
  - Add `linkGoogleAccount()` helper for account linking.
  - Add `resetPassword(email)` helper using `fetchSignInMethodsForEmail` + `sendPasswordResetEmail`.
- `web/src/lib/data/users.js`
  - Add `ensureUserProfile(user)` to create `users` and `usersPublic` docs.
  - Use full email address as default display name for email/password users.
- `web/src/app/AuthProvider.jsx`
  - On auth state change, call `ensureUserProfile` (guarded to avoid unnecessary writes).
  - Track whether user profile exists in context.
- `web/src/app/ProtectedRoute.jsx`
  - Require both auth and user profile presence.
  - Render `VerificationBanner` for unverified email/password users (soft-block).
- `web/src/components/VerificationBanner.jsx` (new)
  - Persistent banner for unverified users.
  - "Resend email" and "I've verified, refresh" actions.
- `web/src/features/settings/SettingsPage.jsx`
  - Add editable display name field (defaults to email or Google name).
  - Add "Link Google account" button for email/password users.
  - Show linked Google account state if applicable.
  - Show verification status with resend option.

### Cloud Functions
- `functions/src/index.js`
  - Add `onUserCreate` trigger (`auth.user().onCreate()`) as backup for user doc creation.
  - Ensures docs are created even if frontend fails.
- `functions/src/auth.js` (new)
  - Add `sendPasswordResetInfo` callable function for forgot password flow (Google-only accounts).
  - Required because unauthenticated users cannot write to `mail` collection.
  - Email template is inlined; optionally create `functions/src/emailTemplates.js` for consistency.
- `functions/src/legacy.js`
  - Update Google Calendar OAuth callback (lines 491-500):
    - Remove strict email match requirement.
    - Use `admin.auth().getUserByEmail()` to check if OAuth email belongs to another user - block if so.
    - Store linked calendar email in `users/{uid}.settings.linkedCalendarEmail`.

## Firebase Configuration Requirement

**"One account per email address" must be ENABLED** in Firebase Console → Authentication → Settings.

This setting ensures:
- Each email can only be associated with one Firebase Auth account
- Prevents duplicate accounts across providers
- Required for the conflict handling described below

## Account Linking & Conflict Scenarios

### Scenario 1: Email/Password User Links Google Account (Same Email)
- User registered with `user@gmail.com` (email/password)
- Clicks "Link Google account" in Settings
- Signs into Google with `user@gmail.com`
- **Result:** Success. User can now sign in with either method.
- Firebase merges the Google provider into the existing account.

### Scenario 2: Email/Password User Links Google Account (Different Email)
- User registered with `user@company.com` (email/password)
- Clicks "Link Google account" in Settings
- Signs into Google with `user@gmail.com` (different email)
- **Result:** Success. Firebase allows linking providers with different emails.
- The account's primary email remains `user@company.com`.
- User can sign in with either:
  - Email/password using `user@company.com`
  - Google using `user@gmail.com`
- **UI:** Show informational notice in Settings:
  ```
  🔗 Google account linked (user@gmail.com)
     ℹ️ Different from login email (user@company.com)
  ```

### Scenario 3: Email/Password User Links Google Account Already Used by Another User
- User A registered with `alice@company.com` (email/password)
- User B already exists with `shared@gmail.com` (Google sign-in)
- User A tries to link `shared@gmail.com`
- **Result:** Firebase throws `auth/credential-already-in-use`
- **UI:** Show error: "This Google account is already linked to another Quest Scheduler account."

### Scenario 4: Google User Tries to Register with Email/Password (Same Email)
- User signed up with Google (`user@gmail.com`)
- Later visits `/auth` and tries to create email/password account with `user@gmail.com`
- **Result:** Firebase throws `auth/email-already-in-use`
- **UI:** Show error: "This email is already registered. Please log in with Google instead."

### Scenario 5: Google User Tries to Register with Email/Password (Different Email)
- User signed up with Google (`user@gmail.com`)
- Later visits `/auth` and tries to create email/password account with `user@company.com`
- **Result:** This creates a SECOND, separate account.
- **Mitigation:** This is allowed but results in two accounts.

**UI copy to discourage accidental duplicate accounts:**

On the "Create account" tab, add helper text:
> "Already have an account? [Log in](/auth) instead. You can add additional sign-in methods in Settings."

On the Settings page "Link Google account" section:
> "Link your Google account to sign in with either Google or your password. Note: The Google account email doesn't need to match your login email."

**Policy decision:** Allowing one user to sign in with two different emails (via linking) is a feature, not a bug. It lets users:
- Register with work email, link personal Google
- Sign in from either identity

If this is undesirable, you could enforce same-email linking only, but this reduces flexibility for legitimate use cases.

### Scenario 6: New User Signs Up with Google, Email Already Has Password Account
- User previously registered with `user@gmail.com` (email/password)
- Later clicks "Continue with Google" using the same email
- **Result:** Firebase throws `auth/account-exists-with-different-credential`
- **UI:** Show error: "An account with this email already exists. Please log in with email/password, then link Google from Settings."
- **Resolution:** User logs in with email/password, goes to Settings, clicks "Link Google account", and authenticates with Google. After linking, they can sign in with either method going forward.

## Account Linking Error Handling

Specific error messages for each scenario:

| Error Code | User Message |
|------------|--------------|
| `auth/credential-already-in-use` | "This Google account is already linked to another Quest Scheduler account. Please use a different Google account or contact support." |
| `auth/account-exists-with-different-credential` | "An account with this email already exists. Please log in with your existing method first, then link Google from Settings." |
| `auth/email-already-in-use` | "This email is already registered. Please log in instead." |
| `auth/weak-password` | "Password must be at least 6 characters." |
| `auth/invalid-email` | "Please enter a valid email address." |
| `auth/user-not-found` | (Don't expose - show generic "If an account exists..." message) |
| `auth/too-many-requests` | "Too many attempts. Please try again later." |

## Calendar Linking Updates

**Note:** Calendar linking is independent of auth provider linking. A user can:
- Sign in with email/password only, and link any Google account for calendar
- Sign in with Google, and link a *different* Google account for calendar
- Link Google for login AND use the same or different Google for calendar

When linking a Google Calendar with a different email than the auth email:
1. Remove the strict email match check in `functions/src/legacy.js:491-500`.
2. **Use Admin Auth `getUserByEmail()`** to check if the OAuth email belongs to another Firebase Auth user - block if so. Don't use `usersPublic` because legacy users may not have that doc.
   ```js
   // In googleCalendarOAuthCallback:
   const oauthEmail = await getOAuthEmail(oauth2Client, tokens);
   try {
     const existingUser = await admin.auth().getUserByEmail(oauthEmail);
     if (existingUser.uid !== uid) {
       // This Google account's email belongs to a different user
       res.status(409).send('This Google account is already associated with another Quest Scheduler account.');
       return;
     }
   } catch (error) {
     // auth/user-not-found means email isn't registered - that's fine, allow linking
     if (error.code !== 'auth/user-not-found') throw error;
   }
   ```
3. Store `settings.linkedCalendarEmail` on success.
4. In Settings UI, display the linked calendar email with a warning if it differs from login email:
   ```
   📅 Google Calendar linked (john@gmail.com)
      ⚠️ Different from login email (john@company.com)
   ```

## Display Name Defaults

```js
function getDefaultDisplayName(user) {
  if (user.displayName) {
    // Google users have displayName from Google profile
    return user.displayName;
  }
  // Email/password users: use full email address
  return user.email || 'User';
}
```

## Phased Implementation Plan

### Phase 0: Firebase Configuration
- Verify "One account per email address" is ENABLED in Firebase Console.
- Enable "Email/Password" sign-in provider in Firebase Console (already done per user).
- Review and update Firestore security rules if needed for new fields.

### Phase 1: Foundation - Auth Helpers + User Doc Creation
- Implement `ensureUserProfile()` in `web/src/lib/data/users.js`.
- Add email/password auth helpers in `web/src/lib/auth.js`.
- Add `onUserCreate` Cloud Function as server-side backup.
- Add `sendPasswordResetInfo` callable Cloud Function for forgot password flow.
- Update `AuthProvider` to call `ensureUserProfile` on auth state change.

### Phase 2: Auth UI + Routes
- Create `/auth` page with "Log in" / "Create account" tabs.
- Google sign-in button prominent, email/password form secondary.
- Terms/Privacy checkbox for email/password registration.
- Add "Forgot password?" link on login tab with modal/inline flow.
- Update landing page CTA to navigate to `/auth`.
- Add `/auth` to public routes in `App.jsx`.

### Phase 3: Registration Guard + Verification Banner
- Update `ProtectedRoute` to require user profile doc.
- Create `VerificationBanner` component for unverified email/password users.
- Implement soft-block: show banner but allow access.
- Add resend verification and refresh status functionality.

### Phase 4: Calendar Linking Update
- Remove strict email match in `functions/src/legacy.js:491-500`.
- Add duplicate email check using `admin.auth().getUserByEmail()` (not `usersPublic`).
- Store linked calendar email in user settings.
- Add UI warning in Settings when calendar email differs from login email.

### Phase 5: Settings UI Enhancements
- Add "Link Google account" button for email/password users.
- Show linked Google account state.
- Show email verification status with resend option.
- Display linked calendar email with mismatch warning.

## Resolved Questions

**Q: Should users be warned when linking a Google calendar email that differs from their login email?**

A: Yes. Display a subtle warning in Settings UI to ensure user clarity:
```
📅 Google Calendar linked (john@gmail.com)
   ⚠️ Different from login email (john@company.com)
```
This is informational only and does not block the action.

## Email Infrastructure Notes

The app has **two separate email systems**:

### 1. Firebase Auth Emails (for authentication)
- **Used for:** Password reset, email verification
- **Sent via:** Firebase Authentication's built-in email service
- **Configured in:** Firebase Console → Authentication → Templates
- **Functions:** `sendPasswordResetEmail()`, `sendEmailVerification()`
- **No code changes needed** - Firebase handles delivery

### 2. SendGrid Extension (for transactional notifications)
- **Used for:** Poll invites, friend requests, finalization notices, vote notifications
- **Sent via:** `firestore-send-email` extension with SendGrid SMTP
- **Configured in:** `extensions/firestore-send-email.env`
- **Pattern:** Write to `mail` collection → extension sends email
- **Template builder:** `web/src/lib/emailTemplates.js`

**Why two systems?**
- Firebase Auth emails are tightly integrated with secure token verification (reset links, verification links)
- Transactional emails need custom templates and are triggered by app events, not auth events
- Keeping them separate is the recommended Firebase pattern

## References

### Official Firebase Documentation
- [Firebase Account Linking](https://firebase.google.com/docs/auth/web/account-linking)
- [Firebase Email Verification](https://firebase.blog/posts/2017/02/email-verification-in-firebase-auth/)
- [Firebase Password-Based Auth](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase Manage Users](https://firebase.google.com/docs/auth/web/manage-users)

### Supplementary Resources
- [sendPasswordResetEmail behavior for non-existent emails (GitHub issue)](https://github.com/firebase/firebase-js-sdk/issues/7651)
- [Login & Signup UX 2025 Guide (Authgear)](https://www.authgear.com/post/login-signup-ux-guide) - UX patterns, not Firebase-specific

### Related Design Docs
- [Discord Login Portal Design](./discord-login-portal.md) - Adds Discord OAuth as a third login provider with custom token flow
- [Display Names and Usernames](./display-names-and-usernames.md) - Public identifier system for user identity and blocking
