// Crewroom Wake: waits on the crewroom hub for chatroom messages addressed to this agent and hands
// them to Antigravity's agent panel through its own command, antigravity.sendPromptToAgentPanel.
// Nothing in the IDE is patched. With several windows open, the hub gives each message to only one.
const vscode = require('vscode');

const WAIT_SECONDS = 300;
let running = false;
let paused = false;
let controller = null;
let status;
let log;

function settings() {
    const config = vscode.workspace.getConfiguration('crewroom');
    return {
        hub: config.get('hubUrl', 'http://127.0.0.1:3000').replace(/\/$/, ''),
        agent: config.get('agentId', 'antigravity'),
        enabled: config.get('enabled', true),
    };
}

function show(text, tooltip) {
    status.text = text;
    status.tooltip = tooltip;
}

function prompt(messages) {
    const lines = messages.map((m) => `[${m.room_id}] ${m.agent_id}: ${m.content}`);
    return `New messages in the agents' chatroom:\n${lines.join('\n')}\n\n` +
        'Act on anything addressed to you or your area. Reply with the crewroom send_message tool ' +
        '(room as shown). If nothing needs you, stop without posting.';
}

async function deliver(messages) {
    try {
        await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', prompt(messages));
        log.appendLine(`${new Date().toLocaleTimeString()} handed ${messages.length} message(s) to the agent (up to #${messages[messages.length - 1].id})`);
    } catch (err) {
        // The messages stay readable with read_messages; only this nudge is lost.
        log.appendLine(`could not reach the agent panel: ${err.message}`);
        vscode.window.showWarningMessage(`Crewroom could not hand messages to the agent: ${err.message}`);
    }
}

async function listen() {
    running = true;
    while (running) {
        const { hub, agent, enabled } = settings();
        if (!enabled || paused) {
            show('$(bell-slash) Crewroom', 'Wake-ups paused. Run "Crewroom: Pause or Resume Wake-ups" to resume.');
            await sleep(3000);
            continue;
        }
        show('$(bell) Crewroom', `Listening for chatroom messages as "${agent}".`);
        controller = new AbortController();
        try {
            const res = await fetch(`${hub}/inbox/${encodeURIComponent(agent)}?wait=${WAIT_SECONDS}`, { signal: controller.signal });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `hub answered ${res.status}`);
            if (body.messages.length > 0) await deliver(body.messages);
        } catch (err) {
            if (!running) break;
            if (err.name !== 'AbortError') {
                // Usually the hub is not running yet; the crewroom MCP server starts it.
                show('$(debug-disconnect) Crewroom', `Hub not reachable at ${hub}: ${err.message}. Retrying.`);
                await sleep(10000);
            }
        }
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function activate(context) {
    log = vscode.window.createOutputChannel('Crewroom');
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    status.command = 'crewroom.toggle';
    status.show();
    context.subscriptions.push(log, status,
        vscode.commands.registerCommand('crewroom.toggle', () => {
            paused = !paused;
            if (controller) controller.abort();
            vscode.window.showInformationMessage(paused ? 'Crewroom wake-ups paused.' : 'Crewroom wake-ups resumed.');
        }),
        vscode.commands.registerCommand('crewroom.test', () =>
            deliver([{ id: 0, room_id: 'test', agent_id: 'Crewroom', content: 'This is a test from the Crewroom Wake extension. Reply "received" here; do not post in the chatroom.' }])),
        vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('crewroom') && controller) controller.abort(); }),
        { dispose: () => { running = false; if (controller) controller.abort(); } });
    listen();
}

function deactivate() {
    running = false;
    if (controller) controller.abort();
}

module.exports = { activate, deactivate };
