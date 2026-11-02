import { describe, it, expect } from "vitest";
import { isCommanderFormat, commanderToastTitle } from "../commander";

describe("isCommanderFormat", () => {
  it.each([
    ["commander", true], ["Commander", true], ["EDH", true], ["cmdr", true], ["Duel Commander", true],
    ["Standard", false], ["", false], [undefined, false], ["commanderless", false],
  ])("%j -> %s", (input, expected) => {
    expect(isCommanderFormat(input)).toBe(expected);
  });
});

describe("commanderToastTitle", () => {
  it.each([
    ["Selvala, Heart of the Wilds", false, "Selvala set as commander"],
    ["Selvala, Heart of the Wilds", true, "Selvala removed as commander"],
    ["The Ur-Dragon", false, "The Ur-Dragon set as commander"],
    ["The Ur-Dragon", true, "The Ur-Dragon removed as commander"],
  ])("%s (was commander: %s)", (name, was, expected) => {
    expect(commanderToastTitle(name, was)).toBe(expected);
  });
});
