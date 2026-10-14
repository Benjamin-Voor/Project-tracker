@AGENTS.md

# Claude Code notes

AGENTS.md (imported above) is the shared instruction file for Claude Code and GitHub Copilot. Record owner decisions and state changes there, not here, so both tools see them.

## Path-scoped coding conventions

These files are Copilot instruction files. Each `applyTo` glob says which files its rules cover; follow a file's rules only when editing matching files.

@.github/instructions/python.instructions.md
@.github/instructions/react.instructions.md
@.github/instructions/terraform.instructions.md

## Other Copilot files

- `.github/prompts/*.prompt.md` are Copilot prompt files. They are exposed as Claude slash commands through symlinks in `.claude/commands/` (for example `/plan-createObjectStructureV5`). They are not loaded into every session.
- `.aiexclude` is mirrored as `permissions.deny` read rules in `.claude/settings.json`. Keep the two in sync. `TuesdayNotes.md` must stay readable (see AGENTS.md).
