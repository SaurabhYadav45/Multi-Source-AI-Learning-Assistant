import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FileText, Presentation, Play, Globe, UploadCloud, 
  Loader2, Trash2, CheckCircle2, AlertCircle, Sparkles, X
} from 'lucide-react';

const TABS = [
  { id: 'pdf', label: 'PDF', icon: FileText, placeholder: 'Upload learning PDF document' },
  { id: 'pptx', label: 'PPTX', icon: Presentation, placeholder: 'Upload learning PPTX presentation' },
  { id: 'youtube', label: 'YouTube', icon: Play, placeholder: 'Enter YouTube video URL (with CC transcripts)' },
  { id: 'web', label: 'Web Page', icon: Globe, placeholder: 'Enter web page article URL' },
];

export default function IngestionPanel({ onClose }) {
  const { activeSession, isUploading, uploadSource, deleteSource } = useApp();

  const [activeTab, setActiveTab] = useState('pdf');
  const [urlInput, setUrlInput] = useState('');
  const [fileInput, setFileInput] = useState(null);
  
  // Success/Error banner states
  const [statusMsg, setStatusMsg] = useState({ type: null, text: '' });
  const fileSelectRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileInput(file);
      setStatusMsg({ type: null, text: '' });
    }
  };

  const handleClearForm = () => {
    setFileInput(null);
    setUrlInput('');
    if (fileSelectRef.current) fileSelectRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg({ type: null, text: '' });

    // Ensure session exists
    if (!activeSession) {
      setStatusMsg({ type: 'error', text: 'Please select or create a workspace first' });
      return;
    }

    try {
      if (activeTab === 'pdf' || activeTab === 'pptx') {
        if (!fileInput) {
          setStatusMsg({ type: 'error', text: `Please select a .${activeTab} file to process` });
          return;
        }
        await uploadSource(activeTab, fileInput);
      } else {
        if (!urlInput.trim()) {
          setStatusMsg({ type: 'error', text: 'Please enter a valid URL' });
          return;
        }
        await uploadSource(activeTab, urlInput.trim());
      }

      setStatusMsg({ type: 'success', text: `Successfully processed and stored ${activeTab}!` });
      handleClearForm();
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to ingest data source' });
    }
  };

  const handleDeleteSource = async (name) => {
    if (confirm(`Remove "${name}" from your active workspace learning context?`)) {
      try {
        await deleteSource(name);
      } catch (err) {
        alert(err.message || 'Failed to delete source');
      }
    }
  };

  // Helper to resolve matching source icon
  const getSourceIcon = (type) => {
    switch(type) {
      case 'pdf': return <FileText className="w-4 h-4 text-rose-400" />;
      case 'pptx': return <Presentation className="w-4 h-4 text-orange-400" />;
      case 'youtube': return <Play className="w-4 h-4 text-red-500" />;
      case 'web': return <Globe className="w-4 h-4 text-emerald-400" />;
      default: return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="w-[90vw] sm:w-96 h-full flex flex-col glass border-l border-white/5 text-gray-200">
      
      {/* 1. Header Section */}
      <div className="p-4 sm:p-6 border-b border-white/5 flex items-start justify-between">
        <div>
          <h2 className="text-md font-semibold flex items-center space-x-2 text-white leading-none">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Upload Sources</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            Ingest materials to isolate learning context for this workspace session.
          </p>
        </div>

        {/* Mobile Close Ingestion Panel Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Close upload panel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Ingestion Form Section */}
      <div className="p-4 sm:p-6 border-b border-white/5">
        {/* Source Ingestion Tabs */}
        <div className="flex space-x-1 p-1 rounded-xl bg-black/40 border border-white/5 mb-4">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  handleClearForm();
                  setStatusMsg({ type: null, text: '' });
                }}
                className={`flex-1 flex flex-col items-center py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isSelected 
                    ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <TabIcon className="w-4 h-4 mb-1" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Inputs Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'pdf' || activeTab === 'pptx' ? (
            /* File Upload Container */
            <div 
              onClick={() => !isUploading && fileSelectRef.current?.click()}
              className="group border border-dashed border-white/10 hover:border-purple-500/40 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-white/[0.01] hover:bg-purple-500/[0.02] transition-all duration-200"
            >
              <input
                type="file"
                ref={fileSelectRef}
                onChange={handleFileChange}
                accept={activeTab === 'pdf' ? '.pdf' : '.pptx'}
                className="hidden"
                disabled={isUploading}
              />
              
              <UploadCloud className="w-10 h-10 text-gray-500 group-hover:text-purple-400 mb-2.5 transition-colors duration-200" />
              
              <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors duration-200">
                {fileInput ? fileInput.name : `Select .${activeTab} file`}
              </span>
              <span className="text-[10px] text-gray-500 mt-1 text-center">
                {fileInput ? `${(fileInput.size / (1024 * 1024)).toFixed(2)} MB` : 'Max limit: 20MB'}
              </span>
            </div>
          ) : (
            /* URL Ingestion Input Box */
            <div className="relative">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={TABS.find(t => t.id === activeTab)?.placeholder}
                disabled={isUploading}
                className="w-full bg-black/40 border border-white/10 focus:border-purple-500/50 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition-all duration-200"
              />
            </div>
          )}

          {/* Submit Button with Loading Indicator */}
          <button
            type="submit"
            disabled={isUploading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/40 text-white font-medium text-xs flex items-center justify-center space-x-2 transition-all duration-200"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                <span>Processing context...</span>
              </>
            ) : (
              <span>Add to Workspace</span>
            )}
          </button>
        </form>

        {/* Dynamic Status Notifications */}
        {statusMsg.type && (
          <div className={`mt-4 flex items-start space-x-2 p-3 rounded-xl border text-xs leading-tight ${
            statusMsg.type === 'success' 
              ? 'bg-green-500/10 border-green-500/20 text-green-300' 
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}>
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* 3. Ingested Materials List */}
      <div className="flex-1 flex flex-col min-h-0 bg-black/10">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Ingested Materials
          </span>
          <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full font-medium">
            {activeSession?.sources?.length || 0} files
          </span>
        </div>

        {/* Scrollable list items */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 sm:py-3 space-y-2">
          {!activeSession?.sources || activeSession.sources.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
              <UploadCloud className="w-8 h-8 text-gray-500 mb-2" />
              <p className="text-xs text-gray-400">No learning materials uploaded.</p>
              <p className="text-[10px] text-gray-500 mt-1">Upload a PDF/PPTX or link to get started.</p>
            </div>
          ) : (
            activeSession.sources.map((src, index) => (
              <div 
                key={index} 
                className="group flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-200"
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  {getSourceIcon(src.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate text-gray-200" title={src.name}>
                      {src.name}
                    </p>
                    <p className="text-[9px] text-gray-500 uppercase mt-0.5">
                      {src.type} • {src.date}
                    </p>
                    {src.summary && (
                      <p className="text-[10px] text-purple-300/80 mt-1.5 leading-relaxed bg-purple-500/5 border border-purple-500/10 rounded-lg p-1.5 font-normal whitespace-normal break-words">
                        <span className="font-semibold text-purple-400">Summary: </span>
                        {src.summary}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Granular Source Deletion Button */}
                <button
                  onClick={() => handleDeleteSource(src.name)}
                  className="p-1 rounded bg-transparent hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200"
                  title="Remove context source"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
