---
name: split-work
description: Turn a request or a list of work into tasks spread across the developers. Use when the owner hands over a list, or when a job is too big for one agent.
---

# Split work

Keep every developer busy without two of them editing the same file. A good task can be done without asking questions.

## 1. Break it into pieces

- Cut each request into pieces that touch **different files**, so they can run side by side. A change to a view and a change to the service behind it are two tasks, not one.
- Write down, for each piece, what "done" looks like (one or two checkable outcomes) and **which files it will touch**. Guess generously; a missed file is how two agents collide.
- Note dependencies: if B needs A's result, hold B until A is done.

## 2. Pick who does each piece

1. `list_tasks` shows how many open tasks each developer has. **Start with the least loaded.**
2. Among equally loaded developers, prefer the one whose usual area fits. The area is a tie-breaker, not ownership: any developer can do any task.
3. If one developer already has an open task on a file this piece needs, give the piece to that developer, or wait.
4. Don't hand one developer a second task while another sits at zero.

## 3. Send it

- One `assign_task` per piece, with the summary, the files and what done looks like. It posts the task to the developer and records it. If the hub refuses because of a file clash, re-plan as in step 2.3.
- Check who is listening (the roster). If a developer isn't running, still assign the task, but tell the owner that agent needs starting.

## 4. Close the loop

- Finish with one short summary to the owner: a numbered list of each piece and who has it, plus anything held or unassigned.
- When a `done_task` note comes in, send the next held piece to whoever is now free, and pass finished work on for review.
- Chase silence once, not repeatedly.
