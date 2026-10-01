// Shared by the MCP bridge (server.js) and the app hooks (inbox-hook.js): find or start the hub,
// and work out which agent a process belongs to.
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = Number(process.env.CREWROOM_PORT) || 3000;
const HUB = `http://127.0.0.1:${PORT}`;
// APP is the install (public/, skills/). ROOT holds agents.json and data/: the install itself, or
// CREWROOM_HOME points at another folder holding agents.json and data/ (a second setup, or tests).
const APP = path.join(__dirname, '..');
const ROOT = process.env.CREWROOM_HOME ? path.resolve(process.env.CREWROOM_HOME) : path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

async function hubIsUp() {
    try { return (await fetch(`${HUB}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function ensureHub() {
    if (await hubIsUp()) return;
    // Detached, so the hub outlives whoever started it and keeps serving everyone else.
    spawn(process.execPath, [path.join(__dirname, 'hub.js')], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 25; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (await hubIsUp()) return;
    }
    throw new Error(`the chat hub did not start on ${HUB}`);
}

async function hubJson(pathAndQuery, options = {}) {
    await ensureHub();
    const res = await fetch(`${HUB}${pathAndQuery}`, { ...options, headers: { 'Content-Type': 'application/json' } });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `hub answered ${res.status}`);
    return body;
}

// agents.json: which folders take part, and how long a finished agent keeps listening.
function settings() {
    const defaults = { roots: [], listen_seconds: 600, max_wakeups: 0, pause_after_messages: 30, pause_window_minutes: 20, agents: {} };
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'agents.json'), 'utf8')) }; } catch { return defaults; }
}

// The agent's name: an explicit one, else the folder its session runs in (app-dev, ui-dev, ...).
function agentFor(cwd, explicit) {
    if (explicit || process.env.AGENT_ID) return explicit || process.env.AGENT_ID;
    const here = path.resolve(cwd || process.cwd()).toLowerCase();
    // A session in a subfolder (app\src\Views, performance\results) is still that agent, not a new one
    // named after the subfolder: match the deepest configured agent folder that contains it.
    const config = settings();
    const owner = Object.entries(config.agents || {})
        .map(([name, agent]) => ({ name, folder: path.resolve(agent.folder || path.join(config.project?.dir || '', name)).toLowerCase() }))
        .filter(({ folder }) => here === folder || here.startsWith(folder + path.sep))
        .sort((a, b) => b.folder.length - a.folder.length)[0];
    return owner ? owner.name : path.basename(cwd || process.cwd());
}

// Hooks run for every session of an app; only folders under a configured root join the chat.
function takesPart(cwd, explicit) {
    if (explicit || process.env.AGENT_ID) return true;
    const here = path.resolve(cwd || process.cwd()).toLowerCase();
    return settings().roots.some((root) => here.startsWith(path.resolve(root).toLowerCase()));
}

module.exports = { APP, ROOT, DATA, HUB, ensureHub, hubJson, settings, agentFor, takesPart };
