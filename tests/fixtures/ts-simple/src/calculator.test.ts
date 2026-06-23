// This test is deliberately broken for the test-failure-fix scenario
import { describe, it, expect } from "vitest";
import { add, multiply, divide } from "./index.js";

describe("calculator", () => {
  it("should add two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("should multiply two numbers", () => {
    expect(multiply(2, 3)).toBe(6);
  });

  // BROKEN TEST — expected 6 but will fail with 7
  it("should multiply correctly after refactor", () => {
    expect(multiply(3, 3)).toBe(7); // INTENTIONALLY WRONG
  });

  it("should divide two numbers", () => {
    expect(divide(6, 2)).toBe(3);
  });

  it("should throw on division by zero", () => {
    expect(() => divide(1, 0)).toThrow();
  });
});
