import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, UploadCloud, FileText, CheckCircle2, AlertCircle,
  MessageSquare, Database, Moon, Sun, Settings, Sparkles,
  ArrowRight, Loader2
} from 'lucide-react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

interface DocumentRecord {
  id: string;
  name: string;
  size: number;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchDocuments = async () => {
    try {
      const { data } = await api.get('/documents');
      setDocuments(data);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 10000);
    return () => clearInterval(interval);
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    if (!user) return;

    setUploading(true);
    for (const file of acceptedFiles) {
      try {
        const fileName = `${user.id}/${Date.now()}_${file.name}`;

        // 1. DUAL INGRESS - Supabase Storage
        const { error: storageError } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (storageError) throw storageError;

        // 2. DUAL INGRESS - Backend Neural Sync
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', user.id);

        const uploadPromise = api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        toast.promise(uploadPromise, {
          loading: `Syncing ${file.name} to Neural Grid...`,
          success: 'Knowledge Base Updated!',
          error: 'Neural Link Interrupted.',
        });

        await uploadPromise;
        fetchDocuments();
      } catch (err: any) {
        console.error('[Dashboard] Sync Fail:', err.message);
        toast.error(`Ingest Failed: ${err.message}`);
      }
    }
    setUploading(false);
  }, [user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    }
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-hidden relative flex selection:bg-teal-500/30">

      {/* ── Background Elements ───────────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-teal-500/5 blur-[120px] animate-fluid-1" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/5 blur-[120px] animate-fluid-2" />
      </div>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 h-full glass-nav border-r border-white/5 flex flex-col z-40 relative shadow-2xl hidden lg:flex">
        <div className="p-6 pb-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Sparkles size={20} className="text-white animate-glow" />
            </div>
            <span className="font-black text-xs tracking-[0.2em] text-white uppercase opacity-80">Cortex One</span>
          </Link>
        </div>

        <div className="px-5 py-6 space-y-1.5">
          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-xs group ${window.location.pathname === '/dashboard'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/10 shadow-sm'
                : 'text-slate-500 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
          >
            <Database size={16} className={window.location.pathname === '/dashboard' ? 'text-teal-400' : 'text-slate-600'} />
            <span className="font-bold uppercase tracking-widest text-[10px]">Knowledge Base</span>
          </button>

          <button
            onClick={() => navigate('/chat')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-xs group ${window.location.pathname === '/chat'
                ? 'bg-teal-500/10 text-teal-300 border border-teal-500/10 shadow-sm'
                : 'text-slate-500 hover:bg-white/5 hover:text-white border border-transparent'
              }`}
          >
            <MessageSquare size={16} className={window.location.pathname === '/chat' ? 'text-slate-600 group-hover:text-slate-400' : 'text-slate-600'} />
            <span className="font-bold uppercase tracking-widest text-[10px]">Neural Chat</span>
          </button>
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
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Dashboard ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto z-10 relative selection:bg-teal-500/20">
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-background/50 backdrop-blur-2xl sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <h2 className="text-xs font-black text-white uppercase tracking-[0.3em]">Knowledge Configuration</h2>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className="p-3 text-slate-400 hover:text-white transition-colors">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="p-3 text-slate-400 hover:text-white transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto w-full px-10 py-16"
        >

          <div className="mb-12">
            <h1 className="text-4xl font-black text-white tracking-tighter mb-3">Neuro Library</h1>
            <p className="text-slate-500 text-base font-bold max-w-2xl leading-relaxed">
              Inject external assets into the neural grid. Our vector engine will segment and index your data for high-fidelity RAG processing.
            </p>
          </div>

          <div
            {...getRootProps()}
            className={`glass-card p-12 rounded-3xl border-2 border-dashed text-center transition-all group relative overflow-hidden ${isDragActive ? 'border-teal-500 bg-teal-500/10' : 'border-white/5 hover:border-teal-500/20 bg-white/5'
              }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none" />
            <input {...getInputProps()} />

            <div className={`w-16 h-16 mx-auto rounded-2xl bg-background border border-white/5 flex items-center justify-center transition-all duration-500 shadow-xl relative z-10 ${isDragActive ? 'scale-110 shadow-teal-500/20' : 'group-hover:scale-105'}`}>
              <UploadCloud size={32} className="text-teal-400" />
            </div>

            <h3 className="mt-8 text-2xl font-black text-white tracking-tight relative z-10 uppercase tracking-widest">
              {isDragActive ? 'Release Neural Assets' : 'Deploy Assets to Grid'}
            </h3>
            <p className="mt-3 text-slate-500 font-bold text-sm relative z-10">DROP PDF/TXT ARCHIVES OR CLICK TO INITIATE TRANSFER</p>

            <AnimatePresence>
              {uploading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 flex flex-col items-center gap-4 relative z-10"
                >
                  <Loader2 className="animate-spin text-teal-400" size={32} />
                  <p className="text-xs font-black text-teal-400 uppercase tracking-[0.3em]">Synching with Vector Grid...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-20 space-y-10">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] flex items-center gap-4">
                <Database size={16} className="text-teal-500" />
                Indexed Repositories
              </h3>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{documents.length} Units Online</span>
            </div>

            <div className="space-y-4">
              {documents.length === 0 ? (
                <div className="glass-card p-20 rounded-[3rem] border border-white/5 text-center">
                  <p className="text-slate-600 font-bold uppercase tracking-widest">Grid currently empty.</p>
                </div>
              ) : (
                documents.map((doc) => (
                  <motion.div
                    layout
                    key={doc.id}
                    className="glass-card p-6 flex items-center justify-between rounded-[2rem] border border-white/5 hover:border-white/10 transition-all group"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <FileText size={24} className="text-teal-400" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-white tracking-tight truncate max-w-sm">{doc.name}</p>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{formatSize(doc.size)}</span>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {doc.status === 'COMPLETED' ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-teal-400/10 border border-teal-400/20 text-teal-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                          <CheckCircle2 size={12} /> Live
                        </div>
                      ) : doc.status === 'PROCESSING' ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                          <Loader2 size={12} className="animate-spin" /> Indexing
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-4 py-2 bg-red-400/10 border border-red-400/20 text-red-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                          <AlertCircle size={12} /> Refused
                        </div>
                      )}
                      <button
                        onClick={() => navigate('/chat')}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all opacity-0 group-hover:opacity-100"
                      >
                        <ArrowRight size={20} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
