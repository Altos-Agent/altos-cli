import { describe, expect, it } from "vitest";

const roleHierarchy = { viewer: 0, operator: 1, admin: 2 };

describe("RoleHierarchy", () => {
  it("viewer is lowest", () => {
    expect(roleHierarchy.viewer).toBeLessThan(roleHierarchy.operator);
    expect(roleHierarchy.viewer).toBeLessThan(roleHierarchy.admin);
  });

  it("admin is highest", () => {
    expect(roleHierarchy.admin).toBeGreaterThan(roleHierarchy.operator);
    expect(roleHierarchy.admin).toBeGreaterThan(roleHierarchy.viewer);
  });
});