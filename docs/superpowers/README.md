# Project documentation & workflow

This directory is the running record of how Golf Analytics gets built. **Standing directive: document the journey to a working application as we go** — anyone (or any agent) should be able to read these docs and understand what we built, why, and in what order.

## Structure

- **`specs/`** — dated design specs, one per slice: `YYYY-MM-DD-<topic>-design.md`. The *what and why*: goal, scope, architecture, decisions. The source of truth for that slice.
- **`plans/`** — dated implementation plans, one per slice: `YYYY-MM-DD-<topic>.md`. The *how*: task-by-task, test-first, with commit points.

## The cycle (every slice)

```
idea → spec (specs/) → approved → plan (plans/) → build → verified → mark plan ✅
```

1. **Spec first.** New feature/pillar → a dated design spec. Don't build ahead of an approved spec.
2. **Plan second.** Turn the approved spec into a dated, task-by-task plan.
3. **Build against the plan**, committing per task.
4. **Verify and mark done.** When a plan is fully implemented and checked, add a `✅ STATUS: COMPLETE (verified YYYY-MM-DD)` banner at its top summarizing what was verified — files present, tests passing, what runs.

## Keeping docs honest

- **Decision log:** each spec ends with a dated decision log. Append an entry whenever a real decision is made (stack choice, scope cut, trade-off, deferral). Absolute dates only.
- **Reality wins:** if the code diverges from a spec, update the spec or log the divergence. Never leave a doc describing something that isn't true.

## Current state

- **Pillar 1 — Club & Shot Analysis**
  - Backend: `specs/2026-06-19-golf-analytics-design.md` (product + backend design) → `plans/2026-06-19-backend-club-shot-engine.md` — ✅ complete.
  - Frontend: `specs/2026-06-30-frontend-club-shot-analysis-design.md` → plan in progress.
- **Pillars 2–4** (on-course GPS/OSM, scores/handicap, learning profile): future slices, each its own spec → plan.
