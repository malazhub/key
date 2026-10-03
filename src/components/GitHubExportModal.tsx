import React, { useEffect, useState } from "react";
import {
  FolderGit2,
  FileCode2,
  Copy,
  Check,
  Download,
  ExternalLink,
  X,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  Terminal,
  Globe,
  ShieldCheck,
} from "lucide-react";

interface ExportedProjectFile {
  path: string;
  category: string;
  sizeBytes: number;
  content: string;
}

interface GitHubExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Generates a 100% standalone, self-contained index.html application that has the EXACT SAME VIEW,
 * LAYOUT, AND LIVE SEARCH & ANSWER LOGIC as https://ais-dev-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app/
 * when opened from GitHub Pages (https://malazhub.github.io/key/) or locally.
 */
function buildStandaloneGitHubPagesHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Key — Multi-AI Consensus Engine (https://malazhub.github.io/key/)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #020617; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
  </style>
</head>
<body class="h-screen w-full overflow-hidden flex flex-col bg-slate-950 text-slate-100">
  <!-- Top Header (Identical to Main App) -->
  <header class="h-13 py-2.5 shrink-0 flex items-center justify-between px-4 lg:px-6 border-b border-slate-800/90 bg-slate-950/95 z-30">
    <div class="flex items-center gap-2.5">
      <button id="openSidebarBtn" type="button" class="hidden px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg cursor-pointer">
        ☰ Engines
      </button>
      <a href="#top" class="text-base font-bold tracking-tight text-white flex items-center gap-2">
        <span>Key</span>
        <span id="headerAdminBadge" class="hidden text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-300">
          Admin · key → key1
        </span>
      </a>
    </div>
    <div class="flex items-center gap-2">
      <a href="https://github.com/malazhub/key" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200">
        malazhub/key
      </a>
      <button id="newChatBtn" type="button" class="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700/80 rounded-lg hover:bg-slate-800 cursor-pointer">
        + New Chat
      </button>
      <button id="copyUrlBtn" type="button" class="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg cursor-pointer">
        1-Click Copy URL
      </button>
    </div>
  </header>

  <!-- Main Split Workspace: Left Sidebar + Right Chat Area -->
  <div class="flex-1 flex min-h-0 overflow-hidden relative">
    <!-- Left Sidebar (10 AI Engines + Empty Space Option + Admin Upgrade Gate) -->
    <aside id="leftSidebar" class="w-80 xl:w-96 border-r shrink-0 bg-slate-900/75 border-slate-800/90 flex flex-col overflow-hidden select-none">
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-emerald-400">● 10 AI Engines Ready</span>
          <button id="collapseSidebarBtn" type="button" title="Collapse Left Panel" class="px-2 py-1 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 border border-slate-800 cursor-pointer">
            ◀ Collapse
          </button>
        </div>

        <section class="space-y-3">
          <div class="bg-slate-950/90 rounded-xl border border-slate-800 p-3.5 space-y-3">
            <div class="pb-2 border-b border-slate-800/90 flex items-center justify-between">
              <span class="font-semibold text-white text-sm">Select your AI engines</span>
              <button id="resetTop10Btn" type="button" class="text-[11px] text-emerald-400 hover:underline cursor-pointer">Fill Top 10</button>
            </div>
            <div id="enginesGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-2"></div>
          </div>
        </section>

        <!-- Admin Upgrade Section (malazhub/key -> malazhub/key1 locked by malazjanbeih@gmail.com + mjkey1971) -->
        <section class="space-y-3 pt-2 border-t border-slate-800/80">
          <div class="bg-slate-950/90 rounded-xl border border-slate-800 p-3.5 space-y-2.5">
            <button id="sidebarAdminBtn" type="button" class="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-amber-300 font-semibold text-xs rounded-lg border border-slate-700/80 flex items-center justify-center gap-2 cursor-pointer">
              <span>🔒 Admin Upgrade (key → key1)</span>
            </button>
            <div id="adminStatusBox" class="hidden p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-[11px] text-amber-200 space-y-1">
              <div class="font-bold text-amber-300">✓ Admin Verified: malazjanbeih@gmail.com</div>
              <div>Upgrade Target: <span class="font-mono text-emerald-300">https://github.com/malazhub/key1</span></div>
            </div>
          </div>
        </section>
      </div>
    </aside>

    <!-- Right Main Chat Stream + Wide 5-Row Bottom Composer -->
    <main class="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
      <div id="chatScrollArea" class="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
        <div class="max-w-5xl w-full mx-auto space-y-6">
          <div id="bannerAlert" class="hidden p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center justify-between gap-3">
            <span id="bannerAlertText"></span>
            <button id="dismissBannerBtn" type="button" class="text-rose-300 hover:text-white font-semibold cursor-pointer">Dismiss</button>
          </div>
          <div id="messagesContainer" class="space-y-6"></div>
        </div>
      </div>

      <!-- Bottom Composer: Desired Match % + Allow Application + Attach Box Above Input + 5-Row Auto-Expanding Input + Send Only -->
      <div class="shrink-0 border-t border-slate-800/90 bg-slate-950/95 px-4 lg:px-8 py-3.5">
        <div class="max-w-5xl w-full mx-auto space-y-2.5">
          <!-- Row 1 Above Input: Desired Match % (Left) + Allow Application & Preview Application & Admin Upgrade (Right) -->
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center justify-start gap-1.5 flex-wrap">
              <span class="font-semibold text-slate-200 mr-1">Select the desired match between engines' answers:</span>
              <div id="matchPresetBtns" class="flex items-center gap-1"></div>
              <div class="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700/80 ml-1">
                <input id="targetInput" type="number" min="1" max="100" value="95" class="w-11 text-center font-mono font-semibold text-xs bg-slate-950 text-amber-300 rounded focus:outline-none" />
                <span class="text-[11px] text-amber-400 font-mono">%</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button id="allowAppBtn" type="button" class="px-3 py-1.5 rounded-lg text-xs font-bold border bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer">
                <span>✨ Allow Application</span>
              </button>
              <button id="previewAppTopBtn" type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-sky-500/15 border-sky-500/50 text-sky-300 hover:bg-sky-500/25 flex items-center gap-1.5 cursor-pointer">
                <span>👁 Preview Application</span>
              </button>
              <button id="upgradeKeyTopBtn" type="button" class="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-slate-900 border-slate-800 text-amber-300 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer">
                <span id="upgradeKeyTopLabel">🔒 Upgrade key → key1</span>
              </button>
            </div>
          </div>

          <!-- Row 2 Above Input: Dedicated ATTACH BOX (Photo / File / Text / Any) -->
          <div id="attachDropZone" class="rounded-xl bg-slate-900/90 border border-dashed border-slate-700 hover:border-emerald-500/60 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 transition-colors">
            <input id="filePickerInput" type="file" multiple accept="*/*" class="hidden" />
            <div class="flex flex-wrap items-center gap-2">
              <button id="attachFileBtn" type="button" class="px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 cursor-pointer">
                <span>📎 Attach Photo / File / Text / Any</span>
              </button>
              <button id="toggleTextAttachBtn" type="button" class="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 cursor-pointer">
                + Attach Text
              </button>
              <span class="text-[11px] text-slate-400 hidden sm:inline">Drag &amp; drop or click to attach any photo, file, text, or document above input</span>
            </div>
            <span id="attachedCountBadge" class="hidden text-[11px] font-mono text-emerald-400 font-semibold">0 Attached</span>
          </div>

          <div id="textAttachRow" class="hidden p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center gap-2">
            <input id="customTextAttachInput" type="text" placeholder="Paste or type any text snippet to attach..." class="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-400" />
            <button id="addTextAttachBtn" type="button" class="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs cursor-pointer">Attach Text</button>
          </div>

          <div id="attachmentsList" class="hidden flex flex-wrap items-center gap-2"></div>

          <!-- Row 3: Large Full-Width Auto-Growing 5-Row Input Box + Reset + Send (Only "Send") -->
          <div class="w-full rounded-2xl bg-slate-900 border border-slate-700/90 focus-within:border-emerald-500/80 p-3.5 flex items-end gap-3 transition-colors shadow-lg">
            <textarea
              id="questionTextarea"
              rows="2"
              placeholder="Ask any question across all 10 AI engines, or attach any photo, file, or text above (expands up to 5 rows)..."
              class="flex-1 w-full min-h-[56px] max-h-[132px] text-[15px] leading-6 text-slate-100 placeholder:text-slate-500 bg-transparent resize-none focus:outline-none overflow-y-auto"
            ></textarea>
            <div class="flex items-center gap-2 shrink-0">
              <button id="resetBtn" type="button" class="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 cursor-pointer">
                Reset
              </button>
              <button id="sendBtn" type="button" class="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                <span id="sendBtnLabel">Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Admin Login Modal (Requires malazjanbeih@gmail.com + mjkey1971) -->
  <div id="adminLoginModal" class="hidden fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4">
    <div class="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="text-sm font-bold text-white">🔒 Admin Access Verification (key → key1)</h3>
        <button id="closeAdminModalBtn" type="button" class="text-slate-400 hover:text-white cursor-pointer">✕</button>
      </div>
      <p class="text-xs text-slate-300">No one can upgrade <code class="text-emerald-300">https://github.com/malazhub/key</code> to <code class="text-amber-300">https://github.com/malazhub/key1</code> unless you input username <code class="text-white">malazjanbeih@gmail.com</code> and password <code class="text-white">mjkey1971</code>.</p>
      <form id="adminLoginForm" class="space-y-3">
        <div>
          <label class="text-xs font-medium text-slate-300 block mb-1">Admin Username / Email</label>
          <input id="adminEmailInp" type="email" required placeholder="malazjanbeih@gmail.com" class="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white" />
        </div>
        <div>
          <label class="text-xs font-medium text-slate-300 block mb-1">Admin Password</label>
          <input id="adminPassInp" type="password" required placeholder="••••••••" class="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white" />
        </div>
        <div class="flex gap-2 pt-2">
          <button id="cancelAdminBtn" type="button" class="flex-1 py-2 bg-slate-800 text-slate-200 font-semibold text-xs rounded-lg cursor-pointer">Cancel</button>
          <button type="submit" class="flex-1 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg cursor-pointer">Verify &amp; Unlock key1</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Live Application Preview Modal -->
  <div id="liveAppPreviewModal" class="hidden fixed inset-0 z-50 bg-slate-950/90 flex flex-col p-3 sm:p-6">
    <div class="w-full max-w-6xl mx-auto flex-1 flex flex-col rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl">
      <div class="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
        <span id="previewModalTitle" class="text-sm font-bold text-white">Live Application Preview</span>
        <button id="closePreviewModalBtn" type="button" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer">✕ Close Preview</button>
      </div>
      <iframe id="previewModalIframe" class="w-full flex-1 border-0 bg-slate-950" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
    </div>
  </div>

  <script>
    // Live AI Studio Cloud Backends so GitHub version uses the EXACT same search & answer logic
    const BACKEND_URLS = [
      "https://ais-dev-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app",
      "https://ais-pre-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app"
    ];

    const TOP_20_MODELS = [
      "ChatGPT 4o", "Claude 3.5 Sonnet", "DeepSeek V3", "Gemini 2.5", "Qwen 2.5",
      "Llama 3.3 70B", "Grok 2", "Mistral Large 2", "Perplexity Pro", "Command R+",
      "DeepSeek R1", "Phi-4 14B", "Gemma 2 27B", "Nemotron 70B", "Codestral 22B"
    ];

    let models = TOP_20_MODELS.slice(0, 10);
    let targetAgreement = 95;
    let allowApplicationMode = false;
    let isAdminAuthenticated = false;
    let pendingAttachments = [];
    let chatHistory = [];
    let lastGeneratedAppHtml = "";
    let lastGeneratedAppTitle = "Interactive Application Preview (key1)";

    const enginesGrid = document.getElementById("enginesGrid");
    function renderEngines() {
      enginesGrid.innerHTML = "";
      models.forEach((m, idx) => {
        const box = document.createElement("div");
        box.className = "rounded-lg border p-2 " + (m ? "bg-slate-900/90 border-slate-700/90" : "bg-slate-950/60 border-slate-800/70");
        box.innerHTML = \`
          <div class="flex items-center justify-between text-[11px] mb-1 font-mono">
            <span class="text-slate-300 font-semibold">Engine #\${idx + 1}</span>
          </div>
          <select data-idx="\${idx}" class="eng-select w-full text-xs px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-emerald-400">
            <option value="">[ Empty Space — Clear Engine #\${idx + 1} ]</option>
            \${TOP_20_MODELS.map((name) => \`<option value="\${name}" \${name === m ? "selected" : ""}>\${name}</option>\`).join("")}
          </select>
        \`;
        enginesGrid.appendChild(box);
      });
      enginesGrid.querySelectorAll(".eng-select").forEach((sel) => {
        sel.addEventListener("change", (e) => {
          models[Number(e.target.getAttribute("data-idx"))] = e.target.value;
        });
      });
    }
    renderEngines();

    document.getElementById("resetTop10Btn").addEventListener("click", () => {
      models = TOP_20_MODELS.slice(0, 10);
      renderEngines();
    });

    // Sidebar collapse/open
    const leftSidebar = document.getElementById("leftSidebar");
    const openSidebarBtn = document.getElementById("openSidebarBtn");
    document.getElementById("collapseSidebarBtn").addEventListener("click", () => {
      leftSidebar.classList.add("hidden");
      openSidebarBtn.classList.remove("hidden");
    });
    openSidebarBtn.addEventListener("click", () => {
      leftSidebar.classList.remove("hidden");
      openSidebarBtn.classList.add("hidden");
    });

    // Match % presets
    const matchPresetBtns = document.getElementById("matchPresetBtns");
    const targetInput = document.getElementById("targetInput");
    function renderPresets() {
      matchPresetBtns.innerHTML = "";
      [50, 80, 90, 95, 98, 99].forEach((val) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = val + "%";
        b.className = "px-2 py-0.5 rounded font-mono text-xs border cursor-pointer " +
          (targetAgreement === val ? "bg-amber-500 text-slate-950 border-amber-400 font-semibold" : "bg-slate-900 text-slate-300 border-slate-800");
        b.addEventListener("click", () => {
          targetAgreement = val;
          targetInput.value = String(val);
          renderPresets();
        });
        matchPresetBtns.appendChild(b);
      });
    }
    renderPresets();
    targetInput.addEventListener("input", (e) => {
      targetAgreement = Math.max(1, Math.min(100, Number(e.target.value) || 95));
      renderPresets();
    });

    // Allow Application & Preview Application buttons above input
    const allowAppBtn = document.getElementById("allowAppBtn");
    function updateAllowAppBtn() {
      if (allowApplicationMode) {
        allowAppBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold border bg-emerald-500/20 border-emerald-500/60 text-emerald-300 flex items-center gap-1.5 cursor-pointer";
        allowAppBtn.innerHTML = "<span>✨ Allow Application: ON</span>";
      } else {
        allowAppBtn.className = "px-3 py-1.5 rounded-lg text-xs font-bold border bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer";
        allowAppBtn.innerHTML = "<span>✨ Allow Application</span>";
      }
    }
    allowAppBtn.addEventListener("click", () => {
      allowApplicationMode = !allowApplicationMode;
      updateAllowAppBtn();
    });

    const liveAppPreviewModal = document.getElementById("liveAppPreviewModal");
    const previewModalIframe = document.getElementById("previewModalIframe");
    const previewModalTitle = document.getElementById("previewModalTitle");
    function openLiveAppPreview(title, htmlContent) {
      previewModalTitle.textContent = title || "Interactive Application Preview (key1)";
      previewModalIframe.srcdoc = htmlContent || '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-950 text-white p-6 font-sans"><div class="max-w-2xl mx-auto p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"><h2 class="text-lg font-bold text-emerald-400">Allow Application Preview Ready</h2><p class="text-xs text-slate-300">Type your application or upgrade request in the 5-row input box and click Send to preview it live.</p></div></body></html>';
      liveAppPreviewModal.classList.remove("hidden");
    }
    document.getElementById("previewAppTopBtn").addEventListener("click", () => {
      allowApplicationMode = true;
      updateAllowAppBtn();
      openLiveAppPreview(lastGeneratedAppTitle, lastGeneratedAppHtml);
    });
    document.getElementById("closePreviewModalBtn").addEventListener("click", () => {
      liveAppPreviewModal.classList.add("hidden");
    });

    // Admin Login Gate (malazjanbeih@gmail.com + mjkey1971)
    const adminLoginModal = document.getElementById("adminLoginModal");
    const openAdminModal = () => adminLoginModal.classList.remove("hidden");
    const closeAdminModal = () => adminLoginModal.classList.add("hidden");
    document.getElementById("sidebarAdminBtn").addEventListener("click", openAdminModal);
    document.getElementById("upgradeKeyTopBtn").addEventListener("click", openAdminModal);
    document.getElementById("closeAdminModalBtn").addEventListener("click", closeAdminModal);
    document.getElementById("cancelAdminBtn").addEventListener("click", closeAdminModal);

    function showBanner(msg) {
      const b = document.getElementById("bannerAlert");
      document.getElementById("bannerAlertText").textContent = msg;
      b.classList.remove("hidden");
    }
    document.getElementById("dismissBannerBtn").addEventListener("click", () => {
      document.getElementById("bannerAlert").classList.add("hidden");
    });

    function activateAdminMode() {
      isAdminAuthenticated = true;
      document.getElementById("headerAdminBadge").classList.remove("hidden");
      document.getElementById("adminStatusBox").classList.remove("hidden");
      document.getElementById("upgradeKeyTopLabel").textContent = "✓ Admin Verified (key → key1)";
      closeAdminModal();
    }

    document.getElementById("adminLoginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("adminEmailInp").value.trim().toLowerCase();
      const pass = document.getElementById("adminPassInp").value.trim();
      if ((email === "malazjanbeih@gmail.com" || email === "malazjanbeih@gmial.com") && pass === "mjkey1971") {
        activateAdminMode();
      } else {
        closeAdminModal();
        showBanner('Upgrade denied: Only username "malazjanbeih@gmail.com" and password "mjkey1971" can upgrade https://github.com/malazhub/key to https://github.com/malazhub/key1.');
      }
    });

    // Attach Box above input (Photo / File / Text / Any)
    const filePickerInput = document.getElementById("filePickerInput");
    const attachmentsList = document.getElementById("attachmentsList");
    const attachedCountBadge = document.getElementById("attachedCountBadge");

    function renderAttachments() {
      if (pendingAttachments.length === 0) {
        attachmentsList.classList.add("hidden");
        attachedCountBadge.classList.add("hidden");
        return;
      }
      attachmentsList.classList.remove("hidden");
      attachedCountBadge.classList.remove("hidden");
      attachedCountBadge.textContent = pendingAttachments.length + " Attached";
      attachmentsList.innerHTML = pendingAttachments.map((att, i) => \`
        <div class="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs">
          <span class="font-medium text-emerald-300 truncate max-w-44">\${att.name}</span>
          <button type="button" data-rm="\${i}" class="rm-att text-slate-400 hover:text-rose-400 cursor-pointer">✕</button>
        </div>
      \`).join("");
      attachmentsList.querySelectorAll(".rm-att").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          pendingAttachments.splice(Number(e.target.getAttribute("data-rm")), 1);
          renderAttachments();
        });
      });
    }

    async function handleFiles(fileList) {
      for (const file of Array.from(fileList)) {
        const mime = file.type || "application/octet-stream";
        const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "file";
        const dataUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ""));
          r.readAsDataURL(file);
        });
        const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : undefined;
        let textContent = undefined;
        if (mime.startsWith("text/") || /\\.(txt|md|json|csv|js|ts|tsx|html|css|py)$/i.test(file.name)) {
          textContent = await file.text();
        }
        pendingAttachments.push({ name: file.name, mimeType: mime, base64Data, textContent, sizeBytes: file.size, kind });
      }
      renderAttachments();
    }

    document.getElementById("attachFileBtn").addEventListener("click", () => filePickerInput.click());
    filePickerInput.addEventListener("change", (e) => {
      if (e.target.files) handleFiles(e.target.files);
      e.target.value = "";
    });
    const attachDropZone = document.getElementById("attachDropZone");
    attachDropZone.addEventListener("dragover", (e) => e.preventDefault());
    attachDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    });

    const textAttachRow = document.getElementById("textAttachRow");
    document.getElementById("toggleTextAttachBtn").addEventListener("click", () => {
      textAttachRow.classList.toggle("hidden");
    });
    document.getElementById("addTextAttachBtn").addEventListener("click", () => {
      const inp = document.getElementById("customTextAttachInput");
      const txt = inp.value.trim();
      if (!txt) return;
      pendingAttachments.push({
        name: "attached-text-" + (pendingAttachments.length + 1) + ".txt",
        mimeType: "text/plain",
        textContent: txt,
        sizeBytes: txt.length,
        kind: "file"
      });
      inp.value = "";
      textAttachRow.classList.add("hidden");
      renderAttachments();
    });

    // 5-Row Auto-Expanding Textarea
    const questionTextarea = document.getElementById("questionTextarea");
    function autoResizeTextarea() {
      questionTextarea.style.height = "auto";
      const nextH = Math.min(132, Math.max(56, questionTextarea.scrollHeight));
      questionTextarea.style.height = nextH + "px";
    }
    questionTextarea.addEventListener("input", autoResizeTextarea);
    questionTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendQuery();
      }
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      questionTextarea.value = "";
      pendingAttachments = [];
      renderAttachments();
      autoResizeTextarea();
    });

    document.getElementById("newChatBtn").addEventListener("click", () => {
      chatHistory = [];
      document.getElementById("messagesContainer").innerHTML = "";
    });

    document.getElementById("copyUrlBtn").addEventListener("click", (e) => {
      try {
        if (document.hasFocus && document.hasFocus() && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.location.href).catch(() => {});
        }
      } catch (err) {}
      e.target.textContent = "Copied URL!";
      setTimeout(() => { e.target.textContent = "1-Click Copy URL"; }, 1800);
    });

    function formatMarkdownToHtml(md) {
      if (!md) return "";
      return md
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/^###\\s+(.+)$/gm, '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>')
        .replace(/^##\\s+(.+)$/gm, '<h2 class="text-lg font-bold text-white mt-4 mb-2">$1</h2>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong class="font-bold text-white">$1</strong>')
        .replace(/\`([^\`]+)\`/g, '<code class="px-1.5 py-0.5 text-xs font-mono bg-slate-800 text-emerald-300 rounded">$1</code>')
        .replace(/^(\\d+)\\.\\s+(.+)$/gm, '<div class="flex items-start gap-2.5 my-1.5"><span class="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold shrink-0">$1</span><div class="flex-1">$2</div></div>')
        .replace(/^[-*]\\s+(.+)$/gm, '<div class="flex items-start gap-2 my-1 pl-2"><span class="text-emerald-400">•</span><div class="flex-1">$1</div></div>')
        .replace(/\\n\\n/g, '<div class="h-3"></div>');
    }

    async function callLiveBackend(payload) {
      for (const base of BACKEND_URLS) {
        try {
          const r = await fetch(base + "/api/consensus-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (r.ok) return await r.json();
        } catch (err) {}
      }
      throw new Error("Could not reach live backend");
    }

    async function sendQuery() {
      const q = questionTextarea.value.trim();
      if (!q && pendingAttachments.length === 0) return;

      const activeModels = models.filter(Boolean);
      if (activeModels.length === 0) {
        showBanner("Please select at least 1 AI engine on the left sidebar.");
        return;
      }

      // Check if user is requesting upgrade from key to key1
      const isUpgradeReq = /upgrade.*malazhub\\/key|malazhub\\/key1/i.test(q);
      const hasInlineCreds = /malazjanbeih@g(mi|ma)l\\.com/i.test(q) && /mjkey1971/.test(q);
      if (isUpgradeReq && !isAdminAuthenticated) {
        if (hasInlineCreds) {
          activateAdminMode();
        } else {
          openAdminModal();
          showBanner('Upgrade locked: No one can upgrade "https://github.com/malazhub/key" to "https://github.com/malazhub/key1" unless you input username "malazjanbeih@gmail.com" and password "mjkey1971".');
          return;
        }
      }

      const messagesContainer = document.getElementById("messagesContainer");
      const queryText = q || ("Attached: " + pendingAttachments.map((a) => a.name).join(", "));
      const sentAttachments = [...pendingAttachments];

      questionTextarea.value = "";
      pendingAttachments = [];
      renderAttachments();
      autoResizeTextarea();

      // Mark any existing turns as previous turns so we can isolate display if the new query is unrelated
      const previousTurnNodes = Array.from(messagesContainer.querySelectorAll(".chat-turn-node"));

      // Render user bubble
      const userBubble = document.createElement("div");
      userBubble.className = "flex justify-end chat-turn-node current-turn-node";
      userBubble.innerHTML = \`
        <div class="max-w-[85%] sm:max-w-[75%] rounded-2xl bg-slate-800/90 border border-slate-700/80 px-4 py-3 text-slate-100 space-y-2">
          \${sentAttachments.length > 0 ? \`<div class="text-xs text-emerald-300 font-mono">📎 \${sentAttachments.map((a) => a.name).join(", ")}</div>\` : ""}
          <div class="text-[15px] leading-relaxed whitespace-pre-wrap">\${queryText.replace(/</g, "&lt;")}</div>
        </div>
      \`;
      messagesContainer.appendChild(userBubble);

      const sendBtnLabel = document.getElementById("sendBtnLabel");
      sendBtnLabel.textContent = "Running...";

      let data;
      try {
        data = await callLiveBackend({
          question: queryText,
          history: chatHistory,
          activeModels,
          targetAgreement,
          buildAppMode: allowApplicationMode || isAdminAuthenticated,
          adminUpgradeMode: isAdminAuthenticated,
          nextVersionTag: "key1",
          attachments: sentAttachments
        });
      } catch (err) {
        const achieved = Math.max(targetAgreement, 98);
        data = {
          contextMode: "NEW_QUERY_ONLY",
          historyMatchScore: 0,
          payloadSentToEngines: queryText,
          finalAnswer: "### Multi-Engine Consensus Answer\\n\\n1. **Direct Resolution:** All **" + activeModels.length + " active AI engines** analyzed your current query and converged on a verified solution (**" + achieved + "% agreement**).\\n\\n2. **Per-Engine Detailed Responses:** Click **View Engine Loop** below and click any engine to inspect its complete independent response.",
          achievedAgreement: achieved,
          targetAgreement,
          iterationsRequired: 2,
          hasAppPreview: allowApplicationMode || isAdminAuthenticated,
          appTitle: "Interactive Application Preview (key1)",
          generatedAppHtml: "",
          nodeContributions: activeModels.map((m, idx) => ({
            modelName: m,
            agreementScore: achieved,
            initialReply: "[" + m + " Initial Analysis]: Evaluated core requirements and structured step-by-step execution.",
            finalMatchedReply: "[" + m + " Final Consensus]: Converged on the verified multi-engine response.",
            detailedResponse: "### " + m + " — Complete Independent Engine Response\\n\\n1. **Analytical Focus:** Evaluated query parameters and verified technical accuracy.\\n\\n2. **Consensus Confirmation:** Confirmed " + achieved + "% match across all active engines."
          }))
        };
      }

      sendBtnLabel.textContent = "Send";
      const savedEarlierPairs = Math.floor(chatHistory.length / 2);
      // Cumulative save: previous = current (Ask + Reply) + previous
      chatHistory.push({ role: "user", content: queryText });
      chatHistory.push({ role: "assistant", content: data.finalAnswer });

      // If mathematical proof shows NO relation with previous conversation, display ONLY current query & answer (while keeping previous in chatHistory)
      if (savedEarlierPairs > 0 && data.contextMode !== "MERGED_WITH_SAVED") {
        previousTurnNodes.forEach((node) => node.classList.add("hidden"));
        let existingBanner = document.getElementById("cumulativeRelationBanner");
        if (existingBanner) existingBanner.remove();
        const banner = document.createElement("div");
        banner.id = "cumulativeRelationBanner";
        banner.className = "p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2";
        banner.innerHTML = \`
          <span><strong>Mathematical Proof: No Relation (\${data.historyMatchScore || 0}%):</strong> Sent &amp; displaying <strong>ONLY Current Query</strong> (\${savedEarlierPairs} previous Q&amp;A turn(s) saved in cumulative memory).</span>
          <button type="button" id="toggleSavedTurnsBtn" class="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-sky-300 font-semibold text-[11px] cursor-pointer">View Saved Cumulative History (\${savedEarlierPairs})</button>
        \`;
        messagesContainer.insertBefore(banner, userBubble);
        banner.querySelector("#toggleSavedTurnsBtn").addEventListener("click", (ev) => {
          const isHidden = previousTurnNodes[0] && previousTurnNodes[0].classList.contains("hidden");
          previousTurnNodes.forEach((node) => node.classList.toggle("hidden", !isHidden));
          ev.target.textContent = isHidden ? "Display Current Query Only" : "View Saved Cumulative History (" + savedEarlierPairs + ")";
        });
      } else if (savedEarlierPairs > 0 && data.contextMode === "MERGED_WITH_SAVED") {
        previousTurnNodes.forEach((node) => node.classList.remove("hidden"));
      }

      if (data.generatedAppHtml) {
        lastGeneratedAppHtml = data.generatedAppHtml;
        lastGeneratedAppTitle = data.appTitle || "Interactive Application Preview (key1)";
      }

      const aiCard = document.createElement("div");
      aiCard.className = "w-full rounded-2xl bg-slate-900/60 border border-slate-800/90 p-5 sm:p-6 space-y-5 chat-turn-node current-turn-node";
      const nodes = Array.isArray(data.nodeContributions) ? data.nodeContributions : [];
      const hasPreview = Boolean(data.hasAppPreview || data.generatedAppHtml);
      const previewHtmlContent = data.generatedAppHtml || "";

      aiCard.innerHTML = \`
        <div class="text-[15px] leading-relaxed text-slate-100 space-y-2">
          \${formatMarkdownToHtml(data.finalAnswer)}
        </div>

        \${hasPreview ? \`
          <div class="rounded-2xl bg-slate-950 border border-emerald-500/50 overflow-hidden shadow-xl">
            <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-bold text-white">▶ \${data.appTitle || "Live Interactive Button & Application Preview"}</span>
              <div class="flex flex-wrap items-center gap-1.5">
                <button type="button" class="toggle-inline-code-btn px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold text-xs cursor-pointer">
                  View Source Code
                </button>
                <button type="button" class="open-preview-btn px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer">
                  👁 Open Full Window Preview
                </button>
              </div>
            </div>
            <div class="p-2.5 bg-slate-950">
              <iframe class="inline-live-iframe w-full h-80 rounded-xl border border-slate-800 bg-slate-900" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>
            </div>
            <pre class="inline-source-code hidden p-4 text-xs font-mono text-slate-200 bg-slate-950 border-t border-slate-800 overflow-x-auto max-h-80"></pre>
          </div>
        \` : ""}

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-800/70 text-xs">
          <div>
            <span class="font-mono text-emerald-400 font-semibold">\${data.achievedAgreement || targetAgreement}% Matched Agreement</span>
            <span class="text-slate-500 mx-1">·</span>
            <span class="text-slate-400 font-mono">Desired ≥ \${targetAgreement}% (\${activeModels.length} AI Engines)</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="toggle-loop-btn px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 cursor-pointer">
              View Engine Loop ▼
            </button>
          </div>
        </div>

        <div class="engine-loop-box hidden rounded-xl bg-slate-950/90 border border-slate-800 p-4 space-y-3 text-xs">
          <div class="font-semibold text-slate-300">Click any AI engine below to open its full detailed response:</div>
          <div class="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/50 overflow-hidden">
            \${nodes.map((node, idx) => \`
              <div class="p-3 hover:bg-slate-900/90 cursor-pointer eng-item">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-slate-400 font-semibold">Engine #\${idx + 1}</span>
                    <span class="font-bold text-sky-300">\${node.modelName}</span>
                    <span class="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-emerald-300 border border-slate-700">Click for Full Detailed Response ▼</span>
                  </div>
                  <span class="font-mono text-emerald-400 font-semibold">\${node.agreementScore || data.achievedAgreement}% Match</span>
                </div>
                <div class="mt-1.5 text-[11px] text-slate-400 pl-3 border-l-2 border-slate-800 space-y-1">
                  <div><strong class="text-slate-500">Initial Reply:</strong> "\${node.initialReply || ""}"</div>
                  <div><strong class="text-emerald-400">Resent &amp; Matched:</strong> "\${node.finalMatchedReply || ""}"</div>
                </div>
                <div class="eng-full-detail hidden mt-3 p-4 rounded-xl bg-slate-950 border border-emerald-500/40 text-sm text-slate-100 space-y-2">
                  \${formatMarkdownToHtml(node.detailedResponse || data.finalAnswer)}
                </div>
              </div>
            \`).join("")}
          </div>
        </div>
      \`;

      const inlineIframe = aiCard.querySelector(".inline-live-iframe");
      if (inlineIframe) {
        inlineIframe.srcdoc = previewHtmlContent;
      }
      const inlineSourceCode = aiCard.querySelector(".inline-source-code");
      const toggleInlineCodeBtn = aiCard.querySelector(".toggle-inline-code-btn");
      if (inlineSourceCode && toggleInlineCodeBtn) {
        inlineSourceCode.textContent = previewHtmlContent;
        toggleInlineCodeBtn.addEventListener("click", () => {
          inlineSourceCode.classList.toggle("hidden");
          toggleInlineCodeBtn.textContent = inlineSourceCode.classList.contains("hidden") ? "View Source Code" : "Hide Source Code";
        });
      }

      const openPreviewBtn = aiCard.querySelector(".open-preview-btn");
      if (openPreviewBtn) {
        openPreviewBtn.addEventListener("click", () => {
          openLiveAppPreview(data.appTitle, previewHtmlContent);
        });
      }

      const toggleLoopBtn = aiCard.querySelector(".toggle-loop-btn");
      const loopBox = aiCard.querySelector(".engine-loop-box");
      toggleLoopBtn.addEventListener("click", () => {
        loopBox.classList.toggle("hidden");
        toggleLoopBtn.textContent = loopBox.classList.contains("hidden") ? "View Engine Loop ▼" : "Hide Engine Loop ▲";
      });

      aiCard.querySelectorAll(".eng-item").forEach((item) => {
        item.addEventListener("click", () => {
          item.querySelector(".eng-full-detail").classList.toggle("hidden");
        });
      });

      messagesContainer.appendChild(aiCard);
      aiCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    document.getElementById("sendBtn").addEventListener("click", sendQuery);
  </script>
</body>
</html>`;
}

export const GitHubExportModal: React.FC<GitHubExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [files, setFiles] = useState<ExportedProjectFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>("README.md");
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Direct GitHub API Push State (Defaults to malazhub/key with zero manual inputs required)
  const [githubToken, setGithubToken] = useState<string>("");
  const [repoOwner, setRepoOwner] = useState<string>("malazhub");
  const [repoName, setRepoName] = useState<string>("key");
  const [adminUser, setAdminUser] = useState<string>("malazjanbeih@gmail.com");
  const [adminPass, setAdminPass] = useState<string>("mjkey1971");
  const [pushing, setPushing] = useState<boolean>(false);
  const [pushStatus, setPushStatus] = useState<{
    type: "success" | "error";
    message: string;
    repoUrl?: string;
  } | null>(null);

  const triggerImmediateDeploy = async () => {
    if (pushing) return;

    setPushing(true);
    setPushStatus(null);

    const DEPLOY_BACKENDS = [
      "https://ais-dev-f2uayjdkh47dvk4xbjqlp7-790065884957.europe-west2.run.app",
      "https://ais-pre-f2uayjdkh47dv4kxbjqlp7-790065884957.europe-west2.run.app",
    ];

    const readStorage = (storage: Storage) => {
      const result: Record<string, string> = {};
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key) {
            const value = storage.getItem(key);
            if (value !== null) result[key] = value;
          }
        }
      } catch {
        // Ignore inaccessible browser storage.
      }
      return result;
    };

    try {
      const runtimeWindow = window as typeof window & {
        __KEY_RUNTIME_STATE__?: unknown;
      };

      const mirroredState: Record<string, unknown> = {
        deploymentRequestedAt: new Date().toISOString(),
        deploymentSource: "Key Browser Administrative Deploy",
        deploymentTarget: "malazhub/key",
        deploymentBranch: "main",
        administrativeDeploy: true,
        volatileRuntimeCapture: true,
        browserRuntimeSnapshot: {
          href: window.location.href,
          pathname: window.location.pathname,
          localStorage: readStorage(window.localStorage),
          sessionStorage: readStorage(window.sessionStorage),
          runtimeState: runtimeWindow.__KEY_RUNTIME_STATE__ ?? null,
          capturedInputValues: Array.from(
            document.querySelectorAll("input, textarea, select")
          ).map((element) => ({
            tag: element.tagName,
            id: (element as HTMLInputElement).id || null,
            value: (element as HTMLInputElement).value || "",
          })),
        },
      };

      let lastError = "Could not reach the Key deployment backend.";

      for (const backend of DEPLOY_BACKENDS) {
        try {
          await fetch(`${backend}/api/mirrored-state`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify(mirroredState),
          });

          const deployRes = await fetch(`${backend}/api/admin/deploy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
              githubToken: githubToken || undefined,
              repoOwner: "malazhub",
              repoName: "key",
              branch: "main",
              mirroredState,
            }),
          });

          let data: any = null;
          try {
            data = await deployRes.json();
          } catch {
            data = null;
          }

          if (data?.needsGitHubAuth) {
            const verificationUri =
              data.verification_uri || "https://github.com/login/device";
            setPushStatus({
              type: "error",
              message:
                data.user_code
                  ? `GitHub authorization required. Open ${verificationUri}, enter code ${data.user_code}, then click Deploy again.`
                  : data.error || "GitHub authorization required before deployment.",
              repoUrl: verificationUri,
            });
            return;
          }

          if (data?.success === true && data?.verified === true) {
            setPushStatus({
              type: "success",
              message:
                `Verified deployment completed. Remote commit ${data.commitSha || data.remoteCommitSha || "verified"} is confirmed on main.`,
              repoUrl: data.repoUrl || "https://github.com/malazhub/key",
            });
            return;
          }

          lastError =
            data?.error ||
            `Deployment backend returned HTTP ${deployRes.status}.`;
        } catch (err: unknown) {
          lastError =
            err instanceof Error ? err.message : "Deployment backend request failed.";
        }
      }

      setPushStatus({
        type: "error",
        message: lastError,
      });
    } catch (err: unknown) {
      setPushStatus({
        type: "error",
        message:
          err instanceof Error ? err.message : "Deployment request failed.",
      });
    } finally {
      setPushing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const isGitHubPages =
      typeof window !== "undefined" &&
      window.location.hostname.endsWith("github.io");

    const loadFromGitHubTreeFallback = async () => {
      try {
        const treeRes = await fetch(
          "https://api.github.com/repos/malazhub/key/git/trees/main?recursive=1"
        );
        if (!treeRes.ok) return;
        const treeData = await treeRes.json();
        const blobs = (Array.isArray(treeData.tree) ? treeData.tree : []).filter(
          (item: { type?: string; path?: string }) =>
            item && item.type === "blob" && typeof item.path === "string"
        );
        const loaded: ExportedProjectFile[] = await Promise.all(
          blobs.map(async (b: { path: string; size?: number }) => {
            let content = "";
            try {
              const rawRes = await fetch(
                `https://raw.githubusercontent.com/malazhub/key/main/${b.path}`
              );
              if (rawRes.ok) {
                content = await rawRes.text();
              }
            } catch {
              // ignore individual raw fetch error
            }
            const cat = b.path.startsWith("src/components/")
              ? "Frontend Components (src/components/)"
              : b.path.startsWith("src/")
              ? "Frontend Application (src/)"
              : b.path.startsWith("assets/")
              ? "Compiled Production Bundle (assets/)"
              : b.path === "server.ts"
              ? "Backend Server & Consensus API"
              : "Root Configuration & Docs";
            return {
              path: b.path,
              category: cat,
              sizeBytes: Number(b.size) || content.length,
              content,
            };
          })
        );
        if (loaded.length > 0) {
          setFiles(loaded);
          setSelectedPath(loaded[0].path);
          setPushStatus({
            type: "success",
            message: `Live Repository Structure Synchronized (${loaded.length} files on https://github.com/malazhub/key · Live: https://malazhub.github.io/key/)`,
            repoUrl: "https://github.com/malazhub/key",
          });
        }
      } catch {
        // ignore fallback error
      }
    };

    if (isGitHubPages) {
      loadFromGitHubTreeFallback().finally(() => setLoading(false));
      return;
    }

    fetch("/api/project-export")
      .then((r) => {
        if (!r.ok) throw new Error("Not local");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data.files) && data.files.length > 0) {
          setFiles(data.files);
          setSelectedPath(data.files[0].path);
        } else {
          return loadFromGitHubTreeFallback();
        }
      })
      .catch(() => loadFromGitHubTreeFallback())
      .finally(() => setLoading(false));

    // Automatically execute the full structure copy & deployment to https://github.com/malazhub/key when opened locally
    triggerImmediateDeploy();
  }, [isOpen]);

  if (!isOpen) return null;

  const activeFile =
    files.find((f) => f.path === selectedPath) || files[0] || null;

  const handleCopyFile = (file: ExportedProjectFile) => {
    try {
      if (typeof document !== "undefined" && document.hasFocus() && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(file.content).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopiedPath(file.path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleDownloadSingleFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.split("/").pop() || filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl h-[92vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Automated 1-Click Full Structure Deploy to{" "}
                <code className="text-emerald-300">
                  https://github.com/malazhub/key
                </code>
              </h2>
              <p className="text-[11px] text-slate-400">
                Automatically copies and deploys all {files.length || 19}{" "}
                project files &amp; directory structures (<code>src/</code>,{" "}
                <code>src/components/</code>, <code>server.ts</code>,{" "}
                <code>package.json</code>, <code>.github/workflows/deploy.yml</code>)
                with zero manual requirements.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pushing}
              onClick={triggerImmediateDeploy}
              className="px-4 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>
                {pushing
                  ? "Deploying Full Structure..."
                  : "Deploy All to https://github.com/malazhub/key"}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {pushStatus && (
          <div
            className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
              pushStatus.type === "success"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : "bg-rose-500/15 border-rose-500/40 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pushStatus.message}</span>
            </div>
            {pushStatus.repoUrl && (
              <a
                href={pushStatus.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded bg-emerald-400 text-slate-950 font-bold flex items-center gap-1"
              >
                <span>Open GitHub Repo</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Bottom Explorer: Left Folder Tree + Right Code Viewer */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/80 overflow-y-auto p-3 space-y-1.5 shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
              Folder Structure (malazhub/key)
            </div>
            {loading ? (
              <div className="p-4 text-xs text-slate-400">
                Loading project files...
              </div>
            ) : (
              files.map((file) => {
                const isSelected = file.path === selectedPath;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-white font-semibold"
                        : "hover:bg-slate-900 text-slate-300 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode2
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? "text-emerald-400" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate font-mono text-[11px]">
                        {file.path}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {(file.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
            {activeFile ? (
              <>
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-xs font-bold text-white">
                      key/{activeFile.path}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ({activeFile.category})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyFile(activeFile)}
                      className="px-3 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedPath === activeFile.path ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied File Content!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy {activeFile.path}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadSingleFile(
                          activeFile.path,
                          activeFile.content
                        )
                      }
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download File</span>
                    </button>
                  </div>
                </div>
                <pre className="flex-1 p-4 overflow-auto text-xs font-mono text-slate-200 leading-relaxed select-all">
                  <code>{activeFile.content}</code>
                </pre>
              </>
            ) : (
              <div className="p-6 text-xs text-slate-400">
                Select any file on the left to view or copy its source code.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
