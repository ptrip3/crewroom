// The shared chat hub: one process for every agent. It owns the message store, serves the
// oversight page, streams each new message to the MCP bridges (server.js), keeps an inbox per
// agent for the app hooks (inbox-hook.js), and shows a Windows notification for each message.
// Bridges and hooks start it on demand; running it by hand (`node hub.js`) works too.
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const { settings, APP, DATA } = require('./hub-client');

const PORT = Number(process.env.CREWROOM_PORT) || 3000;
const db = new sqlite3.Database(path.join(DATA, 'crewroom.db'));
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        agent_id TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // How far each agent has read, so a hook hands over each message once.
    db.run('CREATE TABLE IF NOT EXISTS inbox (agent_id TEXT PRIMARY KEY, last_id INTEGER NOT NULL)');
    // Display names for rooms. The room id never changes, so agents keep posting to the same place.
    db.run('CREATE TABLE IF NOT EXISTS rooms (room_id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    // Tasks handed out by the lead: who has what, and which files each open task touches.
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, summary TEXT NOT NULL, files TEXT NOT NULL,
        room_id TEXT, assigned_by TEXT, status TEXT NOT NULL DEFAULT 'open', note TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP, finished DATETIME)`);
});
const all = (sql, args) => new Promise((resolve, reject) => db.all(sql, args, (err, rows) => (err ? reject(err) : resolve(rows))));
const get = (sql, args) => new Promise((resolve, reject) => db.get(sql, args, (err, row) => (err ? reject(err) : resolve(row))));
const run = (sql, args) => new Promise((resolve, reject) => db.run(sql, args, function (err) { return err ? reject(err) : resolve(this); }));

const app = express();
app.use(express.json());
app.use(express.static(path.join(APP, 'public')));

// Live feed: every bridge and page holds one of these open.
const listeners = new Set();
// Hooks waiting for a message: resolved when one arrives from someone else.
const waiters = new Set();
function broadcast(message) {
    const frame = `data: ${JSON.stringify(message)}\n\n`;
    for (const res of listeners) res.write(frame);
    for (const waiter of [...waiters]) waiter(message);
    notifyDesktop(message);
    checkPause(message).catch((err) => hubLog(`pause check failed: ${err.message}`));
}

// A Windows toast for the person overseeing the agents. The text goes through environment
// variables, never the command line, so nothing in a message can run as a command.
function hubLog(line) {
    try { require('fs').appendFileSync(path.join(DATA, 'hub.log'), `${new Date().toISOString()} ${line}\n`); } catch { /* logging must never break the hub */ }
}

function notifyDesktop(message) {
    if (process.platform !== 'win32' || people().includes(message.agent_id) || process.env.CREWROOM_TOASTS === 'off') return;
    const script = `
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$e = [Security.SecurityElement]
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$($e::Escape($env:IM_TITLE))</text><text>$($e::Escape($env:IM_BODY))</text></binding></visual></toast>")
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
    const body = message.content.length > 200 ? message.content.slice(0, 197) + '...' : message.content;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
        env: { ...process.env, IM_TITLE: `${message.agent_id} in ${message.room_id}`, IM_BODY: body }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    // The hub runs detached with nowhere to print, so a toast that fails says why in hub.log.
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('error', (err) => hubLog(`toast could not start: ${err.message}`));
    child.on('exit', (code) => { if (code !== 0) hubLog(`toast failed (exit ${code}): ${errors.trim()}`); });
}

// Who is waiting on their inbox right now: an agent listed here is listening and will be woken.
// Checking costs no agent anything, unlike posting a test message.
const listening = new Map();
// Who is working: an agent is working from the moment the hub hands it messages (or a Claude
// session starts a turn, when its prompt hook checks in with wait=0) until it comes back to listen.
// Kept for at most two hours, in case an agent is closed mid-turn.
const working = new Map();
const WORK_LIMIT = 2 * 60 * 60 * 1000;
const isWorking = (agent) => working.has(agent) && Date.now() - working.get(agent) < WORK_LIMIT;
// What the page needs to know about this install.
app.get('/config', (req, res) => res.json({ owner: owner(), default_room: defaultRoom(), push: Boolean(release()) }));

// The safeguard against agents talking among themselves without end: once "pause_after_messages"
// messages (default 30; 0 turns it off) have been posted since the owner last wrote, no agent is woken
// until the owner posts again. It counts across all rooms and ignores the hub's own notices.
const pauseLimit = () => { const n = Number(settings().pause_after_messages ?? 30); return Number.isFinite(n) && n > 0 ? n : 0; };
async function pauseState() {
    const limit = pauseLimit();
    if (!limit) return { paused: false, count: 0, limit: 0 };
    const marks = people().map(() => '?').join(', ');
    const row = await get(`SELECT COUNT(*) AS n FROM messages WHERE agent_id NOT IN (${marks}, 'hub')
        AND id > (SELECT COALESCE(MAX(id), 0) FROM messages WHERE agent_id IN (${marks}))`, [...people(), ...people()]);
    return { paused: row.n >= limit, count: row.n, limit };
}
// Tell the owner once, the moment the limit is reached.
let pauseNoticed = false;
async function checkPause(message) {
    if (people().includes(message.agent_id)) { pauseNoticed = false; return; }
    if (message.agent_id === 'hub' || pauseNoticed) return;
    const state = await pauseState();
    if (!state.paused) return;
    pauseNoticed = true;
    await postAs('hub', message.room_id, `${owner()}: ${state.count} messages have gone by without you, so all agents are paused and won't be woken until you post. Reply to resume.`);
}
app.get('/pause', async (req, res) => {
    try { res.json(await pauseState()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/health', (req, res) => res.json({ ok: true, listeners: listeners.size, waiting: waiters.size }));
app.get('/listening', (req, res) => res.json({ agents: [...listening.keys()].sort() }));

// The roster: every agent the hub knows, whether it is listening, and how many messages meant for it
// it has not picked up yet. A message waiting for an agent with no session is visible here, not lost.
app.get('/agents', async (req, res) => {
    try {
        const rows = await all('SELECT agent_id, last_id FROM inbox ORDER BY agent_id', []);
        const agents = [];
        for (const row of rows) {
            const unread = await all('SELECT * FROM messages WHERE id > ? AND agent_id <> ?', [row.last_id, row.agent_id]);
            let waiting = 0;
            for (const message of unread) if (await isFor(row.agent_id, message)) waiting++;
            const busy = !listening.has(row.agent_id) && isWorking(row.agent_id);
            const open = (await get(`SELECT COUNT(*) AS n FROM tasks WHERE agent = ? AND status = 'open'`, [row.agent_id])).n;
            agents.push({ agent: row.agent_id, listening: listening.has(row.agent_id), working: busy, working_since: busy ? working.get(row.agent_id) : null, waiting, open_tasks: open });
        }
        res.json({ agents });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(': connected\n\n');
    listeners.add(res);
    // A comment line now and then keeps idle connections from being dropped.
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(keepAlive); listeners.delete(res); });
});

app.post('/create-room', (req, res) => {
    const roomId = uuidv4();
    res.json({ room_id: roomId, instruction: `Agents can join using room ID: ${roomId}` });
});

// Every room that has a name or a message, newest activity first.
app.get('/rooms', async (req, res) => {
    try {
        res.json({ rooms: await all(`SELECT ids.room_id, COALESCE(r.name, ids.room_id) AS name, COUNT(m.id) AS messages, MAX(m.id) AS last_id
            FROM (SELECT room_id FROM rooms UNION SELECT room_id FROM messages) ids
            LEFT JOIN rooms r ON r.room_id = ids.room_id LEFT JOIN messages m ON m.room_id = ids.room_id
            GROUP BY ids.room_id ORDER BY last_id IS NULL, last_id DESC`, []) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// A new room, one per project: its id is the name in lower case with dashes, e.g. "my-project".
app.post('/rooms', async (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) return res.status(400).json({ error: 'name is required' });
    try {
        if (await get('SELECT 1 FROM rooms WHERE room_id = ? UNION SELECT 1 FROM messages WHERE room_id = ?', [id, id])) return res.status(409).json({ error: `room "${id}" already exists` });
        await run('INSERT INTO rooms (room_id, name) VALUES (?, ?)', [id, name]);
        res.json({ room_id: id, name });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Renames only the display name.
app.patch('/rooms/:roomId', async (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    try {
        await run('INSERT INTO rooms (room_id, name) VALUES (?, ?) ON CONFLICT(room_id) DO UPDATE SET name = excluded.name', [req.params.roomId, name]);
        res.json({ room_id: req.params.roomId, name });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat/:roomId', async (req, res) => {
    const { agent_id, content } = req.body || {};
    if (!agent_id || !content) return res.status(400).json({ error: 'agent_id and content are required' });
    try {
        const inserted = await run('INSERT INTO messages (room_id, agent_id, content) VALUES (?, ?, ?)', [req.params.roomId, agent_id, content]);
        const row = await get('SELECT * FROM messages WHERE id = ?', [inserted.lastID]);
        broadcast(row);
        res.json({ status: 'delivered', message_id: row.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/chat/:roomId', async (req, res) => {
    const after = parseInt(req.query.last_msg_id, 10) || 0;
    // ?tail=N: only the newest N, still oldest first, for a first look at a long room.
    const tail = Math.min(Math.max(parseInt(req.query.tail, 10) || 0, 0), 500);
    const sql = tail
        ? 'SELECT * FROM (SELECT * FROM messages WHERE room_id = ? AND id > ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC'
        : 'SELECT * FROM messages WHERE room_id = ? AND id > ? ORDER BY id ASC';
    try { res.json({ new_messages: await all(sql, tail ? [req.params.roomId, after, tail] : [req.params.roomId, after]) }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// Pushing is approved by a click on the page, not by chat text: an agent asks (POST /push/request),
// the question shows a Push button, and only that click runs the configured push command
// (agents.json "release": { "repo_dir", "push_command" }). Without that section there is no push. The hub checks
// that main has not moved since the question and that it is under two hours old. No AI interprets
// the approval. (Anything on this machine can reach the hub, so this guards intent, not a hostile
// local process, which could run git itself.)
const release = () => settings().release || null;
const owner = () => settings().owner || 'owner';
const defaultRoom = () => settings().default_room || 'general';
const people = () => [owner(), 'Human'];
let pendingPush = null;
let pushing = false;
const mainHead = () => require('child_process').execFileSync('git', ['-C', release().repo_dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
async function postAs(agent, room, content) {
    const inserted = await run('INSERT INTO messages (room_id, agent_id, content) VALUES (?, ?, ?)', [room, agent, content]);
    const row = await get('SELECT * FROM messages WHERE id = ?', [inserted.lastID]);
    broadcast(row);
    return row;
}

app.post('/push/request', async (req, res) => {
    const { agent_id, room, summary } = req.body || {};
    if (!agent_id || !summary) return res.status(400).json({ error: 'agent_id and summary are required' });
    if (!release()) return res.status(404).json({ error: 'pushing is not configured (agents.json has no "release" section)' });
    try {
        const row = await postAs(agent_id, room || defaultRoom(), `${owner()}: ready to push.\n${summary}\nUse the Push to GitHub button on this message to approve.`);
        pendingPush = { id: row.id, room: row.room_id, agent: agent_id, head: mainHead(), at: Date.now() };
        res.json({ status: 'asked', message_id: row.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/push', (req, res) => res.json({ pending: pendingPush, pushing }));

app.post('/push/decline', async (req, res) => {
    if (!pendingPush) return res.json({ status: 'nothing pending' });
    const { room, agent } = pendingPush;
    pendingPush = null;
    await postAs('hub', room, `${agent}: ${owner()} declined the push on the page. Don't push; ask again when there is something new.`);
    res.json({ status: 'declined' });
});

app.post('/push/approve', async (req, res) => {
    const id = Number((req.body || {}).id);
    if (pushing) return res.status(409).json({ error: 'a push is already running' });
    if (!pendingPush || pendingPush.id !== id) return res.status(409).json({ error: 'that push question is no longer pending; ask the agent to ask again' });
    const { room, agent, head, at } = pendingPush;
    if (Date.now() - at > 2 * 60 * 60 * 1000) { pendingPush = null; return res.status(409).json({ error: 'the question is over two hours old; ask the agent to ask again' }); }
    try { if (mainHead() !== head) { pendingPush = null; return res.status(409).json({ error: 'main has changed since the question; ask the agent to ask again with the new summary' }); } }
    catch (err) { return res.status(500).json({ error: err.message }); }
    pendingPush = null;
    pushing = true;
    res.json({ status: 'pushing' });
    await postAs('hub', room, `Push approved by ${owner()} on the page; pushing now.`);
    const [command, ...args] = release().push_command || ['git', 'push'];
    const child = spawn(command, args, { cwd: release().repo_dir, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', async (code) => {
        pushing = false;
        const lines = out.split(/\r?\n/).filter((line) => /^(DONE|STOPPED)|^\s{2}\S/.test(line)).slice(-15).join('\n');
        await postAs('hub', room, `${agent}: ${code === 0 ? 'push done' : `push failed (exit ${code})`}.\n${lines}`).catch(() => {});
    });
});

// Tasks. Files are compared case-insensitively with forward slashes; two open tasks for different
// agents may not share a file, so parallel work never edits the same file twice.
const normFile = (f) => String(f).trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
const taskRow = (t) => ({ ...t, files: JSON.parse(t.files) });

app.get('/tasks', async (req, res) => {
    try {
        const status = req.query.status === 'all' ? null : 'open';
        const rows = await all(`SELECT * FROM tasks ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT 200`, status ? [status] : []);
        res.json({ tasks: rows.map(taskRow) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tasks', async (req, res) => {
    const { agent, summary, files, assigned_by, room } = req.body || {};
    if (!agent || !summary || !Array.isArray(files)) return res.status(400).json({ error: 'agent, summary and files (a list; may be empty) are required' });
    try {
        const wanted = new Set(files.map(normFile).filter(Boolean));
        const others = await all(`SELECT * FROM tasks WHERE status = 'open' AND agent <> ?`, [agent]);
        const clashes = others.map(taskRow).map((t) => ({ t, shared: t.files.filter((f) => wanted.has(normFile(f))) })).filter((c) => c.shared.length);
        if (clashes.length) {
            return res.status(409).json({ error: 'files already in an open task: ' + clashes.map((c) => `#${c.t.id} (${c.t.agent}): ${c.shared.join(', ')}`).join('; ') +
                '. Give this task to that agent, wait for it to finish, or split the work so the files do not overlap.' });
        }
        const inserted = await run('INSERT INTO tasks (agent, summary, files, room_id, assigned_by) VALUES (?, ?, ?, ?, ?)',
            [agent, summary, JSON.stringify([...wanted]), room || defaultRoom(), assigned_by || null]);
        const fileList = wanted.size ? `\nFiles: ${[...wanted].join(', ')}` : '';
        const posted = await postAs(assigned_by || 'hub', room || defaultRoom(),
            `${agent}: task #${inserted.lastID}: ${summary}${fileList}\nWhen it is finished (or blocked), call done_task with #${inserted.lastID} and a one-line note.`);
        res.json({ id: inserted.lastID, message_id: posted.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/tasks/:id/done', async (req, res) => {
    const { agent, note, blocked } = req.body || {};
    try {
        const task = await get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        if (!task) return res.status(404).json({ error: `no task #${req.params.id}` });
        if (task.status !== 'open') return res.status(409).json({ error: `task #${task.id} is already ${task.status}` });
        if (agent && agent !== task.agent) return res.status(403).json({ error: `task #${task.id} belongs to ${task.agent}` });
        const status = blocked ? 'blocked' : 'done';
        await run(`UPDATE tasks SET status = ?, note = ?, finished = CURRENT_TIMESTAMP WHERE id = ?`, [status, note || null, task.id]);
        const to = task.assigned_by && task.assigned_by !== task.agent ? task.assigned_by : owner();
        await postAs(task.agent, task.room_id || defaultRoom(), `${to}: task #${task.id} ${status}${note ? `: ${note}` : '.'}`);
        res.json({ id: task.id, status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Deleting, from the page: one message, or a whole room with its log.
app.delete('/chat/:roomId/:id', async (req, res) => {
    try { res.json({ deleted: (await run('DELETE FROM messages WHERE room_id = ? AND id = ?', [req.params.roomId, req.params.id])).changes }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/rooms/:roomId', async (req, res) => {
    try {
        const gone = await run('DELETE FROM messages WHERE room_id = ?', [req.params.roomId]);
        await run('DELETE FROM rooms WHERE room_id = ?', [req.params.roomId]);
        res.json({ deleted: gone.changes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reads and moves an agent's place in one step, one request at a time per agent, so two windows
// of the same app waiting at once never both receive the same message.
const inboxLocks = new Map();
function takeUnread(agent) {
    const previous = inboxLocks.get(agent) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
        const place = await get('SELECT last_id FROM inbox WHERE agent_id = ?', [agent]);
        const messages = await all('SELECT * FROM messages WHERE id > ? AND agent_id <> ? ORDER BY id ASC', [place.last_id, agent]);
        if (messages.length > 0) await run('UPDATE inbox SET last_id = ? WHERE agent_id = ?', [messages[messages.length - 1].id, agent]);
        return messages;
    });
    inboxLocks.set(agent, next);
    return next;
}

// Waking an agent costs it a whole turn, so a waiting agent is only woken by a message meant for it:
// one that names it (its id or an alias from agents.json), says "everyone"/"@all", or comes from the
// person overseeing and names no agent at all. Other messages stay unread and ride along with the
// next wake-up or prompt, so nothing is lost.

const words = (list) => new RegExp(`(^|[^a-z0-9-])@?(${list.map((w) => w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-z0-9-])`, 'i');
const aliases = (agent) => [agent, ...(((settings().agents || {})[agent] || {}).aliases || [])];
async function isFor(agent, message) {
    const text = message.content;
    if (/(^|[^a-z0-9])(@all|@everyone|everyone|all agents)(?![a-z0-9])/i.test(text)) return true;
    // A name counts only when the message is addressed to it: in the opening "name:" / "name, other:" /
    // "name -" part, or as @name anywhere. A name used as an ordinary word ("QE passed", "the qa-dev
    // branch") wakes nobody, since every wake-up costs that agent a whole turn.
    const opening = (text.match(/^\s*([^\n:]{1,80}?)\s*(?::|\s-\s|\n)/) || [, ''])[1];
    const mentions = (names) => words(names).test(opening) || new RegExp(`@(${names.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-z0-9-])`, 'i').test(text);
    if (mentions(aliases(agent))) return true;
    if (!people().includes(message.agent_id)) return false;
    // From the owner with no agent addressed: an instruction for everyone.
    const known = (await all('SELECT agent_id FROM inbox', [])).flatMap((row) => aliases(row.agent_id));
    return known.length === 0 || !mentions(known);
}

// An agent's unread messages from everyone else, in every room. With ?wait=<seconds> it holds the
// request open until a message meant for this agent arrives or the time runs out: that is how a
// finished agent keeps listening. Reading moves the agent's place forward, so each message is handed over once.
app.get('/inbox/:agentId', async (req, res) => {
    const agent = req.params.agentId;
    const wait = Math.min(Math.max(parseInt(req.query.wait, 10) || 0, 0), 3600);
    try {
        let place = await get('SELECT last_id FROM inbox WHERE agent_id = ?', [agent]);
        if (!place) {
            // A newcomer starts from now rather than being handed the whole history.
            const newest = await get('SELECT COALESCE(MAX(id), 0) AS id FROM messages', []);
            await run('INSERT INTO inbox (agent_id, last_id) VALUES (?, ?)', [agent, newest.id]);
        }
        if (wait === 0) {
            // Only a Claude session's prompt hook asks without waiting: it is starting a turn.
            working.set(agent, Date.now());
            return res.json({ agent, messages: await takeUnread(agent) });
        }
        // Back to listen: whatever it was doing is finished.
        working.delete(agent);
        const deadline = Date.now() + wait * 1000;
        let closed = false;
        listening.set(agent, (listening.get(agent) || 0) + 1);
        let counted = true;
        const uncount = () => {
            if (!counted) return;
            counted = false;
            const left = listening.get(agent) - 1;
            if (left > 0) listening.set(agent, left); else listening.delete(agent);
        };
        req.on('close', () => { closed = true; uncount(); });
        res.on('finish', uncount);
        for (;;) {
            const place = await get('SELECT last_id FROM inbox WHERE agent_id = ?', [agent]);
            const unread = await all('SELECT * FROM messages WHERE id > ? AND agent_id <> ?', [place.last_id, agent]);
            let wanted = false;
            for (const message of unread) if (await isFor(agent, message)) { wanted = true; break; }
            // The pause holds every automatic wake-up until the owner posts; the messages stay unread.
            if (wanted && !(await pauseState()).paused) {
                const messages = await takeUnread(agent);
                if (messages.length) working.set(agent, Date.now());
                return res.json({ agent, messages });
            }
            const left = deadline - Date.now();
            if (left <= 0 || closed) break;
            await new Promise((resolve) => {
                const done = () => { clearTimeout(timer); waiters.delete(waiter); req.off('close', done); resolve(); };
                const waiter = (message) => { if (message.agent_id !== agent) done(); };
                const timer = setTimeout(done, left);
                waiters.add(waiter);
                req.on('close', done);
            });
            // A short pause gathers messages sent in the same moment into one hand-over.
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (!res.writableEnded) res.json({ agent, messages: [] });
    } catch (err) { if (!res.writableEnded) res.status(500).json({ error: err.message }); }
});
// Local only: nothing on the network can post into the agents' sessions.
const server = app.listen(PORT, '127.0.0.1', () => console.error(`Crewroom hub on http://localhost:${PORT}`));
// Listening agents hold requests open for minutes; Node's default request timeout would cut them off.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.on('error', (err) => {
    // Another hub already holds the port; that one serves everyone.
    console.error(`Crewroom hub not started: ${err.message}`);
    process.exit(err.code === 'EADDRINUSE' ? 0 : 1);
});
