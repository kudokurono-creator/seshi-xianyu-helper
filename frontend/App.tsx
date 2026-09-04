import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AccountList from './components/AccountList';
import OrderList from './components/OrderList';
import CardList from './components/CardList';
import ItemList from './components/ItemList';
import Settings from './components/Settings';
import Keywords from './components/Keywords';
import LocalLLMPlayground from './components/LocalLLMPlayground';
import SeshiMark from './components/brand/SeshiMark';
import { SpectralHookProvider, SpectralHookLayer, useSpectralSource } from './components/brand/SpectralHook';
import { login, verifySession } from './services/api';
import { ShieldCheck, ArrowRight, Loader2, User, Lock, TerminalSquare, Menu } from 'lucide-react';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [needsInit, setNeedsInit] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mobileSpectralSourceRef = useSpectralSource();

  // Check auth on mount
  useEffect(() => {
      verifySession()
        .then((res) => {
          if (res?.initialized === false) {
            setNeedsInit(true);
            setIsLoggedIn(false);
            return;
          }

          setNeedsInit(false);
          if (res?.authenticated) {
            setIsLoggedIn(true);
            setIsAdmin(Boolean(res.is_admin));
          }
        })
        .catch(() => {
          setIsLoggedIn(false);
          setIsAdmin(false);
        })
        .finally(() => setCheckingAuth(false));

      const handleLogout = () => {
        setIsLoggedIn(false);
        setIsAdmin(false);
      };
      window.addEventListener('auth:logout', handleLogout);
      return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginLoading(true);
      setLoginError('');
      
      try {
          const res = await login({ username, password });
          if (res.success) {
              setIsLoggedIn(true);
              setIsAdmin(Boolean(res.is_admin));
          } else {
              setLoginError(res.message || '登录失败');
          }
      } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setLoginError(msg || '登录失败');
      } finally {
          setLoginLoading(false);
      }
  };


  if (checkingAuth) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
              <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
      );
  }

  // Init Screen (system not initialized)
  if (needsInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] p-4 relative overflow-hidden font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[var(--accent-soft)]/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[var(--accent)]/10 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '2s'}}></div>

        <div className="bg-[var(--surface-primary)]/95 backdrop-blur-3xl p-8 md:p-12 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] w-full max-w-xl border border-[var(--border-subtle)] relative z-10 animate-fade-in">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-[var(--accent)] rounded-[2rem] flex items-center justify-center shadow-xl shadow-[rgba(32,208,202,0.18)] mx-auto mb-6 transform rotate-[-6deg] transition duration-500">
              <TerminalSquare className="w-10 h-10 text-[var(--bg-app)]" />
            </div>
            <h2 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2 tracking-tight">系统尚未初始化</h2>
            <p className="text-[var(--text-secondary)] font-medium">为避免默认口令风险，管理员必须通过服务器本机 CLI 初始化。</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)]">
              <div className="text-sm font-bold text-[var(--text-primary)] mb-2">请在服务器上执行：</div>
              <pre className="text-xs bg-black text-white p-4 rounded-2xl overflow-x-auto">python3 init_admin.py</pre>
              <div className="text-xs text-[var(--text-muted)] mt-2">完成后刷新页面即可进入登录。</div>
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full ios-btn-primary h-14 rounded-xl text-lg mt-2 flex items-center justify-center gap-2 group"
            >
              我已初始化，刷新 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] text-center">
            <span className="text-xs text-[var(--text-muted)] font-medium tracking-widest uppercase">Secure Bootstrap</span>
          </div>
        </div>
      </div>
    );
  }

  // Login Screen Component
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] p-4 relative overflow-hidden font-sans">
        {/* Animated Background Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[var(--accent-soft)]/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[var(--accent)]/10 rounded-full blur-[120px] animate-pulse" style={{animationDelay: '2s'}}></div>

        <div className="bg-[var(--surface-primary)]/95 backdrop-blur-3xl p-8 md:p-12 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] w-full max-w-lg border border-[var(--border-subtle)] relative z-10 animate-fade-in">
          
          {/* Header with Logo */}
          <div className="text-center mb-10">
             <div className="w-24 h-24 bg-[var(--accent)] rounded-[2rem] flex items-center justify-center shadow-xl shadow-[rgba(32,208,202,0.18)] mx-auto mb-6 transform rotate-[-6deg] hover:rotate-0 transition duration-500 cursor-pointer group">
                <span className="text-[var(--bg-app)] font-extrabold text-5xl group-hover:scale-110 transition-transform">S</span>
             </div>
             <h2 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2 tracking-tight">欢迎回来</h2>
             <p className="text-[var(--text-secondary)] font-medium">seshi智能发货系统</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-4">
                <div className="relative group">
                    <label htmlFor="login-username" className="sr-only">管理员账号</label>
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] group-focus-within:text-[var(--accent-bright)] transition-colors" aria-hidden="true" />
                    <input 
                        id="login-username"
                        name="username"
                        type="text" 
                        autoComplete="username"
                        placeholder="管理员账号" 
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        aria-invalid={Boolean(loginError)}
                        aria-describedby={loginError ? 'login-error' : undefined}
                        required
                        className="w-full ios-input pl-14 pr-6 py-4.5 rounded-2xl text-base h-14"
                    />
                </div>
                <div className="relative group">
                    <label htmlFor="login-password" className="sr-only">密码</label>
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)] group-focus-within:text-[var(--accent-bright)] transition-colors" aria-hidden="true" />
                    <input 
                        id="login-password"
                        name="password"
                        type="password" 
                        autoComplete="current-password"
                        placeholder="密码" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        aria-invalid={Boolean(loginError)}
                        aria-describedby={loginError ? 'login-error' : undefined}
                        required
                        className="w-full ios-input pl-14 pr-6 py-4.5 rounded-2xl text-base h-14"
                    />
                </div>
            </div>
            
            {loginError && (
                <div id="login-error" role="alert" aria-live="polite" className="p-3 rounded-xl bg-red-50 text-red-500 text-sm text-center font-bold flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> {loginError}
                </div>
            )}

            <button 
              type="submit" 
              disabled={loginLoading}
              className="w-full ios-btn-primary h-14 rounded-xl text-lg mt-2 flex items-center justify-center gap-2 group disabled:opacity-70"
            >
              {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>立即登录 <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" /></>}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
             <div className="mt-6 text-center">
                 <span className="text-xs text-[var(--text-muted)] font-medium tracking-widest uppercase">
                    seshi Auto-Dispatch Pro v2.5
                 </span>
             </div>
          </div>
        </div>
      </div>
    );
  }

  // Main App Layout
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'accounts': return <AccountList />;
      case 'orders': return <OrderList />;
      case 'cards': return <CardList />;
      case 'items': return <ItemList />;
      case 'keywords': return <Keywords />;
      case 'settings': return <Settings isAdmin={isAdmin} />;
      case 'local-llm-playground': return <LocalLLMPlayground isAdmin={isAdmin} />;
      default: return <Dashboard />;
    }
  };

  return (
    <SpectralHookProvider>
      <div className="app-shell flex min-h-[100dvh] text-[var(--text-primary)]">
      <button
        ref={mobileSpectralSourceRef}
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="打开主导航"
        aria-expanded={isSidebarOpen}
        className="fixed left-4 top-4 z-30 md:hidden w-11 h-11 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-subtle)] text-[var(--accent-bright)] shadow-lg flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
      >
        <span className="sr-only">打开主导航</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          <SeshiMark size={20} />
          <Menu className="w-3.5 h-3.5" />
        </span>
      </button>
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        isAdmin={isAdmin}
        mobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
        onLogout={() => {
            setIsLoggedIn(false);
            setIsAdmin(false);
            setIsSidebarOpen(false);
        }}
      />
      
      <main id="main-content" className="flex-1 min-w-0 p-4 pt-20 md:ml-64 md:p-10 overflow-y-auto min-h-[100dvh] md:h-screen relative scroll-smooth">
        
        <div className="max-w-[1400px] mx-auto pb-10">
            {renderContent()}
        </div>
      </main>
        <SpectralHookLayer />
      </div>
    </SpectralHookProvider>
  );
};

export default App;
