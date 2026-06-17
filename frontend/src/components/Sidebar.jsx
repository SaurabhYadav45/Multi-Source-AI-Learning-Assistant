import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Plus, Trash2, Edit3, Check, MessageSquare, BookOpen, X } from 'lucide-react';

export default function Sidebar({ onClose }) {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createNewSession,
    renameSession,
    removeSession
  } = useApp();

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const handleStartEdit = (session) => {
    setEditingId(session.id);
    setEditName(session.name);
  };

  const handleSaveRename = (id) => {
    if (editName.trim()) {
      renameSession(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e, id) => {
    if (e.key === 'Enter') handleSaveRename(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <aside className="w-[85vw] sm:w-80 h-full flex flex-col glass-dark border-r border-white/5 text-gray-200">
      {/* Sidebar Header Title */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center glow-purple">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-purple-300 to-cyan-200 bg-clip-text text-transparent tracking-tight leading-none">
              AI Learning Assistant
            </h1>
            <span className="text-xs text-purple-400 font-medium">Multi-Source RAG</span>
          </div>
        </div>

        {/* Mobile Close Sidebar Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Create New Session Button */}
      <div className="p-4">
        <button
          onClick={() => createNewSession()}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/20 hover:border-purple-500/40 text-purple-200 hover:text-white font-medium text-sm transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>

      {/* Workspaces Scrollable List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-4">
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 tracking-wider uppercase">
          Workspaces
        </div>
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isEditing = session.id === editingId;

          return (
            <div
              key={session.id}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-white/[0.06] border border-white/10 shadow-lg text-white'
                  : 'hover:bg-white/[0.02] border border-transparent text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => !isEditing && setActiveSessionId(session.id)}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-gray-500'}`} />
                
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleSaveRename(session.id)}
                    onKeyDown={(e) => handleKeyDown(e, session.id)}
                    className="bg-black/40 border border-purple-500/50 rounded px-1.5 py-0.5 text-sm text-white focus:outline-none w-full"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-sm font-medium truncate">{session.name}</span>
                )}
              </div>

              {/* Action Buttons: Rename / Delete (Visible on Hover / Active) */}
              {!isEditing && (
                <div className={`flex items-center space-x-1.5 ${isActive ? 'flex' : 'hidden group-hover:flex'}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(session);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="Rename workspace"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Are you sure you want to delete workspace "${session.name}"?`)) {
                        removeSession(session.id);
                      }
                    }}
                    className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete workspace"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveRename(session.id);
                  }}
                  className="p-1 rounded hover:bg-green-500/20 text-green-400 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
