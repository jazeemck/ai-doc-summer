import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../lib/api';
import { supabase } from '../lib/supabaseClient';

interface User {
  id: string;
  email: string;
  name?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  session: any;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // 1. NEURAL IDENTITY SYNCHRONIZER
  const syncWithBackend = async (sbUser: any) => {
    if (!sbUser) return;
    try {
      console.log('[AuthContext] Neural Sync Initiated for:', sbUser.email);
      const { data } = await api.post('/auth/google-sync', {
        email: sbUser.email,
        name: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0],
        supabaseId: sbUser.id
      });

      console.log('[AuthContext] Neural Sync Locked. Custom JWT stored.');
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      console.error('[AuthContext] Sync failure:', err);
    }
  };

  // 2. LIFECYCLE CONTROLLER (Requirements 1, 2, 7)
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('[AuthContext] Initializing Cognitive Link...');

      // Get initial session (Requirement 4)
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      console.log('[AuthContext] Current Session Result:', initialSession ? 'ONLINE' : 'OFFLINE');

      if (initialSession) {
        setSession(initialSession);
        await syncWithBackend(initialSession.user);
      }

      setLoading(false);
    };

    // 3. EVENT LISTENER (Requirement 2)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[AuthContext] Auth State Change Event:', event);
      setSession(newSession);

      if (event === 'SIGNED_IN' && newSession) {
        await syncWithBackend(newSession.user);
      } else if (event === 'SIGNED_OUT') {
        console.log('[AuthContext] Purging Local Cache...');
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        setSession(null);
      }
    });

    initializeAuth();

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    console.log('[AuthContext] Attempting Direct Ingress...');
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    console.log('[AuthContext] Direct Ingress Successful.');
  };

  const register = async (email: string, password: string, name: string) => {
    console.log('[AuthContext] Synthesizing New Identity...');
    const { data } = await api.post('/auth/register', { email, password, name });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    console.log('[AuthContext] Identity Synthesis Complete.');
  };

  const loginWithGoogle = async () => {
    console.log('[AuthContext] Redirecting to Google Neural Gateway...');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/login'
      }
    });
    if (error) throw error;
  };

  const logout = async () => {
    console.log('[AuthContext] Terminating Sessions...');
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, token, loading, login, register, logout, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
