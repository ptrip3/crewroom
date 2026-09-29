---
name: commit
description: Make one clean, checked commit without sweeping in unrelated work. Use whenever you are about to commit.
---

# Commit

One commit, containing exactly the change you mean, that passes the checks. The project's rules file comes first; where it is stricter than this, follow it.

## Steps

1. **Look first.** `git status --short --branch`, `git diff --stat`, then `git diff`. Know every file that changed and why.
2. **Decide what belongs.** Only the files for this task. Leave out someone else's edits, local config, build output, logs, caches, screenshots and generated files unless the task is about them.
3. **Check it.** Run the project's build and tests (see `prove`). If they fail, stop and report; don't commit a red build unless you were explicitly told to.
4. **Stage by name.** `git add path/one path/two`. Never `git add .` or `git add -A`.
5. **Check again.** `git diff --cached --stat` and `git diff --cached`. The staged change should be exactly what you meant, nothing more.
6. **Scan what you're about to commit** for secrets, personal data, real organisation names, and anything the rules file forbids (for example names of AI tools or assistants in messages, comments or code).
7. **Write the message.** A short imperative subject that says what changed ("Fix the lock test so it never locks the desktop"), under about 72 characters. Add a body only for context a reviewer needs: why, risk, what wasn't checked.
8. **Commit and report**: the commit hash, what you ran to check it, and anything you left uncommitted.

## Never, unless the owner asks for it by name

- Amend, rebase someone else's work, reset, force-push, or delete a branch.
- Skip hooks (`--no-verify`) or signing.
- Push. Pushing goes through whoever handles releases.

## When a hook fails

Read what it says. If it's about the environment (a stale build, a missing install, another process holding a file), fix that and retry. If it's about the change (a forbidden word, a lint rule), fix the change. Don't work around the hook.
