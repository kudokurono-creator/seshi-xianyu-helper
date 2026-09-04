import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot, Check, CircleAlert, Cpu, Eraser, Loader2, RefreshCw, Send,
  Server, UserRound, XCircle,
} from 'lucide-react';
import {
  chatWithLocalLLM,
  getLocalLLMConfig,
  getLocalLLMStatus,
  loadLocalLLM,
  unloadLocalLLM,
} from '../services/api';
import { LocalLLMConfig, LocalLLMMessage, LocalLLMStatus } from '../types';
import AICore, { resolveAICoreState } from './brand/AICore';
import SpectralState from './brand/SpectralState';
import { useSpectralAction } from './brand/SpectralHook';

interface LocalLLMPlaygroundProps {
  isAdmin: boolean;
}

const defaultConfig: LocalLLMConfig = {
  model_path: '',
  system_prompt: '你是一个有帮助的助手。',
  temperature: 0.7,
  top_p: 0.9,
  max_new_tokens: 512,
};

const LocalLLMPlayground: React.FC<LocalLLMPlaygroundProps> = ({ isAdmin }) => {
  const { runSpectralAction } = useSpectralAction();
  const [config, setConfig] = useState<LocalLLMConfig>(defaultConfig);
  const [status, setStatus] = useState<LocalLLMStatus | null>(null);
  const [messages, setMessages] = useState<LocalLLMMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<'load' | 'unload' | null>(null);
  const [error, setError] = useState('');

  const seedMessages = (nextConfig: LocalLLMConfig) => (
    nextConfig.system_prompt.trim()
      ? [{ role: 'system', content: nextConfig.system_prompt.trim() } as LocalLLMMessage]
      : []
  );

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextConfig, nextStatus] = await Promise.all([
        getLocalLLMConfig(),
        getLocalLLMStatus(),
      ]);
      setConfig(nextConfig);
      setStatus(nextStatus);
      setMessages((current) => current.length ? current : seedMessages(nextConfig));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取本地模型状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const runModelAction = async (kind: 'load' | 'unload') => {
    setAction(kind);
    setError('');
    try {
      if (kind === 'load') {
        if (!config.model_path.trim()) throw new Error('请先在系统与AI中填写模型目录');
        await loadLocalLLM(config.model_path.trim());
      } else {
        await unloadLocalLLM();
      }
      setStatus(await getLocalLLMStatus());
      return { success: true };
    } catch (err) {
      setError(err instanceof Error ? err.message : '模型操作失败');
      return { success: false };
    } finally {
      setAction(null);
    }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sending) return { success: false };
    const nextMessages = [...messages, { role: 'user', content } as LocalLLMMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError('');
    try {
      const result = await chatWithLocalLLM(nextMessages, config);
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
      return { success: true };
    } catch (err) {
      setError(err instanceof Error ? err.message : '本地模型生成失败');
      return { success: false };
    } finally {
      setSending(false);
    }
  };

  const clearConversation = () => {
    setMessages(seedMessages(config));
    setInput('');
    setError('');
  };

  const statusLabel = useMemo(() => {
    if (!status) return '读取中';
    if (status.loaded) return `${status.model_name || '模型'} · ${status.device || '未知设备'}`;
    return '尚未加载模型';
  }, [status]);

  const aiCoreState = resolveAICoreState({
    loading,
    action,
    loaded: Boolean(status?.loaded),
    error,
  });
  const hasConversationMessages = messages.some((message) => message.role !== 'system');

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-secondary)] flex items-center justify-center">
              <AICore state={aiCoreState} size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900">本地模型测试</h2>
              <p className="text-gray-500 mt-1 text-sm font-medium">在不影响自动回复的前提下测试本地模型对话</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="px-4 py-2 ios-btn-secondary rounded-xl font-bold flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />刷新状态
        </button>
      </div>

      {error && hasConversationMessages && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-bold text-red-600">
          <CircleAlert className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
        <aside className="ios-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-extrabold text-gray-900"><Server className="w-4 h-4" />运行状态</div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${status?.loaded ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {status?.loaded ? '运行中' : '未加载'}
            </span>
          </div>
          <div className="space-y-3 text-sm">
            <div><div className="text-xs text-gray-400 mb-1">当前模型</div><div className="font-bold text-gray-800 break-all">{statusLabel}</div></div>
            <div><div className="text-xs text-gray-400 mb-1">模型目录</div><div className="font-medium text-gray-700 break-all">{config.model_path || '未配置'}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-xs text-gray-400 mb-1">CUDA</div><div className="font-bold text-gray-800">{status?.cuda_available ? '可用' : '不可用'}</div></div>
              <div><div className="text-xs text-gray-400 mb-1">依赖</div><div className="font-bold text-gray-800">{status?.dependencies_available ? '正常' : '缺失'}</div></div>
            </div>
          </div>
          {status?.unavailable_reason && <div className="text-xs leading-5 rounded-xl bg-amber-50 text-amber-700 px-3 py-2">{status.unavailable_reason}</div>}
          {isAdmin && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={(event) => void runSpectralAction(event.currentTarget, () => runModelAction('load'), { action: 'load-model' })} disabled={action !== null} className="w-full ios-btn-primary h-11 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {action === 'load' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}加载已保存模型
              </button>
              <button type="button" onClick={() => void runModelAction('unload')} disabled={action !== null || !status?.loaded} className="w-full h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {action === 'unload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}卸载模型
              </button>
            </div>
          )}
        </aside>

        <section className="ios-card min-h-[620px] flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 font-extrabold text-gray-900"><Bot className="w-5 h-5" />多轮对话</div>
            <button type="button" onClick={clearConversation} className="text-sm font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1.5" aria-label="清空会话" title="清空会话"><Eraser className="w-4 h-4" />清空</button>
          </div>
          <div className="flex-1 p-5 space-y-4 overflow-y-auto min-h-[430px] max-h-[620px]">
            {loading ? (
              <SpectralState state="loading" type="model" title="正在读取模型状态…" description="正在连接本地模型服务" className="min-h-[360px]" />
            ) : error && !hasConversationMessages ? (
              <SpectralState
                state="error"
                type="model"
                title="加载失败"
                description={error}
                className="min-h-[360px]"
                actions={<button type="button" onClick={() => void refresh()} className="ios-btn-secondary rounded-lg px-4 py-2 text-sm">重新尝试</button>}
              />
            ) : !hasConversationMessages && !sending ? (
              <SpectralState state="empty" type="conversation" title="输入消息开始测试" description="当前对话仅保存在本页面内" className="min-h-[360px]" />
            ) : null}
            {messages.map((message, index) => hasConversationMessages || message.role !== 'system' ? (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role !== 'user' && <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-gray-600" /></div>}
                <div className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-spectral-accent/15 text-spectral-text-primary rounded-br-md' : message.role === 'system' ? 'bg-gray-50 text-gray-500 border border-dashed border-gray-200' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                  {message.content}
                </div>
                {message.role === 'user' && <div className="w-8 h-8 rounded-xl bg-spectral-secondary flex items-center justify-center shrink-0"><UserRound className="w-4 h-4 text-spectral-accent-bright" /></div>}
              </div>
            ) : null)}
            {sending && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />模型生成中...</div>}
          </div>
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-primary)]">
            <div className="flex items-end gap-3">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} disabled={sending} rows={3} placeholder="输入测试消息，Enter 发送，Shift+Enter 换行" className="flex-1 resize-none bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] px-4 py-2.5 rounded-xl text-sm focus:border-[var(--accent)] focus:!shadow-[0_0_0_2px_rgba(32,208,202,0.08)] focus:outline-none" />
              <button type="button" onClick={(event) => void runSpectralAction(event.currentTarget, sendMessage, { action: 'send-ai-message' })} disabled={sending || !input.trim()} className="w-11 h-11 shrink-0 rounded-full bg-[var(--accent)] text-[var(--bg-app)] hover:bg-[var(--accent-bright)] flex items-center justify-center transition-colors disabled:bg-[var(--surface-secondary)] disabled:text-[var(--text-muted)] disabled:opacity-100 disabled:cursor-not-allowed" aria-label="发送消息" title="发送消息">
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LocalLLMPlayground;
