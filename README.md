# Key — Multi-AI Consensus Engine (`malazhub/key`)

### 🌐 Live Application Entry Point (Click to Open AI Key):
# 👉 [**https://malazhub.github.io/key/**](https://malazhub.github.io/key/)

A full-stack **Multi-AI Consensus Engine** that coordinates **10 simultaneous AI Engines** (`ChatGPT 4o`, `Claude 3.5 Sonnet`, `DeepSeek V3`, `Gemini 2.5`, `Qwen 2.5`, `Llama 3.3 70B`, `Grok 2`, `Mistral Large 2`, `Perplexity Pro`, `Command R+`) with **Persistent Contextual Routing (PCR)**, **Full-History Vector Indexing**, and **Global State Sync** until reaching your target agreement threshold (default **≥ 95%**).

---

## 🔗 Direct Links

- **Live Multi-AI Consensus Engine (GitHub Pages):** [https://malazhub.github.io/key/](https://malazhub.github.io/key/)
- **Primary GitHub Repository:** [https://github.com/malazhub/key](https://github.com/malazhub/key)
- **GitHub Actions & Deployment Status:** [https://github.com/malazhub/key/actions](https://github.com/malazhub/key/actions)

---

## 📁 Complete Project Folder Structure (`malazhub/key`)

```text
key/
├── index.html                          # Production GitHub Pages Entry Point (https://malazhub.github.io/key/)
├── index.vite.html                     # Vite development HTML entry point
├── assets/                             # Compiled production JavaScript & CSS bundle for GitHub Pages
├── .nojekyll                           # Ensures GitHub Pages serves all static assets immediately
├── package.json                        # Dependencies and start/build scripts
├── server.ts                           # Express + Vite full-stack server, PCR, Live Mirror Sync & Direct GitHub Force-Deploy API
├── tsconfig.json                       # TypeScript configuration
├── vite.config.ts                      # Vite bundler configuration
├── metadata.json                       # Application metadata & capabilities manifest
├── .env.example                        # Environment variables template (GEMINI_API_KEY, GITHUB_TOKEN)
├── .gitignore                          # Git ignore rules
├── admin_versions_db.json              # Primary repository version ledger (malazhub/key)
├── cloud_users_db.json                 # Cloud user threads & quota storage ledger
├── firebase-applet-config.json         # Firebase project configuration
├── firebase-blueprint.json             # Firebase database schema blueprint
├── firestore.rules                     # Firestore database security rules
├── README.md                           # Direct link to https://malazhub.github.io/key/ & setup guide
└── src/
    ├── main.tsx                        # React DOM entry point
    ├── App.tsx                         # Main Key Multi-AI Consensus UI, 10-Engine Selector, Memory & Admin Deploy
    ├── consensusEngine.ts              # Shared 10-Engine Consensus Kernel, Strict Query Priority & Self-Upgrade Engine
    ├── searchAndEnginePushRouter.ts    # Live Web Search Grounding, 5-Channel Memory Search & 10-Engine Query Push Router
    ├── mirroredKeyState.json           # Live 1:1 Mirrored Workspace State Snapshot (UI, Engines, Target % & Threads)
    ├── selfUpgradeRegistry.json        # Autonomous Self-Upgrade Version & Verification Gate Registry
    ├── index.css                       # Tailwind CSS v4 global stylesheet
    ├── firebase.ts                     # Firebase Auth & Firestore client initialization
    ├── upgrades/
    │   └── activeSelfUpgradeModule.ts  # Active Autonomous Self-Upgrade Manifest
    └── components/
        ├── MarkdownRenderer.tsx        # Structured Markdown + Interactive Portal Controller
        ├── GitHubExportModal.tsx       # Direct GitHub Repository Force-Push & File Inspector
        └── SemanticHistoryGraph.tsx    # Interactive Semantic History & Vector Relation Graph
```

---

## 🚀 How to Open & Run AI Key

### 1. Open Directly from GitHub Pages (Zero Setup)
Click the primary link below on any desktop or mobile browser to launch the **Key Multi-AI Consensus Engine**:
👉 **[https://malazhub.github.io/key/](https://malazhub.github.io/key/)**

### 2. Run Full-Stack Locally (Node.js)
```bash
git clone https://github.com/malazhub/key.git
cd key
npm install
npm run dev
```
Then open `http://localhost:3000` in your browser.


## KEY Maestro Architecture

KEY is the maestro/orchestrator. External AI engines are workers that provide knowledge,
reasoning, research, coding, analysis, and alternative solutions. KEY's permanent core is
the orchestration and upgrade methodology rather than a conventional internal knowledge database.

### Explicit modes

- **NORMAL** — solve tasks; no permanent KeyLogic mutation.
- **LEARN** — analyze and extract principles; no permanent KeyLogic mutation.
- **UPGRADE** — one explicit, finite upgrade transaction may produce one candidate version.
- **SLEEP** — no upgrade activity.

### Declarative upgrade transaction

`src/upgrades/upgradeTransaction.ts` implements the transaction boundary. Candidate KeyLogic
is schema-validated and may use only the trusted strategies:

- `PARALLEL_DELEGATION`
- `SEQUENTIAL_CHAIN`
- `CONSENSUS_VOTE`

Executable JavaScript/TypeScript is not accepted as candidate logic.

Before activation, the candidate is tested against the current capability suite. If a capability
that previously passed now fails, the candidate is saved as an immutable inactive version and
administrator decision is required. Otherwise the version is atomically activated. Previous
versions remain immutable for rollback, and there is no artificial lifetime upgrade count.

### Bounded self-upgrade controller

The self-upgrade execution path now has an isolated, finite-round controller in
\`src/upgrades/selfUpgradeController.ts\`. An administrator can submit a finite number of
rounds (1–50) with one explicit candidate per round. Each candidate is copied into an isolated
session/round workspace, then \`npm run lint\` and \`npm run build\` must pass before the next
round is allowed.

When deployment is requested, the controller calls the existing verified GitHub deployment
routine. A round is considered deployed only when that routine returns \`verified: true\`; failed
deployment restores the files changed by that round. Session state is persisted under the upgrade
workspace so completed rounds and the hard stop are explicit rather than an unbounded recursive loop.

The existing legacy self-upgrade endpoint behavior is preserved when no candidate list is supplied;
the new controller is additive and does not replace that path.

### Deployment integrity

The GitHub deployment routine now treats build/staging failures as hard failures and does not
report a local commit SHA as a remote GitHub commit. After deployment it verifies the remote branch
commit, remote tree, exact intended file set, and Git blob SHA for every deployed file before
returning `success: true`.
