# app/services/vector_store.py
"""
Vector Store Service.
Handles document chunking via LangChain text splitters, dense vector embedding 
generation using Google GenAI, and batch ingestion into Supabase Vector database.
"""

import os
import asyncio
from typing import List, Dict, Any
from supabase import create_client, Client
from langchain_text_splitters import RecursiveCharacterTextSplitter
from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# 1. Initialization
# ---------------------------------------------------------------------------
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
google_api_key = os.environ.get("GOOGLE_API_KEY")

# Validate environment config before proceeding
if not supabase_url or not supabase_key:
    raise ValueError("Supabase credentials are missing. Check your .env file.")
if not google_api_key:
    raise ValueError("GOOGLE_API_KEY is missing. Check your .env file.")

# Supabase database client instance
supabase: Client = create_client(supabase_url, supabase_key)

# New Google GenAI client instance for calling embeddings model
client = genai.Client(api_key=google_api_key)
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


async def process_and_store_chunks(raw_chunks: List[Dict[str, Any]], session_id: str):
    """
    Ingestion Pipeline.
    1. Receives raw document/source pages/slides/paragraphs.
    2. Splits long text segments into smaller, overlapping chunks (1000 chars length).
    3. Generates vector representations in batches of 50 via Google's embedding model.
    4. Bundles embeddings with metadata and session tags, and batch-inserts into Supabase.
    """
    if not raw_chunks:
        raise ValueError("No text chunks were provided to embed.")
    if not session_id:
        raise ValueError("session_id is required to store document chunks.")

    # Initialize LangChain character splitter for optimal chunk lengths
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=100,
        length_function=len,
    )

    final_chunks = []
    # Segment each raw extract text chunk into clean, manageable text slices
    for chunk in raw_chunks:
        split_texts = text_splitter.split_text(chunk["content"])
        for text in split_texts:
            final_chunks.append({
                "content": text,
                "metadata": chunk["metadata"]
            })

    if not final_chunks:
        return {"status": "success", "chunks_stored": 0}

    # Extract clean text representations for vectorization
    texts_to_embed = [c["content"] for c in final_chunks]
    all_vectors = []
    batch_size = 20

    # Batch generate embeddings in blocks of 20 to avoid exceeding the 20,000 TPM limit
    for i in range(0, len(texts_to_embed), batch_size):
        batch = texts_to_embed[i:i + batch_size]
        
        # Exponential backoff retry logic for 429 rate limit errors
        retries = 6
        backoff = 3.0
        response = None
        
        for attempt in range(retries):
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: client.models.embed_content(
                        model=EMBEDDING_MODEL,
                        contents=batch,
                        config=types.EmbedContentConfig(
                            task_type="RETRIEVAL_DOCUMENT",
                            output_dimensionality=EMBEDDING_DIMENSIONS,
                        )
                    )
                )
                break
            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    if attempt == retries - 1:
                        raise e
                    sleep_time = backoff * (2 ** attempt)
                    print(f"Embedding rate limit (429) hit. Retrying in {sleep_time:.2f}s...")
                    await asyncio.sleep(sleep_time)
                else:
                    raise e
                    
        if response and response.embeddings:
            for embedding in response.embeddings:
                all_vectors.append(embedding.values)
                
        # Throttling delay to prevent bursting the API rate limits
        await asyncio.sleep(2.0)

    # Compile and structure records to be inserted into the document_chunks table
    records_to_insert = []
    for i, chunk in enumerate(final_chunks):
        records_to_insert.append({
            "content": chunk["content"],
            "metadata": chunk["metadata"],
            "embedding": all_vectors[i],
            "session_id": session_id,
        })

    insert_batch_size = 100
    # Batch write records into the Supabase database table in blocks of 100
    for i in range(0, len(records_to_insert), insert_batch_size):
        batch = records_to_insert[i:i + insert_batch_size]
        supabase.table("document_chunks").insert(batch).execute()

    return {"status": "success", "chunks_stored": len(records_to_insert)}
