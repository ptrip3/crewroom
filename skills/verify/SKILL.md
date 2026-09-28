---
name: verify
description: Check before you claim. Use whenever you are about to say something is done, fixed, passing or working.
---

# Verify

A claim is only as good as the output behind it. Before saying "done", show it.

## Before any "it works"

1. Name the command that would prove it: the build, the test run, the script, the page load.
2. Run it now, after your last change. Output from earlier in the session does not count.
3. Read all of it: the exit code, the pass and fail counts, and any warnings you have not seen before.
4. Say exactly what it proved, and quote the line that proves it, for example "build.ps1 exit 0, 170/170 tests passed".

If there is no way to check it (no tests, nothing to run), say so plainly and ask how it should be checked. Don't guess.

## For a bug fix

Show the fix matters, not just that the tests pass:

- The check fails without your fix.
- The same check passes with it.

If you can't make it fail without the fix, the check isn't testing the bug. Write a better one.

## Words that give an unchecked claim away

"should work", "probably", "seems fine", "I believe". Replace each with a result, or with "not checked yet, because...".

## Reporting

Say what you ran, what it printed, and what you did not check. Leaving a gap unmentioned is worse than admitting it.
