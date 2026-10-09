/** @jsxImportSource @opentui/react */
import { THEME_COLORS } from "../../utils/constants";

interface MoreItemsProps {
  count: number;
  position: "above" | "below";
}

export function MoreItems({ count, position }: MoreItemsProps) {
  return (
    <text fg={THEME_COLORS.textMuted}>
      {"  "}... {count} more item{count > 1 ? "s" : ""} {position}
    </text>
  );
}
