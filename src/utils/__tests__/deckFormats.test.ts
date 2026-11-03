import { describe, it, expect } from "vitest";
import { DECK_FORMATS, formatOptions } from "../deckFormats";

describe("formatOptions", () => {
  it("returns the standard list when there is no current value", () => {
    expect(formatOptions()).toBe(DECK_FORMATS);
  });
  it("returns the standard list for a known value", () => {
    expect(formatOptions("modern")).toBe(DECK_FORMATS);
  });
  it("appends a legacy free-text value so it stays selectable", () => {
    const opts = formatOptions("Old School");
    expect(opts).toHaveLength(DECK_FORMATS.length + 1);
    expect(opts[opts.length - 1]).toEqual({ value: "Old School", label: "Old School" });
  });
});
