import { useState } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { motion, AnimatePresence } from 'framer-motion';

type Props = {
    onSuccess?: (doc: SavedDocument) => void;
};

export type SavedDocument = {
    id: string;
    fileName: string;
    extractedText: string;
    metadata: {
        summary: string;
        keyPoints: string[];
        documentType: string;
        topics: string[];
    };
    storagePath: string;
    createdAt: string;
};

export default function DocumentUpload({ onSuccess }: Props) {
    const [pasteText, setPasteText] = useState('');
    const { upload, isLoading, error, result, reset } = useDocumentUpload();

    // ── react-dropzone setup ──────────────────────────────────────────────
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: {
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'text/plain': ['.txt'],
            'text/markdown': ['.md'],
        },
        maxSize: 10 * 1024 * 1024,
        multiple: false,
        disabled: isLoading,
        onDropAccepted: async ([file]) => {
            reset();
            const doc = await upload({ file });
            if (doc) {
                toast.success(`"${doc.fileName}" synced to neural grid`);
                onSuccess?.(doc);
            }
        },
        onDropRejected: ([rejection]) => {
            const msg = rejection.errors[0]?.message ?? 'File rejected';
            toast.error(msg);
        },
    });

    // ── Text submit ───────────────────────────────────────────────────────
    async function handleTextSubmit() {
        if (!pasteText.trim()) return;
        reset();
        const doc = await upload({ content: pasteText.trim() });
        if (doc) {
            toast.success('Text document synced to neural grid');
            setPasteText('');
            onSuccess?.(doc);
        }
    }

    return (
        <div className="space-y-8 w-full max-w-2xl mx-auto">

            {/* ── Drop Zone ── */}
            <div
                {...getRootProps()}
                className={`
                    glass-card relative flex flex-col items-center justify-center gap-4
                    rounded-3xl border-2 border-dashed p-14 cursor-pointer
                    transition-all duration-300 select-none group overflow-hidden
                    ${isDragActive
                        ? 'border-teal-500 bg-teal-500/10 scale-[1.01]'
                        : 'border-white/10 hover:border-teal-500/30 hover:bg-white/5'
                    }
                    ${isLoading ? 'pointer-events-none opacity-60' : ''}
                `}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent pointer-events-none" />
                <input {...getInputProps()} />

                <div className={`
                    w-16 h-16 rounded-2xl flex items-center justify-center
                    transition-all duration-500 shadow-xl relative z-10
                    ${isDragActive
                        ? 'bg-teal-500/20 scale-110 shadow-teal-500/20'
                        : 'bg-white/5 border border-white/10 group-hover:scale-105'
                    }
                `}>
                    {isLoading ? (
                        <Loader2 className="h-8 w-8 text-teal-400 animate-spin" />
                    ) : (
                        <Upload className={`h-8 w-8 ${isDragActive ? 'text-teal-400 animate-bounce' : 'text-slate-400 group-hover:text-teal-400'} transition-colors`} />
                    )}
                </div>

                <div className="text-center relative z-10">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest">
                        {isLoading
                            ? 'Processing Neural Data...'
                            : isDragActive
                                ? 'Release Neural Assets'
                                : 'Deploy Assets to Grid'}
                    </h3>
                    <p className="mt-2 text-slate-500 font-bold text-xs uppercase tracking-[0.2em]">
                        PDF, DOCX, TXT, MD — MAX 10 MB
                    </p>
                </div>

                <AnimatePresence>
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-2 flex items-center gap-3 text-teal-400 relative z-10"
                        >
                            <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shadow-[0_0_8px_#2dd4bf]" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em]">
                                Synching with Neural Grid...
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Divider ── */}
            <div className="flex items-center gap-4 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">
                <span className="flex-1 h-px bg-white/5" />
                or paste text
                <span className="flex-1 h-px bg-white/5" />
            </div>

            {/* ── Paste Text ── */}
            <div className="space-y-4">
                <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    disabled={isLoading}
                    rows={6}
                    placeholder="Paste document content here…"
                    className="
                        w-full rounded-2xl glass-card border border-white/10
                        px-5 py-4 text-sm text-white placeholder:text-slate-700
                        focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/30
                        disabled:opacity-50 resize-none transition-all font-bold bg-transparent
                    "
                />
                <button
                    onClick={handleTextSubmit}
                    disabled={isLoading || !pasteText.trim()}
                    className="
                        w-full flex items-center justify-center gap-3
                        btn-gradient rounded-2xl py-3 px-6
                        disabled:opacity-30 disabled:cursor-not-allowed
                        text-xs
                    "
                >
                    {isLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                        <><FileText className="h-4 w-4" /> Save Text Document</>
                    )}
                </button>
            </div>

            {/* ── Error Banner ── */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-start gap-4 rounded-2xl border border-red-500/20 bg-red-950/30 px-5 py-4 text-sm text-red-300"
                    >
                        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0 text-red-400" />
                        <span className="font-bold">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Success Result ── */}
            <AnimatePresence>
                {result && !error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="glass-card rounded-3xl border border-teal-500/20 p-6 space-y-4"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                                <CheckCircle2 size={20} className="text-teal-400" />
                            </div>
                            <div>
                                <p className="font-black text-white text-sm uppercase tracking-tight">{result.fileName}</p>
                                <p className="text-[10px] font-black text-teal-400 uppercase tracking-[0.2em]">Neural Sync Complete</p>
                            </div>
                        </div>

                        {result.metadata?.summary && (
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Summary</p>
                                <p className="text-sm text-slate-300 font-bold leading-relaxed">{result.metadata.summary}</p>
                            </div>
                        )}

                        {result.metadata?.keyPoints?.length > 0 && (
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Key Points</p>
                                <ul className="space-y-2">
                                    {result.metadata.keyPoints.map((point, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300 font-bold">
                                            <Sparkles size={12} className="text-teal-400 mt-1 shrink-0" />
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.metadata?.topics?.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {result.metadata.topics.map((topic, i) => (
                                    <span
                                        key={i}
                                        className="px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-[10px] font-black text-teal-400 uppercase tracking-widest"
                                    >
                                        {topic}
                                    </span>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
