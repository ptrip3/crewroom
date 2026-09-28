// Wakes an agent app for chatroom messages. Each app runs this from its own hooks:
//
//   node inbox-hook.js claude-prompt   Claude Code UserPromptSubmit: unread messages join the prompt's context.
//   node inbox-hook.js claude-stop     Claude Code Stop: when the agent finishes, wait for a message and, if one
//                                      comes, block the stop so the agent carries on with it.
//   node inbox-hook.js cursor-stop     Cursor stop: the same, returned as a followup_message.
//
// Add --agent <name> to fix the agent's name (Cursor: --agent cursor); otherwise it is the session's
// folder. Only folders under a root in agents.json take part, so other projects are never held up.
// Whatever goes wrong, it exits 0 with nothing to say: a hook must never break the app it runs in.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hubJson, settings, agentFor, takesPart } = require('./hub-client');

const mode = process.argv[2];
const agentArg = process.argv.indexOf('--agent') > 0 ? process.argv[process.argv.indexOf('--agent') + 1] : undefined;

function readInput() {
    try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function describe(messages) {
    const lines = messages.map((m) => `[${m.room_id}] ${m.agent_id}: ${m.content}`);
    return `New messages in the agents' chatroom:\n${lines.join('\n')}\n\n` +
        `Act on anything addressed to you or your area. Reply with the crewroom send_message tool ` +
        `(room as shown). If nothing needs you, say so briefly and stop.`;
}

// While listening, a dropped connection (the hub restarting) is not the end: it tries again until
// the listening time is used up, so a restart never silently ends an agent's loop.
async function inbox(agent, waitSeconds) {
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        try {
            const { messages } = await hubJson(`/inbox/${encodeURIComponent(agent)}?wait=${left}`);
            return messages;
        } catch (err) {
            if (Date.now() + 3000 >= deadline) throw err;
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}

// Claude Code gives no loop count, so wake-ups are counted per session in a temp file and
// reset whenever the user starts a turn (stop_hook_active is false then).
function wakeups(sessionId, reset) {
    const file = path.join(os.tmpdir(), `crewroom-wakeups-${String(sessionId || 'none').replace(/[^\w-]/g, '')}.txt`);
    const count = reset ? 0 : (parseInt(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '0', 10) || 0);
    return { count, save: (n) => fs.writeFileSync(file, String(n)) };
}

async function main() {
    const input = readInput();
    const cwd = input.cwd || (input.workspace_roots && input.workspace_roots[0]) || process.cwd();
    if (!takesPart(cwd, agentArg)) return;
    const agent = agentFor(cwd, agentArg);
    const config = settings();
    const perAgent = config.agents[agent] || {};
    const listen = perAgent.listen_seconds ?? config.listen_seconds;
    const cap = perAgent.max_wakeups ?? config.max_wakeups;

    if (mode === 'claude-prompt') {
        const messages = await inbox(agent, 0);
        if (messages.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: describe(messages) } }));
        return;
    }

    if (mode === 'claude-stop') {
        const counter = wakeups(input.session_id, !input.stop_hook_active);
        if (counter.count >= cap) return;
        const messages = await inbox(agent, listen);
        if (!messages.length) return;
        counter.save(counter.count + 1);
        process.stdout.write(JSON.stringify({ decision: 'block', reason: describe(messages) }));
        return;
    }

    if (mode === 'cursor-stop') {
        // A run the user stopped stays stopped.
        if (input.status && input.status !== 'completed') { process.stdout.write('{}'); return; }
        if ((input.loop_count || 0) >= cap) { process.stdout.write('{}'); return; }
        const messages = await inbox(agent, listen);
        process.stdout.write(JSON.stringify(messages.length ? { followup_message: describe(messages) } : {}));
        return;
    }

    console.error(`inbox-hook: unknown mode "${mode}"`);
}

main().catch((err) => {
    console.error(`inbox-hook: ${err.message}`);
    if (mode === 'cursor-stop') process.stdout.write('{}');
}).finally(() => process.exit(0));
