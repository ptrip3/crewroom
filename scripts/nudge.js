// Wakes agents that have gone quiet, for unattended runs. An agent that hit a usage limit is not
// running, so it cannot announce its return; a message addressed to it wakes it once it can work
// again. Run it on a schedule (Task Scheduler every hour):
//   node scripts/nudge.js <room-id> [quiet-minutes]
// It nudges each agent with an open task that has not posted for quiet-minutes (default 45), and
// the lead when the whole room has been quiet that long while a developer has nothing assigned.
const { hubJson, settings } = require('../src/hub-client');

const room = process.argv[2];
const quietMinutes = Number(process.argv[3]) || 45;
if (!room) { console.error('usage: node scripts/nudge.js <room-id> [quiet-minutes]'); process.exit(1); }

async function main() {
    const config = settings();
    const { tasks } = await hubJson('/tasks');
    const { new_messages: recent } = await hubJson(`/chat/${encodeURIComponent(room)}?tail=300`);
    const cutoff = Date.now() - quietMinutes * 60000;
    const at = (m) => Date.parse(m.timestamp.replace(' ', 'T') + 'Z');
    const lastPost = {};
    for (const m of recent) lastPost[m.agent_id] = Math.max(lastPost[m.agent_id] || 0, at(m));
    const roomQuiet = !recent.length || at(recent[recent.length - 1]) < cutoff;

    const lines = [];
    const busy = new Set();
    for (const task of tasks.filter((t) => t.status === 'open')) {
        const first = !busy.has(task.agent);
        busy.add(task.agent);
        if (first && (lastPost[task.agent] || 0) < cutoff)
            lines.push(`${task.agent}: you have been quiet for ${quietMinutes}+ minutes with task #${task.id} open. If you stopped (a usage limit, a restart), say "back" in one line, then list_tasks, read_messages and carry on with #${task.id}. If you are blocked, say why.`);
    }
    const lead = Object.entries(config.agents || {}).find(([, a]) => a.can_assign || a.can_push)?.[0];
    const idle = Object.entries(config.agents || {}).filter(([n, a]) => a.developer && !busy.has(n)).map(([n]) => n);
    if (lead && roomQuiet && idle.length)
        lines.push(`${lead}: the room has been quiet for ${quietMinutes}+ minutes and ${idle.join(', ')} ${idle.length > 1 ? 'have' : 'has'} nothing assigned. Assign the next item from the queue, or write docs/morning-summary.md if the queue is done.`);

    for (const line of lines) await hubJson(`/chat/${encodeURIComponent(room)}`, { method: 'POST', body: JSON.stringify({ agent_id: 'Claude', content: line }) });
    console.log(lines.length ? lines.join('\n') : 'nothing to nudge');
}

main().catch((err) => { console.error(`nudge: ${err.message}`); process.exit(0); });
