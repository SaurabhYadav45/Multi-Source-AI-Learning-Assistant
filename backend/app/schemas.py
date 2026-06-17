# app/schemas.py
"""
Data serialization and validation contracts (Pydantic models) 
defining the exact structural interface for FastAPI request inputs and response payloads.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatRequest(BaseModel):
    """
    Validation schema for incoming student chat messages.
    Ensures correct inputs are provided for contextual queries.
    """
    session_id: str = Field(
        ..., 
        description="Unique UUID/text token used to isolate uploaded learning materials and chat sessions"
    )
    message: str = Field(
        ..., 
        description="The query, question, or discussion prompt sent by the student"
    )
    history: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list,
        description="List of prior conversation turns (e.g. [{'role': 'user', 'content': '...'}]) to support short-term chat memory"
    )

class Citation(BaseModel):
    """
    Metadata representation of document sources used to ground the model's answer.
    Provides precise page, slide, or temporal markers to avoid hallucination.
    """
    source: str = Field(
        ..., 
        description="The identifier of the source file name or scraping URL"
    )
    type: str = Field(
        ..., 
        description="The source medium type: 'pdf', 'pptx', 'youtube', or 'web'"
    )
    page: Optional[int] = Field(
        None, 
        description="The specific page number of the source document (only applicable for PDFs)"
    )
    slide: Optional[int] = Field(
        None, 
        description="The specific slide number of the presentation file (only applicable for PPTX)"
    )
    timestamp: Optional[str] = Field(
        None, 
        description="The formatted timeline marker 'MM:SS' of the transcript block (only applicable for YouTube)"
    )

class ChatResponse(BaseModel):
    """
    Standard schema returned by the conversational endpoint when streaming is not used.
    """
    status: str = Field(
        "success", 
        description="API execution status indicator"
    )
    answer: str = Field(
        ..., 
        description="AI-generated, fully grounded text answer based exclusively on the session's context"
    )
    citations: List[Citation] = Field(
        default_factory=list,
        description="Collection of citations pointing to source text segments matching the query"
    )
