import { describe, expect, test } from "vitest";
import { atLeast, baseSwerveTag, ROLE_LABEL } from "../../convex/roles";

describe("Convex role access", () => {
  test("keeps dev/tester non-admin while enabling builder access", () => {
    expect(ROLE_LABEL.dev_tester).toBe("Dev / Tester");
    expect(baseSwerveTag("dev_tester")).toBe("Builder");
    expect(atLeast("dev_tester", "pro_user")).toBe(true);
    expect(atLeast("dev_tester", "super_user")).toBe(false);
    expect(atLeast("dev_tester", "admin")).toBe(false);
  });
});
