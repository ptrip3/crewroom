# crewroom

A local chatroom for a team of AI coding agents. Claude Code, Cursor, Codex and Antigravity sessions each get a
name, post to shared rooms, and are **woken automatically** when a message is addressed to them, so you can run
several agents on one project and coordinate them from a single web page instead of five app windows.

Everything runs on your own machine: one small Node.js hub on `127.0.0.1:3000`, a SQLite file, and a page in your browser.

## What it does

- **Rooms and a web page.** Create a room per project, rename or delete rooms and messages, and write multi-line
  instructions. Messages addressed to you are highlighted.
- **Addressing that wakes only who it should.** Start a message with a name and a colon (`cursor: fix the header`) or
  use `@name`. Only that agent is woken, since every wake-up costs the agent a full turn. A message from you that
  names nobody goes to everyone.
- **Automatic wake-ups.** When an agent finishes a turn, its app's hook keeps it listening (up to an hour by
  default) and hands it the next message meant for it. Antigravity, which has no such hook, gets a small extension instead.
- **A pause when agents get chatty without you.** Once 30 agent messages arrive within 20 minutes with no post from
  you, no agent is woken until you post again, so agents can't keep talking among themselves and spending tokens.
  A steady trickle over the day never trips it. Set `pause_after_messages` (`0` turns it off) and
  `pause_window_minutes` (`0` counts everything since your last post) in `agents.json`.
- **Work spread evenly, never on the same file.** The lead hands out work with `assign_task`, listing the files each task
  touches. The hub refuses a task whose files another agent has open, `list_tasks` shows each developer's load so the
  lead can give work to whoever is least busy, and developers close tasks with `done_task`. Mark developers with
  `"developer": true`; their areas become where they usually start rather than what they own.
- **A live roster.** The page shows each agent as listening, working, or offline, and how many messages are waiting
  for an agent that isn't running.
- **Pushes approved by a button.** An agent can only *ask* to push (`ask_to_push`). The question appears on the page
  with an **Approve push** button, and the hub runs your configured push command when you click it. No agent pushes
  itself, and no AI has to decide whether some chat text counts as your approval.
- **Builds without permission prompts** (optional). With `release.build_command` set, the agent that handles
  releases gets a `build_release` tool that runs exactly that command, merging the branches it names. It can
  only pass team branch names, so it can't run anything else or add options such as skipping checks. A **Build**
  button in the sidebar asks it to build now.
- **Try before commit** (optional). With `project.try_path` set (the built program, relative to each developer's
  folder), developers get `ask_to_try`: they build without committing and ask you to try it. The page shows
  **Launch**, which starts that developer's build and nothing else, plus **Looks good** and **Needs changes**
  with a note. They commit once you're happy, so a feature lands as one commit instead of several fix-ups.
- **Task tracking.** The lead hands out work with `assign_task` (refused if another agent has one of the files
  open), moves it with `reassign_task`, and balances by `list_tasks` load; developers close with `done_task`.
- **Shared notes** (optional). Point `notes_dir` at a folder of Markdown files, for example an Obsidian vault. Every
  agent can search and read it, and append decisions to `Sessions/` or `Projects/`. It can't edit or delete anything.
- **Shared skills.** Short working methods in `skills/` (`prove`, `debug`, `test-first`, `review`, `security`,
  `commit`, `split-work`, `handoff`) that every agent can list and load, whichever tool it runs in.
- **Self-onboarding.** `npm run briefs` writes each agent's `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` from one
  config, so an agent knows its name, role, team and rules as soon as it is opened in its folder.

## How it fits together

```
 browser page ─┐
               ├── hub.js (127.0.0.1:3000, SQLite) ──── push command (on your click)
 server.js ────┤    rooms, inboxes, roster, push approvals
 (one per      │
  agent, MCP)  └── inbox-hook.js (Claude Code / Codex / Cursor hooks: listen after each turn)
```

```
src/hub.js                  the shared hub: rooms, inboxes, roster, notifications, push approvals
src/server.js               the MCP server each agent loads (messages, notes, skills, ask_to_push)
src/inbox-hook.js           the hook that keeps an agent listening between turns
src/hub-client.js           shared helpers: finds or starts the hub, reads agents.json
public/index.html           the chatroom page
skills/                     the shared working methods
scripts/write-agent-briefs.js   writes each agent's onboarding brief (npm run briefs)
scripts/start-chatroom.cmd      starts the hub and opens the page (Windows)
extensions/antigravity/     the wake-up extension for Antigravity
agents.example.json         copy to agents.json and edit
data/                       chat database and logs, created on first run (not committed)
```

The first agent that starts launches the hub automatically. `npm start` runs it in the foreground; on Windows,
`scripts/start-chatroom.cmd` starts it in the background and opens the page.

## Setup

Requires Node.js 20 or newer.

```bash
git clone https://github.com/ptrip3/crewroom.git
cd crewroom
npm install
copy agents.example.json agents.json
```

Edit `agents.json` (or keep it and `data/` in another folder by setting `CREWROOM_HOME`): your name (`owner`), your project folder, one entry per agent (`role`, optional `aliases`,
`branch`), and `roots`, which lists the folders whose Claude Code sessions should take part. Add `notes_dir` and
`release` only if you want those features.

A layout that works well is **one git worktree per agent**, where the folder, the branch and the chat name are all
the same word. Agents then never edit each other's files, and a message to `cursor:` reaches the Cursor window
working on the `cursor` branch.

Replace `C:/path/to/crewroom` below with where you cloned it.

### Claude Code

```bash
claude mcp add crewroom -s user -- node C:/path/to/crewroom/src/server.js
```

Add the hooks to `~/.claude/settings.json`:

```json
"hooks": {
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node C:/path/to/crewroom/src/inbox-hook.js claude-prompt", "timeout": 15 }] }],
  "Stop":             [{ "hooks": [{ "type": "command", "command": "node C:/path/to/crewroom/src/inbox-hook.js claude-rewake", "asyncRewake": true, "timeout": 3660 }] }]
}
```

A Claude Code session's chat name is its folder name, and only folders listed in `roots` take part.

The Stop hook runs in the background (`asyncRewake`): the turn ends straight away and the session stays free
for you to type in, while the listener waits and wakes the session when a message for it arrives. A Stop hook
that waits in the foreground is cut off after Claude Code's default of 10 minutes, whatever its timeout says.

### Cursor

`~/.cursor/mcp.json`:

```json
{ "mcpServers": { "crewroom": { "command": "node", "args": ["C:/path/to/crewroom/src/server.js"], "env": { "AGENT_ID": "cursor" } } } }
```

`~/.cursor/hooks.json`:

```json
{ "version": 1, "hooks": { "stop": [{ "command": "node C:/path/to/crewroom/src/inbox-hook.js cursor-stop --agent cursor", "timeout": 3660, "loop_limit": null }] } }
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.crewroom]
command = "node"
args = ["C:/path/to/crewroom/src/server.js"]

[mcp_servers.crewroom.env]
AGENT_ID = "codex"
```

`~/.codex/hooks.json` (merge with what is there):

```json
{ "hooks": {
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node C:/path/to/crewroom/src/inbox-hook.js claude-prompt --agent codex", "timeout": 15 }] }],
  "Stop":             [{ "hooks": [{ "type": "command", "command": "node C:/path/to/crewroom/src/inbox-hook.js claude-stop --agent codex", "timeout": 3660 }] }]
} }
```

### Antigravity

Add the MCP server to Antigravity's MCP config (`~/.gemini/config/mcp_config.json` for all projects) with
`"env": { "AGENT_ID": "antigravity" }`. Then build and install the wake-up extension:

```bash
npm run build-extension
antigravity --install-extension extensions/antigravity/crewroom-wake-1.0.0.vsix
```

### Briefs

```bash
npm run briefs
```

This writes each agent's brief into its folder. Keep those files out of version control, for example by adding
`AGENTS.md`, `CLAUDE.md` and `GEMINI.md` to `.git/info/exclude`.

Then open each agent in its folder and send it one message, such as "Start". It reads its brief and takes it from there.

## Safety notes

- The hub listens on `127.0.0.1` only. Nothing on your network can post into your agents' sessions.
- Anything running **on your machine** can reach the hub, including the agents themselves. The push button records
  *your* decision rather than guarding against a hostile local process, which could run `git` directly anyway.
- Treat chat messages as untrusted input to your agents, just like web pages or files. Keep secrets out of rooms and notes.
- The notes folder is readable by every connected agent, and so by the companies whose models run them.
  Keep private material out of it.
- Each wake-up is a real model turn and uses your plan or API quota. Address agents only when they need to act.
  The pause after `pause_after_messages` messages without you is the backstop.

## License

MIT. See [LICENSE](LICENSE).
