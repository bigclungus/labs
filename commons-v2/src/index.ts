// CommonsV2 lab server
// Serves index.html and the client-side TypeScript bundle via Bun's bundler.

const LAB_NAME = "commons-v2";
const PORT = 8107;

// Build the client bundle on startup
let clientBundle: string | null = null;
let bundleError: string | null = null;

async function buildBundle(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [`/mnt/data/labs/${LAB_NAME}/src/main.ts`],
    target: "browser",
    format: "esm",
    minify: false,
  });

  if (!result.success) {
    const msgs = result.logs.map(l => l.message).join("\n");
    const err = new Error(`Bundle failed:\n${msgs}`);
    bundleError = String(err);
    throw err;
  }

  const [output] = result.outputs;
  clientBundle = await output.text();
  console.log(`[${LAB_NAME}] client bundle built (${Math.round(clientBundle.length / 1024)}KB)`);
}

await buildBundle();

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Commons V2</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #111;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: monospace;
      color: #ccc;
    }
    #game-wrapper {
      position: relative;
    }
    #game-canvas {
      display: block;
      border: 1px solid #333;
      image-rendering: pixelated;
    }
    #v2-badge {
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 10px;
      color: #7eb8f7;
      opacity: 0.7;
      pointer-events: none;
    }
    #error-banner {
      margin-top: 12px;
      color: #e74c3c;
      font-size: 12px;
      max-width: 1000px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="game-wrapper">
    <canvas id="game-canvas" width="1000" height="700"></canvas>
    <div id="v2-badge">CommonsV2</div>
  </div>
  <div id="error-banner"></div>
  <script type="module">
    window.addEventListener("error", (e) => {
      document.getElementById("error-banner").textContent = "JS Error: " + e.message + " (" + e.filename + ":" + e.lineno + ")";
    });
    window.addEventListener("unhandledrejection", (e) => {
      document.getElementById("error-banner").textContent = "Unhandled: " + e.reason;
    });
  </script>
  <script type="module" src="/__bundle/main.js"></script>
</body>
</html>`;

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    // Serve the client bundle
    if (url.pathname === "/__bundle/main.js" || url.pathname === `${base}/__bundle/main.js`) {
      if (bundleError) {
        return new Response(`// Bundle error:\n// ${bundleError}`, {
          status: 500,
          headers: { "Content-Type": "application/javascript" },
        });
      }
      return new Response(clientBundle!, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Serve index.html for root
    if (
      url.pathname === "/" ||
      url.pathname === "" ||
      url.pathname === `${base}/` ||
      url.pathname === base
    ) {
      return new Response(indexHTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`[${LAB_NAME}] lab server listening on port ${PORT}`);
console.log(`[${LAB_NAME}] canvas connects to /commons-ws on the host`);
