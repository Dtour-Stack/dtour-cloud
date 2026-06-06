import { describe, expect, it } from "vitest";
import {
  matchingSlashCommands,
  type SlashCommand,
  slashCommandForInput,
  slashCommandHelp,
  slashCommandQuery,
} from "./slashCommands";

const COMMANDS: SlashCommand[] = [
  { id: "new", command: "/new", label: "New chat", description: "Start a chat" },
  { id: "cloud", command: "/cloud", label: "Cloud panel", description: "Open infra" },
  { id: "clear", command: "/clear", label: "Clear chat", description: "Clear messages" },
];

describe("slashCommands", () => {
  it("reads slash queries from the first token only", () => {
    expect(slashCommandQuery("/cl")).toBe("cl");
    expect(slashCommandQuery("/cloud now")).toBe("cloud");
    expect(slashCommandQuery("hello /cloud")).toBeNull();
  });

  it("matches commands by command, label, or description", () => {
    expect(matchingSlashCommands(COMMANDS, "/cl").map((command) => command.id)).toEqual([
      "cloud",
      "clear",
    ]);
    expect(matchingSlashCommands(COMMANDS, "/infra").map((command) => command.id)).toEqual([
      "cloud",
    ]);
  });

  it("executes only exact command tokens", () => {
    expect(slashCommandForInput(COMMANDS, "/cloud please")?.id).toBe("cloud");
    expect(slashCommandForInput(COMMANDS, "/cl")).toBeNull();
    expect(slashCommandHelp(COMMANDS)).toContain("/new");
  });
});
