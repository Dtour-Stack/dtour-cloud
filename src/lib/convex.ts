import { ConvexReactClient } from "convex/react";

// Self-hosted Convex deployment URL (Docker backend defaults to :3210).
const CONVEX_URL =
  (import.meta.env.VITE_CONVEX_URL as string | undefined) ||
  "http://127.0.0.1:3210";

export const convex = new ConvexReactClient(CONVEX_URL);
