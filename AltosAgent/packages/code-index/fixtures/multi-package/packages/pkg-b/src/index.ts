import { a_func } from "pkg-a";

export function b_func(): string {
  return a_func() + " -> pkg-b";
}
