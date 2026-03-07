// OSSFactory-Scaler — Interactive demo page template (Flower of Life design system)
// Matches the fertigation-mix gold standard: glassmorphism, 5 themes, sacred geometry BG.
// The AI generates the interactive body content; this provides the shell.

import type { DemoPageConfig } from "../types";

export function generateDemoPage(config: DemoPageConfig): string {
  return `<!DOCTYPE html>
<!-- DO NOT REMOVE THIS FILE — Auto-generated OSS demo by OSSFactory-Scaler -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(config.title)}</title>
  <meta name="description" content="${esc(config.description)}">
  <meta name="author" content="AdametherzLab">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://che0md.tech/oss/${esc(config.repoName)}">
  <meta property="og:title" content="${esc(config.title)}">
  <meta property="og:description" content="${esc(config.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://che0md.tech/oss/${esc(config.repoName)}">
  <meta property="og:site_name" content="AdametherzLab OSS Factory">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(config.title)}">
  <meta name="twitter:description" content="${esc(config.description)}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "${esc(config.repoName)}",
    "description": "${esc(config.description)}",
    "url": "https://che0md.tech/oss/${esc(config.repoName)}",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
    "author": { "@type": "Organization", "name": "AdametherzLab", "url": "https://github.com/AdametherzLab" }
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root, [data-theme="dark"] {
      --bg-base: #0a0a0a;
      --bg-surface: #111111;
      --bg-card: rgba(26, 26, 26, 0.65);
      --accent-primary: #00D26A;
      --accent-hover: #00B86E;
      --accent-dark: #004D25;
      --text-main: #f0f0f0;
      --text-muted: #888888;
      --glow: rgba(0, 210, 106, 0.2);
      --danger: #ff4757;
      --warning: #ffa502;
      --radius-sm: 8px;
      --radius-md: 16px;
      --radius-lg: 24px;
      --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      --border-subtle: rgba(255,255,255,0.06);
      --border-light: rgba(255,255,255,0.1);
    }
    [data-theme="light"] {
      --bg-base: #f5f5f5;
      --bg-surface: #ffffff;
      --bg-card: rgba(255,255,255,0.85);
      --accent-primary: #00964B;
      --accent-hover: #007a3d;
      --accent-dark: #003D1A;
      --text-main: #1a1a1a;
      --text-muted: #666666;
      --glow: rgba(0,150,75,0.15);
      --danger: #d63031;
      --warning: #e67e22;
      --border-subtle: rgba(0,0,0,0.08);
      --border-light: rgba(0,0,0,0.12);
    }
    [data-theme="forest"] {
      --bg-base: #0a120a;
      --bg-surface: #0f1a0f;
      --bg-card: rgba(15,30,15,0.7);
      --accent-primary: #4CAF50;
      --accent-hover: #43A047;
      --accent-dark: #1B5E20;
      --text-main: #d4e6d4;
      --text-muted: #7a9a7a;
      --glow: rgba(76,175,80,0.2);
      --danger: #ef5350;
      --warning: #FFA726;
      --border-subtle: rgba(76,175,80,0.08);
      --border-light: rgba(76,175,80,0.15);
    }
    [data-theme="ocean"] {
      --bg-base: #070d14;
      --bg-surface: #0d1520;
      --bg-card: rgba(13,21,32,0.7);
      --accent-primary: #00B0F0;
      --accent-hover: #009dd6;
      --accent-dark: #004466;
      --text-main: #d4e8f0;
      --text-muted: #7a9aaa;
      --glow: rgba(0,176,240,0.2);
      --danger: #ff6b6b;
      --warning: #ffd93d;
      --border-subtle: rgba(0,176,240,0.08);
      --border-light: rgba(0,176,240,0.15);
    }
    [data-theme="sunset"] {
      --bg-base: #140a0a;
      --bg-surface: #1c0f0f;
      --bg-card: rgba(28,15,15,0.7);
      --accent-primary: #FF6B35;
      --accent-hover: #e55a28;
      --accent-dark: #7a2e15;
      --text-main: #f0e0d4;
      --text-muted: #aa8a7a;
      --glow: rgba(255,107,53,0.2);
      --danger: #ff4757;
      --warning: #ffc048;
      --border-subtle: rgba(255,107,53,0.08);
      --border-light: rgba(255,107,53,0.15);
    }

    @media print {
      body { background: #fff !important; color: #000 !important; }
      body::before { display: none !important; }
      header, footer, .theme-picker, .badge-btn:not(.no-hide-print), .copy-btn { display: none !important; }
      .output-card, .glass-card { border: 1px solid #ccc !important; background: #fff !important; page-break-inside: avoid; }
      * { color: #000 !important; border-color: #ccc !important; }
      a { text-decoration: underline; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-base);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      position: relative;
    }
    body::before {
      content: "";
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: -1; opacity: 0.04; pointer-events: none;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="%2300D26A" stroke-width="1"><circle cx="50" cy="50" r="28"/><circle cx="50" cy="22" r="28"/><circle cx="50" cy="78" r="28"/><circle cx="26" cy="36" r="28"/><circle cx="74" cy="36" r="28"/><circle cx="26" cy="64" r="28"/><circle cx="74" cy="64" r="28"/></g></svg>');
      background-size: 150px 150px;
      animation: pulse-svg 15s infinite alternate ease-in-out;
    }
    @keyframes pulse-svg { 0%{transform:scale(1);opacity:0.03} 100%{transform:scale(1.05);opacity:0.07} }
    @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

    header { text-align: center; padding: 3rem 1rem 2rem; }
    h1 {
      font-size: 3rem; font-weight: 600; letter-spacing: -0.05em;
      background: linear-gradient(135deg, #fff, var(--accent-primary));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 0 20px var(--glow)); margin-bottom: 0.5rem;
    }
    .tagline { font-size: 1.05rem; color: var(--text-muted); max-width: 650px; margin: 0 auto 1.5rem; line-height: 1.5; }
    .badges { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
    .badge-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px;
      border-radius: 20px; font-size: 0.8rem; font-weight: 500; text-decoration: none;
      border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); transition: var(--transition);
    }
    .badge-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

    main { flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; padding: 0 1rem 4rem; animation: fadeIn 0.4s ease-out forwards; }

    .glass-card {
      background: var(--bg-card); border: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--radius-md); backdrop-filter: blur(12px);
      padding: 1.5rem; margin-bottom: 1.5rem; transition: var(--transition);
    }
    .glass-card:hover { border-color: rgba(0,210,106,0.2); box-shadow: 0 0 20px rgba(0,210,106,0.05); }
    .card-title {
      font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--accent-primary); margin-bottom: 1rem; font-weight: 600;
    }

    .pane-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    @media (max-width: 768px) { .pane-grid { grid-template-columns: 1fr; } }

    label {
      display: block; font-size: 0.75rem; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--accent-primary); margin-bottom: 4px; font-weight: 500;
    }
    input, select, textarea {
      width: 100%; padding: 8px 12px; background: var(--bg-base);
      border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm);
      color: var(--text-main); font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
      transition: var(--transition); margin-bottom: 0.75rem;
    }
    input:focus, select:focus, textarea:focus {
      outline: none; border-color: var(--accent-primary); box-shadow: 0 0 10px var(--glow);
    }
    select { cursor: pointer; }

    .output-card {
      background: var(--bg-base); border: 1px solid rgba(255,255,255,0.08);
      border-radius: var(--radius-sm); overflow: hidden;
    }
    .output-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.75rem;
    }
    .output-body {
      padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
      white-space: pre-wrap; line-height: 1.6; max-height: 500px; overflow-y: auto;
      color: var(--text-main);
    }
    .copy-btn {
      padding: 3px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15);
      background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.7rem;
      transition: var(--transition);
    }
    .copy-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

    .data-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .data-table th {
      text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.1);
      color: var(--accent-primary); font-weight: 600; font-size: 0.7rem;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .data-table td {
      padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.04);
      font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
    }
    .data-table tr:hover td { background: rgba(0,210,106,0.03); }

    .btn {
      padding: 8px 20px; border-radius: 20px; border: 1px solid var(--accent-primary);
      background: transparent; color: var(--accent-primary); cursor: pointer;
      font-family: 'Inter', sans-serif; font-size: 0.85rem; font-weight: 500;
      transition: var(--transition);
    }
    .btn:hover { background: var(--accent-primary); color: #000; }
    .btn-primary { background: var(--accent-primary); color: #000; }
    .btn-primary:hover { background: var(--accent-hover); }

    .form-row { display: flex; gap: 0.75rem; }
    .form-row > div { flex: 1; }
    .warning-box {
      background: rgba(255,165,2,0.1); border: 1px solid rgba(255,165,2,0.3);
      border-radius: var(--radius-sm); padding: 10px 14px; margin-top: 0.75rem;
      font-size: 0.8rem; color: var(--warning);
    }

    h2 { font-size: 1.4rem; font-weight: 600; color: var(--accent-primary); margin-bottom: 1rem; }
    h3 { font-size: 1.1rem; font-weight: 600; color: var(--accent-primary); margin-bottom: 0.75rem; }
    pre { background: var(--bg-base); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-sm); padding: 12px; overflow-x: auto; margin-bottom: 0.75rem; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--accent-primary); }

    footer { text-align: center; padding: 2rem; border-top: 1px solid rgba(255,255,255,0.06); color: var(--text-muted); font-size: 0.8rem; }
    footer a { color: var(--accent-primary); text-decoration: none; }
  </style>
</head>
<body>

<header>
  <h1>${esc(config.repoName)}</h1>
  <p class="tagline">${esc(config.description)} Powered by <a href="${esc(config.repoUrl)}" target="_blank" style="color:var(--accent-primary);text-decoration:none;">${esc(config.repoName)}</a> &mdash; an <a href="https://github.com/AdametherzLab" target="_blank" style="color:var(--accent-primary);text-decoration:none;">AdametherzLab</a> OSS Factory project.</p>
  <div class="badges">
    <a class="badge-btn" href="${esc(config.repoUrl)}" target="_blank">GitHub</a>
    <a class="badge-btn" href="https://www.npmjs.com/package/@adametherzlab/${esc(config.repoName)}" target="_blank">npm</a>
    <span class="badge-btn">v${esc(config.version)}</span>
    <span class="badge-btn">Zero Deps</span>
  </div>
  <div class="theme-picker" style="display:flex;gap:0.5rem;justify-content:center;margin-top:1rem;">
    <button class="theme-btn" data-theme="dark" title="Dark" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:#0a0a0a;cursor:pointer;"></button>
    <button class="theme-btn" data-theme="light" title="Light" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:#f5f5f5;cursor:pointer;"></button>
    <button class="theme-btn" data-theme="forest" title="Forest" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:#1B5E20;cursor:pointer;"></button>
    <button class="theme-btn" data-theme="ocean" title="Ocean" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:#004466;cursor:pointer;"></button>
    <button class="theme-btn" data-theme="sunset" title="Sunset" style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:#7a2e15;cursor:pointer;"></button>
  </div>
</header>

<main>
${config.interactiveBody}
</main>

<footer>
  <p>&copy; ${new Date().getFullYear()} <a href="https://github.com/AdametherzLab">AdametherzLab</a> &mdash; Open Source | <a href="${esc(config.repoUrl)}">View on GitHub</a> | <a href="${esc(config.repoUrl)}/releases">v${esc(config.version)}</a> | <button class="btn" onclick="window.print()" style="display:inline;padding:4px 14px;font-size:0.75rem;">Print / Export</button></p>
</footer>

<script>
  // Theme switcher — persists to localStorage
  (function() {
    var saved = localStorage.getItem('oss-demo-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    document.querySelectorAll('.theme-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var theme = this.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('oss-demo-theme', theme);
      });
    });
  })();
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
