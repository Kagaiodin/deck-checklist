/**
 * Pure policy for the accessibility gate (docs/specs/a11y-gate-spec.md §4): allowlist parsing and
 * baseline matching. No browser or filesystem access, so it is unit-tested in scripts/__tests__/.
 */

export interface A11yHit {
  rule: string;
  screen: string;
  /** First axe target selector for the offending node. */
  selector: string;
  impact: string | null;
  help: string;
  /** Raw `data-a11y-allow` value found on the node or an ancestor, if any. */
  allow?: string;
}

export interface BaselineEntry {
  key: string;
  /** GitHub issue that tracks fixing it. Required; an entry without one fails the lint. */
  issue: number | null;
}

export interface Allow {
  rule: string;
  reason: string;
}

export interface GateOutcome {
  /** Violations not in the baseline and not allowlisted: these fail the run. */
  newHits: A11yHit[];
  /** Baseline keys that no longer fire: these fail the run so the baseline can only shrink. */
  stale: string[];
  /** `data-a11y-allow` values with a missing rule or reason. */
  badAllows: string[];
  /** Baseline entries without an issue number. */
  missingIssue: string[];
  /** Number of violations suppressed by a valid allowlist marker (printed so growth is visible). */
  allowed: number;
  baselined: number;
}

export const hitKey = (h: Pick<A11yHit, "rule" | "screen" | "selector">): string =>
  `${h.rule} | ${h.screen} | ${h.selector}`;

/** `data-a11y-allow="rule: reason; other-rule: reason"`. A bare rule id, or an empty reason, is invalid. */
export function parseAllow(raw: string): { allows: Allow[]; invalid: string[] } {
  const allows: Allow[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(";").map(s => s.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const rule = i === -1 ? part : part.slice(0, i).trim();
    const reason = i === -1 ? "" : part.slice(i + 1).trim();
    if (!rule || !reason) invalid.push(part);
    else allows.push({ rule, reason });
  }
  return { allows, invalid };
}

export function evaluate(hits: A11yHit[], baseline: BaselineEntry[]): GateOutcome {
  const baseKeys = new Set(baseline.map(b => b.key));
  const seen = new Set<string>();
  const out: GateOutcome = { newHits: [], stale: [], badAllows: [], missingIssue: [], allowed: 0, baselined: 0 };

  for (const h of hits) {
    const key = hitKey(h);
    if (h.allow !== undefined) {
      const { allows, invalid } = parseAllow(h.allow);
      for (const bad of invalid) if (!out.badAllows.includes(bad)) out.badAllows.push(bad);
      if (allows.some(a => a.rule === h.rule)) {
        out.allowed++;
        continue;
      }
    }
    seen.add(key);
    if (baseKeys.has(key)) out.baselined++;
    else out.newHits.push(h);
  }

  out.stale = baseline.map(b => b.key).filter(k => !seen.has(k));
  out.missingIssue = baseline.filter(b => !Number.isInteger(b.issue) || (b.issue as number) <= 0).map(b => b.key);
  return out;
}

export const gateFailed = (o: GateOutcome): boolean =>
  o.newHits.length + o.stale.length + o.badAllows.length + o.missingIssue.length > 0;
