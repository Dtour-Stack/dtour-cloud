import { describe, expect, test } from "vitest";
import { atLeast, isAdmin, isPro, ROLE_LABEL } from "./roles";

describe("role access", () => {
  test("treats dev/tester as builder access without admin powers", () => {
    expect(ROLE_LABEL.dev_tester).toBe("Dev / Tester");
    expect(isPro("dev_tester")).toBe(true);
    expect(atLeast("dev_tester", "super_user")).toBe(false);
    expect(isAdmin("dev_tester")).toBe(false);
    expect(atLeast("dev_tester", "admin")).toBe(false);
  });
});
