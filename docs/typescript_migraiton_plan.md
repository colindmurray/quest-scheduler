# TypeScript Migration Plan (Piece-Meal)

## Summary
Yes, a piecemeal migration is feasible here. The web app is Vite + React and already has type definitions for React, and Firebase Functions are structured with a `src/` entry. By enabling `allowJs` in TypeScript configs, we can keep JS/JSX running while converting one file at a time to TS/TSX.

This plan focuses on:
- Keeping build/dev workflows stable.
- Allowing JS and TS to coexist.
- Migrating in small, reviewable steps.

## Current State Snapshot
- Web app: `web/src` is entirely `.js/.jsx` (no TS config yet).
- Functions: `functions/src` is JS; `functions/index.js` re-exports `functions/src/index.js`.
- Tooling: no `tsconfig.json` in either `web/` or `functions/`.

## Principles For Piecemeal Migration
1. **Allow JS + TS side by side** (TypeScript `allowJs: true`, `checkJs: false`).
2. **No big bang refactors**; convert one file/module at a time.
3. **Type safety grows with each converted module**; JS files are untouched until ready.
4. **Prefer migrating leaf modules first** (utils, data access) to reduce churn.
5. **Keep runtime behavior unchanged**; only type and import changes.

## Phase 0 — Tooling Baseline (No File Renames Yet)

### Web
- Add `web/tsconfig.json` enabling JS alongside TS.
- Add `web/src/vite-env.d.ts` for Vite types.
- Install `typescript` (dev dependency).
- Update ESLint to handle `.ts/.tsx`.
- Add `npm --prefix web run typecheck` script (tsc --noEmit).

Example `web/tsconfig.json` baseline:
```
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "isolatedModules": true,
    "strict": false,
    "skipLibCheck": true,
    "baseUrl": "."
  },
  "include": ["src"]
}
```

### Functions
- Add `functions/tsconfig.json` for Node 22 (CJS output) with `allowJs`.
- Install `typescript` + `@types/node`.
- Add `npm --prefix functions run build` (tsc) and `typecheck`.
- Update `firebase.json` to add functions predeploy build.

Example `functions/tsconfig.json` baseline:
```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "lib": ["ES2022"],
    "moduleResolution": "Node",
    "allowJs": true,
    "checkJs": false,
    "outDir": "lib",
    "rootDir": "src",
    "esModuleInterop": true,
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Add to `firebase.json`:
```
"functions": {
  "source": "functions",
  "runtime": "nodejs22",
  "predeploy": ["npm --prefix functions run build"]
}
```

Update `functions/package.json`:
- `main`: `lib/index.js`
- Add scripts: `build`, `typecheck`

This keeps JS running but allows TS files to compile alongside.

## Phase 1 — Low-Risk Web Modules (Utility + Data)
Target files with minimal React or DOM usage to minimize typing overhead.

Suggested order:
1. `web/src/lib/*.js` (pure utilities)
2. `web/src/lib/data/*.js` (Firestore access)
3. `web/src/lib/identity.js`, `web/src/lib/auth.js`

What it looks like:
- Rename `identifiers.js` → `identifiers.ts`.
- Add explicit return types.
- Convert default exports to named exports if helpful (optional).
- Keep tests as JS unless needed.

Example single-file step:
- Rename: `web/src/lib/identifiers.js` → `web/src/lib/identifiers.ts`
- Add types to exported functions
- Update import paths in any consumers

## Phase 2 — Hooks + Shared Components
After the lib/data layer has types, migrate hooks and shared components.

Suggested order:
1. `web/src/hooks/*.js`
2. `web/src/components/*.jsx`

Notes:
- Hooks benefit from typed inputs (ex: ID strings, Firestore doc shapes).
- For components, start with leaf UI components that have fewer props.

## Phase 3 — Feature Modules
Convert features one at a time to reduce surface area of type churn.

Suggested order:
1. `web/src/features/settings`
2. `web/src/features/scheduler`
3. `web/src/features/voting`

Each feature conversion should include:
- Types for feature-level state and data payloads.
- A pass on key forms (react-hook-form schemas can drive TS types).

## Phase 4 — App Shell + Routing
Convert the app root once feature modules are mostly typed:
- `web/src/App.jsx` → `App.tsx`
- `web/src/main.jsx` → `main.tsx`
- `web/src/app/*` providers and routes

This is last because it touches the most dependencies.

## Functions Migration (Piece-Meal)

### Phase A — Shared Types + Helpers
- Add `functions/src/types/` for shared payload types (IDs, Firestore docs).
- Convert small helpers in `functions/src/*`.

### Phase B — Triggers + Callables
- Convert scheduler triggers and legacy callables once types exist.
- Keep exports in `functions/src/index.ts` mirroring the current `module.exports` object.

### Phase C — Discord Modules
- Convert `functions/src/discord/*` later because they tend to use complex external types.
- Add explicit types for request/response payloads first.

### Phase D — Scripts
- Convert `functions/scripts/*` only if needed; they can stay JS indefinitely.

## Example Incremental Diff (Web)
1. Convert a single file:
   - `web/src/lib/identity.js` → `web/src/lib/identity.ts`
2. Add types to `getIdentityFromUser` (or similar)
3. Update imports in dependents
4. Run `npm --prefix web run typecheck`

## Example Incremental Diff (Functions)
1. Convert `functions/src/auth.js` → `functions/src/auth.ts`
2. Add minimal types for function handlers
3. Run `npm --prefix functions run build` and `npm --prefix functions run test`

## Type Strategy (Web + Functions)
- Use `zod` schemas to derive TS types (already in deps).
- Keep Firestore timestamps typed consistently (`Timestamp` from `firebase/firestore`).
- Add central types for:
  - Poll
  - Slot
  - Vote
  - UserProfile
  - QuestingGroup

## ESLint Strategy
- Add TS support via `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`.
- Scope TS rules to `**/*.{ts,tsx}` while keeping existing JS rules.
- Keep `no-unused-vars` in both with TS-aware variant.

## Risks + Mitigations
- **Type churn in shared types**: introduce types centrally and refactor outward.
- **Build drift**: keep `typecheck` separate from `build` until ready to enforce.
- **Firebase Functions packaging**: use `tsc` output to `lib/` with consistent `main`.

## Proposed Milestones
1. Tooling baseline (tsconfig + typecheck scripts) — no file changes.
2. Convert 3-5 `web/src/lib` modules.
3. Convert 3-5 hooks and 2-3 shared components.
4. Convert one feature module end-to-end.
5. Convert app shell.
6. Convert functions helpers + triggers.
7. Convert discord modules.

## What "One File At A Time" Looks Like (Checklist)
For each file:
- Rename `.js/.jsx` → `.ts/.tsx`
- Fix imports to match new extensionless paths
- Add minimal types (use `unknown` + narrow later if needed)
- Run `typecheck` (and tests if behavior touched)
- Update docs/task-list.md progress notes

## Ready To Start
If you want, I can implement Phase 0 (tooling baseline) and then migrate a first module as a working example.
