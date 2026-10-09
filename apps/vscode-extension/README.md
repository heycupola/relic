# Relic for VS Code and Cursor

Run, debug, and test your code with [Relic](https://withrelic.com) secrets injected. Nobody on your team needs a `.env` file.

Relic is an end-to-end encrypted, zero-knowledge secrets layer. This extension never reads, shows, stores, or logs secret values. Everything that needs a value goes through the `relic` CLI, which decrypts on your machine and injects secrets straight into the process it starts. The extension only ever sees secret **names**.

## Requirements

- The [Relic CLI](https://docs.withrelic.com/introduction#installation), logged in with `relic login`.
- A project linked with `relic init` (a `relic.toml` in your workspace).

The extension activates when your workspace contains a `relic.toml`.

## Features

### Environment picker

The status bar shows the Relic environment used for everything below. Click it (or run **Relic: Select Environment**) to choose from the environments of the linked project. The choice is saved per workspace.

### Run with secrets

**Relic: Run with Secrets** asks for a command and runs it in a terminal as:

```sh
relic run -e <environment> -- <your command>
```

### Tasks

Every `package.json` script is available under **Tasks: Run Task → relic**, running through `relic run` with the selected environment and the package manager your project uses. You can also define tasks yourself:

```jsonc
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    { "type": "relic", "script": "dev", "label": "dev (relic)" },
    { "type": "relic", "command": "bun run migrate", "environment": "staging" },
    { "type": "relic", "command": ["python", "manage.py", "runserver"], "folder": "api" },
  ],
}
```

When `environment` is omitted, the task uses the environment selected in the status bar at the moment it runs.

### Relic shell

Pick **Relic Shell** from the terminal profile dropdown (or run **Relic: Open Shell with Secrets**) to get a shell with secrets loaded via `relic shell`. If your CLI doesn't have `relic shell` yet, you get a plain terminal with instructions to prefix commands with `relic run`.

### Debugging

Run **Relic: Debug Current File with Secrets** (also in the editor's run menu) to debug the active Node.js, TypeScript, Bun, or Python file with secrets injected. Or add `"relic": true` to a launch configuration:

```jsonc
// .vscode/launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "API",
      "program": "${workspaceFolder}/src/index.js",
      "relic": true,
    },
    {
      "type": "bun",
      "request": "launch",
      "name": "Worker",
      "program": "${workspaceFolder}/worker.ts",
      "relic": { "environment": "staging" },
    },
    {
      "type": "debugpy",
      "request": "launch",
      "name": "Django",
      "program": "${workspaceFolder}/manage.py",
      "args": ["runserver", "--noreload"],
      "relic": true,
    },
  ],
}
```

`relic` accepts `true` or `{ "environment", "folder", "scope" }`. Bun needs the [Bun extension](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode); Python needs the [Python Debugger extension](https://marketplace.visualstudio.com/items?itemName=ms-python.debugpy).

### Missing-secret warnings

The extension warns when JavaScript or TypeScript (`process.env.X`, `process.env["X"]`, `import.meta.env.X`, `Bun.env.X`) or Python (`os.environ["X"]`, `os.getenv("X")`, `os.environ.get("X")`) reads a variable that isn't a secret in the selected environment. Quick fixes open the Relic TUI to add it, copy the name, or ignore the variable for the workspace.

## Settings

| Setting                      | Default             | Description                                                     |
| ---------------------------- | ------------------- | --------------------------------------------------------------- |
| `relic.cliPath`              | `relic`             | Path to the CLI. Machine-scoped, so workspaces can't change it. |
| `relic.diagnostics.enabled`  | `true`              | Show missing-secret warnings.                                   |
| `relic.diagnostics.severity` | `warning`           | `error`, `warning`, `information`, or `hint`.                   |
| `relic.diagnostics.ignore`   | common runtime vars | Names that never produce a warning.                             |
| `relic.tasks.packageScripts` | `true`              | Offer `package.json` scripts as Relic tasks.                    |

## Limitations

- On macOS and Linux, `relic run` starts programs with a minimal environment plus your secrets. The extension re-applies a launch configuration's `env` for you, but other variables from your editor aren't inherited.
- Node.js debugging attaches over an inspector port, so child processes aren't debugged automatically. Point `runtimeExecutable` at `node` or `tsx`, not a package manager.
- Python debugging on Windows and remote/WSL/container workspaces are untested.

See the [editor guide](https://docs.withrelic.com/guides/editor) for details.
