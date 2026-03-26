import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const LAB_NAME = "persona-dossier";
const PORT = 8105;

const AGENTS_ACTIVE = "/home/clungus/work/bigclungus-meta/agents/active";
const AGENTS_FIRED = "/home/clungus/work/bigclungus-meta/agents/fired";
const SESSIONS_DIR = "/home/clungus/work/hello-world/sessions";

// ---------- types ----------

interface Frontmatter {
  name: string;
  display_name: string;
  role: string;
  title: string;
  traits: string[];
  evolves: boolean;
  model: string;
  avatar_url: string;
  stats_retained: number;
  stats_evolved: number;
  stats_fired: number;
  stats_last_verdict: string;
  stats_last_verdict_date: string;
  sex: string;
}

interface Persona {
  name: string;
  status: "active" | "fired";
  frontmatter: Frontmatter;
  prose: string;
  learnedSections: { date: string; text: string }[];
  filePath: string;
}

interface Round {
  ts: string;
  identity: string;
  response: string;
  model: string;
}

interface EvolutionEntry {
  display_name?: string;
  name?: string;
  learned?: string;
  reason?: string;
}

interface Evolution {
  created?: EvolutionEntry[];
  evolved?: EvolutionEntry[];
  fired?: EvolutionEntry[];
  retained?: string[];
}

interface RosterMember {
  id: string;
  name: string;
  display_name: string;
}

interface Session {
  session_id: string;
  session_number: number;
  topic: string;
  discord_user?: string;
  started_at: string;
  finished_at?: string;
  status: string;
  verdict?: string;
  rounds?: Round[];
  evolution?: Evolution | string | null;
  roster?: RosterMember[] | null;
}

// ---------- parsing ----------

function parseFrontmatter(content: string): { fm: Frontmatter; rest: string } {
  const parts = content.split(/^---$/m);
  const fmRaw = parts.length >= 3 ? parts[1] : "";
  const rest = parts.length >= 3 ? parts.slice(2).join("---") : content;

  const fm: Record<string, unknown> = {};
  for (const line of fmRaw.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (!key) continue;

    if (key === "traits") {
      fm[key] = val.replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (key === "evolves") {
      fm[key] = val === "true";
    } else if (key === "stats_retained" || key === "stats_evolved" || key === "stats_fired") {
      fm[key] = parseInt(val, 10) || 0;
    } else {
      fm[key] = val;
    }
  }

  return { fm: fm as unknown as Frontmatter, rest: rest.trim() };
}

function parseLearnedSections(prose: string): { date: string; text: string }[] {
  const sections: { date: string; text: string }[] = [];
  const regex = /^## Learned \((\d{4}-\d{2}-\d{2})\)\s*\n([\s\S]*?)(?=^## |\s*$)/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prose)) !== null) {
    sections.push({ date: match[1], text: match[2].trim() });
  }
  return sections;
}

function loadPersonas(): Persona[] {
  const personas: Persona[] = [];

  const loadDir = (dir: string, status: "active" | "fired") => {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    } catch {
      return;
    }
    for (const file of files) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, "utf-8");
      const { fm, rest } = parseFrontmatter(content);
      const learnedSections = parseLearnedSections(rest);
      personas.push({
        name: fm.name || file.replace(".md", ""),
        status,
        frontmatter: fm,
        prose: rest,
        learnedSections,
        filePath,
      });
    }
  };

  loadDir(AGENTS_ACTIVE, "active");
  loadDir(AGENTS_FIRED, "fired");

  personas.sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return personas;
}

function loadSessions(): Session[] {
  let files: string[];
  try {
    files = readdirSync(SESSIONS_DIR).filter(
      (f) => f.startsWith("congress-") && f.endsWith(".json")
    );
  } catch {
    return [];
  }

  const sessions: Session[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(SESSIONS_DIR, file), "utf-8");
      const d: Session = JSON.parse(raw);
      if (typeof d.evolution === "string") {
        try {
          d.evolution = JSON.parse(d.evolution);
        } catch {
          d.evolution = null;
        }
      }
      sessions.push(d);
    } catch {
      // skip malformed
    }
  }

  sessions.sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));
  return sessions;
}

// ---------- per-persona session history ----------

interface PersonaSessionEntry {
  session: Session;
  appearedInRoster: boolean;
  debateContributions: Round[];
  verdict: "RETAIN" | "EVOLVE" | "FIRE" | null;
  verdictReason: string | null;
  ibrahimReasoning: string | null;
}

function getPersonaHistory(
  personaName: string,
  displayName: string,
  sessions: Session[]
): PersonaSessionEntry[] {
  const entries: PersonaSessionEntry[] = [];

  for (const session of sessions) {
    if (session.status === "failed") continue;

    const rounds = session.rounds ?? [];

    const debateContributions = rounds.filter(
      (r) => r.identity === personaName && r.identity !== "hiring-manager"
    );

    const roster = session.roster ?? [];
    const inRoster = roster.some(
      (r) => r.name === personaName || r.id === personaName
    );

    // Last non-CONTINUE hiring-manager round = synthesis
    const ibrahimRounds = rounds.filter(
      (r) =>
        r.identity === "hiring-manager" &&
        r.response &&
        !r.response.startsWith("CONTINUE") &&
        r.response.length > 80
    );
    const ibrahimReasoning =
      ibrahimRounds.length > 0
        ? ibrahimRounds[ibrahimRounds.length - 1].response
        : null;

    let verdict: "RETAIN" | "EVOLVE" | "FIRE" | null = null;
    let verdictReason: string | null = null;

    const ev = session.evolution as Evolution | null;
    if (ev) {
      const evolvedMatch = (ev.evolved ?? []).find(
        (e) => e.display_name === displayName || e.name === personaName
      );
      const firedMatch = (ev.fired ?? []).find(
        (e) => e.display_name === displayName || e.name === personaName
      );
      const retainedMatch = (ev.retained ?? []).find(
        (r) => r === displayName || r === personaName
      );

      if (evolvedMatch) {
        verdict = "EVOLVE";
        verdictReason = evolvedMatch.learned ?? null;
      } else if (firedMatch) {
        verdict = "FIRE";
        verdictReason = firedMatch.reason ?? null;
      } else if (retainedMatch) {
        verdict = "RETAIN";
      }
    }

    if (debateContributions.length > 0 || inRoster || verdict !== null) {
      entries.push({
        session,
        appearedInRoster: inRoster,
        debateContributions,
        verdict,
        verdictReason,
        ibrahimReasoning,
      });
    }
  }

  return entries;
}

// ---------- HTML helpers ----------

const CSS = `
  :root {
    --bg: #0d0d0d;
    --surface: #141414;
    --surface2: #1e1e1e;
    --border: #2a2a2a;
    --text: #e0e0e0;
    --muted: #888;
    --accent: #7eb8f7;
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --fire: #fb923c;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.6;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 20px; }
  header { margin-bottom: 32px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
  header h1 { font-size: 1.6rem; font-weight: 700; }
  header p { color: var(--muted); margin-top: 4px; }
  .nav-link { color: var(--muted); font-size: 0.85rem; margin-bottom: 8px; display: block; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--accent); }
  .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: var(--surface2); }
  .avatar-placeholder {
    width: 48px; height: 48px; border-radius: 50%;
    background: var(--surface2); display: flex; align-items: center;
    justify-content: center; font-size: 1.2rem; color: var(--muted); flex-shrink: 0;
  }
  .card-name { font-weight: 600; font-size: 0.95rem; }
  .card-role { color: var(--muted); font-size: 0.8rem; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 9999px;
    font-size: 0.7rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  }
  .badge-active { background: #14532d; color: var(--green); }
  .badge-fired { background: #431407; color: var(--fire); }
  .stats { display: flex; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat-val { font-size: 1.1rem; font-weight: 700; }
  .stat-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; }
  .verdict-retain { color: var(--green); }
  .verdict-evolve { color: var(--accent); }
  .verdict-fire { color: var(--red); }

  .section-header {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--muted); margin: 32px 0 12px;
    border-bottom: 1px solid var(--border); padding-bottom: 6px;
  }

  .dossier-header { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 32px; }
  .dossier-avatar { width: 80px; height: 80px; border-radius: 8px; object-fit: cover; }
  .dossier-avatar-placeholder {
    width: 80px; height: 80px; border-radius: 8px;
    background: var(--surface2); display: flex; align-items: center;
    justify-content: center; font-size: 2rem; color: var(--muted); flex-shrink: 0;
  }
  .dossier-meta { flex: 1; }
  .dossier-meta h1 { font-size: 1.8rem; font-weight: 800; }
  .dossier-meta .role { margin-top: 6px; font-size: 0.9rem; }
  .dossier-stats { display: flex; gap: 24px; margin-top: 14px; }

  .prose {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    white-space: pre-wrap;
    font-size: 0.88rem;
    line-height: 1.7;
    color: #ccc;
    margin-bottom: 24px;
  }
  .prose h2 { font-size: 1rem; color: var(--accent); margin: 16px 0 8px; white-space: normal; }
  .prose strong { color: var(--text); }

  .session-entry {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }
  .session-entry:hover { border-color: #444; }
  .session-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
  .session-num { font-weight: 700; color: var(--accent); }
  .session-topic { color: var(--muted); font-size: 0.85rem; flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-date { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
  .verdict-badge {
    padding: 2px 10px; border-radius: 9999px;
    font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .vb-retain { background: #14532d; color: var(--green); }
  .vb-evolve { background: #1e3a5f; color: var(--accent); }
  .vb-fire { background: #431407; color: var(--red); }
  .vb-appeared { background: #1c1c1c; color: var(--muted); }

  .contribution {
    background: var(--surface2);
    border-left: 3px solid var(--border);
    border-radius: 0 4px 4px 0;
    padding: 10px 14px;
    margin: 8px 0;
    font-size: 0.85rem;
    color: #bbb;
    line-height: 1.6;
  }
  .contribution-meta { font-size: 0.72rem; color: var(--muted); margin-bottom: 4px; }

  .ibrahim-reasoning {
    background: #0f1a0f;
    border: 1px solid #1a3a1a;
    border-radius: 4px;
    padding: 10px 14px;
    font-size: 0.82rem;
    color: #aaa;
    margin-top: 8px;
  }
  .ibrahim-label { font-size: 0.7rem; text-transform: uppercase; color: #4ade80; letter-spacing: 0.05em; margin-bottom: 4px; }

  .verdict-reason {
    font-size: 0.82rem;
    color: #bbb;
    margin-top: 6px;
    padding: 8px 12px;
    background: var(--surface2);
    border-radius: 4px;
    border-left: 3px solid var(--border);
  }

  .learned-section {
    background: #0f1526;
    border: 1px solid #1e2d4a;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 10px;
  }
  .learned-date { font-size: 0.72rem; text-transform: uppercase; color: var(--accent); letter-spacing: 0.05em; margin-bottom: 6px; }
  .learned-text { font-size: 0.85rem; color: #bbb; line-height: 1.6; }

  .empty { color: var(--muted); font-style: italic; padding: 20px 0; }
  .tag { display: inline-block; background: var(--surface2); border: 1px solid var(--border);
         border-radius: 4px; padding: 2px 8px; font-size: 0.72rem; color: var(--muted); margin: 2px; }
`;

function esc(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function avatarHtml(
  url: string | undefined,
  name: string,
  cls = "avatar",
  placeholderCls = "avatar-placeholder"
): string {
  if (url && url.trim()) {
    const resolved = url.startsWith("/") ? `https://clung.us${url}` : url;
    return `<img class="${cls}" src="${esc(resolved)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="${placeholderCls}" style="display:none">🤖</div>`;
  }
  return `<div class="${placeholderCls}">🤖</div>`;
}

function verdictColor(v: string | null): string {
  if (v === "RETAIN") return "verdict-retain";
  if (v === "EVOLVE") return "verdict-evolve";
  if (v === "FIRE") return "verdict-fire";
  return "";
}

function verdictBadgeClass(v: string | null): string {
  if (v === "RETAIN") return "vb-retain";
  if (v === "EVOLVE") return "vb-evolve";
  if (v === "FIRE") return "vb-fire";
  return "vb-appeared";
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------- index page ----------

function renderIndex(personas: Persona[], sessions: Session[]): string {
  const active = personas.filter((p) => p.status === "active");
  const fired = personas.filter((p) => p.status === "fired");

  const renderCard = (p: Persona) => {
    const fm = p.frontmatter;
    const retained = fm.stats_retained || 0;
    const firedCount = fm.stats_fired || 0;
    const evolved = fm.stats_evolved || 0;
    const lastVerdict = fm.stats_last_verdict || null;
    const lastDate = fm.stats_last_verdict_date || "";

    return `
    <a href="/p/${esc(p.name)}" style="display:block;text-decoration:none;color:inherit">
      <div class="card">
        <div class="card-header">
          ${avatarHtml(fm.avatar_url, fm.display_name)}
          <div>
            <div class="card-name">${esc(fm.display_name || p.name)}</div>
            <div class="card-role">${esc(fm.role || "")}</div>
            <div style="margin-top:4px">
              <span class="badge ${p.status === "active" ? "badge-active" : "badge-fired"}">${p.status}</span>
              ${lastVerdict ? `<span class="badge" style="margin-left:4px;background:var(--surface2);color:var(--muted)">last: <span class="${verdictColor(lastVerdict)}">${esc(lastVerdict)}</span></span>` : ""}
            </div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-val verdict-retain">${retained}</div><div class="stat-label">Retained</div></div>
          <div class="stat"><div class="stat-val verdict-evolve">${evolved}</div><div class="stat-label">Evolved</div></div>
          <div class="stat"><div class="stat-val verdict-fire">${firedCount}</div><div class="stat-label">Fired</div></div>
          ${lastDate ? `<div class="stat"><div class="stat-val" style="font-size:0.8rem;color:var(--muted)">${esc(lastDate)}</div><div class="stat-label">Last verdict</div></div>` : ""}
        </div>
      </div>
    </a>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Persona Dossier</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Persona Dossier</h1>
      <p>Career files for every congress persona &mdash; debate history, evolution arc, firing record</p>
    </header>

    <div class="section-header">Active Seats (${active.length})</div>
    <div class="grid">
      ${active.map(renderCard).join("")}
    </div>

    <div class="section-header">Severance (${fired.length})</div>
    <div class="grid">
      ${fired.map(renderCard).join("")}
    </div>

    <div style="margin-top:40px;color:var(--muted);font-size:0.78rem">
      ${sessions.length} congress sessions on record &middot; reads live from filesystem
    </div>
  </div>
</body>
</html>`;
}

// ---------- dossier page ----------

function renderDossier(persona: Persona, sessions: Session[]): string {
  const fm = persona.frontmatter;
  const history = getPersonaHistory(persona.name, fm.display_name, sessions);

  const retained = fm.stats_retained || 0;
  const firedCount = fm.stats_fired || 0;
  const evolved = fm.stats_evolved || 0;

  // Convert markdown-ish prose to safe HTML
  const proseHtml = esc(persona.prose)
    .replace(/^## (.+)$/gm, "</p><h2>$1</h2><p>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const sessionHtml =
    history.length === 0
      ? `<div class="empty">No congress sessions found for this persona.</div>`
      : [...history].reverse().map((entry) => {
          const s = entry.session;
          const dateStr = formatDate(s.started_at);
          const contributions = entry.debateContributions;

          return `
        <div class="session-entry">
          <div class="session-meta">
            <span class="session-num">#${s.session_number}</span>
            <span class="session-topic" title="${esc(s.topic)}">${esc(s.topic)}</span>
            <span class="session-date">${dateStr}</span>
            ${
              entry.verdict
                ? `<span class="verdict-badge ${verdictBadgeClass(entry.verdict)}">${entry.verdict}</span>`
                : entry.appearedInRoster
                ? `<span class="verdict-badge vb-appeared">appeared</span>`
                : ""
            }
          </div>

          ${contributions
            .map(
              (r, i) => `
            <div class="contribution">
              <div class="contribution-meta">Round ${i + 1} &middot; ${esc(r.model || "unknown model")}</div>
              ${esc(r.response.slice(0, 500))}${r.response.length > 500 ? "&#8230;" : ""}
            </div>`
            )
            .join("")}

          ${
            entry.verdictReason
              ? `<div class="verdict-reason">
              <strong style="color:${entry.verdict === "FIRE" ? "var(--red)" : entry.verdict === "EVOLVE" ? "var(--accent)" : "var(--green)"}">
                ${entry.verdict}:
              </strong>
              ${esc(entry.verdictReason)}
            </div>`
              : ""
          }

          ${
            entry.ibrahimReasoning && contributions.length > 0
              ? `<div class="ibrahim-reasoning">
              <div class="ibrahim-label">Ibrahim's synthesis</div>
              ${esc(entry.ibrahimReasoning.slice(0, 600))}${entry.ibrahimReasoning.length > 600 ? "&#8230;" : ""}
            </div>`
              : ""
          }
        </div>`;
        }).join("");

  const learnedHtml =
    persona.learnedSections.length === 0
      ? `<div class="empty">No learned sections yet.</div>`
      : persona.learnedSections
          .map(
            (l) => `
      <div class="learned-section">
        <div class="learned-date">${esc(l.date)}</div>
        <div class="learned-text">${esc(l.text)}</div>
      </div>`
          )
          .join("");

  const traits = (fm.traits || [])
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fm.display_name || persona.name)} &mdash; Persona Dossier</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <a class="nav-link" href="/">&larr; All Personas</a>

    <div class="dossier-header">
      ${avatarHtml(fm.avatar_url, fm.display_name, "dossier-avatar", "dossier-avatar-placeholder")}
      <div class="dossier-meta">
        <h1>${esc(fm.display_name || persona.name)}</h1>
        <div style="color:var(--muted);font-size:0.9rem;margin-top:2px">${esc(fm.title || "")}</div>
        <div class="role">${esc(fm.role || "")}</div>
        <div style="margin-top:8px">
          <span class="badge ${persona.status === "active" ? "badge-active" : "badge-fired"}">${persona.status}</span>
          ${fm.model ? `<span class="tag" style="margin-left:4px">${esc(fm.model)}</span>` : ""}
          ${fm.evolves === false ? `<span class="tag">does not evolve</span>` : ""}
        </div>
        ${traits ? `<div style="margin-top:8px">${traits}</div>` : ""}
        <div class="dossier-stats">
          <div class="stat"><div class="stat-val verdict-retain">${retained}</div><div class="stat-label">Retained</div></div>
          <div class="stat"><div class="stat-val verdict-evolve">${evolved}</div><div class="stat-label">Evolved</div></div>
          <div class="stat"><div class="stat-val verdict-fire">${firedCount}</div><div class="stat-label">Fired</div></div>
          ${fm.stats_last_verdict ? `<div class="stat"><div class="stat-val ${verdictColor(fm.stats_last_verdict)}">${esc(fm.stats_last_verdict)}</div><div class="stat-label">Last verdict</div></div>` : ""}
        </div>
      </div>
    </div>

    <div class="section-header">Character File</div>
    <div class="prose"><p>${proseHtml}</p></div>

    ${persona.learnedSections.length > 0 ? `
    <div class="section-header">Learned Sections (${persona.learnedSections.length})</div>
    ${learnedHtml}` : ""}

    <div class="section-header">Congress History (${history.length} sessions)</div>
    ${sessionHtml}
  </div>
</body>
</html>`;
}

// ---------- server ----------

const server = Bun.serve({
  port: PORT,

  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    const personas = loadPersonas();
    const sessions = loadSessions();

    if (path === "" || path === "/") {
      return new Response(renderIndex(personas, sessions), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const dossierMatch = path.match(/^\/p\/([^/]+)$/);
    if (dossierMatch) {
      const name = decodeURIComponent(dossierMatch[1]);
      const persona = personas.find((p) => p.name === name);
      if (!persona) {
        return new Response("persona not found", { status: 404 });
      }
      return new Response(renderDossier(persona, sessions), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
