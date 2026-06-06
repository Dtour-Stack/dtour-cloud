import {
  matchingSlashCommands,
  type SlashCommand,
} from "@/lib/slashCommands";
import { cn, Icon } from "@/ui";

export function SlashCommandMenu({
  commands,
  input,
  onPick,
  className,
}: {
  commands: readonly SlashCommand[];
  input: string;
  onPick: (command: SlashCommand) => void;
  className?: string;
}) {
  const matches = matchingSlashCommands(commands, input).slice(0, 8);
  if (!matches.length) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] p-1.5 shadow-2xl backdrop-blur-xl",
        className,
      )}
    >
      {matches.map((command) => (
        <button
          key={command.id}
          type="button"
          aria-label={`Run ${command.command}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(command)}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-white/85 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        >
          <span className="mt-0.5 text-white/45">
            <Icon.Zap size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <code className="font-mono text-[12px] text-purple-200">
                {command.command}
              </code>
              <span className="truncate text-[13.5px]">{command.label}</span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-white/35">
              {command.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
