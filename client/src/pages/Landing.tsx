import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { 
  Sparkles, ArrowRight, Brain, Zap, Shield, LogOut, MessageSquare, 
  Database, ChevronRight, Layout, CheckCircle2, 
  Code2, Users, Building2, Terminal, Globe, Cpu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  
  // Parallax effects
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);
  const opacity = useTransform(scrollY, [0, 200], [1, 0]);
  const scale = useTransform(scrollY, [0, 300], [1, 0.9]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-teal-500/30 font-sans overflow-x-hidden transition-colors duration-500">
      
      {/* ── Fluid Background Visuals ───────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div 
          style={{ y: y1 }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-teal-500/20 to-transparent blur-[120px] animate-fluid-1" 
        />
        <motion.div 
          style={{ y: y2 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tl from-deep-blue/30 to-transparent blur-[120px] animate-fluid-2" 
        />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-gradient-to-tr from-cyan-500/10 to-transparent blur-[100px] animate-fluid-3" />
      </div>

      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-[100] transition-all duration-500 ${
        scrolled ? 'py-4 glass-nav shadow-2xl' : 'py-8 bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
              <Sparkles size={24} className="text-white animate-glow" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase text-white">Cortex One</span>
          </motion.div>

          <div className="hidden md:flex items-center gap-10">
            {['Features', 'How it Works', 'Use Cases'].map((item, i) => (
              <motion.a 
                key={item} 
                href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="text-sm font-bold text-slate-400 hover:text-teal-400 transition-colors py-1 relative group"
              >
                {item}
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-teal-400 transition-all duration-300 group-hover:w-full"></span>
              </motion.a>
            ))}
          </div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {!user ? (
              <>
                <Link to="/login" className="hidden sm:block px-6 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors">
                  Sign In
                </Link>
                <Link to="/register" className="btn-gradient flex items-center gap-2 group text-sm !px-6 !py-3">
                  Get Started <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link to="/chat" className="flex items-center gap-2 btn-gradient !px-6 !py-3 text-sm">
                  <Layout size={18} /> Launcher
                </Link>
                <button onClick={logout} className="p-3 rounded-2xl glass-card text-red-400 hover:bg-red-500/10 transition-all">
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative min-h-screen pt-48 pb-32 flex flex-col items-center justify-center z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-3 px-6 py-2 rounded-full glass-card text-xs font-black text-teal-400 mb-10 border border-teal-500/10 uppercase tracking-widest"
          >
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
            </span>
            NEURAL ENGINE v3.0 ACTIVE
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.0] text-white"
          >
            Elevate Your <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-500">Cognition.</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-lg md:text-2xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            A high-fidelity neural interface for hyper-speed document intelligence. 
            Secure, autonomous, and built for the future of SaaS.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-8 mt-10"
          >
            <Link 
              to={user ? "/chat" : "/register"}
              className="btn-gradient !px-10 !py-5 text-xl group flex items-center gap-4 hover:scale-105 active:scale-95 transition-all duration-300 shadow-2xl border border-teal-500/30"
            >
              Start Now <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>

          {/* 3D Abstract Visual Interaction */}
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6 }}
            className="mt-32 w-full max-w-6xl mx-auto relative group"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-blue-600 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative rounded-[2.2rem] glass-card p-6 overflow-hidden">
               <div className="grid grid-cols-12 gap-6 items-center">
                  <div className="col-span-12 lg:col-span-7 aspect-video rounded-3xl bg-black/40 border border-white/10 flex items-center justify-center relative overflow-hidden group">
                     <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        className="text-teal-500/10 scale-[2.5]"
                     >
                        <Brain size={400} />
                     </motion.div>
                     <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <motion.div 
                          animate={{ scale: [1, 1.1, 1] }} 
                          transition={{ duration: 2, repeat: Infinity }}
                          className="bg-teal-500/20 p-4 rounded-full border border-teal-500/30"
                        >
                          <Cpu size={60} className="text-teal-400" />
                        </motion.div>
                        <span className="text-teal-400 font-mono text-lg tracking-[0.3em] font-bold uppercase animate-pulse">Neural Grid Syncing...</span>
                     </div>
                  </div>
                  <div className="col-span-12 lg:col-span-5 text-left p-8 space-y-8">
                     <div className="space-y-2">
                        <h4 className="text-2xl font-black text-white">Advanced RAG Core</h4>
                        <p className="text-slate-400">Context-aware retrieval with vector-space precision.</p>
                     </div>
                     <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400"><Zap size={24} /></div>
                        <div>
                           <div className="text-white font-bold">1.2ms Latency</div>
                           <div className="text-xs text-slate-500 uppercase font-black">Response Speed</div>
                        </div>
                     </div>
                     <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="p-3 rounded-xl bg-teal-500/20 text-teal-400"><Database size={24} /></div>
                        <div>
                           <div className="text-white font-bold">Vector Indexed</div>
                           <div className="text-xs text-slate-500 uppercase font-black">Data Status</div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features Section ────────────────────────────────────────── */}
      <section id="features" className="relative py-48 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-32">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="text-sm font-black text-teal-400 uppercase tracking-[0.5em] mb-6"
            >
              Neural Capabilities
            </motion.h2>
            <motion.h3 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black tracking-tight text-white"
            >
              Engineered for <span className="text-teal-400">Precision.</span>
            </motion.h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {[
              { 
                icon: MessageSquare, 
                title: "Cognitive Chat", 
                desc: "Reason through complex documents with a natural language interface that understands nuance.", 
                gradient: "from-blue-500 to-cyan-500"
              },
              { 
                icon: Database, 
                title: "Neural Memory", 
                desc: "RAG-powered intelligence that transforms your data into high-performance vector embeddings.", 
                gradient: "from-teal-500 to-emerald-500"
              },
              { 
                icon: Shield, 
                title: "Quantum Lock", 
                desc: "End-to-end security architecture designed to isolate and protect your intellectual property.", 
                gradient: "from-purple-500 to-blue-600"
              },
              { 
                icon: Zap, 
                title: "Zero Latency", 
                desc: "Optimized distributed processing delivering instantaneous insights from massive datasets.", 
                gradient: "from-amber-400 to-orange-500"
              }
            ].map((feature, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -10 }}
                className="group p-10 rounded-[2.5rem] glass-card hover:bg-white/[0.08] transition-all duration-500 border border-white/5 hover:border-teal-500/30"
              >
                <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${feature.gradient} p-0.5 mb-8 group-hover:scale-110 transition-transform`}>
                  <div className="w-full h-full bg-[#0B0F19] rounded-[inherit] flex items-center justify-center">
                    <feature.icon size={36} className="text-white" />
                  </div>
                </div>
                <h4 className="text-2xl font-black mb-6 text-white">{feature.title}</h4>
                <p className="text-slate-400 leading-relaxed text-lg">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative py-48">
        <div className="max-w-7xl mx-auto px-6">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-32 items-center">
             <motion.div
               initial={{ opacity: 0, x: -50 }}
               whileInView={{ opacity: 1, x: 0 }}
               transition={{ duration: 0.8 }}
             >
                <h2 className="text-sm font-black text-teal-400 uppercase tracking-[0.5em] mb-6">The Workflow</h2>
                <h3 className="text-5xl md:text-7xl font-black text-white mb-12">Intelligence in <span className="text-cyan-400">Seconds.</span></h3>
                
                <div className="space-y-12">
                   {[
                     { step: "01", title: "Neural Ingestion", desc: "Our engine strips and pre-processes raw documents using multi-stage neural sanitization for perfect clarity." },
                     { step: "02", title: "Vector Encoding", desc: "Data is projected into 1024-dimensional space, creating a dense semantic map of your entire knowledge base." },
                     { step: "03", title: "Cognitive Synthesis", desc: "The RAG controller orchestrates real-time retrieval to generate grounded, factual, and high-density answers." }
                   ].map((item, i) => (
                      <div key={i} className="flex gap-10 items-start group">
                         <div className="flex-shrink-0 w-16 h-16 rounded-3xl glass-card flex items-center justify-center font-black text-teal-400 text-2xl group-hover:bg-teal-500 group-hover:text-white transition-all duration-500 border-teal-500/20 group-hover:border-teal-400">
                           {item.step}
                         </div>
                         <div className="pt-2">
                            <h4 className="text-2xl font-black mb-3 text-white group-hover:text-teal-400 transition-colors uppercase tracking-wider">{item.title}</h4>
                            <p className="text-slate-400 text-lg leading-relaxed">{item.desc}</p>
                         </div>
                      </div>
                   ))}
                </div>
             </motion.div>
             
             <motion.div 
               initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
               whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
               transition={{ duration: 1 }}
               className="relative flex justify-center lg:justify-end"
             >
                <div className="w-full max-w-lg aspect-square bg-gradient-to-br from-teal-500/10 via-cyan-500/10 to-transparent rounded-full flex items-center justify-center relative border border-white/5">
                   <div className="absolute inset-0 border-2 border-dashed border-teal-500/20 rounded-full animate-[spin_60s_linear_infinite]"></div>
                   
                   <motion.div 
                    animate={{ y: [0, -20, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="relative w-3/4 h-3/4 glass-card rounded-[4rem] p-12 flex items-center justify-center shadow-[0_0_100px_rgba(20,184,166,0.15)] group"
                   >
                     <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent rounded-[inherit]"></div>
                     <Cpu size={120} className="text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.5)] group-hover:scale-110 transition-transform duration-700" />
                     
                     <div className="absolute -top-10 -right-10 p-6 glass-card rounded-3xl animate-slow-float">
                        <CheckCircle2 size={40} className="text-teal-400" />
                     </div>
                     <div className="absolute -bottom-10 -left-10 p-6 glass-card rounded-3xl animate-slow-float [animation-delay:-3s]">
                        <Globe size={40} className="text-cyan-400" />
                     </div>
                   </motion.div>
                </div>
             </motion.div>
           </div>
        </div>
      </section>

      {/* ── Use Cases ───────────────────────────────────────────────── */}
      <section id="use-cases" className="relative py-48">
        <div className="max-w-7xl mx-auto px-6 text-center mb-32">
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} className="text-sm font-black text-teal-400 uppercase tracking-[0.5em] mb-6">Versatility</motion.h2>
          <motion.h3 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} className="text-5xl md:text-7xl font-black text-white">Universal Intelligence.</motion.h3>
        </div>

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
           {[
             { icon: Code2, title: "Architects", desc: "Decode complex technical ecosystems and legacies with high-fidelity semantic search." },
             { icon: Users, title: "Researchers", desc: "Synthesize global knowledge threads into coherent actionable insights at light speed." },
             { icon: Building2, title: "Enterprises", desc: "Activate institutional knowledge and policy frameworks through autonomous reasoning." }
           ].map((item, i) => (
             <motion.div 
               key={i}
               initial={{ opacity: 0, y: 40 }}
               whileInView={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               className="p-12 rounded-[3rem] glass-card text-center flex flex-col items-center hover:border-teal-500/50 transition-all duration-700 group cursor-default"
             >
                <div className="mb-10 p-6 glass-card rounded-3xl group-hover:bg-teal-500/10 transition-colors">
                  <item.icon size={48} className="text-teal-400 group-hover:rotate-12 transition-transform duration-500" />
                </div>
                <h4 className="text-3xl font-black mb-6 text-white uppercase tracking-widest">{item.title}</h4>
                <p className="text-xl text-slate-400 leading-relaxed italic">"{item.desc}"</p>
             </motion.div>
           ))}
        </div>
      </section>

      {/* ── CTA Banner ─────────────────────────────────────────────── */}
      <section className="relative py-48 px-6 overflow-hidden">
         <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          className="max-w-6xl mx-auto rounded-[4rem] p-[2px] bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 group shadow-[0_0_100px_rgba(20,184,166,0.2)]"
         >
            <div className="bg-[#020617] p-16 md:p-32 rounded-[3.9rem] flex flex-col items-center text-center relative overflow-hidden">
               <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-teal-500/10 blur-[150px] rounded-full pointer-events-none"></div>
               <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-blue-500/10 blur-[150px] rounded-full pointer-events-none"></div>
               
               <h3 className="text-5xl md:text-8xl font-black tracking-tight mb-12 text-white leading-tight">
                 Ready to reach <br /> <span className="text-teal-400">Escape Velocity?</span>
               </h3>
               <p className="text-2xl text-slate-400 mb-16 max-w-3xl leading-relaxed">
                 Join the decentralized network of intelligence. <br /> Initialize your node today.
               </p>
               
               <Link to="/register" className="px-16 py-8 bg-white text-black font-black text-2xl rounded-3xl hover:bg-neutral-200 transition-all hover:scale-105 active:scale-95 shadow-2xl flex items-center gap-4">
                 Get Started Now <ChevronRight size={32} />
               </Link>
            </div>
         </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="relative pt-48 pb-24 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
           <div className="flex items-center gap-4 mb-16 group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
                <Sparkles size={24} className="text-white" />
              </div>
              <span className="text-3xl font-black tracking-tighter uppercase text-white">Cortex One</span>
           </div>
           
           <div className="flex flex-wrap justify-center gap-16 mb-20 text-lg uppercase font-black tracking-widest text-slate-500">
             {['About', 'Features', 'Community', 'Status', 'Security', 'Enterprise'].map(item => (
                <a key={item} href="#" className="hover:text-teal-400 transition-colors">{item}</a>
             ))}
           </div>
           
           <p className="text-sm font-black tracking-[1em] text-slate-700 uppercase mb-4 text-center">
             DEEP COGNITION SYSTEM · ANTIGRAVITY v1.0
           </p>
           <p className="text-sm text-slate-500">
             © 2026 Cortex One Neural Operations. All rights reserved.
           </p>
        </div>
      </footer>

    </div>
  );
}

