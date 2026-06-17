# app/main.py
"""
Main entry point for the Multi-Source AI Learning Assistant API.
This module handles application initialization, environment variable loading,
CORS middleware configuration, and router registration.
"""

from dotenv import load_dotenv

# Load environment variables from .env file before importing services
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.file_upload import router as upload_router
from app.api.chat import router as chat_router
from app.services.limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# Initialize FastAPI application with metadata for OpenAPI documentation
app = FastAPI(
    title="Multi-Source AI Learning Assistant API",
    description=(
        "Backend RAG pipeline for processing academic learning sources "
        "(PDFs, PPTXs, YouTube Transcripts, and Web pages) and answering student queries."
    ),
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Configure Cross-Origin Resource Sharing (CORS) Middleware
# Allows secure API requests from Vite or React local frontend servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Standard React Dev Server
        "http://localhost:5173"   # Standard Vite Dev Server
    ],
    allow_credentials=True,
    allow_methods=["*"],          # Allow GET, POST, OPTIONS, DELETE, etc.
    allow_headers=["*"],          # Allow all client headers
)

# Register endpoints under prefix /api
app.include_router(upload_router, prefix="/api", tags=["Upload"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])

@app.get("/")
async def root():
    """
    Health check endpoint to verify that the API is online.
    """
    return {
        "status": "online",
        "message": "Multi-Source AI Learning Assistant API is running!"
    }


# uvicorn app.main:app --reload