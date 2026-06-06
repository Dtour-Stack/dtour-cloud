export type SlashCommand = {
  id: string;
  command: `/${string}`;
  label: string;
  description: string;
};

function commandName(command: SlashCommand["command"]): string {
  return command.slice(1).toLowerCase();
}

export function slashCommandQuery(input: string): string | null {
  if (!input.startsWith("/")) return null;
  const token = input.slice(1).split(/\s|\n/, 1)[0] ?? "";
  return token.toLowerCase();
}

export function matchingSlashCommands(
  commands: readonly SlashCommand[],
  input: string,
): SlashCommand[] {
  const query = slashCommandQuery(input);
  if (query === null) return [];
  return commands.filter((command) => {
    const name = commandName(command.command);
    return (
      name.startsWith(query) ||
      command.label.toLowerCase().includes(query) ||
      command.description.toLowerCase().includes(query)
    );
  });
}

export function slashCommandForInput(
  commands: readonly SlashCommand[],
  input: string,
): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const token = trimmed.slice(1).split(/\s|\n/, 1)[0]?.toLowerCase();
  if (!token) return null;
  return commands.find((command) => commandName(command.command) === token) ?? null;
}

export function slashCommandHelp(commands: readonly SlashCommand[]): string {
  return commands
    .map((command) => `${command.command} — ${command.label}`)
    .join(", ");
}
