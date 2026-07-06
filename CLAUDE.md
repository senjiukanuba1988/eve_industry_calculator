# Claude Session Instructions

## Project Structure

```
.claude/
  schema/
    goal.schema.json       # Schema for goal.json and project.json
    tasks.schema.json      # Schema for tasks.json
  goals/
    <goal_name>/
      goal.json
      tasks.json
  completed_goals/
    <goal_name>/           # Moved here when a goal is completed
      goal.json
      tasks.json
project.json               # Project-level overview, uses goal.schema.json
CLAUDE.md                  # This file
```

## Session Start

1. Read `.claude/project.json` for overall project context and key decisions.
   - If `name` is `"unnamed_project"` (the placeholder value), the project hasn't been set up yet. Run the **Project Setup Interview** below instead of the rest of this section.
2. List the subdirectories of `.claude/goals/` using a shell directory listing (e.g. `ls .claude/goals`) — the directory name is the goal name. Do not use Glob for this: a bare `.claude/goals/*` glob only matches files, not directories, and will silently return nothing even when goals exist.
3. Present the list to the user. Wait for the user to pick a goal.
4. Once a goal is selected, read its full `goal.json` and `tasks.json`.
5. Present:
   - The goal description and any existing key decisions
   - Open tasks (status: todo, in_progress, or blocked), grouped by priority
   - `next_session_suggestions` from tasks.json, if any

## Project Setup Interview

Runs once, the first time a session starts with a placeholder `project.json`. Goal: turn an empty scaffold into a real `project.json` plus a first batch of goals/tasks, entirely through conversation. Ask one topic at a time and wait for the answer — don't dump every question at once.

1. **Project identity** — ask for:
   - A short name/slug (used as `name`, e.g. `expense_tracker`)
   - A one-line summary
   - A longer description: what the project does, the overall architecture, and the tech stack (languages, frameworks, services, database)
2. **Key decisions** — ask if there are any foundational architecture or tech choices already made that are worth recording now (optional — more can be added later as they come up).
3. **Goals** — ask the user what larger chunks of work ("goals") they want to track to start, e.g. "set up the login page." For each goal, get a short name (snake_case, becomes the directory name), a one-line summary, and a description of what "done" looks like.
4. **Tasks per goal** — for each goal, work with the user to break it into concrete tasks (e.g. backend entities, a specific use case, a frontend component). For each task get a title, description, and priority (`low`/`medium`/`high`). Encourage granularity — a goal should usually decompose into several independently completable tasks.

Once answers are gathered:

1. Write `.claude/project.json` per `goal.schema.json`, with today's date as `created`.
2. For each goal, follow **Creating a Goal** below.
3. Recap what was created and confirm with the user before treating setup as done.
4. Continue into the normal Session Start flow (step 2 onward) so the session carries straight on.

## Creating a Goal

Use this both during the initial Project Setup Interview and any time later the user wants to add a new goal.

1. Create `.claude/goals/<goal_name>/`.
2. Write `goal.json` per `goal.schema.json` (`status: "active"`, `created` = today).
3. Write `tasks.json` per `tasks.schema.json` — one entry per task, `id` starting at 1 and unique within the file, `status: "todo"`, `created` = today.

## Session End

Session end is signaled by the user saying something like "we're done for now", "that's it for today", or by completing the last open task of a goal and the user responding positively (e.g. "good", "well done", "nice").

When a session ends:

1. **Update tasks** — update the status of any tasks that changed during the session. Set `completed_at` on tasks that are now done.
2. **Update the goal** — if the goal's status changed (e.g. all tasks done and goal is achieved), update `goal.json`. Set `status: "completed"` and `completed_at`, then ask the user to confirm before moving the directory from `goals/` to `completed_goals/`.
3. **Key decisions** — if any decisions were made during the session that seem significant (architecture choices, major trade-offs, things we'd want to remember later), list them and ask the user which ones should be recorded. Add confirmed decisions to the relevant `goal.json` or `project.json`.
4. **Next session suggestions** — ask the user if they have suggestions for the next session, or propose some yourself based on what we just did. Add the agreed suggestions to `next_session_suggestions` in `tasks.json`. Clear any suggestions from the previous session that are no longer relevant.

## Schema Reference

- `goal.json` / `project.json`: `.claude/schema/goal.schema.json`
- `tasks.json`: `.claude/schema/tasks.schema.json`

Status values — goals: `active`, `on_hold`, `completed` — tasks: `todo`, `in_progress`, `done`, `blocked`
