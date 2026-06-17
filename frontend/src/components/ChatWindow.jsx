import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Send, FileText, Presentation, Play, Globe, GraduationCap, ChevronRight, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';

export default function ChatWindow() {
  const { activeSession, sendChatMessage, fetchQuiz } = useApp();
  const [inputText, setInputText] = useState('');
  
  // Quiz states
  const [quizActive, setQuizActive] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizError, setQuizError] = useState(null);

  const scrollboxRef = useRef(null);

  const handleStartQuiz = async () => {
    if (quizActive) {
      setQuizActive(false);
      setQuizQuestions([]);
      setCurrentQuestionIdx(0);
      setSelectedOptionIdx(null);
      setIsAnswerSubmitted(false);
      setQuizScore(0);
      setQuizError(null);
      return;
    }

    setQuizLoading(true);
    setQuizError(null);
    setQuizActive(true);

    try {
      const data = await fetchQuiz(activeSession.id);
      setQuizQuestions(data.questions || []);
      setCurrentQuestionIdx(0);
      setSelectedOptionIdx(null);
      setIsAnswerSubmitted(false);
      setQuizScore(0);
    } catch (err) {
      setQuizError(err.message || "Failed to load quiz.");
    } finally {
      setQuizLoading(false);
    }
  };

  // Auto scroll to bottom when message list updates or streaming content appends
  useEffect(() => {
    if (scrollboxRef.current) {
      scrollboxRef.current.scrollTo({
        top: scrollboxRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [activeSession?.messages, activeSession?.messages?.map(m => m.content).join('')]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const msg = inputText;
    setInputText('');
    await sendChatMessage(msg);
  };

  // Resolve matching citation icon
  const getCitationIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText className="w-3.5 h-3.5 mr-1 text-rose-400" />;
      case 'pptx': return <Presentation className="w-3.5 h-3.5 mr-1 text-orange-400" />;
      case 'youtube': return <Play className="w-3.5 h-3.5 mr-1 text-red-500" />;
      case 'web': return <Globe className="w-3.5 h-3.5 mr-1 text-emerald-400" />;
      default: return <FileText className="w-3.5 h-3.5 mr-1 text-gray-400" />;
    }
  };

  // Format citation label text
  const getCitationLabel = (citation) => {
    const filename = citation.source.split('/').pop(); // Extract file name if it's a path/URL
    if (citation.type === 'pdf' && citation.page) return `${filename} (Page ${citation.page})`;
    if (citation.type === 'pptx' && citation.slide) return `${filename} (Slide ${citation.slide})`;
    if (citation.type === 'youtube' && citation.timestamp) return `${filename} (at ${citation.timestamp})`;
    return filename;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-transparent text-gray-100">
      
      {/* Chat Window Header */}
      <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/5 flex items-center justify-between bg-black/10">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {activeSession ? activeSession.name : 'Workspace Chat'}
          </h2>
          <span className="text-[10px] text-gray-400">Grounded in local session documents</span>
        </div>

        {/* Quiz Me Header Button */}
        {activeSession && activeSession.sources && activeSession.sources.length > 0 && (
          <button
            onClick={handleStartQuiz}
            disabled={quizLoading}
            className="flex items-center space-x-1.5 py-1.5 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/35 text-purple-200 hover:text-white text-xs font-medium transition-all duration-200"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{quizActive ? "Exit Quiz" : "Quiz Me"}</span>
          </button>
        )}
      </div>

      {!quizActive ? (
        <>
          {/* Messages Scrollbox */}
          <div ref={scrollboxRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 space-y-6">
            {!activeSession?.messages || activeSession.messages.length === 0 ? (
              /* Landing Screen (Zero-state) */
              <div className="h-full flex flex-col items-center justify-center text-center p-12 select-none">
                <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/25 flex items-center justify-center glow-purple mb-4">
                  <GraduationCap className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">AI Learning Assistant</h3>
                <p className="text-xs text-gray-400 max-w-sm mt-2 leading-relaxed">
                  Upload textbook PDFs, lecture slides, YouTube lectures, or articles. 
                  The AI answers your questions using **only** your uploaded materials as context.
                </p>
                
                {/* Quick Helper Prompts */}
                <div className="grid grid-cols-2 gap-3 max-w-md mt-8">
                  {[
                    'Explain the core concept in my documents.',
                    'Summarize the uploaded textbook section.',
                    'What are the key terms defined here?',
                    'Draft a 3-question quiz from these materials.'
                  ].map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputText(prompt)}
                      className="p-3 text-left rounded-xl bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-white/10 text-[11px] text-gray-400 hover:text-white transition-all duration-200"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Chat Log list */
              activeSession.messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                
                return (
                  <div key={index} className={`flex items-start space-x-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {/* Avatar Icon */}
                    {!isUser && (
                      <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-4 h-4 text-purple-400" />
                      </div>
                    )}

                    {/* Message Bubble Card */}
                    <div className={`max-w-[70%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                      isUser 
                        ? 'bg-purple-600 text-white rounded-tr-none glow-purple' 
                        : 'glass-card text-gray-100 rounded-tl-none border border-white/5'
                    }`}>
                      {/* Message Text Content */}
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                      {/* Typing/Streaming Cursor */}
                      {msg.isStreaming && !msg.content && (
                        <div className="flex space-x-1 items-center h-5">
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      )}

                      {/* Grounded Citation Badges list */}
                      {!isUser && msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-3.5 border-t border-white/5">
                          <p className="text-[10px] font-semibold text-gray-500 tracking-wider uppercase mb-2">
                            References used:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.citations.map((citation, cIdx) => (
                              <div
                                key={cIdx}
                                className="flex items-center text-[10px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 rounded-lg px-2.5 py-1 select-none cursor-help transition-all duration-200"
                                title={citation.source}
                              >
                                {getCitationIcon(citation.type)}
                                <span>{getCitationLabel(citation)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Input container at footer */}
          <div className="p-4 sm:p-6 bg-black/10 border-t border-white/5">
            <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-center bg-black/60 border border-white/20 rounded-2xl p-1.5 focus-within:border-purple-500/80 focus-within:shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all duration-200">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask a question grounded in this workspace context..."
                className="flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
              />
              
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white flex items-center justify-center transition-all duration-200"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
            <p className="text-[9px] text-gray-500 text-center mt-2.5 leading-none">
              Grounded RAG Assistant. Hallucinations are minimized by matching prompts exclusively to session embeddings.
            </p>
          </div>
        </>
      ) : (
        /* Quiz interface content */
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col items-center justify-center">
          {quizLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
              <h4 className="text-md font-semibold text-white">Generating Quiz...</h4>
              <p className="text-xs text-gray-400 mt-2 max-w-xs leading-relaxed">
                Analyzing your uploaded documents to draft 5 custom multiple-choice questions.
              </p>
            </div>
          ) : quizError ? (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-red-500/5 border border-red-500/10 rounded-2xl">
              <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
              <h4 className="text-md font-semibold text-white">Quiz Generation Failed</h4>
              <p className="text-xs text-red-300 mt-2 leading-relaxed">
                {quizError}
              </p>
              <button 
                onClick={handleStartQuiz} 
                className="mt-6 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 text-xs font-semibold rounded-xl transition-all"
              >
                Retry Quiz
              </button>
            </div>
          ) : quizQuestions.length === 0 ? (
            <div className="text-center p-12 text-gray-400">No questions available.</div>
          ) : currentQuestionIdx >= quizQuestions.length ? (
            /* Quiz Score Summary Card */
            <div className="max-w-md w-full bg-white/[0.02] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl glass-card">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center mb-6 glow-purple">
                <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Quiz Complete!</h3>
              <p className="text-xs text-gray-400 mt-2">
                Great job testing your understanding of these learning materials!
              </p>
              
              <div className="my-6 py-4 px-8 bg-white/5 border border-white/5 rounded-xl w-full">
                <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">Your Score</span>
                <div className="text-2xl font-extrabold text-white mt-1">
                  {quizScore} <span className="text-gray-500 text-lg">/ {quizQuestions.length}</span>
                </div>
                <span className="text-[10px] text-purple-400 font-medium block mt-1.5">
                  {quizScore === quizQuestions.length ? "Perfect Score! 🌟" : quizScore >= 3 ? "Good Job! 👍" : "Keep learning! 📚"}
                </span>
              </div>

              <div className="flex space-x-3 w-full">
                <button
                  onClick={() => {
                    setCurrentQuestionIdx(0);
                    setQuizScore(0);
                    setSelectedOptionIdx(null);
                    setIsAnswerSubmitted(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/25 text-purple-200 hover:text-white text-xs font-semibold transition-all duration-200"
                >
                  Retake Quiz
                </button>
                <button
                  onClick={() => setQuizActive(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all duration-200"
                >
                  Return to Chat
                </button>
              </div>
            </div>
          ) : (
            /* Active Question Panel */
            <div className="max-w-2xl w-full flex flex-col space-y-6">
              {/* Progress and Score Bar */}
              <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                <span>Question {currentQuestionIdx + 1} of {quizQuestions.length}</span>
                <span className="bg-purple-600/10 border border-purple-500/10 px-2.5 py-1 rounded-full text-purple-300 font-medium">
                  Score: {quizScore} / {quizQuestions.length}
                </span>
              </div>

              {/* Question Card */}
              <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 glass-card shadow-lg">
                <h4 className="text-sm font-semibold text-white leading-relaxed">
                  {quizQuestions[currentQuestionIdx].question}
                </h4>
              </div>

              {/* Option Choice Buttons */}
              <div className="grid grid-cols-1 gap-3">
                {quizQuestions[currentQuestionIdx].options.map((option, idx) => {
                  const isSelected = selectedOptionIdx === idx;
                  const isCorrect = quizQuestions[currentQuestionIdx].correct_index === idx;
                  
                  let btnStyle = "bg-white/[0.01] hover:bg-white/[0.03] border-white/5 text-gray-300 hover:text-white";
                  if (isSelected && !isAnswerSubmitted) {
                    btnStyle = "bg-purple-600/10 border-purple-500/50 text-purple-200 glow-purple";
                  } else if (isAnswerSubmitted) {
                    if (isCorrect) {
                      btnStyle = "bg-green-500/10 border-green-500/40 text-green-200";
                    } else if (isSelected) {
                      btnStyle = "bg-red-500/10 border-red-500/40 text-red-200";
                    } else {
                      btnStyle = "bg-white/[0.005] border-white/5 opacity-55 text-gray-500";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswerSubmitted}
                      onClick={() => setSelectedOptionIdx(idx)}
                      className={`w-full text-left p-4 rounded-xl border text-xs font-medium flex items-center justify-between transition-all duration-200 ${btnStyle}`}
                    >
                      <span>{option}</span>
                      {isAnswerSubmitted && isCorrect && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/25 px-1.5 py-0.5 rounded-full font-bold">Correct</span>
                      )}
                      {isAnswerSubmitted && isSelected && !isCorrect && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/25 px-1.5 py-0.5 rounded-full font-bold">Incorrect</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation Banner (Visible post Submission) */}
              {isAnswerSubmitted && (
                <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
                  selectedOptionIdx === quizQuestions[currentQuestionIdx].correct_index
                    ? "bg-green-500/[0.04] border-green-500/10 text-green-300/90"
                    : "bg-red-500/[0.04] border-red-500/10 text-red-300/90"
                }`}>
                  <span className="font-bold uppercase tracking-wider text-[9px] block mb-1 text-gray-400">Explanation:</span>
                  {quizQuestions[currentQuestionIdx].explanation}
                </div>
              )}

              {/* Submission Controls */}
              <div className="flex justify-end pt-2">
                {!isAnswerSubmitted ? (
                  <button
                    disabled={selectedOptionIdx === null}
                    onClick={() => {
                      setIsAnswerSubmitted(true);
                      if (selectedOptionIdx === quizQuestions[currentQuestionIdx].correct_index) {
                        setQuizScore(prev => prev + 1);
                      }
                    }}
                    className="py-2.5 px-8 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold text-xs tracking-wide transition-all shadow-lg glow-purple"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setCurrentQuestionIdx(prev => prev + 1);
                      setSelectedOptionIdx(null);
                      setIsAnswerSubmitted(false);
                    }}
                    className="py-2.5 px-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg glow-purple"
                  >
                    {currentQuestionIdx === quizQuestions.length - 1 ? "Finish Quiz" : "Next Question"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
