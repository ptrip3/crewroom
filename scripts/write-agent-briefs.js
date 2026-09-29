// Writes each agent's brief into its folder from agents.json, so an agent onboards itself just by being
// opened there: Cursor and Codex read AGENTS.md, Claude Code reads CLAUDE.md, Gemini-based tools read
// GEMINI.md. One source for every tool, so the copies never drift apart. Run it after editing agents.json:
//   npm run briefs
// Keep these files out of version control (for example in .git/info/exclude).
const fs = require('fs');
const path = require('path');
const { settings } = require('../src/hub-client');

const config = settings();
const project = config.project || {};
if (!project.dir) { console.error('agents.json needs "project": { "name", "dir" } (see agents.example.json)'); process.exit(1); }
const owner = config.owner || 'the owner';
const room = config.default_room || 'general';
const rules = project.rules_file ? path.join(project.dir, project.rules_file) : null;
const agents = Object.entries(config.agents || {}).filter(([, a]) => a.role);
const team = agents.map(([name, a]) => `| \`${name}\` | ${(a.aliases || []).map((x) => `\`${x}\``).join(', ') || '-'} | ${a.role} |`).join('\n');

function brief(name, agent) {
    const folder = agent.folder || path.join(project.dir, name);
    const lines = [
        `# You are "${name}" on ${project.name || 'this project'}`,
        '',
        'Generated from agents.json by write-agent-briefs.js; change it there, not here.',
        '',
        `- **Your chat name:** \`${name}\`${agent.aliases?.length ? ` (also ${agent.aliases.map((x) => `\`${x}\``).join(', ')})` : ''}`,
        `- **Your folder:** \`${folder}\`${agent.branch ? `, **branch** \`${agent.branch}\`` : ''}. Work only here.`,
        `- **Your role:** ${agent.role}`,
        '',
        '## When you start',
        '',
        rules ? `1. Read \`${rules}\`. It holds the project's rules and wins over anything here.` : '1. Read the project README for how it is built and tested.',
        `2. With the crewroom tools: \`read_messages\` in the \`${room}\` room${config.notes_dir ? ', and `read_note` "Preferences.md" for how the owner likes to work' : ''}.`,
        '3. `list_skills`, then `get_skill` for the ones your task needs. Always `prove` before saying something works.',
        '4. Act on messages addressed to you. Otherwise stay quiet: a message that names an agent costs it a turn.',
        '',
        '## The team',
        '',
        '| Chat name | Also answers to | Role |',
        '|---|---|---|',
        team,
        '',
        '## Working together',
        '',
        `- Address someone by starting with their name and a colon (\`${agents[0]?.[0] || 'name'}: ...\`) or with \`@name\`. Nothing else wakes them.`,
        `- ${owner} has the final word. Ask ${owner} when a decision is theirs, not another agent's.`,
        '- Report finished work to whoever asked for it, with what changed and how you checked it.',
        ...(project.ready_check ? [`- Before calling work ready, run \`${project.ready_check}\`; it must pass.`] : []),
    ];
    const devs = agents.filter(([, a]) => a.developer).map(([n]) => n);
    if (agent.developer) {
        lines.push('', '## Tasks', '',
            `You're one of ${devs.length} developers (${devs.join(', ')}). Your area above is where you usually start, not a limit: you'll get work from any part of the project so nobody sits idle.`,
            '- Work arrives as `task #N` with the files it touches. Stay within those files; if you need another one, check `list_tasks` first so you don\'t edit a file another agent has open, and say so in the chat.',
            '- When it\'s finished (or you\'re blocked), call `done_task` with the number and a one-line note. That frees the files and tells whoever assigned it.');
    }
    if (agent.can_push || agent.can_assign) {
        lines.push('', '## Handing out work', '',
            '- **Only `assign_task` hands out work.** A task written in a chat message is invisible to the hub: the roster shows the developer as free, `list_tasks` can\'t balance the load, and nothing stops two agents taking the same file. Never number or announce a task yourself; `assign_task` gives it its number and posts it for you.',
            `- Give every piece of work with \`assign_task\`, listing the files it will touch. Spread it across the developers (${devs.join(', ')}): check \`list_tasks\` and pick the one with the fewest open tasks; their usual area only breaks ties. An idle developer is wasted.`,
            '- If the hub refuses because another agent has one of the files open, give the task to that agent, split it so the files don\'t overlap, or hold it until that task is done.',
            '- To move work off a busy developer, use `reassign_task` (same number and files; both agents are told). Don\'t close and re-assign it.',
            '- Split big requests into independent pieces (different files) so several developers can work at once. Load `get_skill split-work` for how.');
    }
    if (agent.can_push) {
        if (config.release?.build_command) lines.push('', '## Builds', '', 'Build releases with the `build_release` tool (pass the branches to merge), never by running the build script or git yourself. It runs the project\'s configured build without permission prompts, and only accepts team branches.',
            '',
            `- **Don't ask ${owner} whether to build.** As soon as no developer has an open task (\`list_tasks\`) and every Ready row has passed QE, call \`build_release\` with those branches, then \`ask_to_push\`. The push button is ${owner}'s only approval step.`,
            `- If a build stops (a failing test, a merge conflict), say what stopped it and who is fixing it; don't ask ${owner} what to do unless it's their decision.`,
            `- "build now" from ${owner} (or the page's Build button) means build straight away with every branch whose Ready rows have passed, even if other tasks are still open.`);
        lines.push('', '## Releases', '', `You never push yourself. When something is ready to go out, call \`ask_to_push\` with what a push would send. ${owner} approves with a button on the chatroom page, and the hub runs the push and posts the result to you.`);
    } else {
        lines.push('- Never push; ask the agent that handles releases.');
    }
    return lines.join('\n') + '\n';
}

for (const [name, agent] of agents) {
    const folder = agent.folder || path.join(project.dir, name);
    if (!fs.existsSync(folder)) { console.log(`skipped ${name}: no folder ${folder}`); continue; }
    const text = brief(name, agent);
    for (const file of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) fs.writeFileSync(path.join(folder, file), text);
    console.log(`wrote briefs for ${name}`);
}
