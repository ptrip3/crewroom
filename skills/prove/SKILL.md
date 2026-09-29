---
name: prove
description: Check before you claim. Use whenever you are about to say something is done, fixed, passing or working.
---

# Prove it

A claim is only as good as the output behind it. Before saying "done", show it.

## Before any "it works"

1. Name the command that would prove it: the build, the test run, the script, the page load. Several claims need several commands.
2. Run it now, after your last change. Output from earlier in the session, from another branch, or from another agent does not count.
3. Read all of it: the exit code, the pass and fail counts, and any warnings you have not seen before.
4. Say exactly what it proved, and quote the line that proves it, for example "build.ps1 exit 0, 170/170 tests passed".

If there is no way to check it (no tests, nothing to run), say so plainly and ask how it should be checked. Don't guess.

## What counts as proof

| Claim | Proof | Not proof |
|---|---|---|
| Tests pass | A fresh run: 0 failed, exit 0 | An earlier run, "should pass now" |
| It builds | The full build, exit 0 | One project, or the linter |
| Bug fixed | The reproduction fails before, passes after | "Changed the code, so fixed" |
| Feature works | Used it end to end, or an end-to-end test | Unit tests alone |
| Task done | Each item of "done" checked one by one | "Tests pass, so done" |
| Someone else's work | Their diff read and the checks re-run | Their message saying so |

## For a bug fix

Show the fix matters, not just that the tests pass:

1. Add a check that covers the bug. With the fix, it passes.
2. Undo the fix. The check must now fail.
3. Put the fix back. It passes again.

If it doesn't fail without the fix, the check isn't testing the bug. Write a better one.

## Excuses to notice

- "It's a one-line change." One-line changes break builds all the time. Run it.
- "I ran it earlier." The code changed since. Run it again.
- "That test is flaky." Then the flake is the first thing to fix, not to ignore.
- "It compiles." Compiling says nothing about behavior.
- "QA will catch it." QA checks your proof; it doesn't replace it.

## Words that give an unchecked claim away

"should work", "probably", "seems fine", "I believe". Replace each with a result, or with "not checked yet, because...".

## Reporting

Say what you ran, what it printed, and what you did not check. Leaving a gap unmentioned is worse than admitting it.
