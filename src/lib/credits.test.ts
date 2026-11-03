import { describe, it, expect } from "vitest";
import { exactCredits, formatCredits } from "./credits";

describe("formatCredits", () => {
  it("is exact with separators below one million, then millions with M", () => {
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(5_000)).toBe("5,000");
    expect(formatCredits(273_936)).toBe("273,936");
    expect(formatCredits(999_999)).toBe("999,999");
    expect(formatCredits(1_000_000)).toBe("1.00M");
    expect(formatCredits(1_250_000)).toBe("1.25M");
    expect(formatCredits(9_178_192)).toBe("9.18M");
  });

  it("gives the exact value for tooltips", () => {
    expect(exactCredits(9_178_192)).toBe("9,178,192 credits");
  });
});
