---
name: handoff
description: Report finished or stuck work so the next person can act on it at once. Use when you finish a task, get blocked, or hand work to another agent.
---

# Handoff

The reader should be able to act on your message without opening your session.

## A finished task

- **To:** whoever asked, by name (`orch: ...`).
- **What:** one line on what changed, plus the commit hashes.
- **Proof:** the command you ran and its result (see `prove`).
- **Left out:** anything you didn't do or check, and why.
- **Next:** what should happen now, for example "ready for review" or "needs the owner's decision on X".

## Blocked

- What you were doing, what stopped you (quote the error), and what you already tried.
- The one decision or piece of information that would unblock you, and who can give it.
- Don't wait silently. Say you're blocked, then stop or switch to something else.

## Passing work to another agent

Give them the state as it is: the branch, what's done, what isn't, and which files are mid-change. Name them so they're woken, and say whether you're still on it.

## Keep it short

A few lines, not the whole story. Anything worth keeping for later (a decision, a trap, a workaround) goes into the notes with `add_note`, not only the chat.
