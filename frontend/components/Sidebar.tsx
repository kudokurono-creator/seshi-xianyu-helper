import React from 'react';
import { LayoutDashboard, Users, ShoppingBag, CreditCard, Settings, LogOut, Box, Orbit, MessageSquare, X } from 'lucide-react';
import SeshiMark from './brand/SeshiMark';
import { useSpectralSource } from './brand/SpectralHook';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  isAdmin?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout, mobileOpen = false, onMobileClose }) => {
  const spectralSourceRef = useSpectralSource();
  const menuGroups = [
    {
      label: 'OPERATIONS',
      items: [
        { id: 'dashboard', icon: LayoutDashboard, label: '仪表盘' },
        { id: 'accounts', icon: Users, label: '账号管理' },
        { id: 'orders', icon: ShoppingBag, label: '订单管理' },
      ],
    },
    {
      label: 'MANAGEMENT',
      items: [
        { id: 'cards', icon: CreditCard, label: '卡密库存' },
        { id: 'items', icon: Box, label: '商品列表' },
        { id: 'keywords', icon: MessageSquare, label: '关键词管理' },
      ],
    },
    {
      label: 'AI SYSTEM',
      items: [
        { id: 'settings', icon: Settings, label: '系统与 AI' },
        { id: 'local-llm-playground', icon: Orbit, label: '本地模型测试' },
      ],
    },
  ];

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭主导航"
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px] md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside className={`w-64 max-w-[85vw] min-h-[100dvh] fixed left-0 top-0 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] flex flex-col justify-between z-40 shadow-[8px_0_30px_rgba(0,0,0,0.18)] transition-transform duration-200 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-4 py-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div ref={spectralSourceRef} className="w-10 h-10 rounded-xl border border-[var(--border-active)] bg-[var(--surface-secondary)] flex items-center justify-center text-[var(--accent-bright)] shadow-[0_0_18px_rgba(32,208,202,0.08)]">
            <SeshiMark size={24} label="seshi" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold tracking-wide text-[var(--text-primary)] truncate">seshi智能发货</h1>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Operations Console</p>
          </div>
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="关闭主导航"
            className="ml-auto w-9 h-9 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] md:hidden flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="space-y-7" aria-label="主导航">
          {menuGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-2 text-[10px] font-semibold tracking-[0.24em] text-[var(--text-muted)]">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 group ${
                        isActive
                          ? 'bg-[var(--accent-wash)] text-[var(--accent-bright)] shadow-[inset_8px_0_20px_rgba(32,208,202,0.03)]'
                          : 'text-[var(--text-secondary)] hover:bg-[rgba(145,167,167,0.06)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[var(--accent-bright)]" aria-hidden="true" />}
                      <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? 'text-[var(--accent-bright)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`} aria-hidden="true" />
                      <span className="text-[13px] font-medium tracking-wide">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)]">
        <button 
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-[var(--text-secondary)] hover:text-[var(--status-danger)] hover:bg-[rgba(198,106,82,0.1)] rounded-lg transition-colors duration-200 font-medium"
        >
          <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
          <span className="text-[13px]">退出登录</span>
        </button>
      </div>
      </aside>
    </>
  );
};

export default Sidebar;
