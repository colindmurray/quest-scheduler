# Runbook

## Local development
```
cd web
npm install
npm run dev
```

## Build for production
```
npm --prefix web install
npm --prefix web run build
```

## Firebase deploy
- Hosting + Firestore rules + Extensions (recommended):
```
firebase deploy --only hosting,firestore,extensions --project studio-473406021-87ead
```

- Hosting only:
```
firebase deploy --only hosting --project studio-473406021-87ead
```

## Extensions config
- Params: `extensions/firestore-send-email.env`
- Secrets: `extensions/firestore-send-email.secret.local` (ignored by git)

Update extension config:
```
firebase deploy --only extensions --project studio-473406021-87ead
```

## Notes
- Google Calendar access uses OAuth token from Google sign-in. If finalization fails, re-auth.
- SMTP credentials are placeholders until real provider credentials are added.
