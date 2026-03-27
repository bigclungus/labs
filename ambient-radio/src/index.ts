import { Database } from "bun:sqlite";

const LAB_NAME = "ambient-radio";
const PORT = 8111;

const db = new Database(`/mnt/data/labs/${LAB_NAME}/data.db`);

db.run(`CREATE TABLE IF NOT EXISTS streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  vibe TEXT NOT NULL,
  added_by TEXT DEFAULT 'system',
  plays INTEGER DEFAULT 0,
  ts TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Seed default streams if table is empty
const seedCount = (db.query(`SELECT COUNT(*) as c FROM streams`).get() as { c: number }).c;
if (seedCount === 0) {
  const seeds = [
    { title: "Lofi Hip Hop Radio — beats to relax/study", youtube_id: "jfKfPfyJRdk", vibe: "focus" },
    { title: "Jazz Lofi Radio — smooth chill beats", youtube_id: "HuFYqnbVbzY", vibe: "focus" },
    { title: "Deep Focus — ambient piano", youtube_id: "5yx6BWlEVcY", vibe: "focus" },
    { title: "Siena Sleep Mix — Trance Mix 13.2", youtube_id: "n3pqe3v_J_0", vibe: "sleep" },
    { title: "8 Hours Rain on Window — sleep sounds", youtube_id: "lCOF9LN_Zxs", vibe: "sleep" },
    { title: "Dark Ambient — night soundscape", youtube_id: "S_MOd40zlYU", vibe: "sleep" },
    { title: "Chillhop Essentials — cozy beats", youtube_id: "7NOSDKb0HlU", vibe: "chill" },
    { title: "Synthwave Radio — neon nights", youtube_id: "4xDzrJKXOOY", vibe: "chill" },
    { title: "Forest Rain — nature ambience 3h", youtube_id: "xNN7iTA57jM", vibe: "nature" },
    { title: "Thunderstorm and Rain — deep sleep", youtube_id: "mPZkdNFkNps", vibe: "nature" },
    { title: "Japanese Garden — bamboo water sounds", youtube_id: "cJQQrI7nCeY", vibe: "nature" },
  ];
  for (const s of seeds) {
    db.run(
      `INSERT INTO streams (title, youtube_id, vibe) VALUES (?, ?, ?)`,
      [s.title, s.youtube_id, s.vibe]
    );
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    // POST /play/:id
    if (req.method === "POST" && /^\/play\/\d+$/.test(url.pathname)) {
      const id = url.pathname.split("/")[2];
      db.run(`UPDATE streams SET plays = plays + 1 WHERE id = ?`, [id]);
      return new Response("ok");
    }

    // GET /streams.json
    if (url.pathname === "/streams.json") {
      const streams = db.query(
        `SELECT id, title, youtube_id, vibe, plays FROM streams ORDER BY vibe, plays DESC`
      ).all();
      return new Response(JSON.stringify(streams), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Main page
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(buildHtml(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    return new Response("not found", { status: 404 });
  },
});

function buildHtml(base: string): string {
  const baseJson = JSON.stringify(base);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ambient Radio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0b0e14; color: #c9d0db; min-height: 100vh; }
    header { padding: 24px 32px 16px; border-bottom: 1px solid #1e2533; }
    header h1 { font-size: 1.2rem; font-weight: 600; color: #e0e8f4; letter-spacing: 0.05em; }
    header p { font-size: 0.8rem; color: #6b7a93; margin-top: 4px; }
    .vibes { display: flex; gap: 8px; padding: 16px 32px; flex-wrap: wrap; }
    .vibe-btn {
      padding: 5px 14px; border: 1px solid #2a3347; border-radius: 20px;
      background: transparent; color: #8899bb; cursor: pointer; font-size: 0.8rem; transition: all 0.15s;
    }
    .vibe-btn:hover { border-color: #5577cc; color: #aac0ee; }
    .vibe-btn.active { background: #1a2a4a; border-color: #5577cc; color: #aac0ee; }
    .streams {
      padding: 8px 32px 80px;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;
    }
    .card {
      background: #111620; border: 1px solid #1e2533; border-radius: 8px;
      padding: 14px 16px; cursor: pointer; transition: all 0.15s; position: relative;
    }
    .card:hover { border-color: #3a4f73; background: #141a28; }
    .card.playing { border-color: #4477cc; background: #111d35; }
    .card-title { font-size: 0.85rem; font-weight: 500; color: #c9d0db; line-height: 1.3; padding-right: 28px; }
    .card-vibe { font-size: 0.7rem; color: #5566aa; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.08em; }
    .card-plays { font-size: 0.7rem; color: #445577; margin-top: 3px; }
    .card-icon { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 1.2rem; color: #4477cc; display: none; }
    .card.playing .card-icon { display: block; }
    #player-bar {
      position: fixed; bottom: 0; left: 0; right: 0; background: #0d1220;
      border-top: 1px solid #1e2533; padding: 10px 16px;
      display: none; align-items: center; gap: 12px; z-index: 100;
    }
    #player-bar.visible { display: flex; }
    #player-title { font-size: 0.85rem; color: #aac0ee; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #stop-btn, #toggle-video {
      padding: 5px 12px; background: transparent; border: 1px solid #2a3347;
      border-radius: 4px; color: #556688; cursor: pointer; font-size: 0.8rem;
    }
    #stop-btn:hover { color: #cc6677; border-color: #cc4455; }
    #toggle-video:hover { color: #8899bb; border-color: #3a4f73; }
    #yt-embed {
      position: fixed; bottom: 60px; right: 16px; width: 280px; height: 158px;
      border: 1px solid #2a3347; border-radius: 8px; overflow: hidden; display: none;
    }
    #yt-embed.visible { display: block; }
    .no-results { padding: 32px; color: #445566; font-size: 0.9rem; }
  </style>
</head>
<body>
  <header>
    <h1>Ambient Radio</h1>
    <p>curated streams — pick a vibe, hit play</p>
  </header>
  <div class="vibes" id="vibes">
    <button class="vibe-btn active" data-vibe="all">all</button>
    <button class="vibe-btn" data-vibe="focus">focus</button>
    <button class="vibe-btn" data-vibe="sleep">sleep</button>
    <button class="vibe-btn" data-vibe="chill">chill</button>
    <button class="vibe-btn" data-vibe="nature">nature</button>
  </div>
  <div class="streams" id="grid"><p class="no-results">loading...</p></div>
  <div id="player-bar">
    <span id="player-title">—</span>
    <button id="toggle-video">show video</button>
    <button id="stop-btn">stop</button>
  </div>
  <div id="yt-embed">
    <iframe id="yt-iframe" width="280" height="158" frameborder="0"
      allow="autoplay; encrypted-media" allowfullscreen></iframe>
  </div>
  <script>
    const BASE = ${baseJson};
    let streams = [], currentVibe = 'all', currentId = null, videoVisible = false;

    async function loadStreams() {
      const res = await fetch(BASE + '/streams.json');
      if (!res.ok) throw new Error('Failed to load streams: ' + res.status);
      streams = await res.json();
      render();
    }

    function render() {
      const grid = document.getElementById('grid');
      const filtered = currentVibe === 'all' ? streams : streams.filter(s => s.vibe === currentVibe);
      if (!filtered.length) { grid.innerHTML = '<p class="no-results">no streams for this vibe</p>'; return; }
      grid.innerHTML = filtered.map(s => {
        const title = s.title.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return '<div class="card' + (s.id === currentId ? ' playing' : '') + '" data-id="' + s.id + '" data-ytid="' + s.youtube_id + '" data-title="' + title + '">' +
          '<div class="card-title">' + s.title + '</div>' +
          '<div class="card-vibe">' + s.vibe + '</div>' +
          '<div class="card-plays">' + s.plays + ' play' + (s.plays !== 1 ? 's' : '') + '</div>' +
          '<div class="card-icon">&#9654;</div></div>';
      }).join('');
      grid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => play(+card.dataset.id, card.dataset.ytid, card.dataset.title));
      });
    }

    function play(id, ytId, title) {
      currentId = id;
      fetch(BASE + '/play/' + id, { method: 'POST' }).catch(e => console.error('play record failed:', e));
      const s = streams.find(x => x.id === id);
      if (s) s.plays++;
      document.getElementById('yt-iframe').src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0';
      document.getElementById('player-title').textContent = title;
      document.getElementById('player-bar').classList.add('visible');
      if (videoVisible) document.getElementById('yt-embed').classList.add('visible');
      render();
    }

    function stop() {
      currentId = null;
      document.getElementById('yt-iframe').src = '';
      document.getElementById('player-bar').classList.remove('visible');
      document.getElementById('yt-embed').classList.remove('visible');
      videoVisible = false;
      document.getElementById('toggle-video').textContent = 'show video';
      render();
    }

    document.getElementById('stop-btn').addEventListener('click', stop);
    document.getElementById('toggle-video').addEventListener('click', () => {
      videoVisible = !videoVisible;
      document.getElementById('yt-embed').classList.toggle('visible', videoVisible && !!currentId);
      document.getElementById('toggle-video').textContent = videoVisible ? 'hide video' : 'show video';
    });
    document.getElementById('vibes').querySelectorAll('.vibe-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.vibe-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentVibe = btn.dataset.vibe;
        render();
      });
    });

    loadStreams().catch(e => {
      document.getElementById('grid').innerHTML = '<p class="no-results">error loading streams: ' + e.message + '</p>';
    });
  </script>
</body>
</html>`;
}

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
