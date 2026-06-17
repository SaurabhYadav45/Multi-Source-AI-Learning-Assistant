import React, { createContext, useContext, useState, useEffect } from 'react';

// Create AppContext for global state access
const AppContext = createContext();

// A browser secure-context fallback UUID generator.
// Web Cryptography API is disabled by browsers in insecure contexts (like HTTP IP addresses).
const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const AppProvider = ({ children }) => {
  // Load initial sessions from localStorage or create a default session
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('learning_assistant_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse sessions', e);
      }
    }
    // Generate a default initial session if none exist
    const defaultId = generateUUID();
    return [{
      id: defaultId,
      name: 'Default Workspace',
      sources: [],
      messages: []
    }];
  });

  // Load activeSessionId from localStorage or default to the first session
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const saved = localStorage.getItem('learning_assistant_active_id');
    if (saved && saved !== 'undefined') {
      return saved;
    }
    return sessions[0]?.id || '';
  });

  // Track global loading states (e.g. document uploading or model queries)
  const [isUploading, setIsUploading] = useState(false);

  // Sync sessions state to localStorage on changes
  useEffect(() => {
    localStorage.setItem('learning_assistant_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Sync activeSessionId to localStorage on changes
  useEffect(() => {
    localStorage.setItem('learning_assistant_active_id', activeSessionId);
  }, [activeSessionId]);

  // Get current active session object
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // Helper to add a new session
  const createNewSession = (name = 'New Workspace') => {
    const newId = generateUUID();
    const newSession = {
      id: newId,
      name,
      sources: [],
      messages: []
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newId);
    return newId;
  };

  // Helper to rename an existing session
  const renameSession = (id, newName) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  // Helper to delete an entire session (calls API to clean up vectors first)
  const removeSession = async (id) => {
    try {
      // Clean up Supabase vector store chunks asynchronously
      fetch(`${API_BASE_URL}/api/sessions/${id}`, { method: 'DELETE' }).catch(err => 
        console.error('Failed to delete backend session storage', err)
      );

      setSessions(prev => {
        const remaining = prev.filter(s => s.id !== id);
        if (remaining.length === 0) {
          const defaultId = generateUUID();
          return [{
            id: defaultId,
            name: 'Default Workspace',
            sources: [],
            messages: []
          }];
        }
        return remaining;
      });

      // Adjust active session if the deleted one was active
      if (activeSessionId === id) {
        setActiveSessionId(prev => {
          const remaining = sessions.filter(s => s.id !== id);
          return remaining[0]?.id || '';
        });
      }
    } catch (e) {
      console.error('Delete session error', e);
    }
  };

  // Upload or ingest a source file/link
  const uploadSource = async (sourceType, payload) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('source_type', sourceType);
      formData.append('session_id', activeSessionId);

      let sourceName = '';

      if (sourceType === 'pdf' || sourceType === 'pptx') {
        formData.append('file', payload);
        sourceName = payload.name;
      } else {
        formData.append('url', payload);
        sourceName = payload; // URL serves as name
      }

      const res = await fetch(`${API_BASE_URL}/api/process`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errDetail = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errDetail.detail || 'Internal server error during upload');
      }

      const data = await res.json();

      // Append source metadata to frontend state upon backend ingestion success
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          // Prevent duplicates
          if (s.sources.some(src => src.name === sourceName)) return s;
          return {
            ...s,
            sources: [
              ...s.sources,
              {
                name: sourceName,
                type: sourceType,
                date: new Date().toLocaleDateString(),
                summary: data.summary || "Context successfully processed."
              }
            ]
          };
        }
        return s;
      }));

      return data;
    } finally {
      setIsUploading(false);
    }
  };

  // Remove a specific source file/link from a session
  const deleteSource = async (sourceName) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/sessions/${activeSessionId}/sources?source=${encodeURIComponent(sourceName)}`, 
        { method: 'DELETE' }
      );

      if (!res.ok) {
        throw new Error('Failed to delete source from backend storage');
      }

      // Update local state to remove the source
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            sources: s.sources.filter(src => src.name !== sourceName)
          };
        }
        return s;
      }));
    } catch (err) {
      console.error('Delete source failed', err);
      throw err;
    }
  };

  // Stream conversational RAG response from backend
  const sendChatMessage = async (userMessageText) => {
    if (!userMessageText.trim() || !activeSession) return;

    // 1. Create and append user message, and setup empty assistant token response placeholder
    const userMsg = { role: 'user', content: userMessageText };
    const assistantPlaceholderId = generateUUID();
    const assistantMsg = { 
      id: assistantPlaceholderId, 
      role: 'assistant', 
      content: '', 
      citations: [], 
      isStreaming: true 
    };

    const currentHistory = [...activeSession.messages];
    
    // Add both user message and streaming placeholder to local state
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, userMsg, assistantMsg]
        };
      }
      return s;
    }));

    try {
      // 2. Fetch connection with Server-Sent Events chat route
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          message: userMessageText,
          history: currentHistory.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) {
        throw new Error('Chat network query failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 3. Read stream bytes in chunks
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Save the last line if it's incomplete
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith('data: ')) continue;

          try {
            const dataString = cleanLine.substring(6);
            const data = JSON.parse(dataString);

            // Handle citations packet
            if (data.type === 'citations') {
              setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m => 
                      m.id === assistantPlaceholderId 
                        ? { ...m, citations: data.citations } 
                        : m
                    )
                  };
                }
                return s;
              }));
            }
            // Handle token updates
            else if (data.type === 'token') {
              setSessions(prev => prev.map(s => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m => 
                      m.id === assistantPlaceholderId 
                        ? { ...m, content: m.content + data.content } 
                        : m
                    )
                  };
                }
                return s;
              }));
            }
            // Handle streaming errors
            else if (data.type === 'error') {
              throw new Error(data.detail);
            }
          } catch (e) {
            console.error('Error parsing SSE line', e);
          }
        }
      }

      // Mark streaming complete
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: s.messages.map(m => 
              m.id === assistantPlaceholderId 
                ? { ...m, isStreaming: false } 
                : m
            )
          };
        }
        return s;
      }));

    } catch (error) {
      console.error('Streaming connection error', error);
      // Update assistant response with error detail
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: s.messages.map(m => 
              m.id === assistantPlaceholderId 
                ? { ...m, content: `Error: ${error.message || 'Connection lost'}`, isStreaming: false } 
                : m
            )
          };
        }
        return s;
      }));
    }
  };

  // Fetch an auto-generated 5-question quiz for the session
  const fetchQuiz = async (sessionId) => {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/quiz`, {
      method: 'POST'
    });
    if (!res.ok) {
      const errDetail = await res.json().catch(() => ({ detail: 'Failed to generate quiz' }));
      throw new Error(errDetail.detail || 'Internal server error during quiz generation');
    }
    return await res.json();
  };

  return (
    <AppContext.Provider value={{
      sessions,
      activeSessionId,
      activeSession,
      isUploading,
      setActiveSessionId,
      createNewSession,
      renameSession,
      removeSession,
      uploadSource,
      deleteSource,
      sendChatMessage,
      fetchQuiz
    }}>
      {children}
    </AppContext.Provider>
  );
};

// Custom Hook to consume Context fields easily in sub-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside an AppProvider wrapper');
  }
  return context;
};
