import { describe, it, expect } from "vitest";
import { Foo, getFoo } from "../src/foo.js";

describe("Foo", () => {
  it("should create foo with name", () => {
    const foo = new Foo("test");
    expect(foo.name).toBe("test");
  });

  it("should return value", () => {
    const foo = new Foo("test");
    expect(foo.getValue()).toBe(0);
  });

  it("getFoo helper", () => {
    const foo = getFoo("helper");
    expect(foo.name).toBe("helper");
  });
});
