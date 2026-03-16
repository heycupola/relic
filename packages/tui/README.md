# @repo/tui

Terminal UI for Relic. Built with OpenTUI and React. Provides interactive secret and project operations from the terminal.

## Tech Stack

- **OpenTUI** (`@opentui/core`, `@opentui/react`) -- Terminal UI framework
- **React** -- Component model
- **Convex** -- Real-time backend
- **@repo/auth** -- Authentication and session management

## Screens

| Screen | Description |
|--------|-------------|
| Login | Device code OAuth (Google, GitHub) |
| Password Setup | Master password creation and key generation |
| Password Unlock | Master password verification on return |
| Home | Project list with create, rename, archive |
| Project | Environment, folder, and secret operations |

## Features

- Project management (create, rename, archive)
- Environment management (create, rename, delete)
- Folder management (create, rename, delete)
- Secret operations (view, create, update, delete)
- Bulk import (`.env` and JSON formats)
- Collaborator management (add, revoke with key rotation)
- Pro plan upgrade and billing portal
- Password change

## Navigation

| Key | Action |
|-----|--------|
| `j` / `k` or arrows | Move up / down |
| `Enter` | Select |
| `Esc` | Go back |
| `g` | Open dashboard |
| `?` | Command palette |

## Structure

```
├── index.tsx           # Entry point
├── router.tsx          # Client-side routing
├── context.tsx         # AppProvider (user, auth, Pro status)
├── api.ts              # Convex HTTP client
├── pages/
│   ├── LoginPage.tsx
│   ├── PasswordSetupPage.tsx
│   ├── HomePage.tsx
│   └── ProjectPage.tsx
├── components/
│   ├── shared/         # TaskBar, GuideBar, Modal, DeleteConfirmation
│   ├── modals/         # CommandPalette, ManageCollaborators, BulkImport
│   └── forms/          # TextInput, InlineInput
├── hooks/              # useProjects, useProjectPage, useSecrets, useSharing
├── convex/             # ConvexAuthProvider, useUserKeys, useDeviceAuth
├── types/              # API types, models, keyboard
└── utils/              # Constants, paths, bulk import parsing
```

## Caching

The TUI shares a local SQLite cache with the CLI at `~/.config/relic/relic.db`. When secrets are modified through the TUI, the backend bumps `updatedAt` on the affected environment/folder, invalidating the CLI cache on next run.

User encryption keys are cached separately and persist across session expiry. They are cleared only on explicit logout.

## Development

```bash
bun start          # Start with hot reload
bun run debug      # Start with debug logging
```
