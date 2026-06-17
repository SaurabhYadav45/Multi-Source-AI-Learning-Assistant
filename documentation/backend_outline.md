# Backend Architecture & Module Outline

This document provides a detailed overview of the backend design, structure, and features of the **Multi-Source AI Learning Assistant**.

---

## 1. Project Directory Structure
The backend codebase is structured using a standard modular FastAPI layout:

```text
backend/
├── app/
│   ├── api/
│   │   ├── chat.py          # Chat & streaming API routes
│   │   └── file_upload.py   # Ingestion, processing & deletion API routes
│   ├── services/
│   │   ├── extractors.py    # Multi-source text extraction adapters
│   │   ├── llm.py           # Gemini RAG pipeline & streaming generator
│   │   └── vector_store.py  # Chunking, embedding & Supabase storage
│   ├── main.py              # Application configuration & startup entry point
│   └── schemas.py           # Pydantic request & response validation contracts
├── requirements.txt         # Core dependencies
└── .env                     # App configuration & credentials
```

---

## 2. Main Entry Point (`main.py`)
Configures and initializes the FastAPI application instance.

* **Startup & Configuration**:
  * Loads environment variables from the `.env` file.
  * Mounts the FastAPI application with metadata (title, description, and version).
* **Cross-Origin Resource Sharing (CORS)**:
  * Restricts/permits origins like `http://localhost:5173` (Vite) and `http://localhost:3000` (React) to allow secure communication with the frontend.
* **Router Registration**:
  * Registers routers from `app/api/file_upload.py` under the `/api` prefix.
  * Registers routers from `app/api/chat.py` under the `/api` prefix.

---

## 3. Data Validation Contracts (`schemas.py`)
Defines strict Pydantic model schemas for request validation and response contracts.

* **`ChatRequest`**:
  * `session_id`: Unique identifier to isolate and separate user workspace contexts.
  * `message`: The query or question from the student.
  * `history`: A list of dictionaries preserving previous conversation turns (`role` and `content`) to maintain AI short-term memory.
* **`Citation`**:
  * Models structural citations including source type (`pdf`, `pptx`, `youtube`, `web`), document identifier (`source`), and location markers (`page`, `slide`, or `timestamp`).
* **`ChatResponse`**:
  * A standard output wrapper enclosing status, the AI's generated response, and list of grounding references (`citations`).

---

## 4. Extractors Service (`services/extractors.py`)
Contains adapter functions to read and parse learning materials from diverse document formats and protocols.

### Sub-Functionalities:
1. **PDF Extractor (`extract_text_from_pdf`)**:
   * Reads raw file bytes using `pypdf.PdfReader`.
   * Processes the document page-by-page, removing line breaks.
   * Packages text along with page numbers and filename markers in the metadata.
2. **PPTX Extractor (`extract_text_from_pptx`)**:
   * Reads raw bytes using `python-pptx` representation.
   * Traverses slide elements, extracts shape texts, and joins paragraph lines.
   * Returns slide numbers and filenames in citation metadata.
3. **YouTube Transcript Extractor (`extract_text_from_youtube`)**:
   * Extracts the 11-character Video ID from full URLs.
   * Fetches transcripts via `youtube-transcript-api` (run in a thread executor to prevent blocking FastAPI's async event loop).
   * Group transcripts into small temporal chunks, formatting the start time into `MM:SS` markers.
4. **Web Web Scraper (`extract_text_from_web`)**:
   * Validates target HTTP/HTTPS schemes and calls the URL using `httpx.AsyncClient`.
   * Leverages `trafilatura` to extract the main structural body text, discarding boilerplates like navigation bars and footers.
   * Employs `BeautifulSoup` (with `lxml`) as a fallback parser to scrape basic paragraph and list text.

---

## 5. Vector Store Service (`services/vector_store.py`)
Handles data chunking, generating embeddings, and storing them in Supabase.

### Sub-Functionalities:
1. **Chunking Engine**:
   * Receives clean text from extractors and splits them using LangChain's `RecursiveCharacterTextSplitter`.
   * Configured with a `chunk_size` of 1000 characters and a `chunk_overlap` of 100 characters to keep context clean.
2. **Embedding Generator**:
   * Generates dense vectors using Google GenAI SDK's `gemini-embedding-001` model.
   * Batch-processes embeddings in chunks of 50 to optimize network roundtrips.
3. **Supabase Vector Writer**:
   * Inserts chunks, embeddings, metadata, and the isolating `session_id` into the `document_chunks` table.
   * Inserts records in batches of 100 to balance Supabase database performance limits.

---

## 6. Large Language Model Service (`services/llm.py`)
Core retrieval-augmented generation (RAG) engine connecting vector search results to Gemini for answer formulation.

### Sub-Functionalities:
1. **Vector Search Query Retrieval (`retrieve_relevant_chunks`)**:
   * Embeds student queries using `gemini-embedding-001`.
   * Queries Supabase via SQL RPC `match_documents`, passing the search vector, a similarity threshold, count, and the `session_id` to ensure strict session isolation.
2. **Grounded Answer Generator (`generate_rag_response`)**:
   * Searches relevant documents, aggregates content fragments into a grounded prompt context, and formats chat history.
   * Requests a response from `gemini-2.5-flash` under strict instructions to only use the provided context.
3. **Response Streaming Engine (`generate_rag_response_stream`)**:
   * Retrieves context chunks, dedupes them, and immediately yields citation metadata: `{"type": "citations", "citations": [...]}`.
   * Begins asynchronous streaming from the LangChain `ChatGoogleGenerativeAI` model using `.astream()`, yielding tokens in real-time.

---

## 7. Ingestion & Deletion Router (`api/file_upload.py`)
Exposes HTTP endpoints to add, retrieve, and delete learning materials.

### API Routes:
* **`POST /api/process`**:
  * Unified ingestion router. Validates file types and inputs.
  * Dispatches work to the appropriate service extractor based on `source_type` (`pdf`, `pptx`, `youtube`, or `web`).
  * Forwards extraction chunks to the vector store with the requested `session_id`.
* **`DELETE /api/sessions/{session_id}`**:
  * Wipes all vector and text chunks matching the `session_id` parameter to reset session workspaces.
* **`DELETE /api/sessions/{session_id}/sources`**:
  * Removes document chunks of a specific source (e.g. filename, URL) within a session to allow granular cleanup of specific files.

---

## 8. Chat & Query Router (`api/chat.py`)
Exposes HTTP endpoints to support chat-based learning assistant queries.

### API Routes:
* **`POST /api/chat`**:
  * Standard request-response conversational flow. Evaluates full prompt and returns complete text with citations.
* **`POST /api/chat/stream`**:
  * Token-by-token streaming connection.
  * Streams chunks as Server-Sent Events (SSE) using standard `text/event-stream` media formatting.
  * Integrates real-time error serialization into the stream, yielding structured errors if the query execution fails.
