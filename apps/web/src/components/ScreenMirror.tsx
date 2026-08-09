'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Home,
  Layers,
  Monitor,
  MonitorOff,
  MousePointer2,
  Move,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Type,
  Volume1,
  Volume2,
} from 'lucide-react';
import { apiFetch, apiUrl } from '@/lib/api-client';

type MirrorState = 'idle' | 'streaming' | 'paused' | 'error';
type InteractionMode = 'tap' | 'swipe';
type DragState = { startX: number; startY: number; currentX: number; currentY: number; active: boolean };

interface ScreenMirrorProps {
  deviceCode: string;
  deviceStatus: string;
}

const FRAME_INTERVAL_MS = 30;

export default function ScreenMirror({ deviceCode, deviceStatus }: ScreenMirrorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<DragState>({ startX: 0, startY: 0, currentX: 0, currentY: 0, active: false });

  const [mirrorState, setMirrorState] = useState<MirrorState>('idle');
  const [mode, setMode] = useState<InteractionMode>('tap');
  const [resolution, setResolution] = useState<{ width: number; height: number }>({ width: 720, height: 1600 });
  const [fps, setFps] = useState(0);
  const [actionFeedback, setActionFeedback] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);

  const isOnline = ['ONLINE', 'WARNING', 'BUSY'].includes(deviceStatus.toUpperCase());

  // Portrait dimensions (เสมอแนวตั้ง)
  const portraitWidth = Math.min(resolution.width || 720, resolution.height || 1600);
  const portraitHeight = Math.max(resolution.width || 720, resolution.height || 1600);

  const requestHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem('accessToken') || window.localStorage.getItem('token')
      : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  // Fetch resolution
  useEffect(() => {
    if (!isOnline) return;
    void (async () => {
      try {
        const res = await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/screen/info`, {
          headers: requestHeaders(),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setResolution({ width: json.data.width, height: json.data.height });
        }
      } catch { /* ignore */ }
    })();
  }, [deviceCode, isOnline, requestHeaders]);

  const frameCountRef = useRef<number>(0);

  useEffect(() => {
    if (mirrorState !== 'streaming') {
      setFps(0);
      return;
    }
    const interval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, [mirrorState]);

  // Capture frame & render in portrait (จอแนวตั้ง มือถือ)
  const captureFrame = useCallback(async () => {
    if (abortRef.current?.signal.aborted) return;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/devices/${encodeURIComponent(deviceCode)}/screen`,
        {
          headers: requestHeaders(),
          signal: controller.signal,
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const isLandscape = bitmap.width > bitmap.height;
      const targetWidth = isLandscape ? bitmap.height : bitmap.width;
      const targetHeight = isLandscape ? bitmap.width : bitmap.height;

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isLandscape) {
          ctx.translate(targetWidth / 2, targetHeight / 2);
          ctx.rotate((90 * Math.PI) / 180);
          ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        } else {
          ctx.drawImage(bitmap, 0, 0);
        }
      }
      bitmap.close();

      frameCountRef.current += 1;
      setMirrorState('streaming');
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || controller.signal.aborted) return;
      setMirrorState('error');
    }
  }, [deviceCode, requestHeaders]);

  // Streaming loop
  const startStreaming = useCallback(() => {
    setMirrorState('streaming');
    const loop = async () => {
      await captureFrame();
      if (abortRef.current?.signal.aborted) return;
      frameTimerRef.current = setTimeout(loop, FRAME_INTERVAL_MS);
    };
    void loop();
  }, [captureFrame]);

  const stopStreaming = useCallback(() => {
    if (abortRef.current && !abortRef.current.signal.aborted) {
      try { abortRef.current.abort('Stopped streaming'); } catch { /* ignore */ }
    }
    if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
    frameTimerRef.current = null;
    setMirrorState('paused');
  }, []);

  const toggleStream = useCallback(() => {
    if (mirrorState === 'streaming') {
      stopStreaming();
    } else {
      abortRef.current = new AbortController();
      startStreaming();
    }
  }, [mirrorState, startStreaming, stopStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current && !abortRef.current.signal.aborted) {
        try { abortRef.current.abort('Component unmounted'); } catch { /* ignore */ }
      }
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current);
    };
  }, []);

  // Convert canvas click coords to device coords
  const canvasToDevice = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = portraitWidth / rect.width;
    const scaleY = portraitHeight / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return { x: Math.round(x), y: Math.round(y) };
  }, [portraitWidth, portraitHeight]);

  const showFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(''), 2000);
  }, []);

  // Actions
  const handleTap = useCallback(async (x: number, y: number) => {
    showFeedback(`TAP (${x}, ${y})`);
    try {
      await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/screen/tap`, {
        method: 'POST',
        headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
    } catch { showFeedback('TAP failed'); }
  }, [deviceCode, requestHeaders, showFeedback]);

  const handleSwipe = useCallback(async (x1: number, y1: number, x2: number, y2: number) => {
    showFeedback(`SWIPE (${x1},${y1}) → (${x2},${y2})`);
    try {
      await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/screen/swipe`, {
        method: 'POST',
        headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ x1, y1, x2, y2, duration: 300 }),
      });
    } catch { showFeedback('SWIPE failed'); }
  }, [deviceCode, requestHeaders, showFeedback]);

  const sendKey = useCallback(async (keycode: string, label: string) => {
    showFeedback(label);
    try {
      await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/screen/key`, {
        method: 'POST',
        headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycode }),
      });
    } catch { showFeedback(`${label} failed`); }
  }, [deviceCode, requestHeaders, showFeedback]);

  const sendText = useCallback(async () => {
    if (!textInput.trim()) return;
    showFeedback(`TEXT: ${textInput}`);
    try {
      await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/screen/text`, {
        method: 'POST',
        headers: { ...requestHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
      });
      setTextInput('');
      setShowTextInput(false);
    } catch { showFeedback('TEXT input failed'); }
  }, [deviceCode, requestHeaders, textInput, showFeedback]);

  // Mouse events
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = canvasToDevice(e.clientX, e.clientY);
    if (!coords) return;
    if (mode === 'swipe') {
      dragRef.current = { startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y, active: true };
    }
  }, [canvasToDevice, mode]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'swipe' && dragRef.current.active) {
      const coords = canvasToDevice(e.clientX, e.clientY);
      if (coords) dragRef.current = { ...dragRef.current, currentX: coords.x, currentY: coords.y };
    }
  }, [canvasToDevice, mode]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = canvasToDevice(e.clientX, e.clientY);
    if (!coords) return;

    if (mode === 'tap') {
      void handleTap(coords.x, coords.y);
    } else if (mode === 'swipe' && dragRef.current.active) {
      const { startX, startY } = dragRef.current;
      const dist = Math.hypot(coords.x - startX, coords.y - startY);
      if (dist > 20) {
        void handleSwipe(startX, startY, coords.x, coords.y);
      } else {
        void handleTap(coords.x, coords.y);
      }
      dragRef.current = { startX: 0, startY: 0, currentX: 0, currentY: 0, active: false };
    }
  }, [canvasToDevice, mode, handleTap, handleSwipe]);

  // Touch events
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const coords = canvasToDevice(touch.clientX, touch.clientY);
    if (!coords) return;
    dragRef.current = { startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y, active: true };
  }, [canvasToDevice]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { startX, startY, currentX, currentY, active } = dragRef.current;
    if (!active) return;
    const dist = Math.hypot(currentX - startX, currentY - startY);
    if (dist > 20) {
      void handleSwipe(startX, startY, currentX, currentY);
    } else {
      void handleTap(startX, startY);
    }
    dragRef.current = { startX: 0, startY: 0, currentX: 0, currentY: 0, active: false };
  }, [handleTap, handleSwipe]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const coords = canvasToDevice(touch.clientX, touch.clientY);
    if (coords) dragRef.current = { ...dragRef.current, currentX: coords.x, currentY: coords.y };
  }, [canvasToDevice]);

  return (
    <section className="card">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-pixel-border pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-cyber-blue" />
          <h2 className="card-header mb-0">Live Screen Mirror (มือถือ จอแนวตั้ง)</h2>
          {mirrorState === 'streaming' && (
            <span className="badge badge-online !text-[10px]">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-status-green" />
              LIVE {fps > 0 && `${fps} FPS`}
            </span>
          )}
          {mirrorState === 'paused' && <span className="badge badge-warning !text-[10px]">PAUSED</span>}
          {mirrorState === 'error' && <span className="badge badge-error !text-[10px]">ERROR</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleStream}
            disabled={!isOnline}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-mono text-xs font-bold transition-all disabled:opacity-40 ${
              mirrorState === 'streaming'
                ? 'border-error-red/60 text-error-red hover:bg-error-red/10'
                : 'border-status-green/60 text-status-green hover:bg-status-green/10'
            }`}
          >
            {mirrorState === 'streaming' ? <><Pause className="h-3.5 w-3.5" />Stop Mirror</> : <><Play className="h-3.5 w-3.5" />Start Mirror</>}
          </button>
        </div>
      </div>

      {/* Main Layout: Smartphone Frame on Left, Controls on Right */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
        {/* Smartphone Portrait Casing (จอแนวตั้ง มือถือ) */}
        <div className="relative mx-auto w-full max-w-[340px] shrink-0 rounded-[36px] border-[6px] border-navy-600 bg-navy-900 p-3 shadow-2xl ring-2 ring-cyber-blue/30 transition-all">
          {/* Top Notch Speaker */}
          <div className="relative z-20 mx-auto -mt-1 mb-2.5 flex h-4 w-28 items-center justify-center rounded-b-xl bg-navy-800">
            <div className="h-1.5 w-10 rounded-full bg-navy-600" />
            <div className="ml-2.5 h-2 w-2 rounded-full bg-cyber-blue/60" />
          </div>

          {/* Canvas Viewport inside Phone Glass */}
          <div className="relative overflow-hidden rounded-[22px] border border-pixel-border bg-black shadow-inner">
            {mirrorState === 'idle' ? (
              <div
                className="flex items-center justify-center p-6"
                style={{ aspectRatio: `${portraitWidth} / ${portraitHeight}` }}
              >
                <div className="text-center">
                  <MonitorOff className="mx-auto h-12 w-12 text-gray-600" />
                  <p className="mt-3 font-mono text-xs text-gray-400">
                    {isOnline ? 'กด Start Mirror เพื่อดูหน้าจอมือถือ' : 'อุปกรณ์ไม่ได้เชื่อมต่อ'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  className="block w-full cursor-crosshair object-contain"
                  style={{ aspectRatio: `${portraitWidth} / ${portraitHeight}` }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                />
                {/* Feedback Toast */}
                {actionFeedback && (
                  <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-cyber-blue/50 bg-dark-navy/90 px-3.5 py-1 font-mono text-[11px] text-cyber-blue shadow-glow backdrop-blur-sm animate-fade-in">
                    {actionFeedback}
                  </div>
                )}
                {/* Mode Indicator Overlay */}
                <div className="absolute bottom-2 left-2 z-10 rounded border border-pixel-border/80 bg-dark-navy/85 px-2 py-0.5 font-mono text-[9px] text-gray-300 backdrop-blur-sm">
                  {mode === 'tap' ? '🖱️ Tap' : '↔️ Swipe'} · {portraitWidth}×{portraitHeight}
                </div>
              </>
            )}
          </div>

          {/* Bottom Home Indicator Pill */}
          <div className="mx-auto mt-2.5 h-1 w-24 rounded-full bg-navy-600" />
        </div>

        {/* Side Controls Panel */}
        <div className="flex flex-1 flex-col gap-3 rounded-lg border border-pixel-border bg-navy-800 p-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-cyber-blue">Visual Control Center</h3>

          {/* Mode Selector */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Interaction Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton active={mode === 'tap'} onClick={() => setMode('tap')} icon={<MousePointer2 className="h-3.5 w-3.5" />} label="Tap Mode" />
              <ModeButton active={mode === 'swipe'} onClick={() => setMode('swipe')} icon={<Move className="h-3.5 w-3.5" />} label="Swipe Mode" />
            </div>
          </div>

          {/* Phone Navigation Buttons */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Navigation Keys</p>
            <div className="grid grid-cols-3 gap-2">
              <KeyButton onClick={() => void sendKey('KEYCODE_BACK', 'BACK')} icon={<ChevronLeft className="h-4 w-4" />} label="Back" />
              <KeyButton onClick={() => void sendKey('KEYCODE_HOME', 'HOME')} icon={<Home className="h-4 w-4" />} label="Home" />
              <KeyButton onClick={() => void sendKey('KEYCODE_APP_SWITCH', 'RECENTS')} icon={<Layers className="h-4 w-4" />} label="Recents" />
            </div>
          </div>

          {/* Device Actions */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Device Hardware</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KeyButton onClick={() => void sendKey('KEYCODE_VOLUME_UP', 'VOL+')} icon={<Volume2 className="h-3.5 w-3.5" />} label="Vol +" />
              <KeyButton onClick={() => void sendKey('KEYCODE_VOLUME_DOWN', 'VOL-')} icon={<Volume1 className="h-3.5 w-3.5" />} label="Vol −" />
              <KeyButton onClick={() => void sendKey('KEYCODE_WAKEUP', 'WAKE')} icon={<ArrowUp className="h-3.5 w-3.5" />} label="Wake" />
              <KeyButton onClick={() => void sendKey('KEYCODE_POWER', 'POWER')} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Power" />
            </div>
          </div>

          {/* Text Input */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Remote Keyboard Text</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field flex-1 !py-1.5 !text-xs"
                placeholder="พิมพ์ข้อความภาษาอังกฤษ/ตัวเลข..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void sendText(); }}
              />
              <button
                type="button"
                className="btn-primary flex items-center gap-1 shrink-0 !py-1.5 !px-3 text-xs"
                onClick={() => void sendText()}
              >
                <Type className="h-3.5 w-3.5" /> Send
              </button>
            </div>
          </div>

          {/* Quick Scroll Shortcuts */}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Page Scroll</p>
            <div className="grid grid-cols-2 gap-2">
              <KeyButton
                onClick={() => void handleSwipe(portraitWidth / 2, portraitHeight * 0.7, portraitWidth / 2, portraitHeight * 0.3)}
                icon={<ArrowUp className="h-4 w-4" />}
                label="Scroll Up (ขึ้น)"
              />
              <KeyButton
                onClick={() => void handleSwipe(portraitWidth / 2, portraitHeight * 0.3, portraitWidth / 2, portraitHeight * 0.7)}
                icon={<ArrowDown className="h-4 w-4" />}
                label="Scroll Down (ลง)"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Sub-components ── */

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded border px-3 py-2 font-mono text-xs font-bold transition-all ${
        active
          ? 'border-cyber-blue bg-cyber-blue/20 text-cyber-blue shadow-pixel-sm'
          : 'border-pixel-border text-gray-400 hover:border-gray-500 hover:text-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function KeyButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded border border-pixel-border bg-navy-700 px-3 py-2 font-mono text-xs text-gray-200 transition-colors hover:border-cyber-blue hover:text-cyber-blue active:scale-95 active:bg-cyber-blue/10"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
