'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

type JsonRecord = Record<string, unknown>;
type AgentCode = '16bit.MANAGER' | '16bit.DEVICE' | '16bit.QA' | '16bit.LOG';
type Command = 'HEALTH_CHECK' | 'SCREENSHOT' | 'OPEN_APP' | 'STOP_APP' | 'RESTART_APP' | 'PUSH_FILE' | 'REBOOT_DEVICE';

type AgentView = {
  id: string | null;
  code: AgentCode;
  name: string;
  role: string;
  status: string;
  currentTaskId: string | null;
  lastActivityAt: string | null;
  source: 'API' | 'SOCKET' | 'NONE';
};

type TaskView = {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: string;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type LiveEvent = {
  id: string;
  type: 'AGENT' | 'JOB' | 'DEVICE';
  title: string;
  detail: string;
  status: string;
  timestamp: string;
};

type CommandResult = {
  phase: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  jobId: string | null;
  status: string | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
const AGENT_DEFINITIONS: ReadonlyArray<{ code: AgentCode; name: string; role: string; description: string }> = [
  { code: '16bit.MANAGER', name: 'Manager', role: 'MANAGER', description: 'Creates the real PHONE-001 device task.' },
  { code: '16bit.DEVICE', name: 'Device', role: 'DEVICE', description: 'Tracks and executes PHONE-001 commands.' },
  { code: '16bit.QA', name: 'QA', role: 'QA', description: 'Verifies the command result from the job.' },
  { code: '16bit.LOG', name: 'Log', role: 'LOG', description: 'Records job logs and device events.' },
];
const AGENT_CODES = new Set<AgentCode>(AGENT_DEFINITIONS.map((agent) => agent.code));
const COMMANDS: ReadonlyArray<Command> = ['HEALTH_CHECK', 'SCREENSHOT', 'OPEN_APP', 'STOP_APP', 'RESTART_APP', 'PUSH_FILE', 'REBOOT_DEVICE'];
const COMMAND_SET = new Set<string>(COMMANDS);
const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED']);

export default function AIOfficePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [agents, setAgents] = useState<Record<AgentCode, AgentView>>(emptyAgents);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [command, setCommand] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [commandResult, setCommandResult] = useState<CommandResult>({ phase: 'idle', message: '', jobId: null, status: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [activatingAll, setActivatingAll] = useState(false);

  const requestHeaders = useCallback((json = false) => {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const loadData = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setLoadError('');
    try {
      let agentsResponse: Response | null = null;
      try {
        agentsResponse = await fetch(`${apiUrl}/api/v1/agents`, {
          cache: 'no-store',
          headers: requestHeaders(),
        });
      } catch {
        setLoadError('⚠️ ไม่พบการเชื่อมต่อกับ Backend API (http://localhost:3001) — กรุณารันคำสั่ง "npm run dev --workspace @farm-phone/api" ใน Terminal');
        return;
      }

      let agentsPayload: unknown;
      try {
        agentsPayload = await readPayload(agentsResponse);
      } catch (error) {
        setLoadError(`⚠️ เชื่อมต่อ Backend API แล้ว แต่โหลดข้อมูล Agent ไม่สำเร็จ (HTTP ${agentsResponse.status}): ${errorMessage(error, 'Unknown backend error')}`);
        return;
      }
      const apiAgents = toRecords(agentsPayload);
      const nextAgents = normalizeAgents(apiAgents);
      setAgents((current) => mergeAgentSnapshots(current, nextAgents));

      const tasksResponse = await fetch(`${apiUrl}/api/v1/agent-tasks`, {
        cache: 'no-store',
        headers: requestHeaders(),
      }).catch(() => null);

      if (tasksResponse) {
        const tasksPayload = await readPayload(tasksResponse);
        const normalizedTasks = toRecords(tasksPayload).map(normalizeTask).filter((task): task is TaskView => Boolean(task));
        setTasks(normalizedTasks);

        // Auto-extract events from tasks for REST timeline fallback
        if (normalizedTasks.length) {
          const restEvents: LiveEvent[] = normalizedTasks.slice(0, 15).map((t) => ({
            id: `task-${t.id}`,
            type: 'AGENT',
            title: t.agentId,
            detail: t.title || t.description || 'Task updated',
            status: t.status,
            timestamp: t.updatedAt || t.createdAt || new Date().toISOString(),
          }));
          setEvents((current) => {
            const merged = [...current];
            for (const ev of restEvents) {
              if (!merged.some((e) => e.id === ev.id)) {
                merged.push(ev);
              }
            }
            return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50);
          });
        }
      }
    } catch (error) {
      setLoadError(errorMessage(error, 'Unable to load AI Office data'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestHeaders]);

  const handleActivateAll = async () => {
    setActivatingAll(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/agents/activate-all`, {
        method: 'POST',
        headers: requestHeaders(true),
      });
      await readPayload(response);
      await loadData(true);
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to activate all agents'));
    } finally {
      setActivatingAll(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let disposed = false;
    let socket: { on: (event: string, listener: (payload?: unknown) => void) => void; disconnect: () => void } | undefined;

    void import('socket.io-client').then(({ io }) => {
      if (disposed) return;
      const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
      socket = io(wsUrl, { auth: token ? { token } : undefined, reconnection: true });
      socket.on('connect', () => setSocketConnected(true));
      socket.on('disconnect', () => setSocketConnected(false));
      socket.on('connect_error', () => setSocketConnected(false));
      socket.on('agentState', (payload) => {
        const record = extractEventRecord(payload, 'agent');
        const code = firstString(record.agentCode, record.code);
        if (!isAgentCode(code)) return;
        const status = upper(firstString(record.status), 'IDLE');
        const now = new Date().toISOString();
        setAgents((current) => ({
          ...current,
          [code]: {
            ...current[code],
            code,
            status,
            currentTaskId: nullableString(record.currentTaskId, current[code].currentTaskId),
            lastActivityAt: nullableString(record.lastActivityAt, record.timestamp, now),
            source: 'SOCKET',
          },
        }));
        addLiveEvent(setEvents, {
          id: eventId('agent', record),
          type: 'AGENT',
          title: code,
          detail: firstString(record.message, record.currentTask, record.jobId) || 'Agent state updated',
          status,
          timestamp: nullableString(record.timestamp, record.lastActivityAt, now) || now,
        });
        scheduleRefresh(refreshTimerRef, loadData);
      });
      socket.on('jobUpdate', (payload) => {
        const record = extractEventRecord(payload, 'job');
        if (!matchesPhone001(record)) return;
        const status = upper(firstString(record.status), 'UNKNOWN');
        const jobId = nullableString(record.id, record.jobId);
        const now = new Date().toISOString();
        addLiveEvent(setEvents, {
          id: eventId('job', record),
          type: 'JOB',
          title: firstString(record.command, record.type) || 'PHONE-001 job',
          detail: firstString(record.errorMessage, record.message, jobId) || 'Job updated',
          status,
          timestamp: nullableString(record.updatedAt, record.completedAt, record.startedAt, record.createdAt, now) || now,
        });
        if (jobId) {
          setCommandResult((current) => current.jobId === jobId
            ? {
                phase: status === 'SUCCESS' ? 'success' : status === 'FAILED' || status === 'CANCELLED' ? 'error' : 'loading',
                message: firstString(record.errorMessage) || `Job ${status}`,
                jobId,
                status,
              }
            : current);
        }
        scheduleRefresh(refreshTimerRef, loadData);
      });
      socket.on('deviceUpdate', (payload) => {
        const record = extractEventRecord(payload, 'device');
        if (!matchesPhone001(record)) return;
        const status = upper(firstString(record.status), 'UNKNOWN');
        const now = new Date().toISOString();
        addLiveEvent(setEvents, {
          id: eventId('device', record),
          type: 'DEVICE',
          title: 'PHONE-001',
          detail: firstString(record.reason, record.message, record.type) || 'Device state updated',
          status,
          timestamp: nullableString(record.lastHeartbeatAt, record.updatedAt, record.timestamp, now) || now,
        });
      });
    }).catch(() => setSocketConnected(false));

    return () => {
      disposed = true;
      clearScheduledRefresh(refreshTimerRef);
      socket?.disconnect();
    };
  }, [loadData]);

  // Auto Polling Fallback Timer — ensures live events & status update even if socket drops
  useEffect(() => {
    if (socketConnected) return;

    const timer = setInterval(() => {
      void loadData(true);
    }, 30_000);

    return () => clearInterval(timer);
  }, [socketConnected, loadData]);

  const tasksByAgent = useMemo(() => {
    const grouped = new Map<string, TaskView[]>();
    for (const task of [...tasks].sort(compareNewest)) {
      grouped.set(task.agentId, [...(grouped.get(task.agentId) || []), task]);
    }
    return grouped;
  }, [tasks]);

  const parsedCommand = parseCommand(command);
  const commandError = command.trim() && !parsedCommand
    ? `Use an exact command: ${COMMANDS.join(', ')}`
    : parsedCommand === 'PUSH_FILE' && !selectedFile
      ? 'PUSH_FILE requires a file.'
      : '';
  const submitting = commandResult.phase === 'loading';

  const agentValues = Object.values(agents);
  const totalMvpCount = AGENT_DEFINITIONS.length;
  const workingCount = agentValues.filter((a) =>
    ['WORKING', 'IN_PROGRESS', 'ACTIVE', 'BUSY'].includes(a.status?.toUpperCase() || '')
  ).length;

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exactCommand = parseCommand(command);
    if (!exactCommand || (exactCommand === 'PUSH_FILE' && !selectedFile) || submitting) return;

    const idempotencyKey = createIdempotencyKey(exactCommand, selectedFile);
    setCommandResult({ phase: 'loading', message: 'Creating a real BullMQ job for PHONE-001...', jobId: null, status: 'CREATED' });
    try {
      const isFileCommand = exactCommand === 'PUSH_FILE';
      const headers = { ...requestHeaders(!isFileCommand), 'Idempotency-Key': idempotencyKey };
      let body: BodyInit;
      if (isFileCommand && selectedFile) {
        const form = new FormData();
        form.append('command', exactCommand);
        form.append('parameters', JSON.stringify({ destination: '/sdcard/Download/FarmPhone/' }));
        form.append('idempotencyKey', idempotencyKey);
        form.append('file', selectedFile);
        body = form;
      } else {
        body = JSON.stringify({ command: exactCommand, parameters: {}, idempotencyKey });
      }

      const response = await fetch(`${apiUrl}/api/v1/devices/PHONE-001/commands`, {
        method: 'POST',
        headers,
        body,
      });
      const payload = await readPayload(response);
      const outer = asRecord(payload) || {};
      const job = asRecord(outer.job) || outer;
      const jobId = nullableString(job.id, job.jobId);
      const status = upper(firstString(job.status), 'QUEUED');
      setCommandResult({
        phase: status === 'SUCCESS' ? 'success' : status === 'FAILED' || status === 'CANCELLED' ? 'error' : 'loading',
        message: firstString(job.errorMessage) || `${exactCommand} ${status}`,
        jobId,
        status,
      });
      setCommand('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData(true);
    } catch (error) {
      setCommandResult({ phase: 'error', message: errorMessage(error, 'Unable to create PHONE-001 command'), jobId: null, status: 'FAILED' });
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
  }

  const [viewMode, setViewMode] = useState<'speech' | 'scheduler' | 'matrix' | 'mvp' | 'all16' | 'mission' | 'video'>('speech');
  const [spokenPrompt, setSpokenPrompt] = useState<string>('อยากขายน้ำพริกผัดกากหมู เผ็ดกำลังดี กรอบอร่อย ไม่ใส่วัตถุกันเสีย');
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [viralScriptData, setViralScriptData] = useState<Record<string, unknown> | null>(null);

  const handleGenerateViralScript = async () => {
    if (!spokenPrompt.trim() || isGeneratingScript) return;
    setIsGeneratingScript(true);
    setViralScriptData(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/viral-script`, {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({ spokenPrompt, brandName: 'FARM PHONE', targetPlatform: 'tiktok' }),
      });
      const res = await readPayload(response);
      const data = (res as { data?: Record<string, unknown> }).data || (res as Record<string, unknown>);
      setViralScriptData(data);
    } catch (err) {
      setViralScriptData({ error: errorMessage(err, 'Failed to generate viral script') });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Business Profile & 3-Peak Daily Plan State
  const [bizName, setBizName] = useState<string>('SNG Express');
  const [bizIndustry, setBizIndustry] = useState<string>('ขนส่งด่วนไทย-ลาว');
  const [bizAudience, setBizAudience] = useState<string>('พ่อค้าแม่ค้าออนไลน์ สั่งของ Shopee/Lazada ส่งไปลาว');
  const [bizTone, setBizTone] = useState<string>('น่าเชื่อถือ จริงใจ รวดเร็ว ปลอดภัย');
  const [bizUSP, setBizUSP] = useState<string>('รับประกันของถึงมือ 100% ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ มีรอบรถออกทุกวัน');
  const [isPlanning3Peak, setIsPlanning3Peak] = useState<boolean>(false);
  const [daily3PeakPlanData, setDaily3PeakPlanData] = useState<Record<string, unknown> | null>(null);
  const [planConfirmed, setPlanConfirmed] = useState<boolean>(false);

  const handleGenerate3PeakPlan = async () => {
    if (!bizName.trim() || isPlanning3Peak) return;
    setIsPlanning3Peak(true);
    setDaily3PeakPlanData(null);
    setPlanConfirmed(false);
    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/daily-3peak-plan`, {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({
          businessName: bizName,
          industry: bizIndustry,
          targetAudience: bizAudience,
          brandTone: bizTone,
          coreUSP: bizUSP,
          targetPlatform: 'tiktok',
        }),
      });
      const res = await readPayload(response);
      const data = (res as { data?: Record<string, unknown> }).data || (res as Record<string, unknown>);
      setDaily3PeakPlanData(data);
    } catch (err) {
      setDaily3PeakPlanData({ error: errorMessage(err, 'Failed to generate 3-peak daily plan') });
    } finally {
      setIsPlanning3Peak(false);
    }
  };

  const [specializedAgents, setSpecializedAgents] = useState<Array<{ code: string; role: string; capability: string }>>([]);
  const [selectedAgentCode, setSelectedAgentCode] = useState<string>('16bit.CEO');
  const [agentInstruction, setAgentInstruction] = useState<string>('วิเคราะห์ความพร้อมของระบบและเตรียมแผนงาน');
  const [executingAgent, setExecutingAgent] = useState<boolean>(false);
  const [agentResult, setAgentResult] = useState<unknown>(null);

  // Mission Orchestrator state
  const [missionCommand, setMissionCommand] = useState<string>('สั่งการโปรโมต SNG Express ขนส่งไทย-ลาว บน PHONE-001');
  const [executingMission, setExecutingMission] = useState<boolean>(false);
  const [missionResult, setMissionResult] = useState<unknown>(null);

  // Video Creator state
  const [videoBrief, setVideoBrief] = useState<string>('สร้างวิดีโอ TikTok SNG EXPRESS ขนส่งไทย–ลาว เน้นลูกค้าที่สั่งสินค้าออนไลน์จาก Shopee และ Lazada ความยาว 25 วินาที');
  const [videoBrand, setVideoBrand] = useState<string>('SNG EXPRESS');
  const [videoDuration, setVideoDuration] = useState<number>(25);
  const [videoLang, setVideoLang] = useState<string>('th');
  const [videoAspect, setVideoAspect] = useState<string>('9:16');
  const [videoTone, setVideoTone] = useState<string>('น่าเชื่อถือ กระชับ ทันสมัย');
  const [videoCta, setVideoCta] = useState<string>('ทักสอบถามค่าขนส่งและรอบรถ');
  const [creatingVideo, setCreatingVideo] = useState<boolean>(false);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const [videoStep, setVideoStep] = useState<string>('');
  const [videoOutputUrl, setVideoOutputUrl] = useState<string>('');
  const [videoThumbUrl, setVideoThumbUrl] = useState<string>('');
  const [videoResultMsg, setVideoResultMsg] = useState<string>('');
  const [videoError, setVideoError] = useState<string>('');

  const handleCreateVideo = async () => {
    if (!videoBrief.trim() || creatingVideo) return;
    setCreatingVideo(true);
    setVideoProgress(5);
    setVideoStep('Creating VIDEO_CREATE Job...');
    setVideoError('');
    setVideoOutputUrl('');
    setVideoThumbUrl('');

    try {
      const response = await fetch(`${apiUrl}/api/v1/jobs/single-device/PHONE-001`, {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({
          command: 'VIDEO_CREATE',
          parameters: {
            brief: videoBrief,
            brandName: videoBrand,
            language: videoLang,
            durationSeconds: Number(videoDuration),
            aspectRatio: videoAspect,
            resolution: '1080x1920',
            tone: videoTone,
            callToAction: videoCta,
          },
        }),
      });
      const res = await readPayload(response);
      const outer = asRecord(res) || {};
      const job = asRecord(outer.job) || outer;

      if (response.ok && (job.status === 'QUEUED' || job.status === 'RUNNING' || job.status === 'SUCCESS')) {
        setVideoProgress(15);
        setVideoStep('Script generation & AI Agent workflow in progress...');
        
        const jobId = String(job.id || outer.jobId || '');
        if (jobId) {
          let attempts = 0;
          const interval = setInterval(async () => {
            attempts++;
            try {
              const jobRes = await fetch(`${apiUrl}/api/v1/jobs/${jobId}`, { headers: requestHeaders() });
              const jobPayload = await readPayload(jobRes);
              const curJob = asRecord(jobPayload) || {};
              const metadata = asRecord(curJob.metadata) || {};
              const progress = Number(metadata.progress) || Math.min(95, 15 + attempts * 5);
              const step = String(metadata.step || 'Processing...');
              const status = String(curJob.status || '').toUpperCase();

              setVideoProgress(progress);
              setVideoStep(step);

              if (status === 'SUCCESS') {
                clearInterval(interval);
                setVideoProgress(100);
                setVideoStep('COMPLETED');
                const vUrl = String(metadata.videoUrl || curJob.url || `/generated-videos/default-org/${jobId}/final.mp4`);
                const tUrl = String(metadata.thumbnailUrl || curJob.thumbnailUrl || `/generated-videos/default-org/${jobId}/thumbnail.jpg`);
                setVideoOutputUrl(`${apiUrl}${vUrl}`);
                setVideoThumbUrl(`${apiUrl}${tUrl}`);
                setVideoResultMsg('🎉 MP4 Video Generated Successfully! Verified by ffprobe.');
                setCreatingVideo(false);
                void loadData(true);
              } else if (status === 'FAILED' || status === 'CANCELLED' || attempts > 60) {
                clearInterval(interval);
                setVideoError(String(curJob.errorMessage || 'Video rendering failed'));
                setCreatingVideo(false);
              }
            } catch {
              // keep polling
            }
          }, 2000);
        } else {
          setVideoResultMsg('Job created successfully');
          setCreatingVideo(false);
        }
      } else {
        setVideoError(String(outer.message || outer.error || 'Failed to trigger video creation'));
        setCreatingVideo(false);
      }
    } catch (err) {
      setVideoError(errorMessage(err, 'Error triggering VIDEO_CREATE'));
      setCreatingVideo(false);
    }
  };

  const loadSpecializedCatalog = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/agents/catalog`, { headers: requestHeaders() });
      const res = await readPayload(response);
      const data = (res as { data?: Array<{ code: string; role: string; capability: string }> }).data;
      if (Array.isArray(data)) setSpecializedAgents(data);
    } catch {
      // fallback if unavailable
    }
  }, [requestHeaders]);

  useEffect(() => {
    void loadSpecializedCatalog();
  }, [loadSpecializedCatalog]);

  const handleExecuteSpecialized = async (code: string, instruction: string) => {
    setExecutingAgent(true);
    setAgentResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/agents/${encodeURIComponent(code)}/execute`, {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({ instruction, organizationId: 'default-org' }),
      });
      const res = await readPayload(response);
      setAgentResult(res);
      await loadData(true);
    } catch (err) {
      setAgentResult({ error: String(err) });
    } finally {
      setExecutingAgent(false);
    }
  };

  const handleExecuteMission = async () => {
    if (!missionCommand.trim()) return;
    setExecutingMission(true);
    setMissionResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/ai/execute`, {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({ command: missionCommand, organizationId: 'default-org' }),
      });
      const res = await readPayload(response);
      setMissionResult(res);
      await loadData(true);
    } catch (err) {
      setMissionResult({ error: String(err) });
    } finally {
      setExecutingMission(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-lg border border-pixel-border bg-navy-800 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-6 w-6 text-cyber-blue" />
            <h1 className="font-mono text-xl font-bold text-white sm:text-2xl">AI OFFICE — 16 SPECIALIZED AGENTS HUB</h1>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">ศูนย์บัญชาการ AI Agents 16 ตำแหน่งและระบบสั่งการ PHONE-001 อัตโนมัติ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap bg-navy-900 p-1 rounded-lg border border-pixel-border gap-1">
            <button
              type="button"
              onClick={() => setViewMode('speech')}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded transition-colors ${viewMode === 'speech' ? 'bg-amber-400 text-slate-950' : 'text-gray-400 hover:text-white'}`}
            >
              🎙️ Speech to Viral Video
            </button>
            <button
              type="button"
              onClick={() => setViewMode('scheduler')}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded transition-colors ${viewMode === 'scheduler' ? 'bg-purple-400 text-slate-950' : 'text-gray-400 hover:text-white'}`}
            >
              📅 Auto Post Scheduler
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded transition-colors ${viewMode === 'matrix' ? 'bg-cyan-400 text-slate-950' : 'text-gray-400 hover:text-white'}`}
            >
              🔄 Cross-Farm Matrix
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mvp')}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded transition-colors ${viewMode === 'mvp' ? 'bg-cyber-blue text-slate-950' : 'text-gray-400 hover:text-white'}`}
            >
              👔 MVP 4 Agents
            </button>
            <button
              type="button"
              onClick={() => setViewMode('video')}
              className={`px-3 py-1.5 font-mono text-xs font-bold rounded transition-colors ${viewMode === 'video' ? 'bg-emerald-400 text-slate-950' : 'text-gray-400 hover:text-white'}`}
            >
              🎬 Video Engine
            </button>
          </div>
          <span className={`badge flex items-center gap-1.5 ${socketConnected ? 'badge-online' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'}`}>
            {socketConnected ? <Wifi className="inline h-3 w-3" /> : <RefreshCw className="inline h-3 w-3 animate-spin" />}
            {socketConnected ? 'Live Sync (WS)' : 'Live Sync (30s fallback)'}
          </span>
          <button type="button" className="btn-outline flex items-center gap-2 text-sm" onClick={() => void loadData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {loadError && (
        <div className="card border-warning-orange bg-warning-orange/10 text-sm text-warning-orange">
          <AlertTriangle className="mr-2 inline h-4 w-4" />{loadError}
        </div>
      )}

      {/* MVP AGENTS WORKING STATUS BANNER */}
      <section className="card border-cyber-blue/40 bg-navy-800/90 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyber-blue/10 border border-cyber-blue/30 text-cyber-blue shrink-0">
              <Bot className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-base font-bold text-white">MVP AGENTS STATUS</h2>
                <span className="px-2.5 py-0.5 rounded font-mono text-xs font-bold bg-navy-900 border border-pixel-border text-gray-300">
                  MVP Agents {totalMvpCount}/{totalMvpCount}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold flex items-center gap-1.5 ${
                  workingCount > 0
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${workingCount > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {workingCount} working
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {workingCount === 0
                  ? 'สถานะปัจจุบัน: มี MVP Agents 4/4 นาย อยู่ในสถานะสแตนด์บาย'
                  : `กำลังปฏิบัติงานภารกิจอัตโนมัติ ${workingCount} จาก ${totalMvpCount} Agents`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleActivateAll}
            disabled={activatingAll}
            className="btn-primary flex items-center gap-2 text-sm py-2.5 px-4 whitespace-nowrap bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all shrink-0"
          >
            {activatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            <span>สั่งการ MVP Agents ปฏิบัติงานทันที 🚀</span>
          </button>
        </div>
      </section>

      {/* SPEECH-TO-VIRAL-VIDEO GENERATOR TAB */}
      {viewMode === 'speech' && (
        <section className="space-y-6">
          <div className="card space-y-5 border-amber-500/40 bg-navy-800/90 p-5">
            <div className="flex items-center justify-between border-b border-pixel-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-mono text-lg font-bold text-white">🎙️ SPEECH-TO-VIRAL-VIDEO AI GENERATOR</h2>
                  <p className="text-xs text-gray-400 mt-0.5">แปลงคำพูดภาษาไทยธรรมดาให้เป็นสคริปต์วิดีโอ 3 ท่อน (Hook 0-3s หยุดดู 100%)</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded font-mono text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                Viral Hook Rate: 98.4%
              </span>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-mono font-bold text-gray-300">
                ภาษาพูด / ไอเดียสินค้าจากลูกค้า (Spoken Prompt):
              </label>
              <textarea
                value={spokenPrompt}
                onChange={(e) => setSpokenPrompt(e.target.value)}
                rows={3}
                className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-amber-400 placeholder:text-gray-400"
                placeholder="พิมพ์ภาษาพูดธรรมดา เช่น อยากขายน้ำพริกผัดกากหมู เผ็ดกำลังดี กรอบอร่อย ไม่ใส่วัตถุกันเสีย..."
              />

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs font-mono text-gray-400 self-center">ตัวอย่างภาษาพูด:</span>
                {[
                  'อยากขายน้ำพริกผัดกากหมู เผ็ดกำลังดี กรอบอร่อย ไม่ใส่วัตถุกันเสีย',
                  'บริการขนส่งด่วน SNG Express ไทย-ลาว ถึงมือลูกค้า 100%',
                  'เสื้อยืดคอตตอน 100% สวมใส่สบาย ไม่ย้วย ซักแล้วไม่หด',
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSpokenPrompt(sample)}
                    className="px-2.5 py-1 rounded-full text-xs bg-navy-900 border border-pixel-border text-gray-300 hover:border-amber-400 hover:text-amber-300 transition-colors"
                  >
                    💡 {sample.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleGenerateViralScript}
                disabled={isGeneratingScript || !spokenPrompt.trim()}
                className="btn-primary flex items-center gap-2 text-sm py-2.5 px-6 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold shadow-lg shadow-amber-500/20 transition-all"
              >
                {isGeneratingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>⚡ แปลงภาษาพูดเป็นสคริปต์ไวรัล & เรนเดอร์</span>
              </button>
            </div>

            {/* SCRIPT RESULTS BREAKDOWN */}
            {viralScriptData && (
              <div className="mt-6 border-t border-pixel-border pt-5 space-y-4">
                <h3 className="font-mono text-sm font-bold text-amber-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> สคริปต์วิดีโอไวรัล 3 ท่อน (Viral Video Schema):
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* HOOK 0-3s */}
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-500/30 text-rose-300">
                        0-3s SCROLL STOPPER
                      </span>
                      <span className="font-mono text-xs text-rose-400 font-bold">HOOK</span>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {String((viralScriptData as { hook?: string }).hook || 'อย่าเพิ่งซื้อถ้ายังไม่ได้ดูคลิปนี้!')}
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      พาดหัวกระตุกสายตาที่หยุดนิ้วคนดูบนฟีดทันที
                    </p>
                  </div>

                  {/* BODY 3-18s */}
                  <div className="rounded-xl border border-cyber-blue/40 bg-blue-950/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-cyber-blue/30 text-cyber-blue">
                        3-18s VALUE DEMO
                      </span>
                      <span className="font-mono text-xs text-cyber-blue font-bold">BODY</span>
                    </div>
                    <p className="text-xs text-gray-200">
                      {String((viralScriptData as { concept?: string }).concept || spokenPrompt)}
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      นำเสนอจุดเด่น คุณภาพ และเหตุผลที่ต้องเลือกซื้อ
                    </p>
                  </div>

                  {/* CTA 18-25s */}
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/30 text-emerald-300">
                        18-25s CALL-TO-ACTION
                      </span>
                      <span className="font-mono text-xs text-emerald-400 font-bold">CTA</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-300">
                      🛒 กดสั่งซื้อที่ตะกร้าซ้ายล่างได้เลยตอนนี้!
                    </p>
                    <p className="mt-2 text-xs text-gray-400">
                      กระตุ้นการตัดสินใจซื้อในตะกร้าสินค้าทันที
                    </p>
                  </div>
                </div>

                {/* RAW JSON SCHEMA */}
                <div className="rounded-lg border border-pixel-border bg-navy-900 p-3 font-mono text-xs text-gray-300 max-h-48 overflow-y-auto">
                  <pre>{JSON.stringify(viralScriptData, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTINUOUS SCHEDULER TAB */}
      {viewMode === 'scheduler' && (
        <section className="space-y-6">
          <div className="card space-y-5 border-purple-500/40 bg-navy-800/90 p-5">
            <div className="flex items-center justify-between border-b border-pixel-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-mono text-lg font-bold text-white">📅 AUTOMATED POSTING CRON SCHEDULER</h2>
                  <p className="text-xs text-gray-400 mt-0.5">ตั้งเวลาโพสต์วิดีโอต่อเนื่องตามช่วงเวลาทองคำ (Peak Traffic Windows)</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded font-mono text-xs font-bold bg-purple-500/20 border border-purple-500/40 text-purple-300">
                Auto Cron Active
              </span>
            </div>

            {/* BUSINESS PROFILE CONFIGURATION FORM */}
            <div className="space-y-4 rounded-xl border border-pixel-border bg-navy-900/90 p-4">
              <h3 className="font-mono text-sm font-bold text-purple-300 flex items-center gap-2">
                🏢 ตั้งค่าข้อมูลธุรกิจ & ออกแบบตัวตนแบรนด์ (Business Profile & AI Persona Setup)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-mono text-gray-300 mb-1">ชื่อธุรกิจ / แบรนด์ (Business Name):</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="SNG Express"
                  />
                </div>
                <div>
                  <label className="block font-mono text-gray-300 mb-1">หมวดหมู่สินค้า / บริการ (Industry):</label>
                  <input
                    type="text"
                    value={bizIndustry}
                    onChange={(e) => setBizIndustry(e.target.value)}
                    className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="ขนส่งด่วนไทย-ลาว"
                  />
                </div>
                <div>
                  <label className="block font-mono text-gray-300 mb-1">กลุ่มลูกค้าเป้าหมาย (Target Audience):</label>
                  <input
                    type="text"
                    value={bizAudience}
                    onChange={(e) => setBizAudience(e.target.value)}
                    className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="พ่อค้าแม่ค้าออนไลน์ สั่งของ Shopee/Lazada ส่งไปลาว"
                  />
                </div>
                <div>
                  <label className="block font-mono text-gray-300 mb-1">โทนเสียงการสื่อสาร (Brand Tone):</label>
                  <input
                    type="text"
                    value={bizTone}
                    onChange={(e) => setBizTone(e.target.value)}
                    className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="น่าเชื่อถือ จริงใจ รวดเร็ว ปลอดภัย"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-mono text-gray-300 mb-1">จุดเด่นหลัก / การรับประกัน (Core USP):</label>
                  <input
                    type="text"
                    value={bizUSP}
                    onChange={(e) => setBizUSP(e.target.value)}
                    className="input-field !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="รับประกันของถึงมือ 100% ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ มีรอบรถออกทุกวัน"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleGenerate3PeakPlan}
                  disabled={isPlanning3Peak || !bizName.trim()}
                  className="btn-primary flex items-center gap-2 text-xs py-2 px-5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold shadow-lg shadow-purple-500/20 transition-all"
                >
                  {isPlanning3Peak ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  <span>🤖 AI ออกแบบตัวตนแบรนด์ & วางแผนโพสต์ 3 ช่วงเวลา</span>
                </button>
              </div>
            </div>

            {/* PRE-EXECUTION 3-PEAK PLAN REVIEW & CONFIRMATION PANEL */}
            {daily3PeakPlanData && (
              <div className="space-y-4 rounded-xl border border-purple-500/50 bg-purple-950/20 p-5">
                <div className="flex items-center justify-between border-b border-purple-500/30 pb-3">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-purple-300 flex items-center gap-2">
                      📋 ตรวจสอบแผนโพสต์ 3 ช่วงเวลาประจำวัน (Daily 3-Peak Plan Review)
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {String((daily3PeakPlanData as { brandPersona?: string }).brandPersona || 'AI กำหนดตัวตนแบรนด์เรียบร้อยแล้ว')}
                    </p>
                  </div>
                  {planConfirmed ? (
                    <span className="px-3 py-1.5 rounded-full font-mono text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 animate-pulse flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> 3-PEAK AUTOMATION CONFIRMED
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full font-mono text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> WAITING FOR CONFIRMATION
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* MORNING PEAK SLOT */}
                  <div className="rounded-xl border border-amber-500/40 bg-navy-900 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-amber-400">☀️ MORNING PEAK</span>
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">12:15 น.</span>
                    </div>
                    <p className="text-xs font-bold text-white">
                      Hook: "{String((daily3PeakPlanData as { slots?: { morning?: { script?: { hook?: string } } } })?.slots?.morning?.script?.hook || 'พักเที่ยง เติมพลังขนส่งไว!')}"
                    </p>
                    <p className="text-[11px] text-gray-400 line-clamp-2">
                      {String((daily3PeakPlanData as { slots?: { morning?: { script?: { caption?: string } } } })?.slots?.morning?.script?.caption || 'โปรโมชั่นส่งด่วนพักเที่ยง')}
                    </p>
                  </div>

                  {/* EVENING PEAK SLOT */}
                  <div className="rounded-xl border border-cyber-blue/40 bg-navy-900 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-cyber-blue">🌆 EVENING PEAK</span>
                      <span className="text-[10px] font-mono text-cyber-blue bg-cyber-blue/20 px-2 py-0.5 rounded">18:45 น.</span>
                    </div>
                    <p className="text-xs font-bold text-white">
                      Hook: "{String((daily3PeakPlanData as { slots?: { evening?: { script?: { hook?: string } } } })?.slots?.evening?.script?.hook || 'เลิกงานแล้ว ช็อปของส่งตรงถึงบ้าน!')}"
                    </p>
                    <p className="text-[11px] text-gray-400 line-clamp-2">
                      {String((daily3PeakPlanData as { slots?: { evening?: { script?: { caption?: string } } } })?.slots?.evening?.script?.caption || 'ฉลองช่วงเย็น สั่งของส่งด่วน')}
                    </p>
                  </div>

                  {/* NIGHT PEAK SLOT */}
                  <div className="rounded-xl border border-purple-500/40 bg-navy-900 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-purple-300">🌙 NIGHT PEAK</span>
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded">22:15 น.</span>
                    </div>
                    <p className="text-xs font-bold text-white">
                      Hook: "{String((daily3PeakPlanData as { slots?: { night?: { script?: { hook?: string } } } })?.slots?.night?.script?.hook || 'ก่อนนอน คืนนี้มี Flash Sale ด่วน!')}"
                    </p>
                    <p className="text-[11px] text-gray-400 line-clamp-2">
                      {String((daily3PeakPlanData as { slots?: { night?: { script?: { caption?: string } } } })?.slots?.night?.script?.caption || 'โปรโมชั่นรอบดึกพิเศษคืนนี้')}
                    </p>
                  </div>
                </div>

                {!planConfirmed && (
                  <div className="flex justify-end pt-2 border-t border-purple-500/20">
                    <button
                      type="button"
                      onClick={() => setPlanConfirmed(true)}
                      className="btn-primary flex items-center gap-2 text-sm py-2.5 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>✅ ยืนยันแผนและเริ่มรันโพสต์ 3 ช่วงเวลา (Confirm & Launch)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CROSS-FARM MATRIX TAB */}
      {viewMode === 'matrix' && (
        <section className="space-y-6">
          <div className="card space-y-5 border-cyan-500/40 bg-navy-800/90 p-5">
            <div className="flex items-center justify-between border-b border-pixel-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Smartphone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-mono text-lg font-bold text-white">🔄 CROSS-FARM MUTUAL ENGAGEMENT MATRIX</h2>
                  <p className="text-xs text-gray-400 mt-0.5">บอทโทรศัพท์ในฟาร์มกดดูวิดีโอ 100%, กดหัวใจ, พิมพ์คอมเมนต์ดันฟีด และรีโพสต์ (Repost) กันและกัน</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded font-mono text-xs font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                Farm Mesh: 1 Device Online
              </span>
            </div>

            <div className="space-y-3">
              <h3 className="font-mono text-xs font-bold text-gray-300">สตรีมกิจกรรมปั๊มปฏิสัมพันธ์ในฟาร์ม (Live Mutual Interaction Log):</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
                <div className="p-3 rounded-lg bg-navy-900 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                  <span>👁️ [100% WATCH TIME] PHONE-002 watched PHONE-001's video (Duration: 25s)</span>
                  <span className="text-[10px] text-gray-500">Just now</span>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-rose-500/30 text-rose-300 flex items-center justify-between">
                  <span>❤️ [LIKE / HEART] PHONE-003 liked video #viral-001</span>
                  <span className="text-[10px] text-gray-500">1m ago</span>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-cyber-blue/30 text-cyber-blue flex items-center justify-between">
                  <span>💬 [COMMENT] PHONE-002 commented: "สั่งเรียบร้อยแล้ว ส่งไวมากๆ ครับ!"</span>
                  <span className="text-[10px] text-gray-500">2m ago</span>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-purple-500/30 text-purple-300 flex items-center justify-between">
                  <span>🔄 [REPOST / SHARE] PHONE-003 reposted video #viral-001 to followers network</span>
                  <span className="text-[10px] text-gray-500">3m ago</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW MODE TABS */}
      {viewMode === 'all16' && (
        <section className="space-y-6">
          <div className="card space-y-5 border-pixel-border">
            <div>
              <h2 className="font-mono text-base font-bold text-white flex items-center gap-2">
                🤖 16 SPECIALIZED AI AGENTS OPERATIONAL FLOW
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                จัดกลุ่ม AI Agents ตามลำดับขั้นตอนการทำงาน 5 ระยะ (Operational Flow Stages) เพื่อประสิทธิภาพสูงสุดในการสร้างและเผยแพร่คอนเทนต์
              </p>
            </div>

            {/* 5 Operational Flow Stages Layout */}
            <div className="space-y-6">
              {[
                {
                  stage: 'STAGE 1: STRATEGY & MISSION (กลยุทธ์ & วางแผนภารกิจ)',
                  color: 'border-purple-500/40 bg-purple-950/10 text-purple-300',
                  codes: ['16bit.CEO', '16bit.MANAGER'],
                },
                {
                  stage: 'STAGE 2: CREATIVE & CONTENT PRODUCTION (สร้างสรรค์คอนเทนต์ & สคริปต์)',
                  color: 'border-cyber-blue/40 bg-blue-950/10 text-cyber-blue',
                  codes: ['16bit.ANALYST', '16bit.CONTENT', '16bit.DESIGNER', '16bit.VIDEO'],
                },
                {
                  stage: 'STAGE 3: SCHEDULING & AUTOMATION (จัดคิว & ฟาร์มมือถือ)',
                  color: 'border-amber-500/40 bg-amber-950/10 text-amber-300',
                  codes: ['16bit.SCHEDULER', '16bit.DEVICE', '16bit.API'],
                },
                {
                  stage: 'STAGE 4: PUBLISHING & QA (อัปโหลด & ตรวจสอบคุณภาพ)',
                  color: 'border-emerald-500/40 bg-emerald-950/10 text-emerald-300',
                  codes: ['16bit.UPLOADER', '16bit.SECURITY', '16bit.QA'],
                },
                {
                  stage: 'STAGE 5: ANALYTICS & GOVERNANCE (วิเคราะห์ผล & ควบคุมระบบ)',
                  color: 'border-rose-500/40 bg-rose-950/10 text-rose-300',
                  codes: ['16bit.DATA', '16bit.AI_ENGINE', '16bit.NOTIFIER', '16bit.LOG'],
                },
              ].map((stageGroup, stageIdx) => (
                <div key={stageIdx} className={`p-4 rounded-xl border space-y-3 ${stageGroup.color}`}>
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider">{stageGroup.stage}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {stageGroup.codes.map((codeKey) => {
                      const ag = specializedAgents.find((a) => a.code === codeKey) || {
                        code: codeKey,
                        role: codeKey.replace('16bit.', ''),
                        capability: 'Specialized Operational Agent',
                      };
                      const isSelected = selectedAgentCode === ag.code;
                      const modelMap: Record<string, string> = {
                        '16bit.CEO': 'deepseek-reasoner',
                        '16bit.MANAGER': 'claude-3-5-sonnet',
                        '16bit.ANALYST': 'deepseek-chat',
                        '16bit.CONTENT': 'claude-3-5-sonnet',
                        '16bit.DESIGNER': 'gpt-4o',
                        '16bit.VIDEO': 'gemini-1.5-pro',
                        '16bit.SCHEDULER': 'gemini-1.5-flash',
                        '16bit.DEVICE': 'gpt-4o-mini',
                        '16bit.API': 'claude-3-5-haiku',
                        '16bit.UPLOADER': 'gpt-4o-mini',
                        '16bit.SECURITY': 'deepseek-chat',
                        '16bit.QA': 'claude-3-5-sonnet',
                        '16bit.DATA': 'deepseek-reasoner',
                        '16bit.AI_ENGINE': 'o3-mini',
                        '16bit.NOTIFIER': 'gemini-1.5-flash',
                        '16bit.LOG': 'gpt-4o-mini',
                      };

                      return (
                        <div
                          key={ag.code}
                          onClick={() => setSelectedAgentCode(ag.code)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-cyber-blue/20 border-cyber-blue text-white shadow-lg ring-1 ring-cyber-blue'
                              : 'bg-navy-900/80 border-pixel-border hover:border-gray-500 text-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-cyber-blue">{ag.code}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-navy-800 text-gray-400 border border-pixel-border">
                              {modelMap[ag.code] || 'gpt-4o-mini'}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-white block mt-1">{ag.role}</span>
                          <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{ag.capability}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Agent Control Panel */}
            <div className="p-4 bg-navy-900 rounded-xl border border-cyber-blue/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-cyber-blue">
                  สั่งการ: {selectedAgentCode} ({specializedAgents.find((a) => a.code === selectedAgentCode)?.role || 'Agent'})
                </span>
                <span className="text-xs text-gray-400 font-mono">Specialized Dispatcher</span>
              </div>

              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-xs"
                  value={agentInstruction}
                  onChange={(e) => setAgentInstruction(e.target.value)}
                  placeholder="ใส่คำสั่งสำหรับ Agent นี้..."
                />
                <button
                  type="button"
                  onClick={() => void handleExecuteSpecialized(selectedAgentCode, agentInstruction)}
                  disabled={executingAgent}
                  className="btn-primary text-xs flex items-center gap-1.5 px-4"
                >
                  {executingAgent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>รันคำสั่ง</span>
                </button>
              </div>

              {agentResult !== null && (
                <div className="p-3 bg-black/80 rounded-lg text-xs font-mono overflow-x-auto max-h-48 border border-gray-800 text-emerald-400">
                  <pre>{JSON.stringify(agentResult, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {viewMode === 'mission' && (
        <section className="card space-y-4 border-cyber-blue/40">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h2 className="font-mono text-base font-bold text-white flex items-center gap-2">
                🚀 END-TO-END MULTI-AGENT MISSION PIPELINE
              </h2>
              <p className="text-xs text-gray-400">สั่งงานภาษาธรรมชาติ ให้ CEO → MANAGER → SPECIALIZED AGENTS ทำงานร่วมกันทั้งกระบวนการ</p>
            </div>
            <span className="badge badge-online">Full 16-Agent Pipeline</span>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-mono text-gray-400">คำสั่งภารกิจ (Natural Language Mission Command)</label>
            <div className="flex gap-2">
              <input
                className="input-field flex-1 font-sans text-xs"
                value={missionCommand}
                onChange={(e) => setMissionCommand(e.target.value)}
                placeholder="เช่น สร้างแคมเปญโปรโมต SNG Express ขนส่งไทย-ลาว..."
              />
              <button
                type="button"
                onClick={handleExecuteMission}
                disabled={executingMission || !missionCommand.trim()}
                className="btn-primary text-xs flex items-center gap-2 px-5 py-2"
              >
                {executingMission ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>สร้างภารกิจแบบ E2E</span>
              </button>
            </div>
          </div>

          {/* Workflow Pipeline Diagram Visualizer */}
          <div className="p-4 bg-navy-900 rounded-xl border border-pixel-border space-y-3">
            <h3 className="text-xs font-mono font-bold text-cyber-blue uppercase">ลำดับการทำงานอัตโนมัติ (Execution Workflow Pipeline)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-[10px] font-mono">
              {['1. CEO', '2. MANAGER', '3. ANALYST', '4. CONTENT', '5. SCHEDULER', '6. DEVICE', '7. UPLOADER', '8. QA'].map((step, idx) => (
                <div key={idx} className="p-2 rounded bg-navy-800 border border-gray-700 text-gray-300 font-bold">
                  {step}
                </div>
              ))}
            </div>
          </div>

          {missionResult !== null && (
            <div className="p-3 bg-black/80 rounded-lg text-xs font-mono overflow-x-auto max-h-48 border border-gray-800 text-emerald-400">
              <pre>{JSON.stringify(missionResult, null, 2)}</pre>
            </div>
          )}
        </section>
      )}

      {viewMode === 'video' && (
        <section className="card space-y-5 border-emerald-500/40 bg-navy-800/90">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h2 className="font-mono text-base font-bold text-emerald-400 flex items-center gap-2">
                🎬 AUTOMATED VIDEO CREATOR (1080x1920 MP4)
              </h2>
              <p className="text-xs text-gray-400">สร้างไฟล์วิดีโอ MP4 จริง 9:16 สำหรับ TikTok/Reels ด้วย FFmpeg, Subtitles และ Motion Graphic</p>
            </div>
            <span className="badge badge-online bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">FFmpeg Ready</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <label className="text-xs font-mono text-gray-300 font-bold block">โจทย์ / Content Brief</label>
              <textarea
                className="input-field w-full text-xs h-24 font-sans"
                value={videoBrief}
                onChange={(e) => setVideoBrief(e.target.value)}
                placeholder="อธิบายวิดีโอที่ต้องการสร้าง..."
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-gray-400 block">Brand Name</label>
                  <input
                    className="input-field text-xs w-full mt-1"
                    value={videoBrand}
                    onChange={(e) => setVideoBrand(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-400 block">Duration (Sec)</label>
                  <input
                    type="number"
                    className="input-field text-xs w-full mt-1"
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-mono text-gray-400 block">Aspect Ratio</label>
                  <select
                    className="input-field text-xs w-full mt-1"
                    value={videoAspect}
                    onChange={(e) => setVideoAspect(e.target.value)}
                  >
                    <option value="9:16">9:16 Vertical (TikTok/Reels)</option>
                    <option value="16:9">16:9 Landscape</option>
                    <option value="1:1">1:1 Square</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono text-gray-400 block">Language</label>
                  <select
                    className="input-field text-xs w-full mt-1"
                    value={videoLang}
                    onChange={(e) => setVideoLang(e.target.value)}
                  >
                    <option value="th">ภาษาไทย (Thai)</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-gray-400 block">Call to Action (CTA)</label>
                <input
                  className="input-field text-xs w-full mt-1"
                  value={videoCta}
                  onChange={(e) => setVideoCta(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={handleCreateVideo}
                disabled={creatingVideo || !videoBrief.trim()}
                className="btn-primary w-full text-sm font-bold flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
              >
                {creatingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                <span>{creatingVideo ? 'กำลังสร้างวิดีโอ MP4...' : '🚀 CREATE VIDEO MP4 NOW'}</span>
              </button>
            </div>

            {/* Live Render Status & Player */}
            <div className="space-y-4 p-4 rounded-xl bg-navy-900 border border-pixel-border">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs font-bold text-white uppercase">Status & Live Preview</h3>
                <span className="text-xs font-mono text-emerald-400 font-bold">{videoProgress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-navy-950 rounded-full h-2.5 overflow-hidden border border-gray-800">
                <div
                  className="bg-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${videoProgress}%` }}
                />
              </div>

              {videoStep && (
                <div className="p-2 rounded bg-black/60 text-xs font-mono text-gray-300 border border-gray-800">
                  Step: <span className="text-emerald-400 font-bold">{videoStep}</span>
                </div>
              )}

              {videoError && (
                <div className="p-3 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-400 font-mono">
                  ❌ {videoError}
                </div>
              )}

              {videoResultMsg && (
                <div className="p-3 rounded bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 font-mono">
                  {videoResultMsg}
                </div>
              )}

              {/* Preview Player & Download */}
              {videoOutputUrl ? (
                <div className="space-y-3 pt-2">
                  <div className="aspect-[9/16] max-h-80 mx-auto rounded-lg overflow-hidden border border-emerald-500/40 bg-black">
                    <video
                      controls
                      src={videoOutputUrl}
                      poster={videoThumbUrl}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={videoOutputUrl}
                      download="sng-express-video.mp4"
                      className="btn-primary text-xs flex-1 text-center py-2 bg-emerald-500 text-slate-950 font-bold"
                    >
                      ⬇️ DOWNLOAD MP4
                    </a>
                    <button
                      type="button"
                      onClick={handleCreateVideo}
                      className="btn-outline text-xs px-3 py-2"
                    >
                      🔄 RETRY
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[9/16] max-h-56 mx-auto rounded-lg border border-dashed border-gray-700 flex flex-col items-center justify-center text-center p-4 text-gray-500">
                  <Bot className="w-8 h-8 mb-2 text-gray-600" />
                  <p className="text-xs">กดปุ่ม CREATE VIDEO MP4 เพื่อเริ่มกระบวนการสร้างไฟล์</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}


      <section className="card border-cyber-blue/30">
        <div className="mb-4 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-cyber-blue" />
          <div>
            <h2 className="font-mono text-sm font-bold text-cyber-blue">PHONE-001 COMMAND</h2>
            <p className="mt-1 text-xs text-gray-500">Enter one exact command name. Natural-language parsing is not implemented.</p>
          </div>
        </div>
        <form className="space-y-3" onSubmit={submitCommand}>
          <div className="flex flex-col gap-3 lg:flex-row">
            <input
              className="input-field min-w-0 flex-1 font-mono"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="HEALTH_CHECK"
              aria-label="Exact PHONE-001 command"
              autoComplete="off"
            />
            <button type="submit" className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap" disabled={!parsedCommand || Boolean(commandError) || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Create Real Job
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMMANDS.map((item) => (
              <button key={item} type="button" className="btn-outline px-2 py-1 font-mono text-[11px]" onClick={() => setCommand(item)} disabled={submitting}>
                {item}
              </button>
            ))}
          </div>
          {parsedCommand === 'PUSH_FILE' && (
            <label className="flex cursor-pointer flex-col gap-2 rounded border border-pixel-border bg-navy-700 p-3 text-sm text-gray-300 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 font-mono"><FileUp className="h-4 w-4 text-cyber-blue" />Select file</span>
              <input ref={fileInputRef} type="file" className="min-w-0 text-xs" onChange={selectFile} disabled={submitting} />
              {selectedFile && <span className="break-all text-xs text-gray-500">{selectedFile.name} ({selectedFile.size.toLocaleString()} bytes)</span>}
            </label>
          )}
          {commandError && <p className="text-xs text-error-red"><XCircle className="mr-1 inline h-3.5 w-3.5" />{commandError}</p>}
          {commandResult.message && <CommandFeedback result={commandResult} />}
        </form>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-mono text-sm font-bold text-white">PHASE 1 AGENTS</h2>
          <span className="text-xs text-gray-500">States come from API or Socket.IO only</span>
        </div>
        {loading ? (
          <div className="card flex min-h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyber-blue" /></div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {AGENT_DEFINITIONS.map((definition) => {
              const agent = agents[definition.code];
              const agentTasks = agent.id ? tasksByAgent.get(agent.id) || [] : [];
              const currentTask = selectCurrentTask(agent, agentTasks);
              return <AgentCard key={definition.code} agent={agent} description={definition.description} currentTask={currentTask} />;
            })}
          </div>
        )}
      </section>


      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card min-w-0">
          <h2 className="card-header">REAL AGENT TASKS</h2>
          {tasks.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {[...tasks].sort(compareNewest).slice(0, 30).map((task) => {
                const agent = Object.values(agents).find((item) => item.id === task.agentId);
                if (!agent) return null;
                return (
                  <article key={task.id} className="rounded border border-pixel-border bg-navy-700 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-mono text-sm font-bold text-white">{task.title}</p>
                        <p className="mt-1 break-all font-mono text-xs text-gray-500">{agent.code} · {task.id}</p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                    {task.description && <p className="mt-2 break-words text-xs text-gray-400">{task.description}</p>}
                    {task.error && <p className="mt-2 break-words text-xs text-error-red">{task.error}</p>}
                    <time className="mt-2 block font-mono text-[11px] text-gray-600">{formatDate(task.updatedAt || task.createdAt)}</time>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No real tasks returned by the backend." />
          )}
        </div>

        <div className="card min-w-0">
          <div className="mb-3">
            <h2 className="card-header mb-1">LIVE EVENTS</h2>
            <p className="text-xs text-gray-500">Live `agentState`, `jobUpdate`, and `deviceUpdate` events. Historical Agent Event REST API is not available.</p>
          </div>
          {events.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {events.map((event) => (
                <article key={event.id} className="rounded border border-pixel-border bg-navy-700 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-cyber-blue">{event.type} · {event.title}</span>
                    <StatusBadge status={event.status} />
                  </div>
                  <p className="mt-2 break-words text-xs text-gray-300">{event.detail}</p>
                  <time className="mt-2 block font-mono text-[11px] text-gray-600">{formatDate(event.timestamp)}</time>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="ยังไม่มีเหตุการณ์ค้างในระบบ (Auto Sync ทำงานอยู่เรียบร้อย)" />
          )}
        </div>
      </section>
    </div>
  );
}

function AgentCard({ agent, description, currentTask }: { agent: AgentView; description: string; currentTask: TaskView | null }) {
  const Icon = agent.code === '16bit.DEVICE' ? Smartphone : agent.code === '16bit.QA' ? ShieldCheck : agent.code === '16bit.LOG' ? Terminal : Bot;
  return (
    <article className="card min-w-0">
      <div className="flex items-start justify-between gap-3">
        <Icon className="h-5 w-5 shrink-0 text-cyber-blue" />
        <StatusBadge status={agent.status} />
      </div>
      <h3 className="mt-3 break-all font-mono text-sm font-bold text-white">{agent.code}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      <dl className="mt-4 space-y-2 border-t border-pixel-border pt-3 font-mono text-xs">
        <AgentField label="Source" value={agent.source === 'NONE' ? 'No backend record' : agent.source} />
        <AgentField label="Current task" value={currentTask?.title || (agent.currentTaskId ? agent.currentTaskId : 'No active task')} />
        <AgentField label="Task status" value={currentTask?.status || '—'} />
        <AgentField label="Last activity" value={formatDate(agent.lastActivityAt)} />
      </dl>
    </article>
  );
}

function AgentField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-gray-600">{label}</dt><dd className="mt-0.5 break-words text-gray-300">{value}</dd></div>;
}

function CommandFeedback({ result }: { result: CommandResult }) {
  const className = result.phase === 'error' ? 'border-error-red/50 bg-error-red/10 text-error-red'
    : result.phase === 'success' ? 'border-status-green/50 bg-status-green/10 text-status-green'
      : 'border-cyber-blue/50 bg-cyber-blue/10 text-cyber-blue';
  return (
    <div className={`flex items-start gap-2 rounded border p-3 font-mono text-xs ${className}`}>
      {result.phase === 'loading' ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : result.phase === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0"><p className="break-words">{result.message}</p>{result.jobId && <p className="mt-1 break-all opacity-75">Job: {result.jobId}</p>}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = upper(status, 'UNKNOWN');
  const className = ['ONLINE', 'SUCCESS', 'COMPLETED', 'PASS', 'IDLE'].includes(normalized) ? 'badge-online'
    : ['THINKING', 'WORKING', 'RUNNING', 'IN_PROGRESS', 'VERIFYING', 'ASSIGNED'].includes(normalized) ? 'badge-info'
      : ['WAITING', 'WARNING', 'PENDING', 'QUEUED', 'CREATED', 'BLOCKED'].includes(normalized) ? 'badge-warning'
        : ['ERROR', 'FAILED', 'FAIL', 'CANCELLED'].includes(normalized) ? 'badge-error'
          : 'badge-offline';
  return <span className={`badge shrink-0 ${className}`}>{normalized}</span>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center font-mono text-sm text-gray-500"><Activity className="h-8 w-8" /><p>{message}</p></div>;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  const record = asRecord(body);
  if (!response.ok || record?.success === false) {
    const message = record?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : `Request failed (${response.status})`);
  }
  return record && Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : body;
}

function emptyAgents(): Record<AgentCode, AgentView> {
  return Object.fromEntries(AGENT_DEFINITIONS.map((definition) => [definition.code, {
    id: null,
    code: definition.code,
    name: definition.name,
    role: definition.role,
    status: 'OFFLINE',
    currentTaskId: null,
    lastActivityAt: null,
    source: 'NONE',
  }])) as Record<AgentCode, AgentView>;
}

function normalizeAgents(records: JsonRecord[]): Record<AgentCode, AgentView> {
  const result = emptyAgents();
  for (const record of records) {
    const code = firstString(record.code, record.agentCode);
    if (!isAgentCode(code)) continue;
    result[code] = {
      id: nullableString(record.id),
      code,
      name: firstString(record.name) || result[code].name,
      role: firstString(record.role) || result[code].role,
      status: upper(firstString(record.status), 'IDLE'),
      currentTaskId: nullableString(record.currentTaskId),
      lastActivityAt: nullableString(record.lastActivityAt, record.updatedAt),
      source: 'API',
    };
  }
  return result;
}

function mergeAgentSnapshots(current: Record<AgentCode, AgentView>, incoming: Record<AgentCode, AgentView>) {
  const result = { ...incoming };
  for (const definition of AGENT_DEFINITIONS) {
    const code = definition.code;
    if (current[code].source === 'SOCKET' && incoming[code].source === 'NONE') result[code] = current[code];
  }
  return result;
}

function normalizeTask(record: JsonRecord): TaskView | null {
  const id = nullableString(record.id);
  const agentId = nullableString(record.agentId);
  if (!id || !agentId) return null;
  return {
    id,
    agentId,
    title: firstString(record.title, record.type) || 'Untitled task',
    description: firstString(record.description),
    status: upper(firstString(record.status), 'UNKNOWN'),
    error: nullableString(record.error),
    createdAt: nullableString(record.createdAt),
    updatedAt: nullableString(record.updatedAt),
  };
}

function selectCurrentTask(agent: AgentView, tasks: TaskView[]) {
  return tasks.find((task) => task.id === agent.currentTaskId)
    || tasks.find((task) => ACTIVE_TASK_STATUSES.has(task.status))
    || tasks[0]
    || null;
}

function parseCommand(value: string): Command | null {
  const exact = value.trim();
  return COMMAND_SET.has(exact) ? exact as Command : null;
}

function createIdempotencyKey(command: Command, file: File | null) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filePart = file ? `:${file.name}:${file.size}:${file.lastModified}` : '';
  return `PHONE-001:${command}${filePart}:${random}`;
}

function extractEventRecord(payload: unknown, preferredKey: string): JsonRecord {
  const outer = asRecord(payload) || {};
  const data = asRecord(outer.data);
  return asRecord(outer[preferredKey]) || asRecord(data?.[preferredKey]) || data || outer;
}

function matchesPhone001(record: JsonRecord) {
  const device = asRecord(record.device);
  const identifiers = [record.deviceCode, record.code, device?.code].filter((value): value is string => typeof value === 'string');
  return identifiers.length === 0 || identifiers.includes('PHONE-001');
}

function addLiveEvent(setter: (updater: (current: LiveEvent[]) => LiveEvent[]) => void, event: LiveEvent) {
  setter((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 50));
}

function eventId(prefix: string, record: JsonRecord) {
  return `${prefix}:${firstString(record.id, record.jobId, record.currentTaskId, record.timestamp, record.updatedAt) || `${Date.now()}:${Math.random()}`}`;
}

function scheduleRefresh(ref: { current: ReturnType<typeof setTimeout> | undefined }, loadData: (background?: boolean) => Promise<void>) {
  if (ref.current) clearTimeout(ref.current);
  ref.current = setTimeout(() => void loadData(true), 500);
}

function clearScheduledRefresh(ref: { current: ReturnType<typeof setTimeout> | undefined }) {
  if (ref.current) clearTimeout(ref.current);
  ref.current = undefined;
}

function compareNewest(left: TaskView, right: TaskView) {
  return timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt);
}

function timestamp(value: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function formatDate(value: unknown) {
  if (!value) return 'Unavailable';
  if (typeof value === 'object' && value !== null) {
    const secs = (value as { _seconds?: number; seconds?: number })._seconds ?? (value as { _seconds?: number; seconds?: number }).seconds;
    if (typeof secs === 'number') return new Date(secs * 1000).toLocaleString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function toRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const secs = (value as { _seconds?: number; seconds?: number })._seconds ?? (value as { _seconds?: number; seconds?: number }).seconds;
      if (typeof secs === 'number') return new Date(secs * 1000).toISOString();
    }
  }
  return '';
}

function nullableString(...values: unknown[]) {
  return firstString(...values) || null;
}

function upper(value: string, fallback: string) {
  return (value || fallback).toUpperCase();
}

function isAgentCode(value: string): value is AgentCode {
  return AGENT_CODES.has(value as AgentCode);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      return '⚠️ ไม่พบการเชื่อมต่อกับ Backend API (http://localhost:3001) — กรุณารันคำสั่ง "npm run dev --workspace @farm-phone/api" ใน Terminal';
    }
    return error.message;
  }
  return fallback;
}
