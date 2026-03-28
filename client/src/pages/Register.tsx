import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Google authentication failed');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: { name }
        }
      });
      if (error) throw error;
      navigate('/chat');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground relative overflow-hidden">
      
      {/* ── Fluid Background Visuals ───────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-teal-500/10 blur-[120px] animate-fluid-1" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[120px] animate-fluid-2" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-3 mb-8 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
              <Sparkles size={24} className="text-white animate-glow" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase text-white">Cortex One</span>
          </Link>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">Request Access</h1>
          <p className="text-slate-400 text-lg">Initialize your unique intelligence node.</p>
        </div>

        <div className="glass-card p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/20 to-blue-500/20 rounded-[2.6rem] blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
          
          <div className="relative">
            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <p className="text-sm font-bold text-red-500">{error}</p>
              </motion.div>
            )}
            
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-black text-slate-500 mb-3 uppercase tracking-widest">
                  System Handle
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all text-lg"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-500 mb-3 uppercase tracking-widest">
                  Neural Identifier
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all text-lg"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-500 mb-3 uppercase tracking-widest">
                  Access Logic
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all text-lg"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient w-full flex justify-center items-center py-5 !text-xl group"
                >
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-3">
                      Initialize Node <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                    </span>
                  )}
                </button>
                
                <div className="relative my-10">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-4 bg-[#0B0F19] text-slate-500 font-black uppercase tracking-widest">Secure Linkage</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-4 py-5 px-6 bg-white text-black rounded-2xl text-lg font-black hover:bg-neutral-200 transition-all hover:scale-[1.02] active:scale-95 shadow-xl"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connect with Neural Google
                </button>
              </div>
            </form>

            <div className="mt-12 text-center">
              <p className="text-slate-500 font-bold">
                Already synchronized?{' '}
                <Link to="/login" className="text-teal-400 hover:text-white transition-colors underline underline-offset-8 decoration-2 decoration-teal-500/30 hover:decoration-teal-400">
                  Return to station
                </Link>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
