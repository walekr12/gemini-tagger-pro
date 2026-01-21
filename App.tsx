
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Upload, Settings2, Play, Download, Trash2,
  CheckCircle2, AlertCircle, Loader2, Zap,
  Plus, Server, Save, FileUp, Activity,
  Image as ImageIcon, RotateCw, RefreshCcw,
  Wifi, WifiOff, List, Ruler, Square,
  MessageSquare, MonitorPlay, Copy, EyeOff, Eye
} from 'lucide-react';
import JSZip from 'jszip';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TaggingItem, GlobalConfig, Endpoint } from './types';

// 默认 Gemini 模型列表
const DEFAULT_GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro',
  'gemini-1.5-flash'
];

// === 工具函数：图片压缩 ===
const compressImage = async (file: Blob, maxSizeMB: number, maxWidthOrHeight: number, quality: number): Promise<Blob> => {
  if (file.size <= maxSizeMB * 1024 * 1024) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = reject;
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // 缩放尺寸
      if (width > height) {
        if (width > maxWidthOrHeight) {
          height = Math.round((height *= maxWidthOrHeight / width));
          width = maxWidthOrHeight;
        }
      } else {
        if (height > maxWidthOrHeight) {
          width = Math.round((width *= maxWidthOrHeight / height));
          height = maxWidthOrHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Canvas context error")); return; }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression failed")); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    reader.readAsDataURL(file);
  });
};

const Navbar = () => (
  <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between h-16 items-center">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
            <Zap className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            GEMINI <span className="font-light">TAGGER PRO</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 font-mono">
             v2.5.4 High Perf
           </span>
        </div>
      </div>
    </div>
  </nav>
);

// === 独立的卡片组件，使用 React.memo 优化渲染性能 ===
const ItemCard = React.memo(({
  item,
  isProcessing,
  maxRetry,
  onReset,
  onUpdateTags,
  onStopItem
}: {
  item: TaggingItem,
  isProcessing: boolean,
  maxRetry: number,
  onReset: (id: string) => void,
  onUpdateTags: (id: string, val: string) => void,
  onStopItem?: (id: string) => void
}) => {
  return (
    <div 
      className={`group relative bg-slate-800/80 rounded-2xl overflow-hidden border transition-all duration-300 flex flex-col ${
        item.status === 'processing' ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 
        item.status === 'completed' ? 'border-emerald-500/30' : 
        item.status === 'error' ? 'border-rose-500/30' : 'border-slate-800'
      }`}
    >
      {/* 图片预览区 */}
      <div className="aspect-[4/3] relative overflow-hidden bg-slate-950/50 border-b border-slate-800/50">
        <img loading="lazy" src={item.previewUrl} alt={item.name} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
        
        {/* 左上角状态标签 */}
        <div className="absolute top-2 left-2 flex gap-1 z-10">
          <span className={`text-[9px] px-2 py-0.5 rounded-md uppercase font-black tracking-tighter backdrop-blur-md shadow-lg ${
            item.status === 'completed' ? 'bg-emerald-500 text-white' :
            item.status === 'error' ? 'bg-rose-500 text-white' :
            item.status === 'processing' ? 'bg-indigo-500 text-white animate-pulse' :
            'bg-slate-900/80 text-slate-400'
          }`}>
            {item.status === 'processing' ? '处理中' : item.status === 'completed' ? '完成' : item.status === 'error' ? '失败' : '等待'}
          </span>
        </div>
        
        {/* 右上角操作区 (Retry & Manual Reset) */}
        <div className="absolute top-2 right-2 flex gap-2 z-10">
            {item.status === 'processing' && item.attempts && item.attempts > 1 && (
              <div className="animate-pulse">
                <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-yellow-500 text-black shadow-lg">
                  Retry {item.attempts}/{maxRetry}
                </span>
              </div>
            )}
            
            {!isProcessing && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onReset(item.id); }}
                  className="p-1.5 bg-slate-900/60 hover:bg-rose-500 text-slate-300 hover:text-white rounded-lg backdrop-blur-md transition-all border border-slate-700/50 hover:border-rose-400 shadow-lg"
                  title="重置此图 (重新打标)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
            )}
        </div>

        {item.status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] z-20">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
              {onStopItem && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStopItem(item.id); }}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold rounded-lg shadow-lg transition-all flex items-center gap-1"
                  title="停止此任务"
                >
                  <Square className="w-3 h-3 fill-current" /> 停止
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* 详情与编辑区 */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-slate-300 truncate max-w-[150px]" title={item.name}>{item.name}</span>
          <span className="text-[9px] text-slate-600 font-mono">{(item.blob.size / 1024 / 1024).toFixed(1)}MB</span>
        </div>
        
        {/* 可编辑的文本区域 */}
        <div className="flex-1 relative min-h-[100px]">
          {item.status === 'error' ? (
            <div className="absolute inset-0 p-2 text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-lg overflow-y-auto custom-scrollbar">
              ERROR: {item.error}
            </div>
          ) : (
            <textarea
              value={item.tags || ''}
              onChange={(e) => onUpdateTags(item.id, e.target.value)}
              placeholder={item.status === 'pending' ? '等待处理...' : '标签将显示在这里...'}
              className={`w-full h-full text-[10px] font-medium leading-relaxed p-2 rounded-lg resize-none outline-none focus:ring-1 focus:ring-indigo-500/50 custom-scrollbar transition-all ${
                item.status === 'completed' 
                  ? 'bg-slate-900/50 text-slate-200 border border-slate-700/50 hover:bg-slate-900' 
                  : 'bg-slate-900/30 text-slate-500 border border-slate-800'
              }`}
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // 自定义比较函数，只在关键属性变化时重渲染
  return (
    prev.item === next.item && // 引用相同（内容未变）
    prev.isProcessing === next.isProcessing &&
    prev.maxRetry === next.maxRetry
  );
});

const App: React.FC = () => {
  const [items, setItems] = useState<TaggingItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<{ total: number; current: number; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configInputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map()); // 每个任务的中断控制器
  const stoppedItemsRef = useRef<Set<string>>(new Set()); // 被单独停止的任务ID

  // === 全局配置状态 ===
  const [config, setConfig] = useState<GlobalConfig>({
    endpoints: [
      { 
        id: 'default-sdk', 
        name: '默认 Google SDK', 
        type: 'google_sdk', 
        apiKey: import.meta.env.VITE_GEMINI_API_KEY || '', 
        model: 'gemini-3-flash-preview',
        active: true,
        availableModels: DEFAULT_GEMINI_MODELS
      }
    ],
    concurrency: 1, 
    retry: { enabled: true, maxAttempts: 3, retryIntervalMs: 2000 },
    compression: { enabled: true, maxSizeMB: 3.5, maxWidthOrHeight: 2048, quality: 0.85 },
    validation: { enabled: true, minChars: 20 },
    prompt: {
      stage1: "你是一个专业的图像标注AI。你的任务是为提供的图像生成详细、高质量的标签。输出应仅为逗号分隔的值。",
      stage2: "我准备好了。我将作为专业的图像标注AI，为您提供的图像提供逗号分隔的标签。请提供图像。",
      stage3: "分析这张图片并生成涵盖主体、风格、情绪和技术方面的综合标签。仅输出标签，不要包含其他文字。"
    }
  });

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [activeTab, setActiveTab] = useState<'workspace' | 'general' | 'endpoints' | 'prompts'>('workspace');

  // ... (保留原有的 exportConfig, importConfig, addEndpoint, updateEndpoint, removeEndpoint, fetchModelsForEndpoint 代码)
  const exportConfig = () => {
    const cleanConfig = { ...config, endpoints: config.endpoints.map(({ isChecking, connectionStatus, connectionMessage, ...rest }) => rest) };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanConfig, null, 2));
    const a = document.createElement('a');
    a.href = dataStr; a.download = "gemini_tagger_config.json";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.endpoints) {
          const restoredEndpoints = parsed.endpoints.map((ep: any) => ({
            ...ep, isChecking: false, connectionStatus: 'idle', connectionMessage: '',
            availableModels: ep.availableModels || (ep.type === 'google_sdk' ? DEFAULT_GEMINI_MODELS : [])
          }));
          setConfig({ ...parsed, endpoints: restoredEndpoints });
          alert("配置导入成功！");
        }
      } catch (err) { alert("解析配置文件失败"); }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const addEndpoint = () => {
    setConfig(prev => ({ ...prev, endpoints: [...prev.endpoints, {
      id: Math.random().toString(36).substr(2, 9), name: 'New Node', type: 'openai_compatible',
      apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gemini-3-flash-preview',
      active: true, connectionStatus: 'idle'
    }]}));
  };

  // 复制节点
  const copyEndpoint = (ep: Endpoint) => {
    const newEndpoint: Endpoint = {
      ...ep,
      id: Math.random().toString(36).substr(2, 9),
      name: `${ep.name} (副本)`,
      connectionStatus: 'idle',
      isChecking: false
    };
    setConfig(prev => ({ ...prev, endpoints: [...prev.endpoints, newEndpoint] }));
  };

  const updateEndpoint = (id: string, updates: Partial<Endpoint>) => {
    setConfig(prev => ({ ...prev, endpoints: prev.endpoints.map(ep => ep.id === id ? { ...ep, ...updates } : ep) }));
  };

  const removeEndpoint = (id: string) => {
    setConfig(prev => ({ ...prev, endpoints: prev.endpoints.filter(ep => ep.id !== id) }));
  };

  const fetchModelsForEndpoint = async (endpointId: string) => {
    const endpoint = config.endpoints.find(e => e.id === endpointId);
    if (!endpoint || !endpoint.apiKey) { updateEndpoint(endpointId, { connectionStatus: 'error', connectionMessage: '需要 API Key' }); return; }
    updateEndpoint(endpointId, { isChecking: true, connectionStatus: 'idle', connectionMessage: '' });
    try {
      let models: string[] = [];
      if (endpoint.type === 'openai_compatible') {
        const baseUrl = endpoint.baseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
        const res = await fetch(`${baseUrl}/models`, { method: 'GET', headers: { 'Authorization': `Bearer ${endpoint.apiKey}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        models = data.data.map((m: any) => m.id);
      } else {
        await new Promise(r => setTimeout(r, 800));
        models = DEFAULT_GEMINI_MODELS;
      }
      updateEndpoint(endpointId, { isChecking: false, connectionStatus: 'success', connectionMessage: `可用: ${models.length}`, availableModels: models, model: models.includes(endpoint.model) ? endpoint.model : (models[0] || endpoint.model) });
    } catch (err: any) {
      updateEndpoint(endpointId, { isChecking: false, connectionStatus: 'error', connectionMessage: err.message });
    }
  };

  // ... (保留 handleFileUpload, getBaseName)
  const getBaseName = (filename: string) => filename.substring(0, filename.lastIndexOf('.')) || filename;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportProgress({ total: 0, current: 0, text: '准备中...' });
    const newImageItems: TaggingItem[] = [];
    const textFileMap = new Map<string, string>();
    const fileArray: File[] = Array.from(files);
    const zipFiles = fileArray.filter(f => f.name.endsWith('.zip') || f.type === 'application/zip');
    const directFiles = fileArray.filter(f => !f.name.endsWith('.zip') && f.type !== 'application/zip');
    let totalItems = directFiles.length + zipFiles.length;
    let processedCount = 0;

    try {
        setImportProgress({ total: totalItems, current: 0, text: '正在扫描文件...' });
        for (const zipFile of zipFiles) {
             setImportProgress({ total: totalItems, current: processedCount, text: `解压 ${zipFile.name}...` });
             try {
                 const zip = await JSZip.loadAsync(zipFile);
                 const validImageEntries: JSZip.JSZipObject[] = [];
                 const validTextEntries: JSZip.JSZipObject[] = [];
                 zip.forEach((_, entry) => {
                     if (!entry.dir && !entry.name.includes('__MACOSX') && !entry.name.startsWith('.')) {
                        if (/\.(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(entry.name)) validImageEntries.push(entry);
                        else if (/\.(txt|caption)$/i.test(entry.name)) validTextEntries.push(entry);
                     }
                 });
                 totalItems = totalItems - 1 + validImageEntries.length + validTextEntries.length;
                 for (const txtEntry of validTextEntries) {
                    const content = await txtEntry.async('string');
                    textFileMap.set(getBaseName(txtEntry.name.split('/').pop() || txtEntry.name), content);
                    processedCount++;
                 }
                 for (const imgEntry of validImageEntries) {
                     const blob = await imgEntry.async('blob');
                     const baseName = getBaseName(imgEntry.name.split('/').pop() || imgEntry.name);
                     newImageItems.push({
                        id: Math.random().toString(36).substr(2, 9),
                        name: imgEntry.name.split('/').pop() || imgEntry.name,
                        blob, previewUrl: URL.createObjectURL(blob),
                        status: textFileMap.get(baseName) ? 'completed' : 'pending',
                        tags: textFileMap.get(baseName) || undefined, attempts: 0
                     });
                     processedCount++;
                     setImportProgress({ total: totalItems, current: processedCount, text: `导入: ${baseName}` });
                 }
             } catch (zipErr) { console.error("Unzip error", zipErr); }
        }
        // Direct files
        const directImages = directFiles.filter(f => f.type.startsWith('image/'));
        const directTexts = directFiles.filter(f => f.type === 'text/plain' || f.name.endsWith('.txt') || f.name.endsWith('.caption'));
        for (const txtFile of directTexts) {
          const content = await new Promise<string>((resolve) => {
            const r = new FileReader(); r.onload = (e) => resolve(e.target?.result as string || ''); r.readAsText(txtFile);
          });
          textFileMap.set(getBaseName(txtFile.name), content);
          processedCount++;
        }
        for (const file of directImages) {
            const baseName = getBaseName(file.name);
            newImageItems.push({
              id: Math.random().toString(36).substr(2, 9), name: file.name, blob: file, previewUrl: URL.createObjectURL(file),
              status: textFileMap.get(baseName) ? 'completed' : 'pending',
              tags: textFileMap.get(baseName) || undefined, attempts: 0
            });
            processedCount++;
            setImportProgress({ total: totalItems, current: processedCount, text: `导入: ${file.name}` });
        }
    } catch (err) { alert("导入错误"); } 
    finally { setItems(prev => [...prev, ...newImageItems]); setImportProgress(null); if (fileInputRef.current) fileInputRef.current.value = ''; setActiveTab('workspace'); }
  };

  // 拖放状态
  const [isDragOver, setIsDragOver] = useState(false);

  // 处理拖放文件（支持图片、ZIP、配置文件）
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // 检查是否有配置文件
    const configFile = Array.from(files).find(f => f.name.endsWith('.json'));
    if (configFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.endpoints) {
            const restoredEndpoints = parsed.endpoints.map((ep: any) => ({
              ...ep, isChecking: false, connectionStatus: 'idle', connectionMessage: '',
              availableModels: ep.availableModels || (ep.type === 'google_sdk' ? DEFAULT_GEMINI_MODELS : [])
            }));
            setConfig({ ...parsed, endpoints: restoredEndpoints });
            alert('配置已导入！');
          }
        } catch { alert('配置文件解析失败'); }
      };
      reader.readAsText(configFile);
      // 如果只有配置文件，直接返回
      if (files.length === 1) return;
    }

    // 处理图片和 ZIP 文件（复用现有逻辑）
    const imageAndZipFiles = Array.from(files).filter(f =>
      /\.(jpe?g|png|webp|bmp|gif|tiff?|zip)$/i.test(f.name) ||
      f.type.startsWith('image/') ||
      f.type === 'application/zip'
    );

    if (imageAndZipFiles.length === 0) return;

    // 创建一个模拟的 event 对象来复用 handleFileUpload
    const dataTransfer = new DataTransfer();
    imageAndZipFiles.forEach(f => dataTransfer.items.add(f));

    // 直接调用文件处理逻辑
    const fakeEvent = { target: { files: dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>;
    await handleFileUpload(fakeEvent);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // 使用 useCallback 优化，传递给 Memoized 组件
  const handleTagUpdate = useCallback((id: string, newTags: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, tags: newTags } : item));
  }, []);

  // NEW: 重置单个为 "pending" (等待)，而非错误
  const handleResetItem = useCallback((id: string) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'pending', error: undefined, attempts: 0 } : item
    ));
  }, []);

  // NEW: 重置所有为 "pending"，状态更友好，且更顺滑
  const handleResetAll = () => {
    if (isProcessing) return;
    if (items.length === 0) return;
    if (!window.confirm("确定要重置所有图片吗？所有状态将变更为「等待」，您可以重新开始打标。")) return;

    // 性能优化：使用批量更新，避免触发大量重渲染
    setItems(prev => {
      // 创建新数组，一次性完成所有更新
      const updated = prev.map(item => ({
        ...item,
        status: 'pending' as const,
        error: undefined,
        attempts: 0,
        tags: item.tags // 保留现有标签作为参考
      }));
      return updated;
    });
  };

  // ... (保留 blobToBase64, callApi, processItem, handleStop, processBatch, exportResults)
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => { const res = reader.result as string; resolve(res.includes(',') ? res.split(',')[1] : res); };
      reader.readAsDataURL(blob);
    });
  };

  const callApi = async (item: TaggingItem, endpoint: Endpoint, base64: string, mimeType: string, currentConfig: GlobalConfig, signal?: AbortSignal): Promise<string> => {
    // 检查是否已被中断
    if (signal?.aborted) throw new Error("已停止");

    const temperature = endpoint.temperature ?? 1.0; // 默认温度 1.0

    if (endpoint.type === 'google_sdk') {
      const ai = new GoogleGenAI({ apiKey: endpoint.apiKey });
      // Google SDK 不原生支持 AbortSignal，用 Promise.race 实现超时中断
      const apiPromise = ai.models.generateContent({
        model: endpoint.model,
        contents: [
          { role: 'user', parts: [{ text: currentConfig.prompt.stage1 }] },
          { role: 'model', parts: [{ text: currentConfig.prompt.stage2 }] },
          { role: 'user', parts: [{ inlineData: { mimeType: mimeType, data: base64 } }, { text: currentConfig.prompt.stage3 }] }
        ],
        config: {
          temperature: temperature,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
          ]
        }
      });

      // 创建一个可以被 abort 信号中断的 Promise
      const abortPromise = new Promise<never>((_, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => reject(new Error("已停止")), { once: true });
        }
      });

      const response = await Promise.race([apiPromise, abortPromise]);
      return response.text || "";
    } else {
      const baseUrl = endpoint.baseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1';
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${endpoint.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: endpoint.model,
          messages: [{ role: 'user', content: currentConfig.prompt.stage1 }, { role: 'assistant', content: currentConfig.prompt.stage2 }, { role: 'user', content: [{ type: "text", text: currentConfig.prompt.stage3 }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }] }],
          max_tokens: 1024,
          temperature: temperature
        }),
        signal // 直接传递 AbortSignal 给 fetch
      });
      if (!res.ok) { const err = await res.text(); if (res.status === 413) throw new Error("Payload Too Large"); throw new Error(`API Error ${res.status}: ${err.substring(0, 50)}`); }
      const data = await res.json(); return data.choices?.[0]?.message?.content || "";
    }
  };

  const processItem = async (item: TaggingItem, endpoint: Endpoint, updateAttempts: (attempts: number) => void, signal?: AbortSignal): Promise<{ tags: string; error?: string }> => {
    const currentConfig = configRef.current;
    let currentBlob = item.blob;
    let attempt = 0;
    const maxAttempts = currentConfig.retry.enabled ? currentConfig.retry.maxAttempts : 1;

    // 检查是否已被中断
    if (signal?.aborted) return { tags: "", error: "已停止" };

    if (currentConfig.compression.enabled) {
      try { currentBlob = await compressImage(item.blob, currentConfig.compression.maxSizeMB, currentConfig.compression.maxWidthOrHeight, currentConfig.compression.quality); } catch (e) {}
    }
    const base64 = await blobToBase64(currentBlob);
    const mimeType = currentBlob.type || 'image/jpeg';
    while (attempt < maxAttempts) {
      // 每次重试前检查是否被中断
      if (signal?.aborted) return { tags: "", error: "已停止" };

      try {
        attempt++;
        updateAttempts(attempt); // 使用回调更新，减少状态更新频率
        const result = await callApi(item, endpoint, base64, mimeType, currentConfig, signal);
        if (!result || result.trim() === "") throw new Error("Empty response");
        if (currentConfig.validation.enabled && result.length <= currentConfig.validation.minChars) throw new Error(`Too short (${result.length})`);
        return { tags: result };
      } catch (err: any) {
        // 如果是中断错误，直接返回
        if (err.message === "已停止" || signal?.aborted) return { tags: "", error: "已停止" };
        if (err.message.includes("401") || err.message.includes("403") || attempt >= maxAttempts) return { tags: "", error: err.message };
        await new Promise(r => setTimeout(r, currentConfig.retry.retryIntervalMs));
      }
    }
    return { tags: "", error: "Max attempts reached" };
  };

  // 停止所有处理 - 立即中断所有进行中的请求
  const handleStop = () => {
    stopRef.current = true;
    // 中断所有正在进行的请求
    abortControllersRef.current.forEach((controller, itemId) => {
      controller.abort();
    });
    abortControllersRef.current.clear();
  };

  // 停止单个任务
  const handleStopItem = useCallback((itemId: string) => {
    stoppedItemsRef.current.add(itemId);
    const controller = abortControllersRef.current.get(itemId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(itemId);
    }
  }, []);

  const processBatch = async () => {
    if (configRef.current.endpoints.filter(e => e.active && e.apiKey && !e.disabled).length === 0) { alert("请配置 API 节点"); setActiveTab('endpoints'); return; }
    if (isProcessing) return;
    stopRef.current = false;

    // 构建待处理项目的 ID 映射，避免重复查找
    const pendingItems = items.filter(i => i.status !== 'completed');
    if (pendingItems.length === 0) { alert("所有项目已完成"); return; }

    // 创建 ID 到索引的映射，优化查找性能
    const itemIdToIndexMap = new Map<string, number>();
    items.forEach((item, idx) => itemIdToIndexMap.set(item.id, idx));

    setIsProcessing(true);
    let endpointIndex = 0;
    let currentIndex = 0;

    // 批量状态更新队列，减少频繁的 setItems 调用
    const updateQueue: Array<{ id: string; update: Partial<TaggingItem> }> = [];
    let updateTimeout: NodeJS.Timeout | null = null;

    const flushUpdates = () => {
      if (updateQueue.length === 0) return;
      const updates = [...updateQueue];
      updateQueue.length = 0; // 清空队列

      setItems(prev => {
        const next = [...prev];
        updates.forEach(({ id, update }) => {
          const idx = itemIdToIndexMap.get(id);
          if (idx !== undefined && next[idx]) {
            next[idx] = { ...next[idx], ...update };
          }
        });
        return next;
      });
    };

    const queueUpdate = (id: string, update: Partial<TaggingItem>) => {
      updateQueue.push({ id, update });

      // 使用防抖，100ms 内的更新会合并成一次
      if (updateTimeout) clearTimeout(updateTimeout);
      updateTimeout = setTimeout(flushUpdates, 100);
    };

    const runWorker = async (workerId: number) => {
      while (currentIndex < pendingItems.length) {
        if (stopRef.current) break;
        const itemIndex = currentIndex++;
        if (itemIndex >= pendingItems.length) break;

        const item = pendingItems[itemIndex];

        // 检查该项目是否已被单独停止
        if (stoppedItemsRef.current.has(item.id)) {
          stoppedItemsRef.current.delete(item.id);
          continue;
        }

        const freshConfig = configRef.current;
        const freshActiveEndpoints = freshConfig.endpoints.filter(e => e.active && e.apiKey && !e.disabled);

        if (freshActiveEndpoints.length === 0) {
          queueUpdate(item.id, { status: 'error', error: '无可用节点' });
          continue;
        }

        const endpoint = freshActiveEndpoints[endpointIndex % freshActiveEndpoints.length];
        endpointIndex++;

        // 为该项目创建 AbortController
        const controller = new AbortController();
        abortControllersRef.current.set(item.id, controller);

        // 开始处理
        queueUpdate(item.id, { status: 'processing', error: undefined, attempts: 0 });

        // 立即刷新状态，让用户看到处理开始
        flushUpdates();

        const result = await processItem(item, endpoint, (attempts) => {
          queueUpdate(item.id, { attempts });
        }, controller.signal);

        // 清理 AbortController
        abortControllersRef.current.delete(item.id);

        // 处理完成 - 如果是被停止的，状态设为 pending 而非 error
        if (result.error === "已停止") {
          queueUpdate(item.id, { status: 'pending', error: undefined, attempts: 0 });
        } else {
          queueUpdate(item.id, {
            status: result.error ? 'error' : 'completed',
            tags: result.tags,
            error: result.error
          });
        }

        // 立即刷新完成状态
        flushUpdates();
      }
    };

    const concurrency = Math.min(configRef.current.concurrency, pendingItems.length);
    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(runWorker(i));
    await Promise.all(workers);

    // 确保所有更新都被应用
    if (updateTimeout) clearTimeout(updateTimeout);
    flushUpdates();

    setIsProcessing(false);
  };

  const exportResults = async () => {
    if (items.length === 0) return alert("无数据可导出");
    const zip = new JSZip();
    items.forEach(item => {
      // 导出所有图片，无论是否已完成
      zip.file(item.name, item.blob);
      // 对应的 txt 文件（即使为空也创建）
      zip.file(`${getBaseName(item.name)}.txt`, item.tags || '');
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content); a.download = `dataset_${new Date().getTime()}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const stats = useMemo(() => ({
    total: items.length,
    completed: items.filter(i => i.status === 'completed').length,
    processing: items.filter(i => i.status === 'processing').length,
    error: items.filter(i => i.status === 'error').length,
    pending: items.filter(i => i.status === 'pending').length,
  }), [items]);

  const progress = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  const remainingCount = stats.pending + stats.error;

  return (
    <div
      className="min-h-screen flex flex-col selection:bg-indigo-500/30 font-sans text-slate-200"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <Navbar />

      {/* 拖放覆盖层 */}
      {isDragOver && (
        <div className="fixed inset-0 z-[150] bg-indigo-900/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-slate-800 border-4 border-dashed border-indigo-400 p-12 rounded-3xl shadow-2xl text-center space-y-4 animate-pulse">
            <Upload className="w-16 h-16 text-indigo-400 mx-auto" />
            <h3 className="text-2xl font-bold text-white">释放以导入文件</h3>
            <p className="text-sm text-slate-300">支持：图片、ZIP 压缩包、配置文件 (.json)</p>
          </div>
        </div>
      )}

      {importProgress && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center space-y-6">
            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto" />
            <div className="space-y-2"><h3 className="text-xl font-bold">导入中...</h3><p className="text-sm text-slate-400">{importProgress.text}</p></div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }} /></div>
          </div>
        </div>
      )}

      {/* 顶部标签栏导航 */}
      <div className="sticky top-16 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md">
         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-1 overflow-x-auto custom-scrollbar">
               {[
                 { id: 'workspace', label: '工作台 (Workspace)', icon: MonitorPlay },
                 { id: 'general', label: '常规设置', icon: Settings2 },
                 { id: 'endpoints', label: `节点设置 (${config.endpoints.length})`, icon: Server },
                 { id: 'prompts', label: '提示词工程', icon: MessageSquare },
               ].map((tab) => (
                 <button
                   key={tab.id}
                   onClick={() => setActiveTab(tab.id as any)}
                   className={`flex items-center gap-2 py-4 px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-500 text-indigo-400 bg-slate-800/30' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/10'}`}
                 >
                   <tab.icon className="w-4 h-4" />{tab.label}
                 </button>
               ))}
            </div>
         </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'workspace' && (
           <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
                <div className="flex items-center gap-3">
                  <label className="group cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 select-none">
                    <Upload className="w-4 h-4 group-hover:-translate-y-1 transition-transform" /> 上传图片/ZIP
                    <input ref={fileInputRef} type="file" multiple accept="image/*,.zip,.txt,.caption" className="hidden" onChange={handleFileUpload} />
                  </label>
                  <button onClick={() => setItems([])} className="bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 p-3 rounded-xl transition-all border border-slate-700 active:scale-95" title="清空列表"><Trash2 className="w-5 h-5" /></button>
                </div>
                <div className="flex items-center gap-3">
                   <div className="text-right mr-2 hidden md:block">
                     <div className="text-[10px] text-slate-500 uppercase font-bold">运行状态</div>
                     <div className="text-xs font-bold text-emerald-400">{config.concurrency > 1 ? '并发模式' : '串行模式'} (x{config.concurrency})</div>
                   </div>
                  {isProcessing ? (
                    <button onClick={handleStop} className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl text-sm font-black flex items-center gap-2 shadow-xl shadow-rose-500/20"><Square className="w-4 h-4 fill-current" /> 停止运行</button>
                  ) : (
                    <>
                       <button onClick={handleResetAll} disabled={items.length === 0} className="p-3 bg-slate-800 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 rounded-xl transition-all border border-slate-700 active:scale-95" title="重置全部状态"><RefreshCcw className="w-5 h-5" /></button>
                       <button onClick={processBatch} disabled={remainingCount === 0} className={`px-8 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all active:scale-95 select-none ${remainingCount === 0 ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-500/20'}`}>
                         {remainingCount === 0 ? <><CheckCircle2 className="w-4 h-4" /> 全部完成</> : (stats.completed > 0 || stats.error > 0) ? <><Play className="w-4 h-4 fill-current" /> 继续处理</> : <><Play className="w-4 h-4 fill-current" /> 开始处理</>}
                       </button>
                    </>
                  )}
                  <button onClick={exportResults} disabled={stats.completed === 0 && !items.some(i => i.tags)} className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 select-none ${stats.completed === 0 && !items.some(i => i.tags) ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-500/20'}`}><Download className="w-4 h-4" /> 导出</button>
                </div>
             </div>

             <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[600px]">
               <div className="h-1.5 w-full bg-slate-800 relative overflow-hidden"><div className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }} /></div>
               <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
                 <h3 className="font-bold flex items-center gap-2 text-slate-200">任务队列 <span className="text-slate-500 font-medium text-xs px-2 py-0.5 bg-slate-800 rounded-full">{items.length} 文件</span></h3>
                 <div className="flex gap-4 text-xs font-bold"><span className="text-emerald-400">成功: {stats.completed}</span><span className="text-rose-400">失败: {stats.error}</span><span className="text-slate-500">待处理: {stats.pending}</span></div>
               </div>
               
               {items.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-slate-600 p-12"><div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-6 animate-pulse"><Plus className="w-12 h-12" /></div><p className="text-xl font-bold text-slate-400">队列为空</p><p className="text-sm mt-2">上传图片或 ZIP 压缩包开始批量打标</p></div>
               ) : (
                 <div className="flex-1 p-6 bg-slate-900/50">
                   <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
                     {items.map((item) => (
                       <ItemCard
                          key={item.id}
                          item={item}
                          isProcessing={isProcessing}
                          maxRetry={configRef.current.retry.maxAttempts}
                          onReset={handleResetItem}
                          onUpdateTags={handleTagUpdate}
                          onStopItem={handleStopItem}
                       />
                     ))}
                   </div>
                 </div>
               )}
             </div>
           </div>
        )}

        {activeTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity className="w-4 h-4" /> 运行模式</h3>
                <div className="bg-slate-800/50 p-1 rounded-xl flex border border-slate-800">
                    <button onClick={() => setConfig(prev => ({...prev, concurrency: 1}))} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${config.concurrency === 1 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}>串行轮询 (Poll)</button>
                    <button onClick={() => setConfig(prev => ({...prev, concurrency: prev.concurrency > 1 ? prev.concurrency : 3}))} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${config.concurrency > 1 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}>并发处理 (Concurrent)</button>
                </div>
                {config.concurrency > 1 && (
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800">
                    <div className="flex justify-between text-xs mb-2"><span>并发线程数</span><span className="font-bold text-indigo-400">{config.concurrency}</span></div>
                    <input type="range" min="2" max="10" step="1" value={config.concurrency} onChange={(e) => setConfig(prev => ({...prev, concurrency: parseInt(e.target.value)}))} className="w-full accent-indigo-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                  </div>
                )}
              </div>
              {/* 保留其他设置项，简化代码显示以聚焦核心变更 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Ruler className="w-4 h-4" /> 结果验证</h3>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between"><span className="text-xs">启用长度检测</span><input type="checkbox" checked={config.validation.enabled} onChange={(e) => setConfig(prev => ({...prev, validation: {...prev.validation, enabled: e.target.checked}}))} className="w-4 h-4 accent-indigo-500 rounded cursor-pointer" /></div>
                  {config.validation.enabled && (<div><div className="flex justify-between mb-1"><label className="text-[10px] text-slate-500">丢弃阈值 (字符数)</label><span className="text-[10px] text-indigo-400 font-bold">≤ {config.validation.minChars}</span></div><input type="number" value={config.validation.minChars} onChange={(e) => setConfig(prev => ({...prev, validation: {...prev.validation, minChars: parseInt(e.target.value)}}))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs" /></div>)}
                </div>
              </div>
              {/* 重试与压缩等设置... */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800">
                  <button onClick={exportConfig} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-xs py-3 rounded-xl transition-colors"><Save className="w-3 h-3" /> 导出配置</button>
                  <button onClick={() => configInputRef.current?.click()} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-xs py-3 rounded-xl transition-colors"><FileUp className="w-3 h-3" /> 导入配置</button>
                  <input type="file" ref={configInputRef} onChange={importConfig} accept=".json" className="hidden" />
              </div>
          </div>
        )}

        {/* Endpoint 和 Prompt Tab 逻辑保持不变... */}
        {activeTab === 'endpoints' && (
           <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {config.endpoints.map((ep, idx) => (
               <div key={ep.id} className={`relative rounded-xl p-4 space-y-3 group transition-all ${ep.disabled ? 'bg-slate-900/30 border border-slate-800 opacity-50' : 'bg-slate-800/40 border border-slate-700'}`}>
                 {/* 虚化遮罩提示 */}
                 {ep.disabled && (
                   <div className="absolute top-2 right-14 text-[10px] px-2 py-0.5 bg-slate-700 text-slate-400 rounded-md font-bold">
                     已虚化
                   </div>
                 )}
                 <div className="flex items-center justify-between mb-2">
                   <div className="flex items-center gap-2">
                     <input type="checkbox" checked={ep.active} disabled={ep.disabled} onChange={(e) => updateEndpoint(ep.id, { active: e.target.checked })} className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer disabled:opacity-50" />
                     <input value={ep.name} onChange={(e) => updateEndpoint(ep.id, { name: e.target.value })} className={`bg-transparent text-xs font-bold border-none outline-none focus:ring-0 p-0 w-32 ${ep.disabled ? 'text-slate-500' : 'text-slate-200'}`} />
                   </div>
                   <div className="flex items-center gap-1">
                     <button onClick={() => updateEndpoint(ep.id, { disabled: !ep.disabled, active: ep.disabled ? ep.active : false })} className={`p-1 ${ep.disabled ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-400'}`} title={ep.disabled ? "取消虚化" : "虚化节点（保留但不使用）"}>
                       {ep.disabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                     </button>
                     <button onClick={() => copyEndpoint(ep)} className="text-slate-600 hover:text-indigo-400 p-1" title="复制节点"><Copy className="w-3.5 h-3.5" /></button>
                     <button onClick={() => removeEndpoint(ep.id)} className="text-slate-600 hover:text-red-400 p-1" title="删除节点"><Trash2 className="w-3.5 h-3.5" /></button>
                   </div>
                 </div>
                 <div className={`space-y-2 ${ep.disabled ? 'pointer-events-none' : ''}`}>
                   <select value={ep.type} onChange={(e) => updateEndpoint(ep.id, { type: e.target.value as any })} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1.5 outline-none"><option value="google_sdk">Google GenAI SDK (默认)</option><option value="openai_compatible">OpenAI 兼容 (自定义 URL)</option></select>
                   {ep.type === 'openai_compatible' && <input placeholder="Base URL" value={ep.baseUrl} onChange={(e) => updateEndpoint(ep.id, { baseUrl: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1.5 outline-none placeholder-slate-600" />}
                   <input type="password" placeholder="API Key" value={ep.apiKey} onChange={(e) => updateEndpoint(ep.id, { apiKey: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1.5 outline-none placeholder-slate-600" />
                   <div className="flex gap-2">
                     <button onClick={() => fetchModelsForEndpoint(ep.id)} disabled={ep.isChecking || !ep.apiKey || ep.disabled} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center shrink-0 w-24 ${ep.connectionStatus === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : ep.connectionStatus === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500'}`}>{ep.isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : ep.connectionStatus === 'success' ? <Wifi className="w-3 h-3" /> : ep.connectionStatus === 'error' ? <WifiOff className="w-3 h-3" /> : '连接'}</button>
                     <div className="relative flex-1"><select value={ep.model} onChange={(e) => updateEndpoint(ep.id, { model: e.target.value })} className="w-full h-full bg-slate-900 border border-slate-700 rounded-lg text-xs pl-2 pr-8 py-1.5 outline-none appearance-none">{ep.availableModels?.map(m => (<option key={m} value={m}>{m}</option>)) || <option value={ep.model}>{ep.model}</option>}</select><List className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" /></div>
                   </div>
                   {/* 温度设置 */}
                   <div className="flex items-center gap-3 pt-2">
                     <span className="text-[10px] text-slate-500 shrink-0">温度</span>
                     <input
                       type="range"
                       min="0"
                       max="2"
                       step="0.1"
                       value={ep.temperature ?? 1.0}
                       onChange={(e) => updateEndpoint(ep.id, { temperature: parseFloat(e.target.value) })}
                       className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                     />
                     <span className="text-[10px] text-indigo-400 font-bold w-8 text-right">{(ep.temperature ?? 1.0).toFixed(1)}</span>
                   </div>
                 </div>
               </div>
             ))}
             <button onClick={addEndpoint} className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-xs font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> 添加新节点</button>
           </div>
        )}

        {activeTab === 'prompts' && (
           <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="relative group"><label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 px-1">Phase 1: 设定</label><textarea value={config.prompt.stage1} onChange={(e) => setConfig(prev => ({ ...prev, prompt: { ...prev.prompt, stage1: e.target.value } }))} className="w-full h-24 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none custom-scrollbar" /></div>
             <div className="relative group"><label className="block text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 px-1">Phase 2: 注入</label><textarea value={config.prompt.stage2} onChange={(e) => setConfig(prev => ({ ...prev, prompt: { ...prev.prompt, stage2: e.target.value } }))} className="w-full h-24 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none resize-none custom-scrollbar" /></div>
             <div className="relative group"><label className="block text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-2 px-1">Phase 3: 执行</label><textarea value={config.prompt.stage3} onChange={(e) => setConfig(prev => ({ ...prev, prompt: { ...prev.prompt, stage3: e.target.value } }))} className="w-full h-24 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-300 focus:ring-2 focus:ring-purple-500 outline-none resize-none custom-scrollbar" /></div>
             <button onClick={() => setConfig(prev => ({ ...prev, prompt: { stage1: "你是一个专业的图像标注AI。你的任务是为提供的图像生成详细、高质量的标签。输出应仅为逗号分隔的值。", stage2: "我准备好了。我将作为专业的图像标注AI，为您提供的图像提供逗号分隔的标签。请提供图像。", stage3: "分析这张图片并生成涵盖主体、风格、情绪和技术方面的综合标签。仅输出标签，不要包含其他文字。" }}))} className="text-xs text-slate-500 hover:text-white flex items-center gap-1 mx-auto transition-colors"><RefreshCcw className="w-3 h-3" /> 重置为默认提示词</button>
           </div>
        )}
      </main>
      <footer className="bg-slate-900/50 border-t border-slate-800 py-6 text-center"><p className="text-slate-600 text-[10px] font-medium uppercase tracking-[0.2em]">© {new Date().getFullYear()} 智能图像数据工坊</p></footer>
    </div>
  );
};

export default App;
