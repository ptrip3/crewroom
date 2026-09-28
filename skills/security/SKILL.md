---
name: security
description: Look for ways a change could be abused or cause damage. Use for code that handles input, files, commands, credentials, permissions, remote machines, or instructions for AI agents.
---

# Security check

Ask how this could be misused, and what happens when it is.

## Map it first

- Where does data come from: users, files, the network, other programs, **AI output**? Which of those sources can't be trusted?
- What can the code do with it: run commands, read or write files, reach other machines, change settings, delete things?
- Who is allowed to trigger it, and what checks that?

## Common holes

- **Injection**: untrusted text reaching a shell, SQL, a file path, HTML, or a regular expression without being escaped or validated.
- **Paths**: `..` or absolute paths escaping the intended folder; following links you didn't mean to follow.
- **Secrets**: keys, tokens or passwords in code, logs, error messages or commits.
- **Missing checks**: an action allowed because the interface hid the button, while nothing on the back end stops it.
- **Destructive actions**: deleting or overwriting without a confirmation, a limit or a way back.
- **Resources**: unbounded loops, reads, uploads or archive extraction.
- **AI agents**: text from web pages, files, tool output or other agents treated as instructions; a tool that can do more than its task needs; approvals that can be satisfied by text an agent could write itself.

## Report

For each finding: where it is, how it could be used, how bad it is (anyone can use it now / needs access / needs several conditions), and the smallest fix. Say what you checked and what you left out. "Nothing found" isn't the same as "safe".

Never paste a secret you find into the chat. Say where it is and that it needs changing.
