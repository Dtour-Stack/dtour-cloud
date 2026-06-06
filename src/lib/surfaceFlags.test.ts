import { describe, expect, test } from "vitest";
import {
  DEFAULT_SURFACE_FLAGS,
  isRouteEnabled,
  surfaceLabelForRoute,
  surfaceMetaForRoute,
} from "./surfaceFlags";

describe("surfaceFlags", () => {
  test("keeps completed surfaces open by default", () => {
    expect(isRouteEnabled("/agents", DEFAULT_SURFACE_FLAGS)).toBe(true);
    expect(surfaceLabelForRoute("/agents", DEFAULT_SURFACE_FLAGS)).toBeNull();
  });

  test("marks integrated-but-beta surfaces as open beta", () => {
    expect(isRouteEnabled("/design/sketch", DEFAULT_SURFACE_FLAGS)).toBe(true);
    expect(surfaceLabelForRoute("/design/sketch", DEFAULT_SURFACE_FLAGS)).toBe("Open beta");
  });

  test("opens backed beta surfaces by default", () => {
    expect(isRouteEnabled("/api-keys", DEFAULT_SURFACE_FLAGS)).toBe(true);
    expect(surfaceLabelForRoute("/api-keys", DEFAULT_SURFACE_FLAGS)).toBeNull();
    expect(isRouteEnabled("/instances", DEFAULT_SURFACE_FLAGS)).toBe(true);
    expect(surfaceLabelForRoute("/instances", DEFAULT_SURFACE_FLAGS)).toBe("Open beta");
    expect(surfaceMetaForRoute("/documents")?.title).toBe("Documents & memories");
    expect(surfaceLabelForRoute("/mcps/catalog", DEFAULT_SURFACE_FLAGS)).toBe("Open beta");
  });
});
