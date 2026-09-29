---
name: test-first
description: Write the test before the code. Use when adding behavior or logic that can be tested.
---

# Test first

Write the test that describes the behavior, watch it fail, then write just enough code to pass it.

## The loop

1. **Describe one behavior in a test.** Name it after what should happen ("RefusesToDeleteTheSystemDrive"), not after the method.
2. **Run it and watch it fail.** It should fail because the behavior is missing, not because of a typo or a missing import. A test that has never failed proves nothing.
3. **Make it pass** with the simplest code that works. Don't add anything no test asks for yet.
4. **Tidy up** both the test and the code, and run the tests again.
5. Next behavior.

## Keep in mind

- Test what the code does from the outside, not how it does it. Tests that break whenever you rename a private method get ignored.
- Use real objects where you can. Stand in for the edges only: network, clock, file system, other machines.
- A test that passes straight away isn't testing anything new. Change it or drop it.
- One behavior per test. When it fails, its name should say what broke.
- If something is hard to fake, that's usually a design problem worth fixing, not a reason to skip the test.

## Tests must never act on the real machine

A test runs on a developer's computer, often many times an hour. It must never lock, restart, shut down, sign out, disconnect sessions, delete files outside its own temp folder, or change system settings.

- Fake the thing the code **actually calls**. If code starts `rundll32.exe` through a process helper, a stand-in function called `rundll32.exe` is never used; replace the helper.
- Then assert the dangerous call was **requested** (the right program and arguments), rather than that it happened.
- Before trusting such a test, check it can't reach the real call: read the call path, or run it once with the fake removed in a throwaway environment.

## When to skip it

For UI layout, one-off scripts, or exploratory spikes, say you skipped it and why. Anything that ships as logic gets its tests before it's called ready.
