/** @jsxImportSource @opentui/react */
import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { ReactNode } from "react";
import { TaskProvider } from "../hooks/useTaskQueue";
import { CommandPaletteModal } from "./modals/CommandPaletteModal";
import { ConfirmPaymentModal } from "./modals/ConfirmPaymentModal";
import { ManageCollaboratorsModal } from "./modals/ManageCollaboratorsModal";
import { ProjectItemList } from "./project/ProjectItemList";
import { ErrorBoundary } from "./shared/ErrorBoundary";
import { GuideBar } from "./shared/GuideBar";
import { Modal } from "./shared/Modal";

type Setup = Awaited<ReturnType<typeof testRender>>;
let current: Setup | null = null;

async function render(node: ReactNode, width = 80, height = 24) {
  current = await testRender(<TaskProvider>{node}</TaskProvider>, { width, height });
  await current.renderOnce();
  return current;
}

afterEach(() => {
  current?.renderer.destroy();
  current = null;
});

const noop = () => {};

describe("GuideBar", () => {
  test("wraps shortcuts onto extra rows instead of hiding them", async () => {
    const { captureCharFrame } = await render(
      <GuideBar
        customWidth={30}
        showHelp={true}
        groups={{
          primary: [
            {
              shortcuts: [
                { key: "e", description: "edit secrets" },
                { key: "v", description: "show values" },
                { key: "n", description: "new folder" },
              ],
            },
          ],
          secondary: [{ shortcuts: [{ key: "q", description: "quit" }] }],
        }}
      />,
    );
    const frame = captureCharFrame();
    for (const label of ["edit secrets", "show values", "new folder", "quit"]) {
      expect(frame).toContain(label);
    }
  });
});

describe("Modal", () => {
  test("clamps to small terminals and keeps the title visible", async () => {
    const { captureCharFrame } = await render(
      <Modal visible={true} title="Edit secrets" width={80} height={28}>
        <text>body</text>
      </Modal>,
      40,
      12,
    );
    const frame = captureCharFrame();
    expect(frame).toContain("Edit secrets");
    expect(frame).toContain("body");
  });
});

describe("CommandPaletteModal", () => {
  test("renders grouped commands inside the shared modal", async () => {
    const { captureCharFrame } = await render(
      <CommandPaletteModal
        visible={true}
        commands={[
          { key: "q", description: "Quit", category: "Navigate" },
          { key: "n", description: "Create project", category: "Create" },
        ]}
        onExecute={noop}
        onClose={noop}
      />,
    );
    const frame = captureCharFrame();
    expect(frame).toContain("Commands");
    expect(frame).toContain("Navigate");
    expect(frame).toContain("Create project");
  });
});

describe("ConfirmPaymentModal", () => {
  test("prefers the backend message", async () => {
    const { captureCharFrame } = await render(
      <ConfirmPaymentModal
        visible={true}
        type="collaborator"
        itemName="dev@example.com"
        message="Adding this collaborator costs $1/month."
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    expect(captureCharFrame()).toContain("costs $1/month");
  });
});

describe("ManageCollaboratorsModal", () => {
  test("shows included usage and the per-collaborator price", async () => {
    const { captureCharFrame } = await render(
      <ManageCollaboratorsModal
        visible={true}
        projectName="api"
        collaborators={[{ id: "s1", email: "a@example.com", name: "A", publicKey: null }]}
        shareLimits={{
          hasPro: true,
          freeShareLimit: 3,
          purchasedSharesCount: 0,
          totalSharesCount: 1,
          unusedShares: 2,
        }}
        onClose={noop}
      />,
    );
    const frame = captureCharFrame();
    expect(frame).toContain("Manage collaborators");
    expect(frame).toContain("1/3 included");
    expect(frame).toContain("$1/month");
  });
});

describe("ProjectItemList", () => {
  const baseProps = {
    viewLevel: "environment" as const,
    selectedIndex: 0,
    scrollOffset: 0,
    pageSize: 10,
    creatingItem: null,
    editingItem: null,
    confirmingDelete: null,
    onCreate: noop,
    onCancelCreate: noop,
    onRename: noop,
    onCancelRename: noop,
  };

  test("masks values until they are decrypted and shown", async () => {
    const { captureCharFrame } = await render(
      <ProjectItemList
        {...baseProps}
        showSecrets={false}
        emptyMessage="empty"
        items={[
          {
            type: "secret",
            id: "1",
            name: "API_KEY",
            value: null,
            secretType: "string",
            secretScope: "server",
          },
        ]}
      />,
    );
    const frame = captureCharFrame();
    expect(frame).toContain("API_KEY");
    expect(frame).toContain("********");
  });

  test("shows the empty state", async () => {
    const { captureCharFrame } = await render(
      <ProjectItemList
        {...baseProps}
        showSecrets={false}
        items={[]}
        emptyMessage="No secrets yet. Press e to add secrets."
      />,
    );
    expect(captureCharFrame()).toContain("No secrets yet");
  });
});

describe("ErrorBoundary", () => {
  function Boom(): ReactNode {
    throw new Error("Project is restricted");
  }

  test("renders a friendly recovery screen", async () => {
    const originalError = console.error;
    console.error = noop;
    try {
      const { captureCharFrame } = await render(
        <ErrorBoundary onRecover={noop} onQuit={noop}>
          <Boom />
        </ErrorBoundary>,
      );
      const frame = captureCharFrame();
      expect(frame).toContain("Something went wrong");
      expect(frame).toContain("no longer have access");
      expect(frame).toContain("go home");
    } finally {
      console.error = originalError;
    }
  });
});
