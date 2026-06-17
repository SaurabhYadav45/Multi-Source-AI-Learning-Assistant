# app/api/file_upload.py
"""
API Router for document ingestion and database maintenance.
Exposes endpoints to process PDF, PPTX, YouTube, and web sources,
generating embeddings and storing them, as well as clearing workspaces.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from typing import Optional

# Import extraction functions for parsing different data formats
from app.services.extractors import (
    extract_text_from_pdf,
    extract_text_from_pptx,
    extract_text_from_youtube,
    extract_text_from_web
)
from app.services.llm import generate_source_summary
# Import chunking and storage pipeline, alongside Supabase client instance
from app.services.vector_store import process_and_store_chunks, supabase
from app.services.limiter import limiter

router = APIRouter()

@router.post("/process")
@limiter.limit("5/minute")
async def process_source(
    request: Request,
    source_type: str = Form(..., description="Must be one of: 'pdf', 'pptx', 'youtube', 'web'"),
    session_id: str = Form(..., description="Session identifier used to isolate uploaded learning sources"),
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None)
):
    """
    Unified ingestion endpoint.
    1. Validates the source format constraints.
    2. Routes the source content to its matching service parser.
    3. Triggers chunking, vector embedding generation, and insertion into Supabase.
    """
    valid_sources = ["pdf", "pptx", "youtube", "web"]
    
    # 1. Validation Checks
    if source_type not in valid_sources:
        raise HTTPException(status_code=400, detail=f"Invalid source_type. Must be one of {valid_sources}")

    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")

    # Ensure files are uploaded for file-based sources
    if source_type in ["pdf", "pptx"] and not file:
        raise HTTPException(status_code=400, detail=f"A file must be uploaded for source type: {source_type}")
    
    # Ensure links are provided for URL-based sources
    if source_type in ["youtube", "web"] and not url:
        raise HTTPException(status_code=400, detail=f"A valid URL must be provided for source type: {source_type}")

    raw_chunks = []

    # 2. Execution Phase: Extract raw text chunks and metadata
    try:
        if source_type == "pdf":
            file_bytes = await file.read()
            raw_chunks = await extract_text_from_pdf(file_bytes, file.filename)
            
        elif source_type == "pptx":
            file_bytes = await file.read()
            raw_chunks = await extract_text_from_pptx(file_bytes, file.filename)
            
        elif source_type == "youtube":
            raw_chunks = await extract_text_from_youtube(url)
            
        elif source_type == "web":
            raw_chunks = await extract_text_from_web(url)
            
    except ValueError as e:
        # Catch and bubble up expected parsing errors (like malformed URLs)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Catch unexpected extract failures (corrupted streams, network failure)
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {str(e)}")

    # 3. Generate a short summary of the content using Gemini
    try:
        full_text_preview = " ".join([c["content"] for c in raw_chunks])
        source_summary = await generate_source_summary(full_text_preview)
    except Exception as e:
        print(f"Summary generation error: {e}")
        source_summary = "Context successfully processed."

    # 4. Vectorization & Storage Phase
    try:
        result = await process_and_store_chunks(raw_chunks, session_id=session_id.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to embed and store chunks: {str(e)}")

    return {
        "status": "success",
        "message": f"Successfully processed and stored {source_type}.",
        "chunks_embedded": result.get("chunks_stored", 0),
        "session_id": session_id.strip(),
        "filename": file.filename if file else None,
        "url": url if url else None,
        "summary": source_summary
    }


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Session Reset Endpoint.
    Deletes all text chunks and vectors matching the given session_id from Supabase.
    """
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    try:
        # Delete rows where session_id matches
        res = supabase.table("document_chunks").delete().eq("session_id", session_id.strip()).execute()
        return {
            "status": "success",
            "message": f"Successfully deleted session: {session_id.strip()}",
            "chunks_deleted": len(res.data) if res.data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@router.delete("/sessions/{session_id}/sources")
async def delete_source(session_id: str, source: str):
    """
    Granular Cleanup Endpoint.
    Deletes only the chunks matching a specific file name or URL within a session,
    leaving chunks of other sources in the session untouched.
    """
    if not session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    if not source.strip():
        raise HTTPException(status_code=400, detail="source parameter is required")
    try:
        # Filter matching rows by session_id and traverse JSONB metadata to match the source key
        res = supabase.table("document_chunks").delete().eq("session_id", session_id.strip()).eq("metadata->>source", source.strip()).execute()
        return {
            "status": "success",
            "message": f"Successfully deleted source '{source.strip()}' in session '{session_id.strip()}'",
            "chunks_deleted": len(res.data) if res.data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete source from session: {str(e)}")

