/** @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { THEME_COLORS } from "../../utils/constants";
import { Modal } from "../shared/Modal";

interface Command {
  key: string;
  description: string;
  category?: string;
  disabled?: boolean;
}

interface ControlledProps {
  selectedIndex: number;
  onExecute?: never;
}

interface SmartProps {
  selectedIndex?: never;
  onExecute?: (command: Command) => void;
}

interface CommonProps {
  visible: boolean;
  commands: Command[];
  onClose: () => void;
}

type CommandPaletteModalProps = CommonProps & (ControlledProps | SmartProps);

function isControlled(props: CommandPaletteModalProps): props is CommonProps & ControlledProps {
  return "selectedIndex" in props && props.selectedIndex !== undefined;
}

/**
 * CommandPaletteModal - A modal showing available keyboard commands
 *
 * Supports two modes:
 * 1. **Controlled mode**: Pass `selectedIndex` - parent manages selection state
 * 2. **Smart mode**: Pass `onExecute` - component manages selection and keyboard
 *
 * Smart mode handles:
 * - Up/Down or j/k navigation
 * - Enter to execute selected command
 * - Escape to close
 * - Skips disabled commands
 *
 * @example
 * // Smart mode (recommended)
 * <CommandPaletteModal
 *   visible={showPalette}
 *   commands={commands}
 *   onExecute={(cmd) => executeCommand(cmd.key)}
 *   onClose={() => setShowPalette(false)}
 * />
 *
 * @example
 * // Controlled mode (legacy)
 * <CommandPaletteModal
 *   visible={showPalette}
 *   commands={commands}
 *   selectedIndex={selectedIdx}
 *   onClose={handleClose}
 * />
 */
export function CommandPaletteModal(props: CommandPaletteModalProps) {
  const { visible, commands, onClose } = props;

  if (!visible) return null;

  if (!isControlled(props)) {
    return <SmartCommandPaletteModal {...props} />;
  }

  return (
    <CommandPaletteDisplay
      commands={commands}
      selectedIndex={props.selectedIndex}
      onClose={onClose}
    />
  );
}

const CATEGORIES_ORDER = ["Navigate", "Create", "Manage", "View", "Account"];

/** Orders commands the same way the palette displays them, so indexes line up. */
function orderByCategory(commands: Command[]): Command[] {
  const extraCategories = Array.from(
    new Set(commands.map((c) => c.category).filter((c): c is string => !!c)),
  ).filter((cat) => !CATEGORIES_ORDER.includes(cat));
  return [...CATEGORIES_ORDER, ...extraCategories].flatMap((category) =>
    commands.filter((c) => c.category === category),
  );
}

function SmartCommandPaletteModal({
  commands: unorderedCommands,
  onClose,
  onExecute,
}: CommonProps & SmartProps) {
  const commands = orderByCategory(unorderedCommands);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(
      0,
      commands.findIndex((c) => !c.disabled),
    ),
  );

  const findNextIndex = (current: number, direction: 1 | -1): number => {
    let next = current;
    let attempts = commands.length;

    do {
      next =
        direction === 1
          ? (next + 1) % commands.length
          : (next - 1 + commands.length) % commands.length;
      attempts--;
    } while (commands[next]?.disabled && attempts > 0);

    return next;
  };

  useKeyboard((key) => {
    if (key.name === "escape") {
      onClose();
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => findNextIndex(prev, -1));
      return;
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => findNextIndex(prev, 1));
      return;
    }

    if (key.name === "return") {
      const cmd = commands[selectedIndex];
      if (cmd && !cmd.disabled) {
        onClose();
        onExecute?.(cmd);
      }
      return;
    }
  });

  return (
    <CommandPaletteDisplay commands={commands} selectedIndex={selectedIndex} onClose={onClose} />
  );
}

/**
 * Pure display component
 */
interface CommandPaletteDisplayProps {
  commands: Command[];
  selectedIndex: number;
  onClose: () => void;
}

const MODAL_WIDTH = 50;

function CommandPaletteDisplay({
  commands,
  selectedIndex,
  onClose: _onClose,
}: CommandPaletteDisplayProps) {
  const modalWidth = MODAL_WIDTH;

  const categorizedCommands: Array<
    { type: "header"; category: string } | { type: "command"; command: Command; index: number }
  > = [];

  orderByCategory(commands).forEach((cmd, index) => {
    const previous = categorizedCommands[categorizedCommands.length - 1];
    const previousCategory =
      previous?.type === "command" ? previous.command.category : previous?.category;
    if (cmd.category && cmd.category !== previousCategory) {
      categorizedCommands.push({ type: "header", category: cmd.category });
    }
    categorizedCommands.push({ type: "command", command: cmd, index });
  });

  return (
    <Modal
      visible={true}
      title="Commands"
      width={modalWidth}
      headerRight={
        <text>
          <span fg={THEME_COLORS.textDim}>[</span>
          <span fg={THEME_COLORS.primary}>esc</span>
          <span fg={THEME_COLORS.textDim}>]</span>
          <span fg={THEME_COLORS.textMuted}> close</span>
        </text>
      }
    >
      <box flexDirection="column">
        {categorizedCommands.map((item) => {
          if (item.type === "header") {
            return (
              <box key={`header-${item.category}`} height={1}>
                <text fg={THEME_COLORS.textMuted}>{item.category}</text>
              </box>
            );
          }

          const isSelected = item.index === selectedIndex;
          const isDisabled = item.command.disabled;
          const cmdWidth = modalWidth - 4;

          let descriptionColor: string = THEME_COLORS.text;
          if (isDisabled) descriptionColor = THEME_COLORS.textDim;
          else if (isSelected) descriptionColor = THEME_COLORS.text;
          else descriptionColor = THEME_COLORS.textMuted;

          let keyColor: string = THEME_COLORS.textMuted;
          if (isDisabled) keyColor = THEME_COLORS.textDim;
          else if (isSelected) keyColor = THEME_COLORS.primary;

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
                <span fg={descriptionColor}>{item.command.description}</span>
              </text>
              <text>
                <span fg={THEME_COLORS.textDim}>[</span>
                <span fg={keyColor}>{item.command.key}</span>
                <span fg={THEME_COLORS.textDim}>]</span>
              </text>
            </box>
          );
        })}
      </box>
    </Modal>
  );
}
