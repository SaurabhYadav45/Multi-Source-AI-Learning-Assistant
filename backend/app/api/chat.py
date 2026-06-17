# app/api/chat.py
"""
API Router for chat-related endpoints.
Handles conversational enquiries from students, orchestrating similarity search
retrievals and LLM generation, both as a standard response or as a real-time event stream.
"""

import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.schemas import ChatRequest, ChatResponse
from app.services.llm import generate_rag_response, generate_rag_response_stream, generate_quiz_questions
from app.services.limiter import limiter


router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
@limiter.limit("5/minute")
async def chat_with_context(chat_request: ChatRequest, request: Request):
    """
    Standard HTTP POST chat endpoint.
    Retrieves matching document chunks from the vector store and generates a fully grounded
    response using Gemini, returning the complete answer and its citations in one payload.
    """
    try:
        # Run the core RAG retrieval and generation pipeline
        rag_output = await generate_rag_response(
            query=chat_request.message,
            session_id=chat_request.session_id.strip(),
            history=chat_request.history
        )
        
        # Serialize into the response model payload
        return ChatResponse(
            status="success",
            answer=rag_output["answer"],
            citations=rag_output["citations"]
        )
        
    except ValueError as e:
        # Catch and surface clean validation errors (e.g. missing credentials or empty params)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Catch and hide detailed internal runtime errors, returning a clean 500 status
        raise HTTPException(status_code=500, detail=f"RAG Engine failed to process chat: {str(e)}")


async def event_generator(chat_request: ChatRequest):
    """
    Asynchronous event generator wrapper.
    Formats data fragments into Server-Sent Events (SSE): "data: <json_string>\n\n".
    Wraps execution in an exception block to yield error events if anything fails during stream generation.
    """
    try:
        async for chunk in generate_rag_response_stream(
            query=chat_request.message,
            session_id=chat_request.session_id.strip(),
            history=chat_request.history
        ):
            # Format according to the SSE standard. Every chunk has type and payload.
            yield f"data: {json.dumps(chunk)}\n\n"
    except Exception as e:
        # Yield a structural error event to let the client handle it gracefully
        yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"


@router.post("/chat/stream")
@limiter.limit("5/minute")
async def chat_with_context_stream(chat_request: ChatRequest, request: Request):
    """
    Streaming HTTP POST chat endpoint.
    Initiates a token-by-token text stream back to the client using Server-Sent Events.
    Allows students to read answers in real-time. Yields citations first, followed by text tokens.
    """
    if not chat_request.session_id.strip():
        raise HTTPException(status_code=400, detail="session_id is required")
    
    # Return the StreamingResponse with the correct text/event-stream content type
    return StreamingResponse(
        event_generator(chat_request),
        media_type="text/event-stream"
    )


@router.post("/sessions/{session_id}/quiz")
@limiter.limit("5/minute")
async def get_quiz(session_id: str, request: Request):
    """
    Auto-generates a 5-question multiple-choice quiz based on the session's uploaded files.
    """
    try:
        quiz_data = await generate_quiz_questions(session_id.strip())
        return quiz_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {str(e)}")

