# Relic TUI - Development Guide for Claude

This is the Terminal User Interface for Relic, a zero-knowledge secret management platform. The TUI provides CLI access to manage projects, environments, secrets, and authentication using OpenTUI React.

## Tech Stack

- **Bun** - JavaScript runtime (NOT Node.js)
- **OpenTUI React** - React renderer for terminal UIs
- **TypeScript** - Strict typing enabled
- **Convex** - Backend integration (via `@repo/backend`)

## Project Purpose

The TUI enables users to:

- Authenticate via OAuth2 device flow
- Manage projects, environments, and folders
- Perform zero-knowledge encryption operations
- Create, read, update, and delete secrets
- View audit logs
- Manage user keys (RSA key pairs)
- Handle subscription/billing operations

**CRITICAL:** All encryption happens client-side. The TUI must encrypt secrets before sending to the backend. The backend NEVER sees plaintext secrets.

## Bun Best Practices

Default to using Bun instead of Node.js:

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv

### Bun APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`
- `Bun.redis` for Redis. Don't use `ioredis`
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`
- `WebSocket` is built-in. Don't use `ws`
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa

## OpenTUI React Fundamentals

### TypeScript Configuration

The tsconfig.json is already properly configured:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "strict": true,
    "skipLibCheck": true
  }
}
```

### Basic Setup

```typescript
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

function App() {
  return <text>Hello, Relic!</text>;
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});
createRoot(renderer).render(<App />);
```

### Available Components

**Layout & Display:**
- `<text>` - Display text with styling
- `<box>` - Container with borders and layout
- `<scrollbox>` - Scrollable container
- `<ascii-font>` - ASCII art text with different fonts

**Input Components:**
- `<input>` - Single-line text input
- `<textarea>` - Multi-line text input
- `<select>` - Dropdown selection
- `<tab-select>` - Tab-based selection

**Code & Diff:**
- `<code>` - Syntax-highlighted code blocks
- `<line-number>` - Code with line numbers and diagnostics
- `<diff>` - Unified or split diff viewer

**Text Modifiers (inside `<text>`):**
- `<span>`, `<strong>`, `<em>`, `<u>`, `<b>`, `<i>`, `<br>`

### Essential Hooks

**useRenderer()**
Access the renderer instance for console operations:

```typescript
import { useRenderer } from "@opentui/react";

const renderer = useRenderer();

useEffect(() => {
  renderer.console.show();
  console.log("Debug message");
}, []);
```

**useKeyboard(handler, options?)**
Handle keyboard events:

```typescript
import { useKeyboard } from "@opentui/react";

useKeyboard((key) => {
  if (key.name === "escape") {
    process.exit(0);
  }
  if (key.name === "tab") {
    setFocused((prev) => (prev === "username" ? "password" : "username"));
  }
});
```

**useTerminalDimensions()**
Get responsive terminal dimensions:

```typescript
import { useTerminalDimensions } from "@opentui/react";

const { width, height } = useTerminalDimensions();
```

**useOnResize(callback)**
Handle terminal resize events:

```typescript
import { useOnResize } from "@opentui/react";

useOnResize((width, height) => {
  console.log(`Terminal resized to ${width}x${height}`);
});
```

**useTimeline(options?)**
Create animations:

```typescript
import { useTimeline } from "@opentui/react";

const timeline = useTimeline({
  duration: 2000,
  loop: false,
  autoplay: true,
});

timeline.add(
  { width: 0 },
  {
    width: 50,
    duration: 2000,
    ease: "linear",
    onUpdate: (animation) => {
      setWidth(animation.targets[0].width);
    },
  }
);
```

## Architecture Patterns

### Component Organization

Organize components by feature:

```
packages/tui/
├── index.tsx                 # Entry point
├── components/
│   ├── auth/                 # Authentication flows
│   │   ├── DeviceAuth.tsx    # Device flow UI
│   │   └── Login.tsx         # Login form
│   ├── projects/             # Project management
│   │   ├── ProjectList.tsx
│   │   ├── ProjectCreate.tsx
│   │   └── ProjectSettings.tsx
│   ├── environments/         # Environment management
│   ├── secrets/              # Secret operations
│   │   ├── SecretList.tsx
│   │   ├── SecretCreate.tsx
│   │   └── SecretEditor.tsx
│   └── shared/               # Reusable components
│       ├── Modal.tsx
│       ├── StatusBar.tsx
│       └── Navigation.tsx
├── hooks/                    # Custom hooks
│   ├── useConvex.ts
│   ├── useAuth.ts
│   └── useEncryption.ts
├── lib/                      # Utilities
│   ├── crypto.ts             # Encryption logic
│   ├── convex.ts             # Backend client
│   └── storage.ts            # Local storage
└── types/                    # Type definitions
```

### State Management

Use React state for UI, local storage for persistence:

```typescript
import { useState, useEffect } from "react";

// Load from local storage
const [sessionToken, setSessionToken] = useState<string | null>(() => {
  return localStorage.getItem("session_token");
});

// Persist to local storage
useEffect(() => {
  if (sessionToken) {
    localStorage.setItem("session_token", sessionToken);
  } else {
    localStorage.removeItem("session_token");
  }
}, [sessionToken]);
```

### Authentication Flow (Device Auth)

**Step 1: Request Device Code**

```typescript
const { user_code, device_code, verification_uri } =
  await convex.mutation(api.deviceAuth.requestDeviceCode, {
    clientId: "relic-cli",
    scope: "read write",
  });

// Display to user
console.log(`Go to: ${verification_uri}`);
console.log(`Enter code: ${user_code}`);
```

**Step 2: Poll for Approval**

```typescript
const pollInterval = setInterval(async () => {
  try {
    const { session_token } = await convex.mutation(
      api.deviceAuth.pollDeviceToken,
      { device_code }
    );

    if (session_token) {
      clearInterval(pollInterval);
      setSessionToken(session_token);
    }
  } catch (error) {
    if (error.code === "POLLING_TOO_FAST") {
      // Slow down polling
    } else if (error.code === "DEVICE_CODE_EXPIRED") {
      clearInterval(pollInterval);
      // Show error
    }
  }
}, 5000); // Poll every 5 seconds
```

### Encryption Operations

**CRITICAL:** All secret encryption happens in the TUI, not the backend.

**Generate User Keys:**

```typescript
import { generateKeyPair } from "./lib/crypto";

// Generate RSA key pair
const { publicKey, privateKey } = await generateKeyPair();

// Encrypt private key with user password
const encryptedPrivateKey = await encryptPrivateKey(privateKey, password);

// Send to backend
await convex.mutation(api.userKey.create, {
  publicKey,
  encryptedPrivateKey,
  salt: generatedSalt,
});
```

**Encrypt Secret:**

```typescript
import { encryptSecret } from "./lib/crypto";

// Get user's private key
const privateKey = await decryptPrivateKey(encryptedPrivateKey, password);

// Encrypt secret value
const encryptedValue = await encryptSecret(secretValue, publicKey);

// Send to backend
await convex.mutation(api.secret.create, {
  projectId,
  environmentId,
  key: secretKey,
  encryptedValue,
  primitiveType: "string",
});
```

**Decrypt Secret:**

```typescript
import { decryptSecret } from "./lib/crypto";

// Fetch encrypted secret
const secret = await convex.query(api.secret.get, { secretId });

// Get user's private key
const privateKey = await decryptPrivateKey(encryptedPrivateKey, password);

// Decrypt secret value
const plaintext = await decryptSecret(secret.encryptedValue, privateKey);
```

## UI Patterns for Relic

### Login Form Example

```typescript
import { useState } from "react";
import { useKeyboard } from "@opentui/react";

function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<"username" | "password">("username");

  useKeyboard((key) => {
    if (key.name === "tab") {
      setFocused((prev) => (prev === "username" ? "password" : "username"));
    }
    if (key.name === "escape") {
      process.exit(0);
    }
  });

  const handleSubmit = async () => {
    // Authenticate with backend
    const result = await login(username, password);
    if (result.success) {
      setSessionToken(result.token);
    }
  };

  return (
    <box style={{ border: true, padding: 2, flexDirection: "column", gap: 1 }}>
      <text fg="#FFFF00">Relic - Login</text>

      <box title="Username" style={{ border: true, width: 40, height: 3 }}>
        <input
          placeholder="Enter username..."
          onInput={setUsername}
          onSubmit={handleSubmit}
          focused={focused === "username"}
        />
      </box>

      <box title="Password" style={{ border: true, width: 40, height: 3 }}>
        <input
          placeholder="Enter password..."
          onInput={setPassword}
          onSubmit={handleSubmit}
          focused={focused === "password"}
        />
      </box>

      <text fg="#999">Press Tab to switch fields, Enter to submit</text>
    </box>
  );
}
```

### Secret List with Scrolling

```typescript
import { useState, useEffect } from "react";

function SecretList({ environmentId }: { environmentId: string }) {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSecrets = async () => {
      const result = await convex.query(api.secret.listByEnvironment, {
        environmentId,
      });
      setSecrets(result);
      setLoading(false);
    };

    loadSecrets();
  }, [environmentId]);

  if (loading) {
    return <text>Loading secrets...</text>;
  }

  return (
    <scrollbox
      style={{
        rootOptions: { backgroundColor: "#24283b" },
        viewportOptions: { backgroundColor: "#1a1b26" },
        scrollbarOptions: { showArrows: true },
      }}
      focused
    >
      {secrets.map((secret, i) => (
        <box
          key={secret.id}
          style={{
            width: "100%",
            padding: 1,
            marginBottom: 1,
            backgroundColor: i % 2 === 0 ? "#292e42" : "#2f3449",
          }}
        >
          <text>{secret.key}</text>
        </box>
      ))}
    </scrollbox>
  );
}
```

### Select Menu for Projects

```typescript
import { useState } from "react";

function ProjectSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState([]);

  const options = projects.map((project) => ({
    name: project.name,
    description: `Created ${new Date(project.createdAt).toLocaleDateString()}`,
    value: project.id,
  }));

  return (
    <box style={{ border: true, height: 24 }}>
      <select
        style={{ height: 22 }}
        options={options}
        focused={true}
        onChange={(index, option) => {
          setSelectedIndex(index);
          onSelect(option.value);
        }}
      />
    </box>
  );
}
```

### ASCII Art Banner

```typescript
function Banner() {
  return (
    <box style={{ marginBottom: 2 }}>
      <ascii-font text="RELIC" font="block" />
    </box>
  );
}
```

### Status Bar

```typescript
function StatusBar({ user, project }: { user: User; project?: Project }) {
  const { width } = useTerminalDimensions();

  return (
    <box
      style={{
        width,
        height: 3,
        backgroundColor: "#1a1b26",
        borderStyle: "single",
        padding: 1,
      }}
    >
      <text>
        <span fg="#7aa2f7">{user.email}</span>
        {project && (
          <>
            <span fg="#565f89"> | </span>
            <span fg="#bb9af7">{project.name}</span>
          </>
        )}
      </text>
    </box>
  );
}
```

## Backend Integration

### Convex Client Setup

```typescript
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

// Set session token after authentication
convex.setAuth(sessionToken);
```

### Query Pattern

```typescript
// List projects
const projects = await convex.query(api.project.listPersonalProjects, {
  includeArchived: false,
});

// Get single project
const project = await convex.query(api.project.get, {
  projectId: "j97...",
});
```

### Mutation Pattern

```typescript
// Create secret
const result = await convex.mutation(api.secret.create, {
  projectId: "j97...",
  environmentId: "k12...",
  key: "API_KEY",
  encryptedValue: "encrypted_data_here",
  primitiveType: "string",
});

// Update secret
await convex.mutation(api.secret.update, {
  secretId: "m34...",
  encryptedValue: "new_encrypted_data",
});
```

### Error Handling

```typescript
try {
  await convex.mutation(api.secret.create, args);
} catch (error) {
  if (error.code === "RATE_LIMIT_EXCEEDED") {
    console.error("Too many requests. Please try again later.");
  } else if (error.code === "SECRET_NOT_FOUND") {
    console.error("Secret not found.");
  } else if (error.code === "PERMISSION_DENIED") {
    console.error("You don't have permission to perform this action.");
  } else {
    console.error(`Error: ${error.message}`);
  }
}
```

See `packages/backend/lib/errors.ts` for complete error code list.

## Testing

Use Bun's built-in test runner:

```bash
bun test
```

### Test Example

```typescript
import { test, expect } from "bun:test";
import { encryptSecret, decryptSecret } from "./lib/crypto";

test("encrypt and decrypt secret", async () => {
  const { publicKey, privateKey } = await generateKeyPair();
  const plaintext = "my-secret-value";

  const encrypted = await encryptSecret(plaintext, publicKey);
  const decrypted = await decryptSecret(encrypted, privateKey);

  expect(decrypted).toBe(plaintext);
});
```

## Running the TUI

```bash
# Development with hot reload
bun --hot index.tsx

# Production build
bun build index.tsx --outfile dist/tui.js
bun dist/tui.js
```

## Environment Variables

Create `.env` file:

```bash
CONVEX_URL=https://your-deployment.convex.cloud
```

Bun automatically loads `.env` files.

## React DevTools Integration

For debugging (optional):

1. Install dev dependency:
```bash
bun add --dev react-devtools-core@7
```

2. Start DevTools:
```bash
npx react-devtools@7
```

3. Run with DEV flag:
```bash
DEV=true bun --hot index.tsx
```

## DO NOT

- Use Node.js packages (use Bun equivalents)
- Use npm/yarn/pnpm (use `bun install`)
- Send plaintext secrets to the backend
- Store unencrypted private keys
- Use `any` types
- Add emojis to code or comments
- Use JSDoc-style comments
- Skip error handling for Convex calls
- Hardcode terminal dimensions (use `useTerminalDimensions`)

## DO

- Encrypt all secrets client-side before sending to backend
- Use TypeScript strict mode
- Handle keyboard events for navigation (Tab, Escape, Arrow keys)
- Use `useTerminalDimensions()` for responsive layouts
- Persist session tokens securely
- Clear sensitive data from memory after use
- Use `useKeyboard` for all keyboard interactions
- Provide clear error messages to users
- Show loading states during async operations
- Use proper focus management for inputs
- Test encryption/decryption flows thoroughly
- Follow zero-knowledge architecture principles

## Key Principles

1. **Zero-Knowledge**: Backend never sees plaintext secrets
2. **Client-Side Encryption**: All crypto operations happen in the TUI
3. **Responsive UI**: Adapt to terminal size changes
4. **Keyboard-First**: Design for keyboard navigation
5. **Error Handling**: Gracefully handle backend errors
6. **Security**: Never log or expose sensitive data
7. **Performance**: Use pagination for large datasets

For complete OpenTUI React API reference, see the OpenTUI documentation.
For backend API details, see `packages/backend/CLAUDE.md`.
