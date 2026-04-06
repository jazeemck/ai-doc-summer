import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('error') === 'google_failed') {
      setError('Google authentication failed or was cancelled. Please try again.');
    }
  }, [location]);

  const handleGoogleLogin = () => {
    setError('Neural Google link is temporarily disabled in this quadrant. Please use direct identifier.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('[Login] Fail:', err);
      setError(err.response?.data?.error || 'Authentication failed. Access Denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground relative overflow-hidden">
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
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">Welcome Back</h1>
          <p className="text-slate-400 text-lg">Initialize your cognitive session.</p>
        </div>

        <div className="glass-card p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative group">
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
                <label className="block text-sm font-black text-slate-500 mb-3 uppercase tracking-widest">Neural Identifier</label>
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
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Access Logic</label>
                  <a href="#" className="text-xs font-black text-teal-400 hover:text-white transition-colors uppercase tracking-widest">Lost key?</a>
                </div>
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
                      Initialize <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
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
                  Connect with Neural Google
                </button>
              </div>
            </form>

            <div className="mt-12 text-center">
              <p className="text-slate-500 font-bold">
                New to the grid?{' '}
                <Link to="/register" className="text-teal-400 hover:text-white transition-colors underline underline-offset-8 decoration-2 decoration-teal-500/30 hover:decoration-teal-400">
                  Request access node
                </Link>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
