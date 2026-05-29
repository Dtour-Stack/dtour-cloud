/** localStorage key for the Convex dtour session token (issued after the gate). */
export const DTOUR_SESSION_KEY = "dtour-session";

export function getDtourSessionToken(): string | null {
  try {
    return localStorage.getItem(DTOUR_SESSION_KEY);
  } catch {
    return null;
  }
}
