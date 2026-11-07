# Design workflow

Read this before UI or visual work: new pages, redesigns, visual decisions on existing components, screenshots.

## Open Design
- Open Design project for this repo: `5c6d105f-c086-441b-ad55-2e3403c89799` (pass as `project` to the open-design tools). If the open-design MCP is available, use it to read the artifact/files directly (`get_artifact`, `get_file`) instead of asking for a local export.
- Create designs with the open-design MCP's generate option (`start_run`, then poll `get_run`), not by hand-writing
  mockups with `write_file`. When a large chunk of work is complete (a whole pass implemented, not each small change), ask the user
  whether to run a review, then use `start_run` again to check the result against the spec
  (`docs/specs/<feature>-spec.md`) and confirm it meets it.
- Open Design skills to pass to `start_run`:
  - New pages/components: `frontend-design`
  - Existing UI: `redesign-existing-projects`
  - Polish pass once an artifact exists: `impeccable-design-polish`
  - Review of a completed pass: `plan-design-review` (optionally `web-design-guidelines` for accessibility)
- New feature / new page / unknown visual direction → Open Design first, then implement
  from the local artifact (see the `implement-from-open-design` skill)
- Existing component / layout fix / refactor → Claude Code directly
- For visual decisions on existing components, show inline HTML mockup options and get
  approval before touching source files
- Tech specs: `docs/specs/<feature>-spec.md`; design briefs: `docs/specs/<feature>-design-brief.md`

## Screenshots
- Screenshot passes (capture + visual review) go to a subagent so the images stay out of the main context; images are re-billed on every later call.
- Prefer `npm run screenshots` / `screenshots:diff` and crop to the component over reading full-page PNGs.
