import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Send, MessageSquare, Plus, User as UserIcon, Settings,
  ChevronRight, Menu, Database, Copy, Upload, X,
  FileText, Loader2, AlertCircle, CheckCircle2, Sparkles,
  Cpu, Hash
} from 'lucide-react';
import api from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import TextareaAutosize from 'react-textarea-autosize';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sourceType?: 'casual' | 'doc' | 'wiki' | 'general';
  sources?: { documentName: string; chunkId: string }[];
  createdAt?: string;
}

interface Session {
  id: string;
  title: string;
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [, setCopiedId] = useState<string | null>(null);

  // Document upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [lastSendTime, setLastSendTime] = useState(0);
  const [libraryDocuments, setLibraryDocuments] = useState<any[]>([]);
  const [bridgeMode, setBridgeMode] = useState<'smart' | 'doc'>('smart');

  // Toast state
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleSendRef = useRef<any>(null);


  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    // Only auto-dismiss successes to let errors stay for debugging
    if (type === 'success') {
      toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    showToast('Copied to neuro-clipboard', 'success');
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadSessions = async () => {
    try {
      const { data } = await api.get('/chat/sessions');
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
    }
  };

  const loadLibraryDocuments = async () => {
    try {
      const { data } = await api.get('/documents');
      setLibraryDocuments(data);
    } catch (err) {
      console.error('Failed to load library', err);
    }
  };

  const loadMessages = async (sessionId: string) => {
    try {
      const { data } = await api.get(`/chat/sessions/${sessionId}/messages`);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  const createNewSession = async () => {
    try {
      setUploadedFile(null);
      setDocumentId(null);
      setInput('');

      const { data } = await api.post('/chat/sessions', { title: 'New Neural Thread' });
      setSessions([data, ...sessions]);
      setActiveSession(data.id);
      setMessages([]);
      setTimeout(() => textareaRef.current?.focus(), 100);
      return data.id;
    } catch (err) {
      console.error('Failed to create session', err);
      return null;
    }
  };

  const handleSend = async (e?: React.FormEvent, voiceMsg?: string) => {
    if (e) e.preventDefault();
    const currentInput = voiceMsg || textareaRef.current?.value || input;
    if (!currentInput.trim() || loading) return;

    const now = Date.now();
    if (!voiceMsg && now - lastSendTime < 1500) {
      showToast('Wait for synchronization', 'error');
      return;
    }

    const userMsg = currentInput.trim();
    setInput('');
    setLoading(true);
    setLastSendTime(now);

    let sessionId = activeSession;
    if (!sessionId) {
      sessionId = await createNewSession();
      if (!sessionId) {
        setLoading(false);
        return;
      }
    }

    const tempId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: userMsg,
      createdAt: new Date().toISOString()
    }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ content: userMsg, documentId, mode: bridgeMode }), // Added mode to request body
      });

      if (!response.ok) throw new Error('API Error');

      setLoading(false);

      const currentSession = sessions.find(s => s.id === sessionId);
      if (!currentSession?.title || currentSession.title === 'New Neural Thread') {
        const newTitle = userMsg.length > 25 ? userMsg.substring(0, 25) + '...' : userMsg;
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const astTempId = Date.now().toString() + '-ast';

      setMessages(prev => [...prev, {
        id: astTempId,
        role: 'assistant',
        content: '',
        sources: [],
        createdAt: new Date().toISOString()
      }]);

      if (reader) {
        let textBuffer = '';
        let fullResponse = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });
          const lines = textBuffer.split('\n\n');
          textBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'token') {
                  fullResponse += data.text;
                  setMessages(prev => prev.map(msg =>
                    msg.id === astTempId ? { ...msg, content: msg.content + data.text } : msg
                  ));
                } else if (data.type === 'sources') {
                  setMessages(prev => prev.map(msg =>
                    msg.id === astTempId ? { ...msg, sources: data.sources, sourceType: data.sourceType } : msg
                  ));
                }
              } catch (e) { }
            }
          }
        }
      }
    } catch (err) {
      showToast('Neurolink connection failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update effect for handleSendRef
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadSessions();
    loadLibraryDocuments();
  }, [user, navigate]);

  useEffect(() => {
    if (activeSession) {
      loadMessages(activeSession);
      setUploadedFile(null);
      setDocumentId(null);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Neural Sync Polling: Automatically refresh library if any document is processing
  useEffect(() => {
    const hasProcessing = libraryDocuments.some(doc => doc.status === 'PROCESSING');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      console.log('[NeuralLink] Synchronizing state...');
      await loadLibraryDocuments();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [libraryDocuments]);

  const handleFileUpload = async (file: File) => {
    const allowedExtensions = /\.(pdf|docx|md|markdown|txt)$/i;
    if (!allowedExtensions.test(file.name)) {
      showToast('Supported formats: PDF, DOCX, MD, TXT', 'error');
      return;
    }

    setUploadedFile(file);
    setDocumentId(null);
    setUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      console.log(`[Chat] Uploading: ${file.name} | Size: ${file.size} bytes | Type: ${file.type}`);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Chat] Upload error response:', errorData);
        throw new Error(errorData.error || `Upload failed (${response.status})`);
      }

      const result = await response.json();
      console.log('[Chat] Upload success response:', result);

      if (result.status === 'completed' || result.status === 'processing') {
        await loadLibraryDocuments();

        if (result.status === 'completed') {
          setDocumentId(result.documentId);
          const debugInfo = result.debug ? ` (${result.debug.totalChunks} chunks, ${result.debug.textLength} chars)` : '';
          showToast(`Success! ${file.name} is now online.${debugInfo}`, 'success');
        } else {
          showToast(`${file.name} is synchronizing...`, 'success');
        }
      } else {
        throw new Error(result.message || 'Neural ingestion failed');
      }
    } catch (err: any) {
      setUploadedFile(null);
      showToast(err.message || 'Ingestion failed', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };


  const handleDragStart = (e: React.DragEvent, doc: any) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'internal-doc',
      id: doc.id,
      name: doc.name
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      try {
        const data = JSON.parse(internalData);
        if (data.type === 'internal-doc') {
          setDocumentId(data.id);
          setUploadedFile({ name: data.name } as any);
          showToast(`Context Injected: ${data.name}`, 'success');
          return;
        }
      } catch (err) { }
    }

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div
      className="flex h-screen bg-background text-foreground font-sans overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-teal-950/40 backdrop-blur-md flex flex-col items-center justify-center p-10 border-[4px] border-dashed border-teal-400/50 m-6 rounded-[3rem] pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-background/80 p-16 rounded-[4rem] shadow-2xl border border-teal-500/30 flex flex-col items-center text-center space-y-8"
            >
              <div className="w-32 h-32 rounded-[2.5rem] bg-teal-500/20 flex items-center justify-center text-teal-400">
                <Upload size={64} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-4xl font-black text-white tracking-tighter uppercase mb-4">Neural Data Drop</h2>
                <p className="text-slate-400 text-lg font-bold max-sm lowercase tracking-tight">Release assets to synchronize with the Cortex One vector grid</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <div className="absolute top-[10%] right-[10%] w-[500px] h-[500px] bg-teal-500/10 blur-[150px] animate-fluid-1" />
        <div className="absolute bottom-[10%] left-[10%] w-[500px] h-[500px] bg-blue-500/10 blur-[150px] animate-fluid-2" />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-72 h-full glass-nav border-r border-white/5 flex flex-col z-40 relative shadow-2xl"
          >
            <div className="p-8 pb-4 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Sparkles size={20} className="text-white animate-glow" />
                </div>
                <span className="font-black text-xs tracking-[0.2em] text-white uppercase opacity-80">Cortex One</span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-slate-500 hover:text-white transition-colors"
              >
                <ChevronRight className="rotate-180" size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-2">
              <button
                onClick={createNewSession}
                className="btn-gradient w-full flex items-center justify-center gap-2 py-2.5 !text-[11px]"
              >
                <Plus size={16} />
                <span>New Session</span>
              </button>

              <button
                onClick={() => navigate('/dashboard')}
                className="btn-outline w-full flex items-center justify-center gap-2 py-2.5 !text-[11px] border-teal-500/10 text-teal-400 hover:bg-teal-500/5"
              >
                <Database size={16} />
                <span>Knowledge Base</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-6 pt-2 scrollbar-hide">
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-4">Neural History</h3>
                <div className="space-y-1">
                  {sessions.length === 0 ? (
                    <div className="px-4 py-6 text-center bg-white/5 rounded-xl border border-white/5">
                      <p className="text-[11px] text-slate-500">No sessions found.</p>
                    </div>
                  ) : sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSession(s.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-xs group ${activeSession === s.id
                        ? 'bg-teal-500/10 text-teal-300 border border-teal-500/10 shadow-sm'
                        : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                        }`}
                    >
                      <MessageSquare size={14} className={activeSession === s.id ? 'text-teal-400' : 'text-slate-600 group-hover:text-slate-400'} />
                      <span className="truncate flex-1 text-left font-bold">{s.title}</span>
                      {activeSession === s.id && <motion.div layoutId="active-dot" className="w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf]" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-4">Ingested Contexts</h3>
                <div className="space-y-1">
                  {libraryDocuments.map(doc => (
                    <button
                      key={doc.id}
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, doc)}
                      onClick={() => {
                        setDocumentId(doc.id);
                        setUploadedFile({ name: doc.name } as any);
                        showToast(`Context switched`, 'success');
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[10px] group ${documentId === doc.id
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/10'
                        : 'text-slate-600 hover:bg-white/5 active:scale-95'
                        }`}
                    >
                      <FileText size={12} className={documentId === doc.id ? 'text-cyan-400' : 'text-slate-700'} />
                      <span className="truncate flex-1 text-left font-bold uppercase tracking-tight">{doc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 mt-auto border-t border-white/5 bg-black/20">
              <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-black text-lg shadow-lg">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate uppercase tracking-tighter">Session User</p>
                  <p className="text-[10px] text-slate-500 truncate lowercase">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative min-w-0 h-full overflow-hidden">

        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-background/50 backdrop-blur-2xl z-30">
          <div className="flex items-center gap-6">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-white"
              >
                <Menu size={20} />
              </button>
            )}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shadow-[0_0_8px_#2dd4bf]" />
                <h2 className="text-sm font-black text-white uppercase tracking-widest truncate max-w-sm">
                  {sessions.find(s => s.id === activeSession)?.title || 'Neural Bridge Idle'}
                </h2>
              </div>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Quantum Encypted Tunnel</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {uploadedFile && (
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-full">
                <FileText size={14} className="text-teal-400" />
                <span className="text-[11px] font-black text-teal-300 uppercase tracking-tighter truncate max-w-[150px]">{uploadedFile.name}</span>
                <button
                  onClick={() => handleSend(undefined, "Summarize this document")}
                  className="ml-2 px-3 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/40 text-[9px] font-black uppercase text-teal-300 border border-teal-500/30 transition-all flex items-center gap-1.5"
                >
                  <Sparkles size={10} />
                  Summarize
                </button>
                <button onClick={() => { setUploadedFile(null); setDocumentId(null); }} className="hover:text-white text-teal-500 transition-colors ml-1">
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="h-8 w-px bg-white/10" />
            <button className="p-3 text-slate-400 hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-hide py-12 px-6">
          <div className="max-w-3xl mx-auto space-y-12">

            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center pt-24 text-center"
              >
                <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center shadow-2xl mb-10 relative">
                  <div className="absolute inset-0 bg-teal-400/20 blur-2xl rounded-full animate-pulse" />
                  <Cpu size={48} className="text-white relative z-10" />
                </div>
                <h1 className="text-5xl font-black text-white tracking-tighter mb-4">BRAIN LINK READY</h1>
                <p className="text-slate-400 text-lg max-w-lg font-bold">Initiate neural transfer or upload system assets to begin cognitive processing.</p>
                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                  {[['System Architecture', 'Analyze structures'], ['Logic Processing', 'Verify neural paths']].map(([t, d]) => (
                    <button key={t} className="glass-card p-5 rounded-3xl border border-white/5 hover:border-teal-500/20 text-left group transition-all">
                      <p className="text-[10px] font-black text-teal-400 mb-1.5 uppercase tracking-widest">{t}</p>
                      <p className="text-white text-sm font-bold">{d}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              messages.map((msg, i) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex gap-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg">
                      <Sparkles size={24} className="text-teal-400" />
                    </div>
                  )}

                  <div className={`relative max-w-[80%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="px-6 py-4 bg-gradient-to-br from-teal-500 to-blue-600 text-white rounded-[1.75rem] rounded-tr-sm shadow-xl text-base font-bold leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="glass-card p-6 rounded-[2rem] rounded-tl-sm border border-white/10 shadow-2xl text-slate-200 text-base leading-relaxed transition-all hover:border-white/20 group/msg relative">
                        {msg.sourceType && (
                          <div className={`mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${msg.sourceType === 'doc' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                            msg.sourceType === 'casual' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                              msg.sourceType === 'wiki' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}>
                            {msg.sourceType === 'doc' ? '📄 Document Answer' :
                              msg.sourceType === 'casual' ? '💬 Casual' :
                                msg.sourceType === 'wiki' ? '📚 Wikipedia + AI' :
                                  '🌐 General AI'}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        <div className="absolute -right-12 top-0 flex flex-col gap-2 opacity-0 group-hover/msg:opacity-100 transition-all">
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white"
                          >
                            <Copy size={16} />
                          </button>
                        </div>

                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-10 pt-8 border-t border-white/5 flex flex-wrap gap-3">
                            {msg.sources.map((s, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/5 border border-teal-500/10 text-[10px] font-black text-teal-400 uppercase tracking-widest">
                                <Hash size={12} className="opacity-50" />
                                {s.documentName}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="mt-4 px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">{msg.createdAt && new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg">
                      <UserIcon size={24} className="text-slate-400" />
                    </div>
                  )}
                </motion.div>
              ))
            )}

            {loading && (
              <div className="flex gap-6 justify-start animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <Loader2 size={24} className="text-teal-400 animate-spin" />
                </div>
                <div className="h-20 w-48 glass-card border-none mt-2" />
              </div>
            )}

            <div ref={messagesEndRef} className="h-24" />
          </div>
        </div>

        <div className="p-6 pt-0 bg-gradient-to-t from-background via-background/95 to-transparent z-40">
          <div className="max-w-3xl mx-auto relative group">

            <div className={`relative transition-all duration-500 rounded-3xl p-1.5 border border-white/5 bg-white/5 backdrop-blur-3xl shadow-xl ${loading ? 'opacity-50 pointer-events-none' : 'hover:border-teal-500/20 hover:bg-white/10'}`}>

              <div className="flex items-end gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-teal-500/10 border border-white/5 hover:border-teal-500/30 transition-all text-slate-500 hover:text-teal-400 group/upload"
                >
                  {uploadLoading ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileInputChange}
                  accept=".pdf,.docx,.md,.markdown,.txt"
                />

                <TextareaAutosize
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Transmit logic to Cortex One..."
                  className="w-full bg-transparent border-none focus:ring-0 focus:outline-none outline-none resize-none py-2 px-2 text-white text-sm placeholder-slate-700 font-bold shadow-none ring-0 focus-visible:ring-0"
                  maxRows={8}
                />

                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className={`p-2.5 rounded-xl transition-all flex items-center justify-center gap-2 px-5 font-bold uppercase tracking-widest text-[11px] shadow-lg ${input.trim() ? 'bg-gradient-to-br from-teal-400 to-blue-600 text-white hover:shadow-teal-500/20' : 'bg-white/5 text-slate-700'}`}
                >
                  <span className="hidden md:block">Execute</span>
                  <Send size={16} />
                </button>
              </div>

              <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-emerald-400 animate-pulse' : 'bg-slate-700'}`} />
                  {loading ? 'Processing Neural Token' : 'Neural Bridge Ready'}
                </div>

                <div className="hidden md:flex items-center p-0.5 rounded-lg bg-black/40 border border-white/5 ml-4">
                  <button
                    onClick={() => setBridgeMode('smart')}
                    className={`px-3 py-1 rounded-md transition-all ${bridgeMode === 'smart' ? 'bg-teal-500/20 text-teal-400' : 'text-slate-600 hover:text-slate-400'}`}
                  >
                    Smart
                  </button>
                  <button
                    onClick={() => setBridgeMode('doc')}
                    className={`px-3 py-1 rounded-md transition-all ${bridgeMode === 'doc' ? 'bg-teal-500/20 text-teal-400' : 'text-slate-600 hover:text-slate-400'}`}
                  >
                    Doc-Only
                  </button>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[10px] text-center text-slate-600 font-black uppercase tracking-[0.3em]">Neural processing may hallucinate. Verify critical logic.</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            className={`fixed bottom-12 right-12 z-[100] p-6 rounded-[2.5rem] border shadow-2xl backdrop-blur-3xl max-w-xl min-w-[320px] ${toast.type === 'success' ? 'bg-teal-950/40 border-teal-500/30 text-teal-100' : 'bg-red-950/40 border-red-500/30 text-red-100'
              }`}
          >
            <div className="flex items-start gap-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${toast.type === 'success' ? 'bg-teal-500/20' : 'bg-red-500/20'}`}>
                {toast.type === 'success' ? <CheckCircle2 size={24} className="text-teal-400" /> : <AlertCircle size={24} className="text-red-400" />}
              </div>
              <div className="flex-1 pt-1.5">
                <p className="font-black uppercase tracking-[0.2em] text-[10px] mb-2 opacity-60">
                  {toast.type === 'success' ? 'Neural Sync Confirmed' : 'Neural Link Error'}
                </p>
                <p className="font-bold text-sm leading-relaxed whitespace-pre-wrap">{toast.message}</p>
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
