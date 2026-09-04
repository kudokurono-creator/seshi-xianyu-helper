import React, { useEffect, useState } from 'react';
import {
  getSystemSettings, updateSystemSettings, discoverAIModels,
  getLocalLLMConfig, getLocalLLMStatus, updateLocalLLMConfig,
  loadLocalLLM, unloadLocalLLM,
} from '../services/api';
import { LocalLLMConfig, LocalLLMStatus, SystemSettings } from '../types';
import {
  Bot, Save, Lock, Sparkles, Mail, Settings as SettingsIcon,
  Eye, EyeOff, RefreshCw, Database, ToggleLeft, ToggleRight,
  Cpu, Server, CircleAlert, CheckCircle2, Loader2
} from 'lucide-react';
import { useSpectralAction } from './brand/SpectralHook';

interface SettingsProps {
  isAdmin?: boolean;
}

const Settings: React.FC<SettingsProps> = ({ isAdmin = false }) => {
  const { runSpectralAction } = useSpectralAction();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Password visibility states
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [localConfig, setLocalConfig] = useState<LocalLLMConfig | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalLLMStatus | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [localAction, setLocalAction] = useState<'load' | 'unload' | null>(null);
  const [localMessage, setLocalMessage] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    loadSettings();
    void loadLocalSettings();
  }, []);

  const loadSettings = () => {
    setLoading(true);
    getSystemSettings().then(setSettings).finally(() => setLoading(false));
  };

  const handleSave = async () => {
      if(!settings) return { success: false };
      setSaving(true);
      try {
        await updateSystemSettings(settings);
        alert('系统配置已保存');
        return { success: true };
      } catch (e) {
        alert('保存失败：' + (e as Error).message);
        return { success: false };
      } finally {
        setSaving(false);
      }
  };

  const loadLocalSettings = async () => {
    setLocalLoading(true);
    setLocalError('');
    try {
      const [nextConfig, nextStatus] = await Promise.all([
        getLocalLLMConfig(),
        getLocalLLMStatus(),
      ]);
      setLocalConfig(nextConfig);
      setLocalStatus(nextStatus);
    } catch (e) {
      setLocalError((e as Error).message || '加载本地模型配置失败');
    } finally {
      setLocalLoading(false);
    }
  };

  const saveLocalSettings = async () => {
    if (!localConfig) return { success: false };
    setLocalSaving(true);
    setLocalMessage('');
    setLocalError('');
    try {
      const saved = await updateLocalLLMConfig(localConfig);
      setLocalConfig(saved);
      setLocalMessage('本地模型配置已保存，模型不会自动加载');
      return { success: true };
    } catch (e) {
      setLocalError((e as Error).message || '保存本地模型配置失败');
      return { success: false };
    } finally {
      setLocalSaving(false);
    }
  };

  const runLocalModelAction = async (kind: 'load' | 'unload') => {
    if (!localConfig) return { success: false };
    setLocalAction(kind);
    setLocalMessage('');
    setLocalError('');
    try {
      if (kind === 'load') {
        if (!localConfig.model_path.trim()) throw new Error('请先填写模型目录');
        await loadLocalLLM(localConfig.model_path.trim());
        setLocalMessage('模型加载完成');
      } else {
        await unloadLocalLLM();
        setLocalMessage('模型已卸载');
      }
      setLocalStatus(await getLocalLLMStatus());
      return { success: true };
    } catch (e) {
      setLocalError((e as Error).message || '模型操作失败');
      return { success: false };
    } finally {
      setLocalAction(null);
    }
  };

  const handleDiscoverModels = async () => {
    if (!settings) return;
    const baseUrl = (settings.ai_api_url || '').trim();
    const apiKey = (settings.ai_api_key || '').trim();
    if (!baseUrl || !apiKey) {
      setModelsError('请先填写 API 地址和 API Key');
      return;
    }

    setModelsLoading(true);
    setModelsError('');
    try {
      const models = await discoverAIModels(baseUrl, apiKey);
      const current = (settings.ai_model || '').trim();
      setModelOptions(Array.from(new Set([...(current ? [current] : []), ...models])));
      const builtInDefaults = new Set(['qwen-plus', 'qwen-turbo', 'gpt-3.5-turbo', 'gpt-4']);
      if ((!current || builtInDefaults.has(current)) && models[0] && !models.includes(current)) {
        setSettings({...settings, ai_model: models[0]});
      }
    } catch (e) {
      setModelsError((e as Error).message || '获取模型失败，可手动填写模型名');
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (!settings?.ai_api_url || !settings?.ai_api_key) return;
    const timer = window.setTimeout(() => { void handleDiscoverModels(); }, 800);
    return () => window.clearTimeout(timer);
  }, [settings?.ai_api_url, settings?.ai_api_key]);

  if (!settings) return <div className="p-8 text-center text-gray-400">加载配置中...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-gray-600" />
          </div>
          <div>
              <h2 className="text-3xl font-extrabold text-gray-900">系统设置</h2>
              <p className="text-gray-500 mt-1 text-sm font-medium">配置全局自动化规则与系统参数</p>
          </div>
        </div>
        <button
          onClick={loadSettings}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-8">
          {/* Basic Settings */}
          <section className="space-y-4">
            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-gray-100 text-gray-600">
                    <Database className="w-4 h-4" />
                </div>
                基础设置
            </h3>

            <div className="ios-card rounded-[2rem] p-6 bg-white space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-bold text-gray-900">允许用户注册</div>
                  <div className="text-xs text-gray-500 mt-1">开启后允许新用户注册账号</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="允许用户注册"
                  aria-checked={settings.registration_enabled}
                  onClick={() => setSettings({...settings, registration_enabled: !settings.registration_enabled})}
                  className={`w-14 h-8 rounded-full transition relative ${
                    settings.registration_enabled ? 'bg-spectral-accent/35' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full absolute top-1 transition shadow-md ${
                      settings.registration_enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-bold text-gray-900">显示默认登录信息</div>
                  <div className="text-xs text-gray-500 mt-1">登录页面显示默认账号密码提示</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="显示默认登录信息"
                  aria-checked={settings.show_default_login_info}
                  onClick={() => setSettings({...settings, show_default_login_info: !settings.show_default_login_info})}
                  className={`w-14 h-8 rounded-full transition relative ${
                    settings.show_default_login_info ? 'bg-spectral-accent/35' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full absolute top-1 transition shadow-md ${
                      settings.show_default_login_info ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-bold text-gray-900">登录滑动验证码</div>
                  <div className="text-xs text-gray-500 mt-1">开启后账号密码登录需要完成滑动验证</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="登录滑动验证码"
                  aria-checked={settings.login_captcha_enabled}
                  onClick={() => setSettings({...settings, login_captcha_enabled: !settings.login_captcha_enabled})}
                  className={`w-14 h-8 rounded-full transition relative ${
                    settings.login_captcha_enabled ? 'bg-spectral-accent/35' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full absolute top-1 transition shadow-md ${
                      settings.login_captcha_enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-bold text-gray-900">启用商品自动同步</div>
                  <div className="text-xs text-gray-500 mt-1">定时自动获取商品信息到本地数据库</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="启用商品自动同步"
                  aria-checked={settings.item_sync_enabled}
                  onClick={() => setSettings({...settings, item_sync_enabled: !settings.item_sync_enabled})}
                  className={`w-14 h-8 rounded-full transition relative ${
                    settings.item_sync_enabled ? 'bg-spectral-accent/35' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-6 h-6 bg-white rounded-full absolute top-1 transition shadow-md ${
                      settings.item_sync_enabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3 px-4">
                <label className="block text-sm font-bold text-gray-800">商品同步间隔（分钟）</label>
                <input
                  type="number"
                  value={Math.round((settings.item_sync_interval || 600) / 60)}
                  onChange={(e) => {
                    const minutes = parseInt(e.target.value) || 10;
                    setSettings({...settings, item_sync_interval: minutes * 60});
                  }}
                  className="w-full ios-input px-4 py-3 rounded-xl"
                  min="1"
                  max="1440"
                />
                <p className="text-xs text-gray-500">建议：10-60分钟</p>
              </div>

              <div className="space-y-3 px-4">
                <label className="block text-sm font-bold text-gray-800">每次最多同步页数</label>
                <input
                  type="number"
                  value={settings.item_sync_max_pages || 5}
                  onChange={(e) => setSettings({...settings, item_sync_max_pages: parseInt(e.target.value) || 5})}
                  className="w-full ios-input px-4 py-3 rounded-xl"
                  min="1"
                  max="50"
                />
                <p className="text-xs text-gray-500">每页20个商品</p>
              </div>
            </div>
          </section>

          {/* AI Configuration */}
          <section className="space-y-4">
            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-spectral-accent/15 text-spectral-accent-bright">
                    <Sparkles className="w-4 h-4" />
                </div>
                AI 智能回复配置
            </h3>

            <div className="ios-card rounded-[2rem] p-6 bg-white space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">API 地址</label>
                <input
                  type="text"
                  value={settings.ai_api_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}
                  onChange={e => setSettings({...settings, ai_api_url: e.target.value})}
                  className="w-full ios-input px-4 py-3 rounded-xl text-sm"
                  placeholder="https://api.openai.com/v1"
                />
                <p className="text-xs text-gray-500">无需补全 /chat/completions</p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.ai_api_key || ''}
                    onChange={e => setSettings({...settings, ai_api_key: e.target.value})}
                    className="w-full ios-input px-4 py-3 pr-12 rounded-xl font-mono text-sm"
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-bold text-gray-800">模型</label>
                  <button
                    type="button"
                    onClick={() => { void handleDiscoverModels(); }}
                    disabled={modelsLoading}
                    className="text-xs font-bold text-gray-600 hover:text-black disabled:opacity-50"
                  >
                    {modelsLoading ? '获取中...' : '重新获取模型'}
                  </button>
                </div>
                <select
                  value={settings.ai_model || 'qwen-plus'}
                  onChange={e => setSettings({...settings, ai_model: e.target.value})}
                  className="w-full ios-input px-4 py-3 rounded-xl"
                >
                  {(modelOptions.length ? modelOptions : ['qwen-plus', 'qwen-turbo', 'gpt-3.5-turbo', 'gpt-4']).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={settings.ai_model || ''}
                  onChange={e => {
                    const model = e.target.value;
                    setSettings({...settings, ai_model: model});
                    if (model && !modelOptions.includes(model)) setModelOptions([...modelOptions, model]);
                  }}
                  className="w-full ios-input px-4 py-3 rounded-xl text-sm font-mono"
                  placeholder="也可以手动填写，例如 deepseek-chat"
                />
                {modelsError && <p className="text-xs text-red-500">{modelsError}</p>}
                <p className="text-xs text-gray-500">填写地址和 Key 后会自动获取；DeepSeek 常用模型：deepseek-chat、deepseek-reasoner</p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">默认自动回复内容</label>
                <textarea
                  className="w-full ios-input px-4 py-3 rounded-xl min-h-[100px] text-sm resize-none"
                  value={settings.default_reply || ''}
                  onChange={e => setSettings({...settings, default_reply: e.target.value})}
                  placeholder="设置默认的自动回复内容..."
                ></textarea>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                <strong>常见 AI 服务:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>阿里云通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1</li>
                  <li>OpenAI: https://api.openai.com/v1</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          {/* SMTP Settings */}
          <section className="space-y-4">
            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                    <Mail className="w-4 h-4" />
                </div>
                SMTP 邮件配置
            </h3>

            <div className="ios-card rounded-[2rem] p-6 bg-white space-y-6">
              <p className="text-sm text-gray-500">配置SMTP服务器用于发送注册验证码等邮件通知</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-800">SMTP服务器</label>
                  <input
                    type="text"
                    value={settings.smtp_server || ''}
                    onChange={e => setSettings({...settings, smtp_server: e.target.value})}
                    placeholder="smtp.qq.com"
                    className="w-full ios-input px-4 py-3 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-800">SMTP端口</label>
                  <input
                    type="number"
                    value={settings.smtp_port || 587}
                    onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value)})}
                    placeholder="587"
                    className="w-full ios-input px-4 py-3 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">发件邮箱</label>
                <input
                  type="email"
                  value={settings.smtp_user || ''}
                  onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                  placeholder="your-email@qq.com"
                  className="w-full ios-input px-4 py-3 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">邮箱密码/授权码</label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={settings.smtp_password || ''}
                    onChange={e => setSettings({...settings, smtp_password: e.target.value})}
                    placeholder="输入密码或授权码"
                    className="w-full ios-input px-4 py-3 pr-12 rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">QQ邮箱需要使用授权码</p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-800">发件人显示名（可选）</label>
                <input
                  type="text"
                  value={settings.smtp_from || ''}
                  onChange={e => setSettings({...settings, smtp_from: e.target.value})}
                  placeholder="seshi 自动回复系统"
                  className="w-full ios-input px-4 py-3 rounded-xl text-sm"
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-spectral-accent/15 text-spectral-accent-bright"><Cpu className="w-4 h-4" /></div>
            本地模型
          </h3>
          <button type="button" onClick={() => void loadLocalSettings()} disabled={localLoading} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-700 flex items-center gap-2 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${localLoading ? 'animate-spin' : ''}`} />刷新状态
          </button>
        </div>
        <div className="ios-card p-6 bg-white space-y-5">
          {localLoading && !localConfig ? (
            <div className="py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />加载本地模型配置中...</div>
          ) : localConfig ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-2 lg:col-span-2">
                  <label className="block text-sm font-bold text-gray-800">模型目录</label>
                  <input type="text" value={localConfig.model_path} onChange={(e) => setLocalConfig({ ...localConfig, model_path: e.target.value })} disabled={!isAdmin || localSaving} placeholder="例如 D:\\models\\Qwen" className="w-full ios-input px-4 py-3 rounded-xl text-sm" />
                  <p className="text-xs text-gray-500">填写服务器本机 HuggingFace 模型目录，保存后由管理员手动加载。</p>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <label className="block text-sm font-bold text-gray-800">默认系统提示词</label>
                  <textarea rows={3} value={localConfig.system_prompt} onChange={(e) => setLocalConfig({ ...localConfig, system_prompt: e.target.value })} disabled={!isAdmin || localSaving} className="w-full ios-input px-4 py-3 rounded-xl text-sm resize-y" />
                </div>
                <div className="space-y-2"><label className="block text-sm font-bold text-gray-800">温度</label><input type="number" min="0" max="2" step="0.1" value={localConfig.temperature} onChange={(e) => setLocalConfig({ ...localConfig, temperature: Number(e.target.value) })} disabled={!isAdmin || localSaving} className="w-full ios-input px-4 py-3 rounded-xl text-sm" /></div>
                <div className="space-y-2"><label className="block text-sm font-bold text-gray-800">Top P</label><input type="number" min="0.01" max="1" step="0.05" value={localConfig.top_p} onChange={(e) => setLocalConfig({ ...localConfig, top_p: Number(e.target.value) })} disabled={!isAdmin || localSaving} className="w-full ios-input px-4 py-3 rounded-xl text-sm" /></div>
                <div className="space-y-2"><label className="block text-sm font-bold text-gray-800">最大生成字数</label><input type="number" min="1" max="4096" value={localConfig.max_new_tokens} onChange={(e) => setLocalConfig({ ...localConfig, max_new_tokens: Number(e.target.value) })} disabled={!isAdmin || localSaving} className="w-full ios-input px-4 py-3 rounded-xl text-sm" /></div>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div><div className="text-xs text-gray-400 mb-1">当前状态</div><div className="font-bold text-gray-800 flex items-center gap-1.5">{localStatus?.loaded ? <CheckCircle2 className="w-4 h-4 text-status-success" /> : <Server className="w-4 h-4 text-gray-400" />}{localStatus?.loaded ? '已加载' : '未加载'}</div></div>
                <div><div className="text-xs text-gray-400 mb-1">模型 / 设备</div><div className="font-bold text-gray-800 break-all">{localStatus?.model_name || '-'} / {localStatus?.device || '-'}</div></div>
                <div><div className="text-xs text-gray-400 mb-1">CUDA</div><div className="font-bold text-gray-800">{localStatus?.cuda_available ? '可用' : '不可用'}</div></div>
                <div><div className="text-xs text-gray-400 mb-1">运行依赖</div><div className="font-bold text-gray-800">{localStatus?.dependencies_available ? '正常' : '缺失'}</div></div>
              </div>
              {localStatus?.unavailable_reason && <div className="text-xs leading-5 rounded-xl bg-amber-50 text-amber-700 px-3 py-2">{localStatus.unavailable_reason}</div>}
              {localError && <div className="flex items-center gap-2 text-sm font-bold text-status-danger"><CircleAlert className="w-4 h-4" />{localError}</div>}
              {localMessage && <div className="flex items-center gap-2 text-sm font-bold text-status-success"><CheckCircle2 className="w-4 h-4" />{localMessage}</div>}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {isAdmin && <button type="button" onClick={(event) => void runSpectralAction(event.currentTarget, saveLocalSettings, { action: 'save-model-config' })} disabled={localSaving || localAction !== null} className="ios-btn-primary px-5 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" />{localSaving ? '保存中...' : '保存本地模型配置'}</button>}
                {isAdmin && <button type="button" onClick={(event) => void runSpectralAction(event.currentTarget, () => runLocalModelAction('load'), { action: 'load-model' })} disabled={localAction !== null || localSaving} className="ios-btn-primary px-5 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-60">{localAction === 'load' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}加载已保存模型</button>}
                {isAdmin && <button type="button" onClick={() => void runLocalModelAction('unload')} disabled={localAction !== null || localSaving || !localStatus?.loaded} className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center gap-2 disabled:opacity-50">{localAction === 'unload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}卸载模型</button>}
              </div>
            </>
          ) : <div className="py-6 text-center text-gray-400">本地模型配置暂不可用</div>}
        </div>
      </section>

      {/* Save Button */}
      <div className="fixed bottom-10 right-10 z-30">
        <button
            onClick={(event) => void runSpectralAction(event.currentTarget, handleSave, { action: 'save-settings' })}
            disabled={saving}
            className="ios-btn-primary px-10 py-5 rounded-[2rem] text-lg flex items-center gap-3 transform hover:scale-105 active:scale-95 transition disabled:opacity-70"
        >
            <Save className="w-6 h-6" />
            {saving ? '保存中...' : '保存所有配置'}
        </button>
      </div>
    </div>
  );
};

export default Settings;
