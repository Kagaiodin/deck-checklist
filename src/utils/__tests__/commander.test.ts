import { describe, it, expect } from "vitest";
import { isCommanderFormat } from "../commander";

describe("isCommanderFormat", () => {
  it.each([
    ["commander", true], ["Commander", true], ["EDH", true], ["cmdr", true], ["Duel Commander", true],
    ["Standard", false], ["", false], [undefined, false], ["commanderless", false],
  ])("%j -> %s", (input, expected) => {
    expect(isCommanderFormat(input)).toBe(expected);
  });
});
