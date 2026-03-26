const LAB_NAME = "tvtropes-explorer";
const PORT = 8106;

const TVTROPES_BASE = "https://tvtropes.org";

// Fetch and clean a TVTropes page
async function fetchTropePage(path: string): Promise<{ title: string; body: string; error?: string }> {
  const url = `${TVTROPES_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TVTropesExplorer/1.0)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
  } catch (e: any) {
    return { title: "Error", body: "", error: `Failed to fetch: ${e.message}` };
  }

  if (!res.ok) {
    return { title: "Error", body: "", error: `TVTropes returned ${res.status}` };
  }

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].replace(" - TV Tropes", "").trim() : path;

  // Extract main article content
  // TVTropes uses <div class="article-content"> or <div id="main-article">
  let bodyHtml = "";

  const articleMatch = html.match(/<div[^>]+class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]+id="page-content"/i)
    || html.match(/<div[^>]+id="main-article"[^>]*>([\s\S]*?)<\/div>\s*(?:<div|<footer)/i)
    || html.match(/<div[^>]+class="[^"]*page-content[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+(?:id="footer"|class="[^"]*footer))/i);

  if (articleMatch) {
    bodyHtml = articleMatch[1];
  } else {
    // Fallback: grab everything between <article> tags if present
    const fallback = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    bodyHtml = fallback ? fallback[1] : "<p><em>Could not extract article content.</em></p>";
  }

  // Rewrite internal TVTropes links to go through our proxy
  bodyHtml = bodyHtml.replace(/href="(\/pmwiki\/[^"]+)"/g, 'href="?path=$1"');
  bodyHtml = bodyHtml.replace(/href="(https?:\/\/tvtropes\.org\/pmwiki\/[^"]+)"/g, (_m, p) => {
    const relative = p.replace("https://tvtropes.org", "");
    return `href="?path=${encodeURIComponent(relative)}"`;
  });

  // Strip script tags
  bodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Strip inline style that references external fonts/ads
  bodyHtml = bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Strip ad divs
  bodyHtml = bodyHtml.replace(/<div[^>]+(?:class|id)="[^"]*(?:ad|ads|advertisement|google)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");

  return { title: rawTitle, body: bodyHtml };
}

function searchUrl(query: string): string {
  return `/pmwiki/elastic_search_result.php?q=${encodeURIComponent(query)}&page_type=all`;
}

function renderPage(base: string, title: string, content: string, searchValue = ""): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)} — TVTropes Explorer</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      background: #1a1a1a;
      color: #d4cfc8;
      margin: 0;
      padding: 0;
    }
    header {
      background: #111;
      border-bottom: 2px solid #8b0000;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    header a.logo {
      color: #cc2200;
      font-size: 1.3rem;
      font-weight: bold;
      text-decoration: none;
      white-space: nowrap;
    }
    header a.logo:hover { color: #ff4422; }
    form {
      display: flex;
      gap: 8px;
      flex: 1;
      min-width: 200px;
    }
    input[type="text"] {
      flex: 1;
      padding: 8px 12px;
      background: #222;
      border: 1px solid #444;
      color: #d4cfc8;
      border-radius: 4px;
      font-size: 0.95rem;
    }
    input[type="text"]:focus { outline: 1px solid #cc2200; border-color: #cc2200; }
    button {
      padding: 8px 16px;
      background: #8b0000;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.95rem;
    }
    button:hover { background: #cc2200; }
    .random-btn {
      padding: 8px 12px;
      background: #333;
      color: #aaa;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      text-decoration: none;
      white-space: nowrap;
    }
    .random-btn:hover { background: #444; color: #d4cfc8; }
    main {
      max-width: 900px;
      margin: 32px auto;
      padding: 0 24px 80px;
    }
    h1 { color: #e8e0d8; font-size: 1.8rem; margin-bottom: 8px; }
    .article-content { line-height: 1.75; }
    .article-content a { color: #7eb8f7; }
    .article-content a:hover { color: #aad4ff; }
    .article-content ul, .article-content ol { padding-left: 1.5em; }
    .article-content li { margin-bottom: 6px; }
    .article-content h2 { color: #cc9944; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .article-content h3 { color: #aaa; }
    .article-content blockquote {
      border-left: 3px solid #555;
      padding: 8px 16px;
      margin: 12px 0;
      background: #222;
      font-style: italic;
      color: #bbb;
    }
    .article-content img { max-width: 100%; height: auto; opacity: 0.9; }
    .welcome {
      text-align: center;
      padding: 80px 0 40px;
    }
    .welcome h1 { font-size: 2rem; color: #cc2200; }
    .welcome p { color: #888; font-style: italic; }
    .welcome .quick-links { margin-top: 32px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .quick-links a {
      padding: 8px 16px;
      background: #222;
      border: 1px solid #444;
      border-radius: 4px;
      color: #7eb8f7;
      text-decoration: none;
      font-size: 0.9rem;
    }
    .quick-links a:hover { background: #333; }
    .error-box {
      background: #2a0000;
      border: 1px solid #660000;
      border-radius: 6px;
      padding: 20px;
      margin: 40px 0;
      color: #ff8888;
    }
  </style>
</head>
<body>
  <header>
    <a href="${base}/" class="logo">📺 TVTropes Explorer</a>
    <form action="${base}/" method="get">
      <input type="text" name="q" placeholder="Search tropes..." value="${escHtml(searchValue)}" autofocus>
      <button type="submit">Search</button>
    </form>
    <a href="${base}/?path=/pmwiki/randomitem.php?next=1" class="random-btn">Random 🎲</a>
  </header>
  <main>
    ${content}
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    const pathParam = url.searchParams.get("path");
    const query = url.searchParams.get("q")?.trim() ?? "";

    // Root with no params: show welcome
    if (!pathParam && !query) {
      const welcome = `
        <div class="welcome">
          <h1>TVTropes Explorer</h1>
          <p>Clean reader. No ads. No sidebar clutter. Just the tropes.</p>
          <div class="quick-links">
            <a href="${base}/?path=/pmwiki/pmwiki.php/Main/HomePage">Main Page</a>
            <a href="${base}/?path=/pmwiki/pmwiki.php/Main/TropesAToZ">Tropes A-Z</a>
            <a href="${base}/?path=/pmwiki/pmwiki.php/Main/NarrativeTropes">Narrative Tropes</a>
            <a href="${base}/?path=/pmwiki/pmwiki.php/Main/ComicBookTropes">Comic Tropes</a>
            <a href="${base}/?path=/pmwiki/pmwiki.php/Main/VideoGameTropes">Video Game Tropes</a>
            <a href="${base}/?path=/pmwiki/randomitem.php?next=1">Random Trope 🎲</a>
          </div>
        </div>`;
      return renderPage(base, "Home", welcome);
    }

    // Search query
    if (query && !pathParam) {
      const searchPath = searchUrl(query);
      const { title, body, error } = await fetchTropePage(searchPath);
      if (error) {
        return renderPage(base, "Search Error", `<div class="error-box"><strong>Error:</strong> ${escHtml(error)}</div>`, query);
      }
      return renderPage(base, `Search: ${query}`, `<h1>Search: ${escHtml(query)}</h1><div class="article-content">${body}</div>`, query);
    }

    // Path-based page fetch
    if (pathParam) {
      const { title, body, error } = await fetchTropePage(pathParam);
      if (error) {
        return renderPage(base, "Error", `<div class="error-box"><strong>Error:</strong> ${escHtml(error)}</div>`);
      }
      return renderPage(base, title, `<h1>${escHtml(title)}</h1><div class="article-content">${body}</div>`);
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
