import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as p from "@clack/prompts";
import { coreTools, discoverExtended, extendedTools, isPresent } from "./catalog.js";
import { loadConfig, updateConfig, type Config } from "./config.js";
import * as t from "./theme.js";
import type { ToolDef } from "./types.js";

/** `grindeasy tools <list|scan|add|remove>`. */
export async function runToolsCommand(verb: string | undefined): Promise<void> {
  const { config } = loadConfig();
  switch (verb) {
    case "list":
      listTools(config);
      return;
    case "scan":
      await scanTools(config);
      return;
    case "add":
      await addTool(config);
      return;
    case "remove":
      await removeTool(config);
      return;
    default:
      console.error("Usage: grindeasy tools <list|scan|add|remove>");
      process.exit(1);
  }
}

/** Everything grindeasy knows about, grouped by state. Works without a TTY. */
function listTools(config: Config): void {
  const home = homedir();
  const enabledIds = new Set(config.enabledToolIds);
  const declinedIds = new Set(config.declinedToolIds);
  const extended = extendedTools(home);

  const groups: Array<{ title: string; tools: ToolDef[]; mark: () => string; hint: string }> = [
    { title: "tracked · core", tools: coreTools(home), mark: t.MARK.tracked, hint: "core" },
    {
      title: "tracked · extended",
      tools: extended.filter((d) => enabledIds.has(d.id)),
      mark: t.MARK.tracked,
      hint: "enabled",
    },
    {
      title: "tracked · custom",
      tools: config.customTools,
      mark: t.MARK.tracked,
      hint: "custom",
    },
    {
      title: "available",
      tools: extended.filter(
        (d) => !enabledIds.has(d.id) && !declinedIds.has(d.id) && isPresent(d),
      ),
      mark: t.MARK.found,
      hint: "detected — add with `tools scan`",
    },
    {
      title: "declined",
      tools: extended.filter((d) => declinedIds.has(d.id)),
      mark: t.MARK.found,
      hint: "declined",
    },
  ];

  // One column width across every panel, so names and hints line up even when a
  // long name like "GitHub Copilot" shows up in only one group.
  const labelWidth = Math.max(
    4,
    ...groups.flatMap((g) => g.tools.map((d) => d.name.length)),
  );

  for (const group of groups) {
    if (group.tools.length === 0) continue;
    const rows = group.tools.map((d) =>
      t.row(group.mark(), t.fg(d.name), labelWidth, group.hint),
    );
    console.log("\n" + t.panel(group.title, rows));
  }
  console.log("");
}

/** Re-probe the catalog and offer any newly-present tools. */
async function scanTools(config: Config): Promise<void> {
  const home = homedir();
  const found = discoverExtended(home).filter(
    (d) => !config.enabledToolIds.includes(d.id) && !config.declinedToolIds.includes(d.id),
  );

  if (found.length === 0) {
    console.log(t.dim("No new tools found. Everything present is already tracked or declined."));
    return;
  }

  if (!process.stdin.isTTY) {
    console.log("Found: " + found.map((d) => d.name).join(", "));
    console.log("Run `grindeasy tools scan` in an interactive terminal to add them.");
    return;
  }

  p.intro(t.phosphor("tools scan"));
  const selected = await p.multiselect<string>({
    message: "Add these to tracking?",
    options: found.map((d) => ({ value: d.id, label: d.name, hint: d.activityDirs[0] })),
    initialValues: found.map((d) => d.id),
    required: false,
  });
  if (p.isCancel(selected)) {
    p.cancel("No changes.");
    return;
  }
  const accepted = selected as string[];
  const declined = found.map((d) => d.id).filter((id) => !accepted.includes(id));
  updateConfig({
    enabledToolIds: [...config.enabledToolIds, ...accepted],
    declinedToolIds: [...config.declinedToolIds, ...declined],
  });
  p.outro(t.phosphor(`Tracking ${accepted.length} more · ${declined.length} skipped`));
}

/** Add a custom tool by directory. Interactive only. */
async function addTool(config: Config): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("`grindeasy tools add` needs an interactive terminal.");
    process.exit(1);
  }

  p.intro(t.phosphor("add a tool"));
  const name = await p.text({
    message: "Tool name",
    placeholder: "My Editor",
    validate: (v) => ((v ?? "").trim() ? undefined : "A name is required."),
  });
  if (p.isCancel(name)) return void p.cancel("Cancelled.");

  const dir = await p.text({
    message: "Activity directory (its files change while the tool is in use)",
    placeholder: "~/.mytool/sessions",
    validate: (v) => ((v ?? "").trim() ? undefined : "A directory is required."),
  });
  if (p.isCancel(dir)) return void p.cancel("Cancelled.");

  const extsRaw = await p.text({
    message: "File extensions to watch (comma-separated)",
    placeholder: ".json, .jsonl, .log",
    defaultValue: ".json,.jsonl,.log",
  });
  if (p.isCancel(extsRaw)) return void p.cancel("Cancelled.");

  const resolvedDir = expandHome(dir.trim());
  const extensions = parseExtensions(extsRaw);
  const tool: ToolDef = {
    id: slugify(name.trim()),
    name: name.trim(),
    activityDirs: [resolvedDir],
    extensions,
  };

  if (!existsSync(resolvedDir)) {
    p.log.warn(t.dim(`${resolvedDir} doesn't exist yet — it'll be watched once it appears.`));
  }
  if (config.customTools.some((c) => c.id === tool.id)) {
    p.cancel(`A custom tool named "${tool.name}" already exists.`);
    return;
  }

  updateConfig({ customTools: [...config.customTools, tool] });
  p.outro(t.phosphor(`Added ${tool.name}. Restart grindeasy to track it.`));
}

/** Stop tracking an enabled extended tool or remove a custom one. Interactive only. */
async function removeTool(config: Config): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("`grindeasy tools remove` needs an interactive terminal.");
    process.exit(1);
  }

  const home = homedir();
  const enabledExtended = extendedTools(home).filter((d) => config.enabledToolIds.includes(d.id));
  const options = [
    ...enabledExtended.map((d) => ({ value: `ext:${d.id}`, label: d.name, hint: "extended" })),
    ...config.customTools.map((d) => ({ value: `custom:${d.id}`, label: d.name, hint: "custom" })),
  ];

  if (options.length === 0) {
    console.log(t.dim("Nothing to remove — only core tools are tracked."));
    return;
  }

  p.intro(t.phosphor("remove tools"));
  const selected = await p.multiselect<string>({
    message: "Stop tracking which tools?",
    options,
    required: false,
  });
  if (p.isCancel(selected) || (selected as string[]).length === 0) {
    p.cancel("No changes.");
    return;
  }

  const picks = selected as string[];
  const removeExtIds = picks.filter((s) => s.startsWith("ext:")).map((s) => s.slice(4));
  const removeCustomIds = picks.filter((s) => s.startsWith("custom:")).map((s) => s.slice(7));

  updateConfig({
    // Removing an extended tool declines it, so the next scan won't re-offer it.
    enabledToolIds: config.enabledToolIds.filter((id) => !removeExtIds.includes(id)),
    declinedToolIds: [...new Set([...config.declinedToolIds, ...removeExtIds])],
    customTools: config.customTools.filter((c) => !removeCustomIds.includes(c.id)),
  });
  p.outro(t.phosphor(`Removed ${picks.length}. Restart grindeasy to apply.`));
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "custom-tool"
  );
}

export function parseExtensions(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith(".") ? s : "." + s));
  return parts.length ? [...new Set(parts)] : [".json", ".jsonl", ".log"];
}

export function expandHome(dir: string, home = homedir()): string {
  if (dir === "~") return home;
  if (dir.startsWith("~/")) return home + dir.slice(1);
  return dir;
}
