# Multi-Source AI Learning Assistant

A web-based AI-powered learning chatbot that accepts multiple knowledge sources (PDF files, PowerPoint presentations, YouTube URLs, and Web Page articles), processes them into a grounded retrieval index, and allows students to ask questions, read auto-generated summaries, and take interactive multiple-choice quizzes based on their loaded materials.

---

## 1. Architectural Design & Decisions

### 1.1 Backend Architecture (FastAPI & RAG Pipeline)
* **Framework**: Built with **FastAPI** to support high-performance asynchronous execution, automatic request/response schema validation via Pydantic, and automatic OpenAPI documentation.
* **Retrieval-Augmented Generation (RAG)**:
  * **Embeddings**: Uses Google's `gemini-embedding-001` to generate 768-dimensional dense vectors representing text semantic segments.
  * **Vector Database**: Leverages **Supabase (PostgreSQL with `pgvector`)** to store chunk embeddings. Similarity searches are executed using a PostgreSQL SQL function (`match_documents`) executing Cosine Similarity.
  * **Context Retrieval & Session Isolation**: Every uploaded document chunk is tagged with a `session_id`. RAG queries execute vector similarity searches strictly matching this `session_id`, ensuring absolute data isolation between different workspaces.
  * **Streaming Engine**: Uses LangChain's asynchronous `.astream()` implementation to deliver token-by-token response streams via **Server-Sent Events (SSE)**.

### 1.2 Frontend Architecture (React, Vite & Global Context)
* **Build Engine & UI**: Built using **React + Vite** for fast HMR (Hot Module Replacement) and packaged using **Tailwind CSS v3** with a premium, responsive dark glassmorphism theme.
* **Global State Manager (`AppContext.jsx`)**:
  * Acts as a global state machine maintaining workspace sessions, active document listings, and conversation logs.
  * Synchronizes workspace configurations automatically to `localStorage` so that data is preserved across page reloads.
  * Operates a browser stream reader that listens to the SSE stream, parsing data fragments into citation tags, token texts, or stream errors on the fly.
* **Responsive Shell Layout**:
  * Utilizes flex grid allocations for clean vertical scrolling.
  * Automatically transitions the left navigation sidebar and right upload panel into slide-in drawer overlays on mobile and tablet screens.

---

## 2. Environment Variables & Configuration

The application requires a `.env` file located in the `backend/` directory with the following variables:

```ini
# Google Gemini API Credentials
GOOGLE_API_KEY=your_gemini_api_key_here

# Supabase Credentials & Settings
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key

# (Optional) Production CORS allowed origins (comma-separated URLs)
CORS_ALLOWED_ORIGINS=https://my-frontend.vercel.app,https://another-domain.com
```

* **`GOOGLE_API_KEY`**: Authenticates requests to Google GenAI SDK and LangChain ChatGoogleGenerativeAI (`gemini-2.5-flash` and `gemini-embedding-001`).
* **`SUPABASE_URL` & `SUPABASE_SERVICE_KEY`**: Used to communicate with the vector database to store chunks and execute the `match_documents` similarity search RPC.
* **`CORS_ALLOWED_ORIGINS`**: (Optional) Comma-separated list of deployed frontend URLs to whitelist on the backend to avoid browser CORS policy blocking in production. Defaults to localhost domains if omitted.

---

## 3. Setup & Installation Instructions

### Prerequisites
* Python 3.10 or higher
* Node.js 18 or higher (with npm)

### 3.1 Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows (Command Prompt/PowerShell):
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables in `backend/.env`.
5. Start the backend development server:
   ```bash
   uvicorn app.main:app --port 8000 --reload
   ```

### 3.2 Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install node packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   # Or expose it on the local network:
   npx vite --host
   ```
4. Access the application in your web browser at `http://localhost:5173/`.

---

## 4. Technical Challenges & Graceful Resolutions

During development, we encountered several roadblocks. Below is a summary of where we got stuck, why it happened, and how we solved it:

### Challenge 1: Web Page Extraction Noise & Scraping Blocks
* **Problem**: Arbitrary web URLs often contain noise (headers, footer links, cookie warnings, sidebars) that pollutes vector embeddings. Additionally, some sites block basic crawlers.
* **Resolution**: We integrated `trafilatura` as our primary extractor to strip boilerplate layouts and extract clean structural Markdown content. For cases where `trafilatura` fails or returns empty text, we wrote an asynchronous fallback scraper using `httpx` (configured with human-like user agent headers) and `BeautifulSoup` + `lxml` to target specific reading elements (`h1`, `h2`, `h3`, `p`, `li`, `blockquote`).

### Challenge 2: Multilingual Captions & YouTube Cloud IP Block (RequestBlocked)
* **Problem**: 
  1. Attempting to fetch English transcripts failed when a video only had Hindi, Spanish, or auto-generated captions.
  2. In the deployed environment (Render), YouTube actively blocks requests originating from cloud provider IP addresses, raising a `RequestBlocked` exception.
* **Resolution**: 
  1. We refactored the extraction helper in `extractors.py` to fetch the transcript list and fall back to the first available caption language (e.g. auto-generated Hindi) if English is unavailable.
  2. For the cloud IP block, we implemented specific exception logging to surface the `RequestBlocked` message. While proxies or cookies can bypass this, we document this as a hosting platform constraint. YouTube transcript extraction remains fully functional when run locally using a standard residential/office ISP connection.

### Challenge 3: Gemini 429 API Key Resource Exhaustion
* **Problem**: Rapidly processing files, generating summaries, and streaming chats caused Gemini API limits to trigger HTTP `429 Resource Exhausted` errors, disrupting user sessions.
* **Resolution**:
  1. We integrated **`slowapi`** (IP-based rate limiter) on the FastAPI backend, restricting `/chat`, `/chat/stream`, `/process`, and `/quiz` endpoints to at most **5 requests per minute** to protect API quotas.
  2. We implemented exception handlers to catch `RateLimitExceeded` and return an HTTP `429` status code.
  3. The frontend displays custom, user-friendly error banners with recommendations to wait.

### Challenge 4: Browser UUID Generation in Local Network Contexts
* **Problem**: When exposing the Vite server over the local network (`--host`) for mobile testing, browsers automatically disabled the Web Cryptography API (`crypto.randomUUID()`) because the local IP address was accessed over insecure HTTP. This caused frontend app crashes.
* **Resolution**: We coded a secure browser context fallback UUID generator in `AppContext.jsx`. It checks if `window.crypto.randomUUID` is defined, and if not, gracefully falls back to a math-based pseudorandom identifier generator, preventing app crashes on mobile devices.

### Challenge 5: Gemini Markdown Code Block Wrapping JSON Responses
* **Problem**: When generating structured MCQ quizzes, Gemini would wrap its JSON payload in markdown formatting blocks (e.g., ` ```json ... ``` `). Running standard `json.loads()` on this raw output caused JSON parsing errors.
* **Resolution**: We added a regex cleaning utility using `re.sub` in `llm.py` to strip out start/end markdown fences before running `json.loads()`. Additionally, we added robust schema checks to verify that the generated data structure conforms to our expectations before responding.

---

## 5. Popular General RAG Challenges & Solutions

Beyond our specific roadblocks, developers building RAG-based systems commonly encounter these structural challenges:

### 1. Document Chunking Strategies vs. Semantic Context Loss
* **Challenge**: Dividing documents into arbitrary segments (e.g., character-based slicing) can slice sentences in half, separate key nouns from their pronouns, or orphan rows in table datasets.
* **General Solution**: Implementing recursive text splitters (with overlap margins) or structure-aware semantic chunkers that split text exclusively on paragraph or sentence bounds.

### 2. PDF Column & Complex Layout Parsing
* **Challenge**: Multi-column research articles, sidebars, or headers/footers parsed by basic readers (e.g., left-to-right text scrapers) merge horizontal lines across column gutters, rendering the extracted text incomprehensible.
* **General Solution**: Integrating bounding-box layout parsing engines (like `PyMuPDF` or layout-aware OCR services) to segment text into correct reading orders before chunking.

### 3. Vector Similarity Search Limitations
* **Challenge**: Dense vector similarity search (e.g., Cosine Similarity) maps conceptual meaning but struggles with exact matching, such as searching for exact serial numbers, model acronyms, or product IDs.
* **General Solution**: Deploying a **Hybrid Search** index that merges vector similarity scores with exact lexical matches (e.g., BM25 keyword matching) in the database.

### 4. Retrieval Bias Toward Large Documents
* **Challenge**: In a mixed workspace, long documents produce significantly more chunks than brief notes, often leading the vector store to return search results populated entirely by chunks from a single long document.
* **General Solution**: Implementing **Maximal Marginal Relevance (MMR)** or deploying pre-retrieval filters to ensure retrieved chunks are gathered from a diverse set of document sources.

### 5. Chat History Token Overflow
* **Challenge**: Appending the complete historical message log along with newly retrieved chunks to the LLM prompt can quickly exceed the model's max token context window, leading to API failures or massive token bills.
* **General Solution**: Capping active conversational history to the last few turns (as done in our RAG prompt logic) or running summarizing micro-agents to compress older chat history dynamically.

