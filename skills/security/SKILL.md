---
name: security
description: Look for ways a change could be abused or cause damage. Use for code that handles input, files, commands, credentials, permissions, remote machines, or instructions for AI agents.
---

# Security check

Ask how this could be misused, and what happens when it is.

## Map it first

- Where does data come from: users, files, the network, other programs, **AI output**? Which of those sources can't be trusted?
- What can the code do with it: run commands, read or write files, reach other machines, change settings, delete things?
- Who is allowed to trigger it, and what checks that? Where does trusted become untrusted?
- For a change rather than new code: does it remove or weaken a check that was there before?

## Common holes

Check only what applies, roughly in this order:

- **Secrets**: keys, tokens or passwords in code, logs, error messages or commits.
- **Injection**: untrusted text reaching a shell, SQL, a file path, HTML, or a regular expression without being escaped or validated.
- **Paths**: `..` or absolute paths escaping the intended folder; following links you didn't mean to follow.
- **Missing checks**: an action allowed because the interface hid the button, while nothing on the back end stops it; a permission checked once for a whole module when only some of its actions are safe.
- **Logic**: two steps that can race, a step that can be skipped, a value the caller shouldn't be able to set.
- **Destructive actions**: deleting, overwriting, restarting or signing out without a confirmation, a limit or a way back.
- **Data exposure**: personal data in logs or reports, errors that say too much.
- **Resources**: unbounded loops, reads, uploads or archive extraction.
- **Weak crypto and settings**: disabled certificate checks, debug switches left on, home-made encryption.
- **AI agents**: text from web pages, files, tool output or other agents treated as instructions; a tool that can do more than its task needs; approvals that can be satisfied by text an agent could write itself.

## How bad

| Level | Means |
|---|---|
| Critical | Anyone can use it now; data loss or running their own code is possible |
| High | Needs moderate effort or some inside access |
| Medium | Needs several conditions, or the damage is limited |
| Low | Hardening; no direct way to use it |

Raise the level when the target is reachable from outside or the data is sensitive. Look for chains: two medium findings together can make a critical one.

## Report

For each finding: where it is, how it could be used, how bad it is, and the smallest fix (prefer what the framework already provides). For critical and high, also say how misuse would be noticed. Mark false alarms with why. Say what you checked and what you left out. "Nothing found" isn't the same as "safe".

Never paste a secret you find into the chat. Say where it is and that it needs changing.
