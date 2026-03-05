// OSSFactory-Scaler — SEO-optimized HTML demo page template

import type { DemoPageConfig } from "../types";

const THEMES: Record<string, { bg: string; fg: string; accent: string; card: string }> = {
  dark:    { bg: "#0d1117", fg: "#e6edf3", accent: "#58a6ff", card: "#161b22" },
  light:   { bg: "#ffffff", fg: "#1f2328", accent: "#0969da", card: "#f6f8fa" },
  forest:  { bg: "#0b1a0b", fg: "#d4edda", accent: "#00d26a", card: "#1a2e1a" },
  ocean:   { bg: "#0a192f", fg: "#ccd6f6", accent: "#64ffda", card: "#112240" },
  sunset:  { bg: "#1a0a2e", fg: "#e6d5f0", accent: "#ff6b6b", card: "#2d1b4e" },
};

export function generateDemoPage(config: DemoPageConfig): string {
  const theme = THEMES[config.theme] ?? THEMES.dark;
  const features = config.features.map(f => `<li>${escapeHtml(f)}</li>`).join("\n            ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.title)} | Free ${escapeHtml(config.repoName)}</title>
  <meta name="description" content="${escapeHtml(config.description)}">
  <meta property="og:title" content="${escapeHtml(config.title)}">
  <meta property="og:description" content="${escapeHtml(config.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(config.repoUrl)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(config.title)}">
  <meta name="twitter:description" content="${escapeHtml(config.description)}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "${escapeHtml(config.repoName)}",
    "description": "${escapeHtml(config.description)}",
    "url": "${escapeHtml(config.repoUrl)}",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Any",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
  }
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: ${theme.bg}; color: ${theme.fg}; min-height: 100vh; padding: 2rem; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; color: ${theme.accent}; }
    .subtitle { font-size: 1.1rem; opacity: 0.8; margin-bottom: 2rem; }
    .card { background: ${theme.card}; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid ${theme.accent}22; }
    .card h2 { color: ${theme.accent}; margin-bottom: 0.75rem; font-size: 1.3rem; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.4rem 0; padding-left: 1.2rem; position: relative; }
    li::before { content: "\\2022"; color: ${theme.accent}; position: absolute; left: 0; }
    pre { background: ${theme.bg}; border: 1px solid ${theme.accent}33; border-radius: 8px; padding: 1rem; overflow-x: auto; font-size: 0.9rem; position: relative; }
    code { font-family: 'SF Mono', 'Fira Code', monospace; }
    .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: ${theme.accent}; color: ${theme.bg}; border: none; border-radius: 6px; padding: 0.3rem 0.8rem; cursor: pointer; font-size: 0.8rem; }
    .copy-btn:hover { opacity: 0.8; }
    .actions { display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
    .btn { display: inline-block; padding: 0.6rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .btn-primary { background: ${theme.accent}; color: ${theme.bg}; }
    .btn-secondary { border: 1px solid ${theme.accent}; color: ${theme.accent}; background: transparent; }
    .footer { text-align: center; margin-top: 3rem; opacity: 0.5; font-size: 0.85rem; }
    @media print { body { background: white; color: black; } .card { border: 1px solid #ccc; } .copy-btn, .actions { display: none; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(config.repoName)}</h1>
    <p class="subtitle">${escapeHtml(config.description)}</p>

    <div class="card">
      <h2>Features</h2>
      <ul>
            ${features}
      </ul>
    </div>

    <div class="card">
      <h2>Install</h2>
      <pre><code>${escapeHtml(config.installCmd)}</code><button class="copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)">Copy</button></pre>
    </div>

    <div class="card">
      <h2>Quick Start</h2>
      <pre><code>${escapeHtml(config.usageExample)}</code><button class="copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)">Copy</button></pre>
    </div>

    <div class="actions">
      <a class="btn btn-primary" href="${escapeHtml(config.repoUrl)}" target="_blank" rel="noopener">GitHub Repo</a>
      <a class="btn btn-secondary" href="${escapeHtml(config.repoUrl)}/releases" target="_blank" rel="noopener">Releases</a>
      <button class="btn btn-secondary" onclick="window.print()">Print / Export</button>
    </div>

    <p class="footer">Built with OSSFactory-Scaler</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
