import { describe, expect, it } from "vitest";
import { isScored, scoreText } from "./score";

describe("scoreText", () => {
  it("says Not scored for a score that was never computed, never 0%", () => {
    expect(scoreText(0)).toBe("Not scored");
    expect(scoreText(null)).toBe("Not scored");
    expect(scoreText(undefined)).toBe("Not scored");
    expect(isScored(0)).toBe(false);
  });
  it("writes a real score as a whole percent", () => {
    expect(scoreText(92)).toBe("92%");
    expect(scoreText(78.4)).toBe("78%");
  });
});
