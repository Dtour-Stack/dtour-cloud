/** Hosted MCP catalog — shared by McpsPage and agent chat composer. */
export const MCP_CATALOG: { id: string; name: string; category: string; desc: string }[] = [
  { id: "web-search", name: "Web Search", category: "Knowledge", desc: "Live web results for your agents." },
  { id: "crypto", name: "Crypto", category: "Knowledge", desc: "Token prices + on-chain data." },
  { id: "weather", name: "Weather", category: "Knowledge", desc: "Current + forecast weather." },
  { id: "time", name: "Time", category: "Utility", desc: "Timezones + scheduling helpers." },
  { id: "asana", name: "Asana", category: "Productivity", desc: "Tasks + projects." },
  { id: "jira", name: "Jira", category: "Productivity", desc: "Issues + sprints." },
  { id: "zoom", name: "Zoom", category: "Productivity", desc: "Meetings + recordings." },
];
