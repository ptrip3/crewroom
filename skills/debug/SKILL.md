---
name: debug
description: Find the cause before changing code. Use for any bug, failing test, crash, regression or "it used to work".
---

# Debug

A fix that's written before the cause is known moves the symptom somewhere else. Find the cause first.

## 1. Pin down the gap

In two lines: what happens, and what should happen instead. If you can't write the second line, ask. Otherwise you'd be guessing at the goal.

## 2. Make it happen on demand

Find the shortest set of steps that shows the problem every time. Note what it depends on: versions, settings, data, the machine, whether you have admin rights. If you can't reproduce it, say so; don't fix it blind.

## 3. Narrow it down

- List two or three likely causes.
- For each one, decide beforehand what you would expect to see if it were the cause.
- Test the cheapest one first, and change one thing at a time.
- Keep notes on what you ruled out, so nobody repeats it.

Check logs and recent commits (`git log -p` on the affected files) early. The newest change to a broken area is often the cause.

## 4. Fix the cause, not the symptom

Propose the fix and its risk. If the fix is large, touches another agent's area, or changes behavior someone relies on, get agreement first.

## 5. Prove it

Follow `verify`: the reproduction steps fail before the fix and pass after it. Add a test that would have caught the bug.

## Report

What was wrong, why, what you changed, and how you proved it. Record anything non-obvious with `add_note`, so the next agent to hit it saves the time.
