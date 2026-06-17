# app/services/llm.py
"""
Large Language Model (LLM) Service.
Integrates Google's GenAI SDK and LangChain to provide semantic context retrieval
and grounded question answering. Supports both standard block responses and token streams.
"""

import os
import re
import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from supabase import create_client, Client
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from google import genai
from google.genai import types


# ---------------------------------------------------------------------------
# 1. Client Initialization
# ---------------------------------------------------------------------------
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
google_api_key = os.environ.get("GOOGLE_API_KEY")

# Validate required variables are present before startup
if not supabase_url or not supabase_key:
    raise ValueError("Supabase credentials are missing from environment variables.")
if not google_api_key:
    raise ValueError("GOOGLE_API_KEY is missing from environment variables.")

# Supabase Admin Client used to query RPC matching procedures
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize new Google GenAI client specifically for generating query embeddings
client = genai.Client(api_key=google_api_key)
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768

# Initialize LangChain model for generating grounded conversational chat responses
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)


async def retrieve_relevant_chunks(query: str, session_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Vector Similarity Search.
    1. Embeds the user query using gemini-embedding-001.
    2. Invokes Supabase's SQL match_documents RPC to find the closest cosine matches.
    3. Restricts results strictly to the provided session_id to maintain isolation.
    """
    if not session_id:
        raise ValueError("session_id is required to retrieve context.")

    # Generate vector embedding representation of the search string
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=query,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=EMBEDDING_DIMENSIONS,
        )
    )
    query_vector = response.embeddings[0].values

    # Query Supabase Vector DB using RPC match_documents
    response = supabase.rpc(
        "match_documents",
        {
            "query_embedding": query_vector,
            "match_threshold": 0.3,
            "match_count": limit,
            "filter_session_id": session_id,
        }
    ).execute()

    return response.data


async def generate_rag_response(
    query: str,
    session_id: str,
    history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Retrieval-Augmented Generation (Standard Flow).
    Retrieves matching document chunks, builds a grounded system prompt,
    appends conversational history, and generates the response.
    """
    history = history or []
    # Retrieve top 5 matching text segments within the session
    matched_chunks = await retrieve_relevant_chunks(query, session_id=session_id)

    context_elements = []
    citations = []
    seen_sources = set()

    # Process and build prompt context, extracting unique sources for citation mapping
    for chunk in matched_chunks:
        context_elements.append(
            f"Content: {chunk['content']}\nSource Metadata: {chunk['metadata']}\n---"
        )
        meta = chunk['metadata']
        source_key = (meta.get("source"), meta.get("page"), meta.get("slide"), meta.get("timestamp"))
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            citations.append({
                "source": meta.get("source"),
                "type": meta.get("type"),
                "page": meta.get("page"),
                "slide": meta.get("slide"),
                "timestamp": meta.get("timestamp")
            })

    # Join fragments into system prompt context
    context_str = "\n".join(context_elements) if context_elements else "No relevant context found."

    # Define system instruction restricting the AI to the context pool and forcing inline citations
    system_instruction = (
        "You are an expert academic learning assistant. Your job is to answer the user's question "
        "using ONLY the provided reference context. If the answer cannot be found in the context, "
        "politely inform the user that the uploaded material does not contain the answer.\n\n"
        "You MUST cite your references inline by mentioning the source name and specific details "
        "directly in the text where the fact is used (e.g., '[book.pdf, Page 12]', '[lecture.pptx, Slide 3]', "
        "or '[video_url, at 14:22]'). Do not invent any citations that are not in the context.\n\n"
        f"--- START REFERENCE CONTEXT ---\n{context_str}\n--- END REFERENCE CONTEXT ---"
    )

    # Compile messages including system prompt, limited history, and the new query
    messages = [SystemMessage(content=system_instruction)]
    for msg in history[-6:]: # Limit history to last 3 conversational turns (6 messages)
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=msg.get("content")))
        elif msg.get("role") == "assistant":
            messages.append(AIMessage(content=msg.get("content")))
    messages.append(HumanMessage(content=query))

    ai_message = llm.invoke(messages)

    return {
        "answer": ai_message.content,
        "citations": citations
    }


async def generate_rag_response_stream(
    query: str,
    session_id: str,
    history: Optional[List[Dict[str, Any]]] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Retrieval-Augmented Generation (Streaming Flow).
    Retrieves matching document chunks, builds a grounded system prompt,
    yields the list of citations as the first chunk, then streams LLM response tokens.
    """
    history = history or []
    # Retrieve top 5 matching text segments within the session
    matched_chunks = await retrieve_relevant_chunks(query, session_id=session_id)

    context_elements = []
    citations = []
    seen_sources = set()

    # Format context and extract citation metadata
    for chunk in matched_chunks:
        context_elements.append(
            f"Content: {chunk['content']}\nSource Metadata: {chunk['metadata']}\n---"
        )
        meta = chunk['metadata']
        source_key = (meta.get("source"), meta.get("page"), meta.get("slide"), meta.get("timestamp"))
        if source_key not in seen_sources:
            seen_sources.add(source_key)
            citations.append({
                "source": meta.get("source"),
                "type": meta.get("type"),
                "page": meta.get("page"),
                "slide": meta.get("slide"),
                "timestamp": meta.get("timestamp")
            })

    # Join fragments into system prompt context
    context_str = "\n".join(context_elements) if context_elements else "No relevant context found."

    # Define system instruction restricting the AI to the context pool and forcing inline citations
    system_instruction = (
        "You are an expert academic learning assistant. Your job is to answer the user's question "
        "using ONLY the provided reference context. If the answer cannot be found in the context, "
        "politely inform the user that the uploaded material does not contain the answer.\n\n"
        "You MUST cite your references inline by mentioning the source name and specific details "
        "directly in the text where the fact is used (e.g., '[book.pdf, Page 12]', '[lecture.pptx, Slide 3]', "
        "or '[video_url, at 14:22]'). Do not invent any citations that are not in the context.\n\n"
        f"--- START REFERENCE CONTEXT ---\n{context_str}\n--- END REFERENCE CONTEXT ---"
    )

    # Compile messages including system prompt, history, and the new query
    messages = [SystemMessage(content=system_instruction)]
    for msg in history[-6:]: # Limit history to last 3 conversational turns (6 messages)
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=msg.get("content")))
        elif msg.get("role") == "assistant":
            messages.append(AIMessage(content=msg.get("content")))
    messages.append(HumanMessage(content=query))

    # 1. Emit the citations first so the client can render citation tags/cards
    yield {"type": "citations", "citations": citations}

    # 2. Iterate and stream text tokens from LangChain ChatGoogleGenerativeAI
    async for chunk in llm.astream(messages):
        yield {"type": "token", "content": chunk.content}


async def generate_source_summary(text: str) -> str:
    """
    Generates a very short (12-18 words) summary of the document content
    using Gemini to be displayed in the UI materials checklist.
    """
    if not text.strip():
        return "Empty document."
    
    # Take the first 3000 characters to get the main topic without overloading
    snippet = text[:3000]
    
    messages = [
        SystemMessage(content=(
            "You are a helpful assistant. Write a very short, single-sentence summary "
            "(maximum 12 to 18 words) of the following document snippet, describing its main topic. "
            "Respond ONLY with the summary text, do not write any introductory or extra text."
        )),
        HumanMessage(content=snippet)
    ]
    
    try:
        # Run blocking LLM call in a thread pool executor
        ai_message = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: llm.invoke(messages)
        )
        return ai_message.content.strip().strip('"')
    except Exception as e:
        print(f"Failed to generate summary: {e}")
        return "Context successfully processed."


async def generate_quiz_questions(session_id: str) -> Dict[str, Any]:
    """
    Retrieves a selection of document chunks for the session,
    prompts Gemini to generate a 5-question multiple-choice quiz in JSON format,
    and returns it.
    """
    if not session_id:
        raise ValueError("session_id is required to generate a quiz.")
        
    # Retrieve up to 12 chunks from the session to use as context
    try:
        res = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: supabase.table("document_chunks").select("content").eq("session_id", session_id).limit(12).execute()
        )
        chunks = res.data if res.data else []
    except Exception as e:
        print(f"Error fetching chunks for quiz: {e}")
        chunks = []
        
    if not chunks:
        raise ValueError("No learning materials have been uploaded to this workspace yet. Please upload a source before starting the quiz.")
        
    context_str = "\n".join([f"Content: {c['content']}\n---" for c in chunks])
    
    system_instruction = (
        "You are an expert academic learning assistant. Your job is to generate a high-quality "
        "5-question multiple-choice quiz (MCQ) based ONLY on the provided reference context.\n\n"
        "You MUST respond with a single, valid JSON object matching the following structure. "
        "Do not write any markdown code blocks, introductory text, or explanations outside the JSON structure. "
        "The JSON object must contain exactly one key 'questions', which maps to a list of 5 question objects. "
        "Each question object must contain these exact keys:\n"
        "- 'question': (string) the question text.\n"
        "- 'options': (list of 4 strings) the choices.\n"
        "- 'correct_index': (integer, 0 to 3) the index of the correct option.\n"
        "- 'explanation': (string) a detailed explanation explaining why the option is correct, grounded in the context.\n\n"
        f"--- START REFERENCE CONTEXT ---\n{context_str}\n--- END REFERENCE CONTEXT ---"
    )
    
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content="Generate the 5-question MCQ JSON object now.")
    ]
    
    # Set temperature higher for more creative questions, but still grounded
    quiz_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.5)
    
    try:
        ai_message = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: quiz_llm.invoke(messages)
        )
        
        # Clean up output in case the LLM returned markdown code blocks (e.g. ```json ... ```)
        raw_content = ai_message.content.strip()
        if raw_content.startswith("```"):
            raw_content = re.sub(r"^```[a-zA-Z]*\n", "", raw_content)
            raw_content = re.sub(r"\n```$", "", raw_content)
            raw_content = raw_content.strip()
            
        quiz_data = json.loads(raw_content)
        if "questions" not in quiz_data or not isinstance(quiz_data["questions"], list):
            raise ValueError("Invalid quiz structure generated by AI.")
            
        return quiz_data
    except Exception as e:
        print(f"Quiz generation failed: {e}")
        raise ValueError(f"AI failed to compile the quiz. Please try again. Detail: {str(e)}")


