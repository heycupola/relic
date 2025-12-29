interface LoginButtonProps {
  label: string;
  selected: boolean;
}

export function LoginButton({ label, selected }: LoginButtonProps) {
  return (
    <box
      width={40}
      height={3}
      borderStyle={selected ? "double" : "single"}
      borderColor={selected ? "#7aa2f7" : "#565f89"}
      backgroundColor={selected ? "#292e42" : "#1a1b26"}
      justifyContent="center"
      alignItems="center"
    >
      <text fg={selected ? "#7aa2f7" : "#a9b1d6"}>
        {selected ? "› " : "  "}
        {label}
        {selected ? " ‹" : "  "}
      </text>
    </box>
  );
}
