// Display names for the tool ids the agent reports. Kept in sync by hand with
// the agent's src/catalog.ts; unknown ids fall back to a title-cased id so a
// newly added tool still reads sensibly before this map catches up.
const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  aider: "Aider",
  zed: "Zed",
  continue: "Continue",
  windsurf: "Windsurf",
  copilot: "GitHub Copilot",
  cline: "Cline",
  "roo-code": "Roo Code",
  "kilo-code": "Kilo Code",
};

export function toolLabel(id: string): string {
  return (
    TOOL_LABELS[id] ??
    id
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}
