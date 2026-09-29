---
name: review
description: Review a branch or change before it is merged. Use when asked to review, or when checking another agent's work.
---

# Review

The job is to catch what would hurt after merging, not to restyle someone else's code.

## Gather

- What the change is for: the task, the Ready note, the message that asked for it.
- The full change: `git log main..<branch>` and `git diff main...<branch>`. Then open the changed files and read them around the diff, not just the diff.
- Who depends on it: search for callers of every changed public method, property, setting or file, and read a few.
- Run the project's build and tests on that branch yourself (see `verify`). First make sure the branch contains every safety fix main has; an old base can make a green run do real damage.

## Look for, in this order

1. **Wrong behavior.** Logic errors, edge cases (empty, huge, missing, duplicate), off-by-one, wrong defaults.
2. **Failure handling.** What happens when the network, the disk, the permissions or the input is bad? Silent failures count as bugs.
3. **Concurrency.** Shared state, UI-thread work, races, anything that "usually" works.
4. **Danger.** Anything that deletes, overwrites, restarts, locks, signs out or changes a remote machine: is it confirmed, limited and reversible? Does the change remove or loosen a safeguard that was there before (a confirmation, a permission check, a limit)? Run `security` if the change handles input, credentials or permissions.
5. **Tests that act for real.** A test must never lock, restart, shut down, sign out, disconnect, delete or change settings on the machine running it. Check that every fake replaces what the code actually calls. A stand-in function named after an .exe does nothing if the code starts that .exe as a process through a helper; the fake has to replace the helper.
6. **Fit.** Does it duplicate something that already exists? Does it change a contract other code relies on, and are all callers updated? Could it be rolled back, or does it change stored data one way?
7. **Tests.** Is the new logic covered, and would the tests fail if it broke? Was a test deleted or weakened, and if so, is the coverage put back some other way?
8. **Project rules.** Whatever the rules file says, for example no names of AI tools in code and no private data.

## Verdict

- **Passed**: say what you checked, including the build and test result and the base commit it ran on.
- **Changes needed**: list each issue as `file:line`, what's wrong, why it matters, and what would fix it. Put blockers first, then follow-ups, then nice-to-haves.

Leave taste and style alone unless the project's rules cover them. Address the author by name in the chatroom so they're woken.
