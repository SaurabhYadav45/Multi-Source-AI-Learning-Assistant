import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import IngestionPanel from './components/IngestionPanel';
import ChatWindow from './components/ChatWindow';
import { Menu, Library, X, BookOpen } from 'lucide-react';

function AppContent() {
  const { activeSessionId } = useApp();
  // Toggle states for mobile/tablet drawer overlays
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ingestionOpen, setIngestionOpen] = useState(false);

  // Auto-close drawers on mobile when active workspace session changes
  useEffect(() => {
    setSidebarOpen(false);
    setIngestionOpen(false);
  }, [activeSessionId]);

  return (
    <div className="flex w-screen h-screen overflow-hidden relative bg-[#030014] text-gray-200">
      {/* 1. Global Blurred Mesh Background Bubbles */}
      <div className="bg-mesh" />

      {/* 2. Sidebar Workspace Panel (Left) */}
      {/* Desktop view: Sidebar remains visible. Mobile view: Drawer slides in from left */}
      <div className={`
        fixed inset-y-0 left-0 z-40 transform lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* 3. Chat Workspace Area (Center) */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Responsive Mobile Header with Toggle Drawer Buttons */}
        <div className="lg:hidden flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/5 glass bg-black/30 z-30">
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => {
              setSidebarOpen(!sidebarOpen);
              setIngestionOpen(false); // Close ingestion drawer
            }}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Mobile Center Logo Header with Book Icon */}
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-purple-600 flex items-center justify-center glow-purple">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white bg-gradient-to-r from-purple-400 to-cyan-300 bg-clip-text text-transparent">
              AI Learning Assistant
            </span>
          </div>

          {/* Toggle Ingestion Panel Button */}
          <button
            onClick={() => {
              setIngestionOpen(!ingestionOpen);
              setSidebarOpen(false); // Close sidebar drawer
            }}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            {ingestionOpen ? <X className="w-5 h-5" /> : <Library className="w-5 h-5" />}
          </button>
        </div>

        {/* Backdrop overlay for drawers on mobile */}
        {(sidebarOpen || ingestionOpen) && (
          <div 
            onClick={() => {
              setSidebarOpen(false);
              setIngestionOpen(false);
            }}
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300"
          />
        )}

        <ChatWindow />
      </div>

      {/* 4. Ingestion Panel (Right) */}
      {/* Desktop view: Panel remains visible. Mobile view: Drawer slides in from right */}
      <div className={`
        fixed inset-y-0 right-0 z-40 transform lg:relative lg:translate-x-0 transition-transform duration-300 ease-in-out
        ${ingestionOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <IngestionPanel onClose={() => setIngestionOpen(false)} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
