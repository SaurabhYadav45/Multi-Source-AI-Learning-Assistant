# Frontend Architecture & Module Outline

This document provides a detailed overview of the frontend design, structure, and features of the **Multi-Source AI Learning Assistant**.

---

## 1. Project Directory Structure
The frontend codebase is built with React and Vite, styled using Tailwind CSS v3, and organized as follows:

```text
frontend/
├── public/                 # Static assets
├── src/
│   ├── components/
│   │   ├── ChatWindow.jsx  # Grounded chat logs & interactive MCQ Quiz Panel
│   │   ├── IngestionPanel.jsx # Source tabs, upload forms, and summary cards
│   │   └── Sidebar.jsx     # Workspace session lists, renaming & deletion
│   ├── context/
│   │   └── AppContext.jsx  # Context Provider for global state, SSE & API calls
│   ├── App.jsx             # Main layout, responsive drawers & app container
│   ├── main.jsx            # React root injection point
│   └── index.css           # Custom styles, glassmorphism utilities & animations
├── package.json            # Scripts and dependencies
├── tailwind.config.js      # Custom animations, transitions and theme configuration
└── vite.config.js          # Vite plugins and dev server settings
```

---

## 2. Global State & API Handler (`context/AppContext.jsx`)
Acts as the central nervous system of the client, providing global state properties and helper methods using React's Context API.

* **State Synchronization (`localStorage`)**:
  * Automatically loads and syncs active sessions (names, uploaded sources, message histories) and the active session ID to `localStorage` to preserve work across page reloads.
* **Workspace Management Action Hooks**:
  * `createNewSession(name)`: Generates a new unique UUID and workspace log.
  * `renameSession(id, newName)`: Modifies a session's label.
  * `removeSession(id)`: Invokes the backend cleanup API (`DELETE /api/sessions/{id}`) to purge vector chunks, then updates state.
* **Source Ingestion Hooks**:
  * `uploadSource(sourceType, payload)`: Prepares form-data boundaries, hits `/api/process`, and appends the source name, type, date, and Gemini-generated short summary into the session source list.
  * `deleteSource(sourceName)`: Purges the source's vector embeddings from the backend and filters it out of the local source state.
* **Server-Sent Events (SSE) Chat Stream (`sendChatMessage`)**:
  * Establishes a POST stream connection with `/api/chat/stream`.
  * Reads stream bytes incrementally via `TextDecoder` and splits the buffer by newlines (`\n`).
  * Parses SSE lines (prefixed with `data: `):
    * **Citations event**: Renders matching citation badges.
    * **Token event**: Appends token fragments sequentially.
    * **Error event**: Renders error messages.
* **Quiz Retrieval Hook**:
  * `fetchQuiz(sessionId)`: Triggers `/api/sessions/{session_id}/quiz` to retrieve the auto-generated MCQ array.

---

## 3. Workspace Navigation Sidebar (`components/Sidebar.jsx`)
Renders the workspace selection list on the left side of the dashboard.

* **Workspace List Operations**:
  * Single-click switches the active workspace session.
  * Double-clicking or clicking the edit icon opens an inline text box to rename the session.
  * Clicking the trash icon prompts to confirm and delete the workspace.
* **Responsive Drawer Integration**:
  * Integrates drawer close handlers (`onClose`) to automatically slide shut when switching sessions on mobile devices.

---

## 4. Content Ingestion Dashboard (`components/IngestionPanel.jsx`)
Handles document uploads and displays the list of learning materials on the right side of the dashboard.

* **Multi-Source Tabs**:
  * Tab selectors for **PDF**, **PPTX**, **YouTube**, and **Web Page**.
* **Upload Fields**:
  * Drag-and-drop or select file selectors for `.pdf` and `.pptx` uploads.
  * Text input box for YouTube video links and article web URLs.
  * Progress loaders with spinner icons indicate when a document is uploading and embedding.
* **Ingested Materials Checklist**:
  * Lists uploaded files and links, resolving matching file icons (e.g. green globe for web pages, red play icon for YouTube).
  * **Short Summaries**: Shows a Gemini-generated summary under the file name badge, prefixed with `Summary:`.
  * Hovering over the word `Summary:` displays the original filename as a tooltip.
  * Includes a granular delete trash icon next to each source to remove its vector data.

---

## 5. Grounded Chat & Quiz Window (`components/ChatWindow.jsx`)
The main interactive center of the screen, supporting two distinct view modes: **Chat Mode** and **Quiz Mode**.

### 5.1 Chat Mode
* **Chat Logs**: Renders user messages and assistant responses.
* **Typing Indicator**: Shows an animated bouncing typing bubble when streaming a response.
* **Auto-Scrolling**: Utilizes `scrollboxRef` to smoothly scroll to the bottom when messages update or streaming text appends.
* **Grounded Citations**: Displays reference cards below assistant messages showing matching document sources, page numbers, slide indexes, or video timestamps.
* **Quick Helper Prompt Chips**: Prompts to quickly click and evaluate textbook concepts.

### 5.2 Quiz Mode
* **MCQ Quiz Interface**: Auto-loads a 5-question multiple-choice quiz based on active workspace documents.
* **Live Score & Progress Bar**: Tracks the current question index and correct answers.
* **Live Correctness Verification**: 
  * Displays choices as hover-glow buttons.
  * Shows a colored border (Green for correct, Red for incorrect selection) upon answer submission.
* **Explanation block**: Instantly displays a detailed explanation below the choices explaining the reasoning.
* **Quiz Results Dashboard**: Displays a congratulations screen showing final scores with controls to retake the quiz or return to chat.

---

## 6. Layout Shell & Mobile Drawer Controllers (`App.jsx`)
Defines the main grid container and responsive drawer overlays.

* **Layout Configurations**:
  * **Desktop**: Side-by-side flex layout (Sidebar + Chat Window + Ingestion Panel).
  * **Mobile/Tablet**: The Chat Window occupies 100% of the screen. Sidebar (Menu) and Ingestion Panel (Library) slide in from the left and right as drawers when triggered.
* **Event Handlers**:
  * Leverages a `useEffect` hook listening to `activeSessionId` to automatically close all slide-out drawers on workspace switches.

---

## 7. Custom Styling & Theme System (`index.css` & `tailwind.config.js`)
Builds a premium dark glassmorphism aesthetic.

* **Theme Design System**:
  * Background: A dark gradient mesh backed by a deep radial gradient.
  * Panels: Semitransparent backgrounds with subtle white borders (`glass` / `glass-card`).
  * Text: High-contrast white and muted slate text.
* **Visual Effects**:
  * Bouncing keyframe animations for the streaming message loader.
  * Hover-glow shadows and transitions for interactive choices.
