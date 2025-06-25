
# Notention

A streamlined, powerful notebook app integrating language model (LM) capabilities via LangChain.js, emphasizing simplicity, reliability, and elegant design. The app leverages Tool Use and Multi-Context Prompting (MCP) as core drivers of functionality, operates as an offline-first Progressive Web App (PWA), and incorporates Nostr for private/public communication. Minimalism maximizes impact while reducing complexity.

## Functional Requirements

### 1. Core Notebook
- **Markdown Editor**: Lightweight markdown-based note-taking with real-time preview (headings, lists, code blocks).
- **Flat Structure**: Single notebook with pages, searchable via full-text and tags.
- **Offline Storage**: Persist notes in IndexedDB for seamless offline access.
- **Export**: Save notes as markdown or JSON; no import to keep simplicity.

### 2. LM Integration (Tool Use & MCP Driven)
- **LangChain.js Core**:
  - Connect to LM APIs (e.g., OpenAI, Anthropic) via API keys.
  - Use Tool Use for dynamic interactions (e.g., web search, math solvers, code execution).
  - MCP orchestrates complex tasks (e.g., combining note summarization, code generation, and explanation in one prompt).
- **Streaming**: Stream LM responses for instant feedback, with a stop button.
- **Token Counting**: Display input/output token counts per interaction; warn on high usage.
- **Minimal UI**: Single prompt input with streaming output below the editor, triggered by a hotkey (e.g., `Ctrl+Enter`).

### 3. Configuration
- **Single Settings Page**:
  - Markdown-based page ("Settings") with form-like syntax for:
    - LM API key and model choice.
    - Nostr relay URL and key pair.
    - Theme toggle (light/dark).
  - Persist in IndexedDB; editable as markdown for simplicity.
- **Hot Reload**: Apply changes instantly without app restart.

### 4. Nostr Integration
- **Lightweight Communication**:
  - Share notes or LM outputs as Nostr events (public or private via NIP-04 encryption).
  - Generate/import Nostr key pairs; connect to one user-specified relay.
- **UI**: "Share" button on notes with public/private toggle.
- **Contacts**: User `Profiles` smoothly integrated as special Notes

### 5. PWA & Offline
- **Offline-First PWA**:
  - Installable, with service worker caching for assets and notes.
  - IndexedDB for notes, settings, and cached LM responses.
- **No Offline LM**: Rely on API connectivity; cache last 10 responses for offline viewing.
- **Sync**: Auto-sync notes when online; no server required.

### 6. UI
- **Minimalist Design**:
  - Single-column layout: markdown editor at top, LM output below.
  - Sidebar for page list and search.
  - Settings as a special page in the sidebar.
- **Responsive**: Mobile and desktop support with fluid scaling.
- **Hotkeys**: `Ctrl+S` for save, `Ctrl+Enter` for LM prompt, `Ctrl+T` for new page.

## Non-Functional Requirements

### 1. Performance
- **Load Time**: <1 second on modern devices.
- **Streaming Latency**: First token <100ms when online.
- **Storage**: Cap at 500MB for notes and cache.

### 2. Security
- **Encryption**: Use Web Crypto API for API keys and Nostr private keys in IndexedDB.
- **Sanitization**: Strip HTML from markdown to prevent XSS.
- **Nostr**: Validate relay URLs; use NIP-04 for private messages.

### 3. Reliability
- **Error Recovery**: Handle API/network failures with clear user feedback.
- **Data Safety**: Auto-save notes every 5 seconds; local backups on export.
- **PWA Stability**: Test offline mode rigorously.

### 4. Elegance
- **Tool Use & MCP**: Drive all advanced features (e.g., summarization, code gen) via LangChain.js tools and MCP, reducing custom logic.
- **Minimal Codebase**: Avoid feature bloat; prioritize reusable components.

## Technical Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS.
- **Editor**: SimpleMDE (markdown) for lightweight editing.
- **Storage**: Dexie.js (IndexedDB wrapper).
- **LM**: LangChain.js for Tool Use and MCP.  Prioritize `Google Gemini` and `Ollama` (localhost)
- **Nostr**: nostr-tools (minimal implementation). Latest version: Follow the example code from its github's README
- **PWA**: Workbox for caching.
- **Utilities**: date-fns, sanitize-html.

## Deployment
- **Static Hosting**: Vercel or Netlify for client-side PWA.
- **No Server**: Fully client-side to eliminate maintenance.
- **PWA Setup**: Basic manifest.json and service worker for installability.

## Risks & Mitigations
- **API Dependency**: Cache responses; guide users to configure multiple APIs.
- **Nostr Relay Failure**: Allow relay switching in settings.
- **Complexity Creep**: Enforce minimalism via MCP-driven features.

## Code Guidelines / Conventions
- Complete (fully functional)
- Professional-grade, not explanatory/educational
- Correct (bug-free and logically sound)
- Compact (minimal codebase size)
    - Using space-saving syntax constructs, like ternary/switch/etc..., to minimize lines and tokens
    - Using the latest language version's syntax options to best express code
- Consolidated (avoids unnecessary separation)
- Deduplicated (no redundant logic)
    - Introduce helpful abstractions functions, parameters, and classes to share common code
    - Apply "don't repeat yourself" principles
- Modular (logically organized, supporting abstraction, OOP principles)
- Remove all comments, relying only on self-documenting code
    - Clear naming and structure
- Use the latest version of the language, APIs, and dependencies
