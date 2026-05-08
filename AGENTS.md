# AGENTS.md

## Step Granularity Rule
Every coder task must be:
- One file only
- One contiguous block of changes
- Never simultaneously modifying imports AND state AND JSX in the same step

If a plan step violates this, return it to the architect before dispatching.

## Error Handling
If any step fails:
- STOP immediately
- Report the exact error
- Wait for human instruction
- Never attempt to fix a failed step by doing extra work