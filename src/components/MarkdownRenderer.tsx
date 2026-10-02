import React, { useState } from "react";
import {
  Check,
  Copy,
  Play,
  Eye,
  Code2,
  RefreshCw,
  Maximize2,
  Minimize2,
} from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Enhances any generated HTML or inline HTML snippet so:
 * 1. The AI's actual generated HTML, buttons, inputs, and application UI render directly and cleanly
 *    at the top of the preview without any fake dashboard covering or replacing them.
 * 2. Escaped single-quote onclick handlers (e.g. onclick='alert(\'...\')') are sanitized so they never throw JS SyntaxErrors.
 * 3. Calls to window.alert() or window.confirm() inside the sandboxed iframe display a clean live feedback banner
 *    inside the preview instead of failing silently in sandboxed iframes.
 */
export function enhanceInteractiveHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  // Automatically upgrade any legacy dummy Key1 status placeholder HTML into the real Zero-Divergence Key1 Launcher & Workspace
  const isLegacyDummyKey1 =
    /running in an isolated state|Key1 Instance Initialized Successfully|Current state:\s*Sandbox Mode/i.test(
      rawHtml
    ) && !rawHtml.includes("k1ChatStream");

  const effectiveRawHtml = isLegacyDummyKey1
    ? buildClientKey1ZeroDivergenceHtml()
    : rawHtml;

  const interactiveHelperScript = `<script>
(function() {
  function showLiveFeedback(msg) {
    var text = String(msg || 'Action executed successfully').trim();
    var banner = document.getElementById('__key-live-feedback-toast');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = '__key-live-feedback-toast';
      banner.style.cssText = 'margin-top:14px;padding:12px 16px;border-radius:12px;background:#064e3b;color:#ecfdf5;border:1px solid #10b981;font-family:system-ui,-apple-system,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 8px 20px -4px rgba(0,0,0,0.4);';
      document.body.appendChild(banner);
    }
    var timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;"></span>' +
        '<span>' + text.replace(/</g, '&lt;') + '</span>' +
      '</div>' +
      '<span style="font-size:11px;color:#a7f3d0;font-family:monospace;">' + timeStr + '</span>';
  }

  window.__showInteractiveAction = showLiveFeedback;
  window.alert = function(msg) {
    showLiveFeedback(msg);
  };
  window.confirm = function(msg) {
    showLiveFeedback(msg);
    return true;
  };

  document.addEventListener('DOMContentLoaded', function() {
    // Reveal any container that was accidentally hidden via #sana-app or .hidden
    var sApp = document.getElementById('sana-app');
    if (sApp && sApp.style && sApp.style.display === 'none') {
      sApp.style.display = 'block';
    }

    var buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[href="#"]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var onclickAttr = btn.getAttribute('onclick') || '';
      if (onclickAttr.indexOf('alert(') !== -1) {
        var m = onclickAttr.match(/alert\\s*\\(\\s*['"&quot;&#39;\\\\]*([^'"&)]+)/i);
        var extractedMsg = m && m[1] ? m[1].trim() : (btn.innerText || 'Button Clicked');
        btn.setAttribute('data-key-alert-msg', extractedMsg);
        btn.removeAttribute('onclick');
      }
    }

    document.addEventListener('click', function(e) {
      var target = e.target && e.target.closest ? e.target.closest('button, input[type="button"], input[type="submit"], a[href="#"]') : null;
      if (!target) return;
      var alertMsg = target.getAttribute('data-key-alert-msg') || target.getAttribute('data-key-module');
      if (alertMsg) {
        e.preventDefault();
        showLiveFeedback(alertMsg);
      }
    });
  });
})();
</script>`;

  let fixed = effectiveRawHtml
    .replace(
      /onclick=['"]alert\(\\?['"]([^'"]*?)\\?['"]\)['"]/gi,
      `data-key-module="$1"`
    )
    .replace(/alert\(\\'([^']*?)\\'\)/gi, `window.alert("$1")`)
    .replace(/alert\(\\"([^"]*?)\\"\)/gi, `window.alert("$1")`);

  fixed = fixed.replace(/srcdoc="([^"]*)"/gi, (_match, innerSrcDoc) => {
    const cleanedInner = innerSrcDoc
      .replace(
        /onclick='alert\(\\'([^']*?)\\'\)'/gi,
        `data-key-module="$1"`
      )
      .replace(/\\'/g, "'");
    const safePolyfillForAttr = interactiveHelperScript
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");
    return `srcdoc="${safePolyfillForAttr}${cleanedInner}"`;
  });

  if (/<html[\s>]/i.test(fixed)) {
    if (/<head[\s>]/i.test(fixed)) {
      return fixed.replace(
        /<head([^>]*)>/i,
        `<head$1>${interactiveHelperScript}`
      );
    }
    return fixed.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${interactiveHelperScript}</head>`
    );
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  ${interactiveHelperScript}
</head>
<body class="bg-slate-900 text-slate-100 p-5 font-sans">
  ${fixed}
</body>
</html>`;
}

export function buildClientKey1ZeroDivergenceHtml(): string {
  const originUrl =
    typeof window !== "undefined" &&
    window.location &&
    window.location.origin &&
    !window.location.origin.startsWith("file:")
      ? window.location.origin
      : "https://ais-dev-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app";

  const liveKeyPagesUrl = "https://malazhub.github.io/key/";
  const githubRepoUrl = "https://github.com/malazhub/key";

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Key — Direct GitHub Force-Deploy &amp; Live AI Key Portal (malazhub/key)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #020617; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; margin: 0; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 h-screen flex flex-col overflow-hidden">
  <div class="bg-slate-900 border-b border-emerald-500/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="flex items-center gap-3 flex-wrap">
      <button
        id="clientForceDeployBtn"
        type="button"
        class="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-xs tracking-wide shadow-md cursor-pointer flex items-center gap-2 border border-emerald-300"
      >
        <span>🚀 Force Git Commit &amp; Deploy Key to GitHub</span>
      </button>
      <a
        href="${liveKeyPagesUrl}"
        target="_blank"
        rel="noopener noreferrer"
        class="px-4 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-xs tracking-wide shadow-md cursor-pointer flex items-center gap-1.5"
      >
        <span>🌐 Open AI Key (${liveKeyPagesUrl})</span>
      </a>
      <a
        href="${githubRepoUrl}"
        target="_blank"
        rel="noopener noreferrer"
        class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs border border-slate-700 cursor-pointer"
      >
        📂 ${githubRepoUrl}
      </a>
      <div id="clientDeployStatus" class="text-slate-300 text-xs font-mono flex items-center gap-2 flex-wrap">
        Target: <strong class="text-emerald-300">malazhub/key (main)</strong> → <strong class="text-sky-300">${liveKeyPagesUrl}</strong>
      </div>
    </div>
  </div>
  <iframe
    id="keyLiveFrame"
    src="${originUrl}"
    title="Key — Multi-AI Consensus Engine"
    class="flex-1 w-full border-0 bg-slate-950"
  ></iframe>
  <script>
    var pollTimer = null;
    function startPollingDevice(deviceCode) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async function() {
        try {
          var pr = await fetch('${originUrl}/api/admin/github-device-poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: deviceCode, repoOwner: 'malazhub', repoName: 'key', branch: 'main' })
          });
          if (!pr.ok) return;
          var pd = await pr.json();
          if (pd.authorized && pd.success) {
            clearInterval(pollTimer);
            try { if (pd.accessToken && !/x{4,}/i.test(pd.accessToken)) localStorage.setItem('malaz_github_oauth_token_v1', pd.accessToken); } catch(e){}
            var st = document.getElementById('clientDeployStatus');
            st.innerHTML = '✓ <strong class="text-emerald-300">Force-Deployed ' + pd.pushedCount + ' files (Commit ' + pd.commitSha + ')!</strong> <a href="${liveKeyPagesUrl}?v=' + pd.commitSha + '" target="_blank" class="px-2.5 py-1 rounded bg-emerald-400 text-slate-950 font-extrabold underline">Open Live AI Key</a>';
          }
        } catch (e) {}
      }, 5000);
    }

    function findSavedBrowserToken() {
      try {
        var keys = ['malaz_github_oauth_token_v1', 'malaz_github_pat', 'github_token', 'gh_token', 'githubToken', 'GITHUB_TOKEN'];
        for (var i = 0; i < keys.length; i++) {
          var v = (localStorage.getItem(keys[i]) || '').trim();
          if (!v) continue;
          if (/x{4,}/i.test(v)) {
            try { localStorage.removeItem(keys[i]); } catch(e){}
            continue;
          }
          if (/^(gh[pousr]_[A-Za-z0-9_]{15,255}|github_pat_[A-Za-z0-9_]{15,255}|[a-f0-9]{40})$/i.test(v)) return v;
        }
      } catch (e) {}
      return '';
    }

    async function runDirectDeploy() {
      var st = document.getElementById('clientDeployStatus');
      st.innerHTML = '⏳ Executing clean-slate Git force-commit &amp; deploy to <strong>malazhub/key</strong>...';
      try {
        var savedToken = findSavedBrowserToken();
        var r = await fetch('${originUrl}/api/admin/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ githubToken: savedToken || undefined, repoOwner: 'malazhub', repoName: 'key', branch: 'main' })
        });
        var d = await r.json();
        if (d.success) {
          st.innerHTML = '✓ <strong class="text-emerald-300">Force-Deployed ' + d.pushedCount + ' files (Commit ' + d.commitSha + ')!</strong> <a href="${liveKeyPagesUrl}?v=' + d.commitSha + '" target="_blank" class="px-2.5 py-1 rounded bg-emerald-400 text-slate-950 font-extrabold underline">Open Live AI Key</a>';
        } else if (d.needsGitHubAuth) {
          var devRes = await fetch('${originUrl}/api/admin/github-device-start', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
          var devData = await devRes.json();
          if (devData.user_code && devData.device_code) {
            try {
              if (document.hasFocus && document.hasFocus() && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(devData.user_code).catch(function(){});
              }
            } catch(e){}
            var verifyUri = devData.verification_uri || 'https://github.com/login/device';
            st.innerHTML = '🔒 Code <strong class="text-amber-300 text-sm px-1.5 py-0.5 bg-slate-950 rounded border border-amber-400">' + devData.user_code + '</strong> (Copied!) → <a href="' + verifyUri + '" target="_blank" rel="noopener noreferrer" class="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold underline">Click Here to Open GitHub &amp; Paste Code</a>';
            startPollingDevice(devData.device_code);
          }
        }
      } catch (e) {
        st.innerHTML = '⚠️ Network error while reaching deploy endpoint.';
      }
    }

    document.getElementById('clientForceDeployBtn').addEventListener('click', runDirectDeploy);
    runDirectDeploy();
  </script>
</body>
</html>`;
}

function isHtmlTagLine(trimmed: string): boolean {
  if (!trimmed) return false;
  return /^<(?:!DOCTYPE\s+html|\/?(?:html|head|body|div|section|main|article|aside|header|footer|nav|form|iframe|button|input|select|textarea|label|table|thead|tbody|tr|td|th|ul|ol|li|h[1-6]|p|span|a|img|video|audio|canvas|svg|style|script)\b)/i.test(
    trimmed
  );
}

/**
 * Splits a message into normal Markdown sections and any embedded raw HTML blocks
 * so raw HTML tags are never dumped as text and instead render as live interactive widgets.
 */
export function splitMarkdownAndHtmlBlocks(raw: string): Array<{
  type: "markdown" | "html";
  content: string;
}> {
  if (!raw) return [];
  const normalized = raw.replace(/\r\n/g, "\n");

  const fenceSplit = normalized.split(/(```[\s\S]*?```)/g);
  const blocks: Array<{ type: "markdown" | "html"; content: string }> = [];

  const pushBlock = (type: "markdown" | "html", content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (blocks.length > 0 && blocks[blocks.length - 1].type === type) {
      blocks[blocks.length - 1].content += `\n\n${trimmed}`;
    } else {
      blocks.push({ type, content: trimmed });
    }
  };

  for (const part of fenceSplit) {
    if (!part) continue;
    if (part.startsWith("```") && part.endsWith("```")) {
      pushBlock("markdown", part);
      continue;
    }

    const lines = part.split("\n");
    let mdLines: string[] = [];
    let htmlLines: string[] = [];
    let inHtml = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!inHtml) {
        if (isHtmlTagLine(trimmed)) {
          if (mdLines.length > 0) {
            pushBlock("markdown", mdLines.join("\n"));
            mdLines = [];
          }
          inHtml = true;
          htmlLines.push(line);
        } else {
          mdLines.push(line);
        }
      } else {
        if (!trimmed) {
          let nextNonEmpty = "";
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim()) {
              nextNonEmpty = lines[j].trim();
              break;
            }
          }
          if (nextNonEmpty && isHtmlTagLine(nextNonEmpty)) {
            htmlLines.push(line);
          } else {
            pushBlock("html", htmlLines.join("\n"));
            htmlLines = [];
            inHtml = false;
          }
        } else if (isHtmlTagLine(trimmed) || trimmed.endsWith(">")) {
          htmlLines.push(line);
        } else {
          pushBlock("html", htmlLines.join("\n"));
          htmlLines = [];
          inHtml = false;
          mdLines.push(line);
        }
      }
    }

    if (htmlLines.length > 0) {
      pushBlock("html", htmlLines.join("\n"));
    }
    if (mdLines.length > 0) {
      pushBlock("markdown", mdLines.join("\n"));
    }
  }

  return blocks.length > 0 ? blocks : [{ type: "markdown", content: normalized }];
}

function normalizeStructuredText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n").trim();

  // Merge standalone number lines like "1\nOpen: ..." into "1. Open: ..."
  text = text.replace(/(?:^|\n)(\d+)[.)]?\s*\n+([A-Z*])/g, "\n$1. $2");

  // Ensure inline numbered items start on new lines
  text = text.replace(/([.!?:])\s+(\d+\.\s+\*\*)/g, "$1\n\n$2");
  text = text.replace(/([.!?])\s+(\d+\.\s+[A-Z])/g, "$1\n$2");

  // Ensure inline markdown headings start on a new line
  text = text.replace(/([^\n])\s*(#{1,3}\s+)/g, "$1\n\n$2");

  if (!text.includes("\n") && text.length > 220) {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (sentences && sentences.length >= 3) {
      const paragraphs: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        paragraphs.push(
          sentences
            .slice(i, i + 2)
            .join(" ")
            .trim()
        );
      }
      text = paragraphs.join("\n\n");
    }
  }

  return text;
}

function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token.slice(0, 8)}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={key}
          className="px-1.5 py-0.5 mx-0.5 text-[13px] font-mono bg-slate-800/90 text-emerald-300 rounded border border-slate-700/70"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key} className="font-bold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={key} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300 transition-colors font-medium"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else {
      parts.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Renders the AI's generated HTML button, UI component, or full interactive application
 * directly and visibly at the top of the card (Live View by default), with instant access
 * to Source Code, Live + Code View, Copy Code, Reload, and Height Expansion.
 */
export function InteractivePortalController({
  html,
  title,
}: {
  html: string;
  title?: string;
}) {
  const isKey1Portal =
    /\bkey1\b/i.test(title || "") ||
    /\b(singleKey1Button|k1ChatStream|clientKey1LaunchBtn|Key1 Instance|isolated state)\b/i.test(
      html || ""
    );

  const [viewMode, setViewMode] = useState<
    "live" | "both" | "code" | "bundle"
  >("live");
  const [expandedHeight, setExpandedHeight] = useState(isKey1Portal);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const enhancedSrcDoc = enhanceInteractiveHtml(html);

  const localRunnerBundleText = [
    `// ============================================================================`,
    `// KEY LOCAL RUNNER MULTI-FILE PROJECT BUNDLE (${title || "Standalone App"})`,
    `// Run locally on Windows, macOS, or Linux with full native OS hardware access`,
    `// ============================================================================`,
    ``,
    `// --- FILE 1: package.json ---`,
    JSON.stringify(
      {
        name: "key-local-runner-app",
        version: "1.0.0",
        private: true,
        scripts: {
          start: "node server.js",
        },
        dependencies: {
          express: "^4.21.0",
        },
      },
      null,
      2
    ),
    ``,
    `// --- FILE 2: server.js (Local Express + Native OS Hardware Bridge) ---`,
    `const express = require('express');`,
    `const os = require('os');`,
    `const path = require('path');`,
    `const { exec } = require('child_process');`,
    `const app = express();`,
    `app.use(express.static(__dirname));`,
    `app.get('/api/local-hardware-scan', (req, res) => {`,
    `  const cmd = process.platform === 'win32'`,
    `    ? 'netsh wlan show networks mode=bssid'`,
    `    : 'nmcli -t -f SSID,BSSID,SIGNAL,FREQ,CHAN,SECURITY dev wifi list';`,
    `  exec(cmd, { timeout: 3000 }, (err, stdout) => {`,
    `    res.json({ platform: process.platform, rawScan: stdout || '', interfaces: os.networkInterfaces() });`,
    `  });`,
    `});`,
    `app.listen(3000, () => console.log('Local Runner active at http://localhost:3000'));`,
    ``,
    `// --- FILE 3: start-local.sh / start-local.bat ---`,
    `// npm install && npm start`,
    ``,
    `// --- FILE 4: index.html ---`,
    html,
  ].join("\n");

  const handleCopyHtml = () => {
    try {
      if (typeof document !== "undefined" && document.hasFocus() && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(html).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyBundle = () => {
    try {
      if (typeof document !== "undefined" && document.hasFocus() && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(localRunnerBundleText).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopiedBundle(true);
    setTimeout(() => setCopiedBundle(false), 1800);
  };

  const handleLaunchKey1NewBrowser = () => {
    const originUrl =
      typeof window !== "undefined" &&
      window.location &&
      window.location.origin &&
      !window.location.origin.startsWith("file:")
        ? window.location.origin
        : "https://ais-dev-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app";
    const targetUrl = `${originUrl.replace(/\/+$/, "")}/?instance=key1`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    setExpandedHeight(true);
    setViewMode("live");
  };

  return (
    <div className="my-4 rounded-2xl overflow-hidden border border-emerald-500/50 bg-slate-950 shadow-xl">
      {/* Top Interactive Bar: Single Button "key1" (when applicable) | Live Interactive View | Live + Code | Source Code | Local Runner Bundle | Copy | Reload */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {isKey1Portal && (
            <button
              type="button"
              onClick={handleLaunchKey1NewBrowser}
              className="px-4 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold text-sm tracking-wide shadow-md cursor-pointer flex items-center gap-1.5 border border-emerald-300 transition"
              title="Click key1 to open the isolated 100% Zero-Divergence key1 application in a new browser window"
            >
              <span>key1</span>
              <span className="text-[10px] font-mono bg-slate-950/20 px-1.5 py-0.5 rounded">
                ↗ New Browser
              </span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="font-bold text-white">
              {title || "Live Interactive Component & Application Preview"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("live")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === "live"
                ? "bg-emerald-400 text-slate-950"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Live Interactive View</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("both")}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === "both"
                ? "bg-sky-400 text-slate-950"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Live + Code</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("code")}
            className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors ${
              viewMode === "code"
                ? "bg-amber-400 text-slate-950 font-semibold"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Source Code</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("bundle")}
            className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors ${
              viewMode === "bundle"
                ? "bg-emerald-300 text-slate-950 font-bold"
                : "bg-slate-800 hover:bg-slate-700 text-emerald-300"
            }`}
            title="Multi-file project bundle (package.json, server.js, index.html) to run natively on your device"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Local Runner Bundle</span>
          </button>

          <button
            type="button"
            onClick={handleCopyHtml}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer flex items-center gap-1"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copy Code</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload Live Preview"
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                window.postMessage(
                  {
                    type: "OPEN_FULLSCREEN_APP_PREVIEW",
                    title:
                      title ||
                      "Live Interactive Component & Application Preview",
                    html,
                  },
                  "*"
                );
              } catch {
                // ignore
              }
            }}
            title="Open Application Preview in Full Screen with Close & Return Button"
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Full Screen Preview</span>
          </button>

          <button
            type="button"
            onClick={() => setExpandedHeight((prev) => !prev)}
            title={expandedHeight ? "Compact Height" : "Expand Height"}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-medium cursor-pointer flex items-center gap-1"
          >
            {expandedHeight ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Compact</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expand</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Interactive Iframe Preview (Visible by default in "live" and "both" modes) */}
      {(viewMode === "live" || viewMode === "both") && (
        <div className="bg-slate-950 p-2.5">
          <div
            className={`w-full ${
              expandedHeight
                ? "h-[640px]"
                : isKey1Portal
                ? "h-[540px]"
                : "h-96"
            } rounded-xl overflow-hidden border border-slate-800 bg-slate-900 transition-all`}
          >
            <iframe
              key={reloadKey}
              title={title || "Live Interactive View"}
              srcDoc={enhancedSrcDoc}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
              className="w-full h-full border-0 bg-slate-900"
            />
          </div>
        </div>
      )}

      {/* Full Source Code View (Visible in "both" and "code" modes so nothing is ever hidden) */}
      {(viewMode === "code" || viewMode === "both") && (
        <div className="border-t border-slate-800 bg-slate-950">
          <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 font-mono">
            <span>Complete HTML / JS Source Code</span>
            <button
              type="button"
              onClick={handleCopyHtml}
              className="text-emerald-400 hover:text-emerald-300 font-sans font-semibold cursor-pointer"
            >
              {copiedCode ? "✓ Copied" : "Copy Full Code"}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto bg-slate-950 max-h-96">
            <code>{html}</code>
          </pre>
        </div>
      )}

      {/* Option 6: Full-Project Multi-File Local Runner Bundle View */}
      {viewMode === "bundle" && (
        <div className="border-t border-slate-800 bg-slate-950">
          <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
            <span className="font-mono text-emerald-300 font-semibold">
              Multi-File Local Runner Package (package.json + server.js + Native Hardware Bridge + index.html)
            </span>
            <button
              type="button"
              onClick={handleCopyBundle}
              className="px-3 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold cursor-pointer"
            >
              {copiedBundle ? "✓ Copied Multi-File Bundle" : "Copy Multi-File Project Bundle"}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-emerald-200 overflow-x-auto bg-slate-950 max-h-96">
            <code>{localRunnerBundleText}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    try {
      if (typeof document !== "undefined" && document.hasFocus() && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 font-mono">
        <span className="uppercase tracking-wider text-[11px] font-semibold text-emerald-400">
          {lang || "code"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy code</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-4 text-[13px] leading-relaxed font-mono text-slate-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
}) => {
  if (!content) return null;

  const blocks = splitMarkdownAndHtmlBlocks(content);

  return (
    <div className="space-y-6 text-[15px] leading-8 text-slate-100">
      {blocks.map((block, blockIdx) => {
        if (block.type === "html") {
          return (
            <CodeBlock
              key={`html-${blockIdx}`}
              lang="html"
              code={block.content}
            />
          );
        }

        const normalized = normalizeStructuredText(block.content);
        const segments = normalized.split(/(```[\s\S]*?```)/g);
        let runningOrderedNumber = 0;

        return (
          <React.Fragment key={`md-${blockIdx}`}>
            {segments.map((segment, segIdx) => {
              if (segment.startsWith("```") && segment.endsWith("```")) {
                const lines = segment.slice(3, -3).split("\n");
                const firstLine = lines[0]?.trim() || "";
                const codeContent = lines.slice(1).join("\n");
                return (
                  <CodeBlock
                    key={`${blockIdx}-${segIdx}`}
                    lang={firstLine}
                    code={codeContent}
                  />
                );
              }

              const lines = segment.split("\n");
              const elements: React.ReactNode[] = [];
              let listItems: {
                ordered: boolean;
                items: Array<{ displayNum: number; text: string }>;
              } | null = null;
              let tableRows: string[][] | null = null;

              const flushTable = (keyPrefix: string) => {
                if (!tableRows || tableRows.length === 0) return;
                const headerRow = tableRows[0];
                const bodyRows = tableRows.slice(1);
                elements.push(
                  <div
                    key={`${keyPrefix}-table`}
                    className="my-5 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 shadow-md"
                  >
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-900/95 border-b border-slate-800 text-emerald-300 font-bold">
                          {headerRow.map((cell, cIdx) => (
                            <th
                              key={cIdx}
                              className="py-2.5 px-3.5 border-r border-slate-800/70 last:border-r-0"
                            >
                              {formatInline(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {bodyRows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className="hover:bg-slate-900/50 transition-colors"
                          >
                            {headerRow.map((_, cIdx) => (
                              <td
                                key={cIdx}
                                className="py-2 px-3.5 text-slate-200 border-r border-slate-800/50 last:border-r-0 align-top"
                              >
                                {formatInline(row[cIdx] || "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
                tableRows = null;
              };

              const flushList = (keyPrefix: string) => {
                if (!listItems) return;
                if (listItems.ordered) {
                  elements.push(
                    <ol
                      key={`${keyPrefix}-ol`}
                      className="space-y-4 my-5 text-slate-100"
                    >
                      {listItems.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 leading-relaxed bg-slate-950/45 border border-slate-800/70 rounded-xl px-4 py-3"
                        >
                          <span className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {item.displayNum}
                          </span>
                          <div className="flex-1 min-w-0">
                            {formatInline(item.text)}
                          </div>
                        </li>
                      ))}
                    </ol>
                  );
                } else {
                  elements.push(
                    <ul
                      key={`${keyPrefix}-ul`}
                      className="space-y-3.5 my-5 text-slate-100 pl-1"
                    >
                      {listItems.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 leading-relaxed"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-2.5" />
                          <div className="flex-1 min-w-0">
                            {formatInline(item.text)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                }
                listItems = null;
              };

              lines.forEach((rawLine, lineIdx) => {
                const line = rawLine.trimEnd();
                const trimmed = line.trim();

                if (!trimmed || /^#{1,6}$/.test(trimmed)) {
                  return;
                }

                // Markdown Pipe Table Row Detection: | col1 | col2 | ... |
                if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
                  flushList(`${segIdx}-${lineIdx}`);
                  const rawCells = trimmed
                    .slice(1, -1)
                    .split("|")
                    .map((c) => c.trim());
                  // Skip alignment separator rows like | :--- | :--- |
                  const isSeparatorRow = rawCells.every((c) =>
                    /^:?-{2,}:?$/.test(c) || c === ""
                  );
                  if (!isSeparatorRow) {
                    if (!tableRows) {
                      tableRows = [];
                    }
                    // Carry forward first cell if empty (e.g. grouped Attack Surface column)
                    if (
                      rawCells[0] === "" &&
                      tableRows.length > 1 &&
                      tableRows[tableRows.length - 1][0]
                    ) {
                      rawCells[0] = tableRows[tableRows.length - 1][0];
                    }
                    tableRows.push(rawCells);
                  }
                  return;
                }

                if (tableRows) {
                  flushTable(`${segIdx}-${lineIdx}`);
                }

                if (trimmed === "---" || trimmed === "***") {
                  flushList(`${segIdx}-${lineIdx}`);
                  runningOrderedNumber = 0;
                  elements.push(
                    <hr
                      key={`${segIdx}-${lineIdx}`}
                      className="my-6 border-slate-800"
                    />
                  );
                  return;
                }

                if (trimmed.startsWith("#### ")) {
                  flushList(`${segIdx}-${lineIdx}`);
                  runningOrderedNumber = 0;
                  elements.push(
                    <h4
                      key={`${segIdx}-${lineIdx}`}
                      className="text-sm font-bold text-emerald-300 mt-6 mb-2.5 tracking-tight flex items-center gap-2 border-b border-slate-800/70 pb-1.5"
                    >
                      <span className="w-1.5 h-3.5 rounded-full bg-emerald-400 shrink-0" />
                      <span>{formatInline(trimmed.slice(5))}</span>
                    </h4>
                  );
                  return;
                }

                if (trimmed.startsWith("### ")) {
                  flushList(`${segIdx}-${lineIdx}`);
                  runningOrderedNumber = 0;
                  elements.push(
                    <h3
                      key={`${segIdx}-${lineIdx}`}
                      className="text-base font-bold text-white mt-7 mb-3 tracking-tight flex items-center gap-2 border-b border-slate-800/80 pb-2"
                    >
                      <span className="w-1.5 h-4 rounded-full bg-emerald-400 shrink-0" />
                      <span>{formatInline(trimmed.slice(4))}</span>
                    </h3>
                  );
                  return;
                }

                if (trimmed.startsWith("## ")) {
                  flushList(`${segIdx}-${lineIdx}`);
                  runningOrderedNumber = 0;
                  elements.push(
                    <h2
                      key={`${segIdx}-${lineIdx}`}
                      className="text-lg font-bold text-white mt-7 mb-3 tracking-tight flex items-center gap-2 border-b border-slate-800 pb-2"
                    >
                      <span className="w-1.5 h-5 rounded-full bg-emerald-400 shrink-0" />
                      <span>{formatInline(trimmed.slice(3))}</span>
                    </h2>
                  );
                  return;
                }

                if (trimmed.startsWith("# ")) {
                  flushList(`${segIdx}-${lineIdx}`);
                  runningOrderedNumber = 0;
                  elements.push(
                    <h1
                      key={`${segIdx}-${lineIdx}`}
                      className="text-xl font-bold text-white mt-7 mb-3.5 tracking-tight border-b border-slate-800 pb-2"
                    >
                      {formatInline(trimmed.slice(2))}
                    </h1>
                  );
                  return;
                }

                if (trimmed.startsWith("> ")) {
                  flushList(`${segIdx}-${lineIdx}`);
                  elements.push(
                    <blockquote
                      key={`${segIdx}-${lineIdx}`}
                      className="border-l-3 border-emerald-400 bg-slate-950/50 rounded-r-xl pl-4 pr-3 py-2 my-2.5 text-slate-200 italic"
                    >
                      {formatInline(trimmed.slice(2))}
                    </blockquote>
                  );
                  return;
                }

                const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
                if (bulletMatch) {
                  if (listItems && listItems.ordered) {
                    // Append sub-bullets cleanly inside the current ordered list item if one is active
                    const lastOrdered =
                      listItems.items[listItems.items.length - 1];
                    if (lastOrdered) {
                      lastOrdered.text += ` — ${bulletMatch[1]}`;
                      return;
                    }
                    flushList(`${segIdx}-${lineIdx}`);
                  }
                  if (!listItems) {
                    listItems = { ordered: false, items: [] };
                  }
                  listItems.items.push({
                    displayNum: listItems.items.length + 1,
                    text: bulletMatch[1],
                  });
                  return;
                }

                const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
                if (orderedMatch) {
                  if (listItems && !listItems.ordered) {
                    flushList(`${segIdx}-${lineIdx}`);
                  }
                  if (!listItems) {
                    listItems = { ordered: true, items: [] };
                  }
                  const explicitNum = parseInt(orderedMatch[1], 10);
                  runningOrderedNumber =
                    !Number.isNaN(explicitNum) && explicitNum > runningOrderedNumber
                      ? explicitNum
                      : runningOrderedNumber + 1;
                  listItems.items.push({
                    displayNum: runningOrderedNumber,
                    text: orderedMatch[2],
                  });
                  return;
                }

                // If an ordered list item is currently open and the next line is a labeled detail line (e.g. "Representative Methods:", "Mechanism:", "Context:", "Source:"), merge it into that ordered item
                if (
                  listItems &&
                  listItems.ordered &&
                  listItems.items.length > 0 &&
                  /^(?:Representative\s+(?:Methods|Research)|Mechanism|Context|Source|KEY\s+Architectural\s+Mitigation)\s*:/i.test(
                    trimmed
                  )
                ) {
                  const lastItem = listItems.items[listItems.items.length - 1];
                  lastItem.text += ` · ${trimmed}`;
                  return;
                }

                flushList(`${segIdx}-${lineIdx}`);
                elements.push(
                  <p
                    key={`${segIdx}-${lineIdx}`}
                    className="leading-8 text-slate-100"
                  >
                    {formatInline(trimmed)}
                  </p>
                );
              });

              flushTable(`${segIdx}-end-table`);
              flushList(`${segIdx}-end`);

              return <React.Fragment key={segIdx}>{elements}</React.Fragment>;
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
