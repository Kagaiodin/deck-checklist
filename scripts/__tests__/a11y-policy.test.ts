import { describe, it, expect } from "vitest";
import { evaluate, gateFailed, hitKey, parseAllow, type A11yHit } from "../a11y-policy";

const hit = (over: Partial<A11yHit> = {}): A11yHit => ({
  rule: "target-size", screen: "01-home", selector: ".btn", impact: "serious", help: "h", ...over,
});

describe("parseAllow", () => {
  it("accepts rule: reason, several separated by ;", () => {
    const { allows, invalid } = parseAllow("target-size: dense row; label: decorative");
    expect(allows).toEqual([{ rule: "target-size", reason: "dense row" }, { rule: "label", reason: "decorative" }]);
    expect(invalid).toEqual([]);
  });
  it("rejects a bare rule id or an empty reason", () => {
    expect(parseAllow("target-size").invalid).toEqual(["target-size"]);
    expect(parseAllow("target-size:  ").invalid).toEqual(["target-size:"]);
  });
});

describe("evaluate", () => {
  it("fails on a violation that is not in the baseline", () => {
    const o = evaluate([hit()], []);
    expect(o.newHits).toHaveLength(1);
    expect(gateFailed(o)).toBe(true);
  });
  it("passes a baselined violation", () => {
    const o = evaluate([hit()], [{ key: hitKey(hit()), issue: 12 }]);
    expect(o.baselined).toBe(1);
    expect(gateFailed(o)).toBe(false);
  });
  it("fails on a stale baseline entry so the baseline can only shrink", () => {
    const o = evaluate([], [{ key: "label | 02 | .x", issue: 12 }]);
    expect(o.stale).toEqual(["label | 02 | .x"]);
    expect(gateFailed(o)).toBe(true);
  });
  it("fails on a baseline entry without an issue number", () => {
    const o = evaluate([hit()], [{ key: hitKey(hit()), issue: null }]);
    expect(o.missingIssue).toHaveLength(1);
    expect(gateFailed(o)).toBe(true);
  });
  it("suppresses a violation with a valid allow marker and counts it", () => {
    const o = evaluate([hit({ allow: "target-size: dense row" })], []);
    expect(o.allowed).toBe(1);
    expect(gateFailed(o)).toBe(false);
  });
  it("fails on a bare allow marker, and does not suppress", () => {
    const o = evaluate([hit({ allow: "target-size" })], []);
    expect(o.badAllows).toEqual(["target-size"]);
    expect(o.newHits).toHaveLength(1);
  });
  it("an allow for a different rule does not suppress this one", () => {
    const o = evaluate([hit({ allow: "label: decorative" })], []);
    expect(o.newHits).toHaveLength(1);
  });
});
