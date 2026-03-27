import { Database } from "bun:sqlite";

const LAB_NAME = "chengyu";
const PORT = 8109;
const DB_PATH = `/mnt/data/labs/${LAB_NAME}/data.db`;

const db = new Database(DB_PATH);

// Ensure table exists (seed.ts handles population)
db.run(`CREATE TABLE IF NOT EXISTS chengyu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  explanation TEXT NOT NULL,
  derivation TEXT NOT NULL,
  example TEXT NOT NULL,
  abbreviation TEXT NOT NULL
)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_word ON chengyu(word)`);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noExample(s: string): boolean {
  return !s || s.trim() === "无" || s.trim() === "";
}

function entryHtml(base: string, e: {
  id: number; word: string; pinyin: string;
  explanation: string; derivation: string; example: string;
}): string {
  return `
    <article class="entry">
      <div class="entry-header">
        <a href="${base}/word/${encodeURIComponent(e.word)}" class="word-link">
          <span class="word">${escapeHtml(e.word)}</span>
        </a>
        <span class="pinyin">${escapeHtml(e.pinyin)}</span>
      </div>
      <p class="explanation">${escapeHtml(e.explanation)}</p>
      ${!noExample(e.derivation) ? `<p class="derivation"><span class="label">来源</span>${escapeHtml(e.derivation)}</p>` : ""}
      ${!noExample(e.example) ? `<p class="example"><span class="label">例句</span>${escapeHtml(e.example)}</p>` : ""}
    </article>`;
}

function pageHtml(base: string, title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — 成语 Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Noto Serif CJK SC", "Noto Serif SC", Georgia, serif;
      background: #0f0f0f; color: #e0ddd8;
      min-height: 100vh;
    }
    header {
      background: #1a1a1a; border-bottom: 1px solid #2e2e2e;
      padding: 14px 20px; display: flex; align-items: center; gap: 20px;
      position: sticky; top: 0; z-index: 10;
    }
    header a { text-decoration: none; color: inherit; }
    header .logo { font-size: 1.4rem; color: #d4a843; letter-spacing: .05em; }
    header .subtitle { font-size: .75rem; color: #888; margin-top: 2px; font-family: monospace; }
    form { display: flex; flex: 1; max-width: 420px; gap: 8px; margin-left: auto; }
    input[type=search] {
      flex: 1; padding: 7px 12px; border-radius: 6px;
      border: 1px solid #333; background: #1f1f1f; color: #e0ddd8;
      font-size: .9rem; outline: none;
    }
    input[type=search]:focus { border-color: #d4a843; }
    button {
      padding: 7px 14px; border-radius: 6px; border: none;
      background: #d4a843; color: #0f0f0f; font-weight: bold;
      cursor: pointer; font-size: .85rem;
    }
    button:hover { background: #e8bc55; }
    main { max-width: 760px; margin: 0 auto; padding: 28px 20px 60px; }
    h1 { font-size: 1.1rem; color: #888; font-weight: normal; margin-bottom: 20px; font-family: monospace; }
    .entry {
      border: 1px solid #252525; border-radius: 8px; padding: 18px 20px;
      margin-bottom: 16px; background: #141414;
    }
    .entry:hover { border-color: #383838; }
    .entry-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 10px; }
    .word-link { text-decoration: none; }
    .word { font-size: 1.9rem; color: #d4a843; letter-spacing: .12em; }
    .word-link:hover .word { color: #e8bc55; }
    .pinyin { font-size: .9rem; color: #8eb8d8; font-family: monospace; }
    .explanation { font-size: .95rem; line-height: 1.65; color: #d8d5cf; }
    .derivation, .example {
      font-size: .82rem; line-height: 1.6; color: #999; margin-top: 8px;
    }
    .label {
      display: inline-block; font-size: .7rem; background: #222; color: #666;
      border-radius: 3px; padding: 1px 5px; margin-right: 6px;
      font-family: monospace; vertical-align: middle;
    }
    .pagination { display: flex; gap: 8px; margin-top: 28px; flex-wrap: wrap; }
    .pagination a, .pagination span {
      padding: 6px 12px; border-radius: 5px; font-size: .85rem; text-decoration: none;
      border: 1px solid #2e2e2e; color: #bbb; font-family: monospace;
    }
    .pagination a:hover { border-color: #d4a843; color: #d4a843; }
    .pagination .current { background: #d4a843; color: #0f0f0f; border-color: #d4a843; }
    .random-btn {
      display: inline-block; margin-bottom: 24px; padding: 8px 16px;
      background: #1e1e1e; border: 1px solid #333; border-radius: 6px;
      color: #bbb; text-decoration: none; font-family: monospace; font-size: .85rem;
    }
    .random-btn:hover { border-color: #d4a843; color: #d4a843; }
    .detail-word { font-size: 3.5rem; color: #d4a843; letter-spacing: .2em; display: block; margin-bottom: 6px; }
    .detail-pinyin { font-size: 1.1rem; color: #8eb8d8; font-family: monospace; }
    .detail-section { margin-top: 20px; }
    .detail-section h3 { font-size: .75rem; color: #666; font-family: monospace; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; }
    .detail-section p { font-size: 1rem; line-height: 1.7; color: #d8d5cf; }
    .back { font-family: monospace; font-size: .85rem; color: #888; text-decoration: none; display: inline-block; margin-bottom: 20px; }
    .back:hover { color: #d4a843; }
    .count-info { font-family: monospace; font-size: .8rem; color: #555; margin-bottom: 20px; }
    .no-results { color: #666; font-family: monospace; padding: 40px 0; }
  </style>
</head>
<body>
  <header>
    <a href="${base}/">
      <div class="logo">成语</div>
      <div class="subtitle">chengyu browser</div>
    </a>
    <form method="get" action="${base}/search">
      <input type="search" name="q" placeholder="Search (character, pinyin, meaning...)" autocomplete="off">
      <button type="submit">Search</button>
    </form>
  </header>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

const PAGE_SIZE = 20;

function homePage(base: string): Response {
  const total = (db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c;
  const featured = db.query(
    "SELECT * FROM chengyu ORDER BY RANDOM() LIMIT 5"
  ).all() as { id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string }[];

  const content = `
    <h1>${total.toLocaleString()} chengyu in the database</h1>
    <a href="${base}/random" class="random-btn">🎲 random chengyu</a>
    ${featured.map(e => entryHtml(base, e)).join("")}
    <p style="font-family:monospace;font-size:.8rem;color:#555;margin-top:24px">Showing 5 random entries. Use search to find specific chengyu.</p>
  `;
  return new Response(pageHtml(base, "成语 Browser", content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function searchPage(base: string, query: string, page: number): Response {
  if (!query.trim()) {
    return Response.redirect(`${base}/`, 302);
  }

  const q = `%${query}%`;
  const offset = (page - 1) * PAGE_SIZE;

  const total = (db.query(
    `SELECT COUNT(*) as c FROM chengyu WHERE word LIKE ? OR pinyin LIKE ? OR explanation LIKE ? OR derivation LIKE ?`
  ).get(q, q, q, q) as { c: number }).c;

  const results = db.query(
    `SELECT * FROM chengyu WHERE word LIKE ? OR pinyin LIKE ? OR explanation LIKE ? OR derivation LIKE ?
     LIMIT ? OFFSET ?`
  ).all(q, q, q, q, PAGE_SIZE, offset) as { id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string }[];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  let paginationHtml = "";
  if (totalPages > 1) {
    paginationHtml = `<div class="pagination">`;
    if (page > 1) paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${page - 1}">← prev</a>`;
    const start = Math.max(1, page - 3);
    const end = Math.min(totalPages, page + 3);
    for (let i = start; i <= end; i++) {
      if (i === page) paginationHtml += `<span class="current">${i}</span>`;
      else paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${i}">${i}</a>`;
    }
    if (page < totalPages) paginationHtml += `<a href="${base}/search?q=${encodeURIComponent(query)}&p=${page + 1}">next →</a>`;
    paginationHtml += `</div>`;
  }

  const content = results.length === 0
    ? `<h1>Search: "${escapeHtml(query)}"</h1><p class="no-results">No results found.</p>`
    : `
      <h1>Search: "${escapeHtml(query)}"</h1>
      <p class="count-info">${total.toLocaleString()} result${total !== 1 ? "s" : ""} · page ${page} of ${totalPages}</p>
      ${results.map(e => entryHtml(base, e)).join("")}
      ${paginationHtml}
    `;

  return new Response(pageHtml(base, `"${query}" — Search`, content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function wordPage(base: string, word: string): Response {
  const e = db.query("SELECT * FROM chengyu WHERE word = ? LIMIT 1").get(word) as {
    id: number; word: string; pinyin: string; explanation: string; derivation: string; example: string;
  } | null;

  if (!e) {
    return new Response(
      pageHtml(base, "Not found", `<a href="${base}/" class="back">← back</a><p class="no-results">No entry for "${escapeHtml(word)}".</p>`),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const content = `
    <a href="javascript:history.back()" class="back">← back</a>
    <div>
      <span class="detail-word">${escapeHtml(e.word)}</span>
      <span class="detail-pinyin">${escapeHtml(e.pinyin)}</span>
    </div>
    <div class="detail-section">
      <h3>Meaning</h3>
      <p>${escapeHtml(e.explanation)}</p>
    </div>
    ${!noExample(e.derivation) ? `
    <div class="detail-section">
      <h3>Origin / Etymology (来源)</h3>
      <p>${escapeHtml(e.derivation)}</p>
    </div>` : ""}
    ${!noExample(e.example) ? `
    <div class="detail-section">
      <h3>Example (例句)</h3>
      <p>${escapeHtml(e.example)}</p>
    </div>` : ""}
  `;

  return new Response(pageHtml(base, e.word, content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function randomRedirect(base: string): Response {
  const e = db.query("SELECT word FROM chengyu ORDER BY RANDOM() LIMIT 1").get() as { word: string };
  return Response.redirect(`${base}/word/${encodeURIComponent(e.word)}`, 302);
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";
    const path = url.pathname.replace(base, "") || "/";

    if (path === "/" || path === "") return homePage(base);
    if (path === "/random") return randomRedirect(base);
    if (path === "/search") {
      const q = url.searchParams.get("q") ?? "";
      const p = Math.max(1, parseInt(url.searchParams.get("p") ?? "1", 10));
      return searchPage(base, q, p);
    }
    const wordMatch = path.match(/^\/word\/(.+)$/);
    if (wordMatch) return wordPage(base, decodeURIComponent(wordMatch[1]));

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT} — ${(db.query("SELECT COUNT(*) as c FROM chengyu").get() as { c: number }).c} chengyu loaded`);
