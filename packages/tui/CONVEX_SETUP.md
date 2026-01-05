# TUI Convex Client - Refactored Implementation

## Overview
Direct imports from `@repo/backend` package to avoid duplication and use typed Convex API.

## Structure

```
packages/tui/convex/
├── config.ts           # Convex client configuration
├── types.ts            # TUI-specific types (Session, DeviceAuth types)
├── index.ts            # Main barrel export
├── context/
│   ├── AuthContext.tsx # React auth context
│   └── index.ts
├── hooks/
│   ├── index.ts         # All hooks export
│   ├── useDeviceAuth.ts # Device auth flow hook
│   ├── useSession.ts    # Session management hook
│   └── useApi.ts        # Typed API hooks
└── services/
    ├── index.ts         # All services export
    ├── api.ts           # Typed API client (uses backend's `api`)
    ├── deviceAuth.ts    # Device auth service (uses backend's `api`)
    ├── session.ts       # Session storage (JWT + session)
    └── jwt.ts           # JWT token exchange
```

## Key Differences from Web App

| Web App | TUI |
|----------|-----|
| Uses `ConvexBetterAuthProvider` with cookies | Uses `ConvexHttpClient` with manual JWT management |
| Auto-refreshes JWT via `authClient.convex.token()` | Manually fetches JWT from `/api/auth/convex/token` |
| JWT stored in memory/browser | JWT cached in `~/.config/relic/session.json` |
| Session stored in HTTP cookies | Session stored in file |

## Auth Flow

```
1. Device Code Request
   └── deviceAuth.requestDeviceCode()
   └── Returns: device_code, user_code, verification_uri

2. Browser Opens
   └── User visits URL and enters user_code

3. Poll for Token
   └── deviceAuth.pollDeviceToken()
   └── Returns: session_token

4. JWT Exchange (NEW!)
   └── GET /api/auth/convex/token with Authorization: Bearer {session_token}
   └── Returns: JWT (valid for 15 min)

5. API Calls
   └── client.setAuth(() => jwtToken)
   └── All Convex mutations/queries/actions

6. Session Storage
   └── ~/.config/relic/session.json
   └── Contains: sessionToken, jwtToken, expiresAt, jwtExpiresAt
```

## Usage Example

```typescript
// In a component
import { useDeviceAuth } from "@repo/tui/convex";

function LoginPage() {
  const { startAuth, status, userCode } = useDeviceAuth({
    onSuccess: () => {
      // Navigate to home
    }
  });

  // Start device auth flow
  await startAuth();
}

// API call
import { useProjects, useCreateProject } from "@repo/tui/convex";

function HomePage() {
  const [projectsState, fetchProjects] = useProjects();
  const [createState, createProject] = useCreateProject();

  const loadProjects = () => fetchProjects();
}
```

## Environment Variables Required

- `CONVEX_URL` - Your Convex deployment URL
- `SITE_URL` - Your web app URL (for JWT token endpoint)

## Next Steps

1. Run `bun install` to install dependencies
2. Run `bunx convex dev` in backend to regenerate types
3. Test device auth flow end-to-end
