# Task Prompt Template (Discord MVP)

Use this template when running a single task from the Discord MVP task list.

```
You are implementing task #{TASK_ID} from docs/discord-bot-feature-design-tasks-list.md.
Task name: {TASK_NAME}
Priority: {PRIORITY}
Dependencies: {DEPENDENCIES}

Design doc references:
- docs/discord-bot-feature-design-doc.md (re-read before coding)

Scope:
- Implement the task in the smallest reviewable change set.
- Follow AGENTS.md conventions.

Validation:
- Run the most relevant automated tests. If none exist, note that in the task's Notes.

Task list updates:
- Mark task #{TASK_ID} Status as [x] only after it is completed and validated.
- If any dependency or priority ordering changes are needed, update the task list and explain in Notes.

Research:
- If any Discord/Firebase/API details are unclear, do web research (official docs first), update the design doc accordingly, then proceed.

Commit:
- If this completes a milestone (typically a Section 1.x group), run tests and commit with message: "discord: <milestone summary>".
```
