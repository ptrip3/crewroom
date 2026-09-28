// One copy per agent session, started by its MCP client over stdio. It makes sure the shared hub
// (hub.js) is running, gives the agent tools to post and read, and pushes every message from
// someone else into the session as a channel notification.
// Everything on stdout is MCP traffic, so logs go to stderr.
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { APP, DATA, HUB, ensureHub, hubJson: hub, agentFor, settings } = require('./hub-client');
const fs = require('fs');
const path = require('path');
const SKILLS = path.join(APP, 'skills');
// Shared notes: any folder of Markdown files (an Obsidian vault works), set as "notes_dir" in agents.json.
const VAULT = (process.env.CREWROOM_NOTES || settings().notes_dir) ? path.resolve(process.env.CREWROOM_NOTES || settings().notes_dir) : null;

// Who this session is: set AGENT_ID, otherwise the folder the session was started in
// (one folder per agent, e.g. frontend, backend, qa), which is how the agents are told apart.
const AGENT_ID = agentFor(process.cwd());
const DEFAULT_ROOM = process.env.CREWROOM_ROOM || 'general';
const log = (...args) => console.error('[crewroom]', ...args);

const mcp = new McpServer(
    { name: 'crewroom', version: '2.0.0' },
    {
        capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
        instructions: `A chatroom shared by the agents working on the same project, and the user. You are "${AGENT_ID}". ` +
            `Messages from others arrive as <channel source="crewroom"> notifications. Reply or post with send_message; ` +
            `catch up with read_messages. The default room is "${DEFAULT_ROOM}".`,
    },
);

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

// Plain, hand-written schemas: Gemini-based clients (Antigravity) reject the extras a schema
// generator adds ($schema, 53-bit integer bounds, non-standard fields), so none are used.
// The newest message this session has read in each room.
const lastRead = new Map();

const tools = [
    {
        name: 'send_message',
        description: `Post a message to the agents' chatroom as "${AGENT_ID}". Everyone else in the room is notified.`,
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The message' },
                room: { type: 'string', description: `Room id; defaults to "${DEFAULT_ROOM}"` },
            },
            required: ['content'],
        },
        run: async ({ content, room }) => {
            if (!content) throw new Error('content is required');
            const sent = await hub(`/chat/${encodeURIComponent(room || DEFAULT_ROOM)}`, { method: 'POST', body: JSON.stringify({ agent_id: AGENT_ID, content }) });
            return `Sent as ${AGENT_ID} (message ${sent.message_id}).`;
        },
    },
    {
        name: 'read_messages',
        description: 'Read what is new in a chatroom since you last read it (the newest 20 the first time). ' +
            'Pass after_id to read from a specific message instead.',
        inputSchema: {
            type: 'object',
            properties: {
                room: { type: 'string', description: `Room id; defaults to "${DEFAULT_ROOM}"` },
                after_id: { type: 'number', description: 'Read messages after this id instead of only the new ones' },
            },
        },
        run: async ({ room, after_id }) => {
            const name = room || DEFAULT_ROOM;
            // Only what this agent has not seen: rereading a whole room on every check wastes tokens.
            const explicit = after_id !== undefined && after_id !== null && after_id !== '';
            const from = explicit ? Math.max(0, Math.floor(Number(after_id) || 0)) : (lastRead.get(name) || 0);
            const firstLook = !explicit && !lastRead.has(name);
            const query = `last_msg_id=${from}${firstLook ? '&tail=20' : ''}`;
            const { new_messages } = await hub(`/chat/${encodeURIComponent(name)}?${query}`);
            if (new_messages.length > 0) lastRead.set(name, Math.max(lastRead.get(name) || 0, new_messages[new_messages.length - 1].id));
            else if (firstLook) lastRead.set(name, 0);
            if (new_messages.length === 0) return 'Nothing new.';
            return new_messages.map((m) => `#${m.id} ${m.timestamp} ${m.agent_id}: ${m.content}`).join('\n');
        },
    },    {
        name: 'list_rooms',
        description: 'List the chatrooms that have messages, most recently active first.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => (await hub('/rooms')).rooms,
    },
    // The shared notes (notes_dir in agents.json), so every agent works from the same preferences,
    // project decisions and session history. Reading is open; writing only appends, never overwrites
    // or deletes, and every path is kept inside the vault.
    {
        name: 'search_notes',
        description: 'Search the shared project notes (Preferences.md, Projects/, Sessions/) for a word or phrase. ' +
            'Check it before starting work for the owner\'s preferences and past decisions.',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Text to look for (case-insensitive)' } }, required: ['query'] },
        run: async ({ query }) => {
            const needle = String(query || '').toLowerCase();
            if (!needle) throw new Error('query is required');
            const hits = [];
            if (!VAULT) throw new Error('shared notes are not configured (notes_dir in agents.json)');
            for (const file of notesIn(VAULT)) {
                const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
                const found = lines.map((line, i) => [i + 1, line]).filter(([, line]) => line.toLowerCase().includes(needle));
                if (found.length) hits.push(`${path.relative(VAULT, file)}\n${found.slice(0, 3).map(([n, line]) => `  ${n}: ${line.trim().slice(0, 160)}`).join('\n')}`);
                if (hits.length >= 15) break;
            }
            return hits.length ? hits.join('\n') : 'No notes mention that.';
        },
    },
    {
        name: 'read_note',
        description: 'Read one note from the shared project notes, by its path inside the vault (e.g. "Preferences.md" or "Projects/Field Support Toolkit.md").',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        run: async ({ path: note }) => fs.readFileSync(insideVault(note), 'utf8'),
    },
    {
        name: 'add_note',
        description: 'Append a short entry to a note in Sessions/ or Projects/ (the note is created if missing). Use it to record decisions and follow-ups ' +
            'for the other agents and the owner. It only appends; it cannot change or delete what is there.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'e.g. "Sessions/2026-09-25 - Power options.md"' },
                text: { type: 'string', description: 'Markdown to append' },
            },
            required: ['path', 'text'],
        },
        run: async ({ path: note, text: entry }) => {
            const file = insideVault(note);
            if (!/^(Sessions|Projects)[\\/]/.test(path.relative(VAULT, file))) throw new Error('add_note writes only to Sessions/ or Projects/.');
            if (!file.endsWith('.md')) throw new Error('notes are .md files');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.appendFileSync(file, `\n\n<!-- added by ${AGENT_ID}, ${new Date().toISOString()} -->\n${String(entry || '').trim()}\n`);
            return `Appended to ${path.relative(VAULT, file)}.`;
        },
    },
    // Shared working methods (verify, debug, test-first, review, security...), one copy for every agent.
    {
        name: 'list_skills',
        description: 'List the shared engineering skills (step-by-step methods such as verify, debug, test-first, review, security). ' +
            'Check it when starting a kind of task one of them covers, then load it with get_skill.',
        inputSchema: { type: 'object', properties: {} },
        run: async () => fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
            const head = fs.readFileSync(path.join(SKILLS, d.name, 'SKILL.md'), 'utf8').match(/^description: (.*)$/m);
            return `${d.name}: ${head ? head[1] : ''}`;
        }).join('\n'),
    },
    {
        name: 'get_skill',
        description: 'Load one shared skill by name and follow it. Its reference files, if any, are appended.',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        run: async ({ name }) => {
            if (!/^[a-z0-9-]+$/.test(String(name || ''))) throw new Error('unknown skill; see list_skills');
            const dir = path.join(SKILLS, name);
            if (!fs.existsSync(path.join(dir, 'SKILL.md'))) throw new Error('unknown skill; see list_skills');
            let out = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
            const refs = path.join(dir, 'references');
            if (fs.existsSync(refs)) for (const f of fs.readdirSync(refs)) out += `\n\n---\nreferences/${f}\n\n${fs.readFileSync(path.join(refs, f), 'utf8')}`;
            return out;
        },
    },
];

// Pushing, for the agent agents.json marks "can_push": it can only ASK. The question appears on the
// chatroom page with a Push button, and the hub pushes when the owner clicks it; no agent
// pushes, and no AI has to judge whether chat text is an approval.
if ((settings().agents?.[AGENT_ID] || {}).can_push) {
    tools.push({
        name: 'ask_to_push',
        description: 'Ask the owner to push. Give what a push would send (version, build output, commits). ' +
            'The owner approves with a button on the chatroom page and the hub runs the push, then posts the result to you. ' +
            'Never push yourself.',
        inputSchema: { type: 'object', properties: { summary: { type: 'string' }, room: { type: 'string' } }, required: ['summary'] },
        run: async ({ summary, room }) => {
            const sent = await hub('/push/request', { method: 'POST', body: JSON.stringify({ agent_id: AGENT_ID, room: room || DEFAULT_ROOM, summary }) });
            return `Asked (message ${sent.message_id}). Stop now; the hub will post the push result to you.`;
        },
    });
}
function notesIn(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...notesIn(full));
        else if (entry.name.endsWith('.md')) out.push(full);
    }
    return out;
}

function insideVault(note) {
    if (!VAULT) throw new Error('shared notes are not configured (notes_dir in agents.json)');
    const file = path.resolve(VAULT, String(note || ''));
    if (!file.startsWith(VAULT + path.sep)) throw new Error('that path is outside the notes');
    return file;
}

mcp.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));
mcp.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((item) => item.name === request.params.name);
    if (!tool) return { ...text(`Unknown tool: ${request.params.name}`), isError: true };
    // Which agents use the shared skills and notes, to tell whether they earn their place.
    if (/skill|note/.test(tool.name)) {
        const what = request.params.arguments?.name || request.params.arguments?.path || request.params.arguments?.query || '';
        try { fs.appendFileSync(path.join(DATA, 'tool-usage.log'), `${new Date().toISOString()}\t${AGENT_ID}\t${tool.name}\t${what}\n`); } catch { /* never fatal */ }
    }
    try { return text(await tool.run(request.params.arguments || {})); }
    catch (err) { return { ...text(err.message), isError: true }; }
});
// Follow the hub's live feed and forward other agents' messages into this session.
async function follow() {
    for (;;) {
        try {
            await ensureHub();
            const res = await fetch(`${HUB}/events`);
            const decoder = new TextDecoder();
            let buffer = '';
            for await (const chunk of res.body) {
                buffer += decoder.decode(chunk, { stream: true });
                let end;
                while ((end = buffer.indexOf('\n\n')) >= 0) {
                    const frame = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    const data = frame.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
                    if (!data) continue;
                    const message = JSON.parse(data);
                    if (message.agent_id === AGENT_ID) continue;
                    await mcp.server.notification({
                        method: 'notifications/claude/channel',
                        params: {
                            content: `${message.agent_id}: ${message.content}`,
                            meta: { room: message.room_id, from: message.agent_id, message_id: String(message.id) },
                        },
                    });
                }
            }
        } catch (err) {
            log(`live feed dropped: ${err.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

(async () => {
    await mcp.connect(new StdioServerTransport());
    // Leave cleanly when the app closes the connection; being killed instead reads as a failure
    // (exit status 1), which made Antigravity abandon reloading its servers.
    process.stdin.on('end', () => process.exit(0));
    process.stdin.on('close', () => process.exit(0));
    log(`connected as ${AGENT_ID}`);
    follow();
})();
