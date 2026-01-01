import { useTerminalDimensions } from "@opentui/react";
import { THEME_COLORS } from "../../lib/constants";

interface Command {
  key: string;
  description: string;
  category?: string;
}

interface CommandPaletteModalProps {
  visible: boolean;
  commands: Command[];
  selectedIndex: number;
  onClose: () => void;
}

export function CommandPaletteModal({
  visible,
  commands,
  selectedIndex,
  onClose: _onClose,
}: CommandPaletteModalProps) {
  const { width, height } = useTerminalDimensions();

  if (!visible) return null;

  const modalWidth = 50;

  // Group commands by category with pre-computed indices
  const categoriesOrder = ["Create", "Manage", "View"];
  const categorizedCommands: Array<
    { type: "header"; category: string } | { type: "command"; command: Command; index: number }
  > = [];

  let currentIndex = 0;
  for (const category of categoriesOrder) {
    const cmds = commands.filter((c) => c.category === category);
    if (cmds.length > 0) {
      categorizedCommands.push({ type: "header", category });
      for (const cmd of cmds) {
        categorizedCommands.push({ type: "command", command: cmd, index: currentIndex });
        currentIndex++;
      }
    }
  }

  // Height calculation
  const contentHeight = categorizedCommands.length + 4;
  const modalHeight = Math.min(contentHeight, height - 6);
  const left = Math.floor((width - modalWidth) / 2);
  const top = Math.floor((height - modalHeight) / 2);

  return (
    <>
      {/* Background overlay */}
      <box
        position="absolute"
        left={0}
        top={0}
        width={width}
        height={height}
        backgroundColor={THEME_COLORS.background}
      />
      {/* Modal card */}
      <box
        position="absolute"
        left={left}
        top={top}
        width={modalWidth}
        height={modalHeight}
        backgroundColor={THEME_COLORS.header}
        flexDirection="column"
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {/* Header - minimal style */}
        <box height={1} flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text fg={THEME_COLORS.text}>
            <strong>Commands</strong>
          </text>
          <text>
            <span fg={THEME_COLORS.textDim}>[</span>
            <span fg={THEME_COLORS.primary}>esc</span>
            <span fg={THEME_COLORS.textDim}>]</span>
            <span fg={THEME_COLORS.textMuted}> close</span>
          </text>
        </box>

        {/* Command List - no separator line */}
        <box flexDirection="column">
          {categorizedCommands.map((item, idx) => {
            if (item.type === "header") {
              return (
                <box key={`header-${item.category}`} height={1}>
                  <text fg={THEME_COLORS.textDim}>{item.category}</text>
                </box>
              );
            }

            const isSelected = item.index === selectedIndex;
            const cmdWidth = modalWidth - 4;

            return (
              <box
                key={`cmd-${item.command.key}`}
                height={1}
                width={cmdWidth}
                flexDirection="row"
                justifyContent="space-between"
              >
                <text>
                  <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textDim}>
                    {isSelected ? "› " : "  "}
                  </span>
                  <span fg={isSelected ? THEME_COLORS.text : THEME_COLORS.textMuted}>
                    {item.command.description}
                  </span>
                </text>
                <text>
                  <span fg={THEME_COLORS.textDim}>[</span>
                  <span fg={isSelected ? THEME_COLORS.primary : THEME_COLORS.textMuted}>
                    {item.command.key}
                  </span>
                  <span fg={THEME_COLORS.textDim}>]</span>
                </text>
              </box>
            );
          })}
        </box>
      </box>
    </>
  );
}
