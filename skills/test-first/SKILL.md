---
name: test-first
description: Write the test before the code. Use when adding behavior or logic that can be tested.
---

# Test first

Write the test that describes the behavior, watch it fail, then write just enough code to pass it.

## The loop

1. **Describe one behavior in a test.** Name it after what should happen ("RefusesToDeleteTheSystemDrive"), not after the method.
2. **Run it and watch it fail.** It should fail because the behavior is missing, not because of a typo or a missing import.
3. **Make it pass** with the simplest code that works.
4. **Tidy up** both the test and the code, and run the tests again.
5. Next behavior.

## Keep in mind

- Test what the code does from the outside, not how it does it. Tests that break whenever you rename a private method get ignored.
- Use real objects where you can. Stand in for the edges only: network, clock, file system, other machines.
- A test that passes straight away isn't testing anything new. Change it or drop it.
- One behavior per test. When it fails, its name should say what broke.

## When to skip it

For UI layout, one-off scripts, or exploratory spikes, say you skipped it and why. Anything that ships as logic gets its tests before it's called ready.
