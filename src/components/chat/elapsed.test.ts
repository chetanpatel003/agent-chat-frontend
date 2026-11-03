import { describe, it, expect } from "vitest";
import { formatElapsed } from "./run-status-indicator";

describe("formatElapsed", () => {
  it("shows seconds, then minutes with padded seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(59)).toBe("59s");
    expect(formatElapsed(60)).toBe("1m 00s");
    expect(formatElapsed(83)).toBe("1m 23s");
    expect(formatElapsed(181)).toBe("3m 01s");
  });
});
