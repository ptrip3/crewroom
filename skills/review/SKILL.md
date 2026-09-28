---
name: review
description: Review a branch or change before it is merged. Use when asked to review, or when checking another agent's work.
---

# Review

The job is to catch what would hurt after merging, not to restyle someone else's code.

## Gather

- What the change is for: the task, the Ready note, the message that asked for it.
- The full change: `git log main..<branch>` and `git diff main...<branch>`. Then open the changed files and read them around the diff, not just the diff.
- Run the project's build and tests on that branch yourself (see `verify`). Don't take "it passes" on trust.

## Look for, in this order

1. **Wrong behavior.** Logic errors, edge cases (empty, huge, missing, duplicate), off-by-one, wrong defaults.
2. **Failure handling.** What happens when the network, the disk, the permissions or the input is bad? Silent failures count as bugs.
3. **Concurrency.** Shared state, UI-thread work, races, anything that "usually" works.
4. **Danger.** Anything that deletes, overwrites, restarts or changes a remote machine: is it confirmed, limited and reversible? Run `security` if the change handles input, credentials or permissions.
5. **Fit.** Does it duplicate something that already exists? Does it change a contract other code relies on? Are all callers updated?
6. **Tests.** Is the new logic covered, and would the tests fail if it broke?
7. **Project rules.** Whatever the rules file says, for example no names of AI tools in code and no private data.

## Verdict

- **Passed**: say what you checked, including the build and test result.
- **Changes needed**: list each issue as `file:line`, what's wrong, why it matters, and what would fix it. Put blockers first.

Leave taste and style alone unless the project's rules cover them. Address the author by name in the chatroom so they're woken.
