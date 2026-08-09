'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle,
  Clock,
  Filter,
  Info,
  RefreshCw,
  XCircle,
} from 'lucide-react';

type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

type Notification = {
  id: string;
  channel?: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

const TYPE_CONFIG: Record<NotificationType, { icon: ReactNode; badgeClass: string; color: string; border: string }> = {
  INFO: {
    icon: <Info className="h-4 w-4" />,
    badgeClass: 'badge-info',
    color: 'text-cyber-blue',
    border: 'border-cyber-blue',
  },
  WARNING: {
    icon: <AlertTriangle className="h-4 w-4" />,
    badgeClass: 'badge-warning',
    color: 'text-warning-orange',
    border: 'border-warning-orange',
  },
  ERROR: {
    icon: <XCircle className="h-4 w-4" />,
    badgeClass: 'badge-error',
    color: 'text-error-red',
    border: 'border-error-red',
  },
  SUCCESS: {
    icon: <CheckCircle className="h-4 w-4" />,
    badgeClass: 'badge-success',
    color: 'text-status-green',
    border: 'border-status-green',
  },
};

function authHeaders(includeJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (includeJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function unwrap<T>(payload: T | { success?: boolean; data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function notificationType(type: string): NotificationType {
  return type in TYPE_CONFIG ? (type as NotificationType) : 'INFO';
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

async function apiError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    return Array.isArray(payload.message) ? payload.message.join(', ') : payload.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotificationType | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/notifications`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await apiError(response));
      const payload = (await response.json()) as Notification[] | { success?: boolean; data?: Notification[] };
      const data = unwrap(payload);
      setNotifications(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setNotifications([]);
      setError(loadError instanceof Error ? loadError.message : 'ไม่สามารถโหลดการแจ้งเตือนได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const filteredNotifications = useMemo(
    () => filter === 'ALL'
      ? notifications
      : notifications.filter((item) => notificationType(item.type) === filter),
    [filter, notifications],
  );

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const markAsRead = useCallback(async (notification: Notification) => {
    if (notification.isRead || actionId) return;
    setActionId(notification.id);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/notifications/${notification.id}/read`, {
        method: 'PATCH',
        headers: authHeaders(true),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const payload = (await response.json()) as Notification | { success?: boolean; data?: Notification };
      const updated = unwrap(payload);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, ...updated, isRead: true } : item
      )));
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'ไม่สามารถอัปเดตการแจ้งเตือนได้');
    } finally {
      setActionId(null);
    }
  }, [actionId]);

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0 || actionId) return;
    setActionId('all');
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/notifications/mark-all-read`, {
        method: 'POST',
        headers: authHeaders(true),
      });
      if (!response.ok) throw new Error(await apiError(response));
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'ไม่สามารถอ่านทั้งหมดได้');
    } finally {
      setActionId(null);
    }
  }, [actionId, unreadCount]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">NOTIFICATIONS</h1>
          <p className="mt-1 font-mono text-sm text-gray-400">
            การแจ้งเตือนจริงจากระบบ · ยังไม่อ่าน {unreadCount} รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-outline flex items-center gap-2 text-sm"
            onClick={() => void markAllAsRead()}
            disabled={unreadCount === 0 || actionId !== null || loading}
          >
            <CheckCheck className="h-4 w-4" />
            {actionId === 'all' ? 'กำลังอัปเดต...' : 'อ่านทั้งหมด'}
          </button>
          <button
            className="btn-primary flex items-center gap-2 text-sm"
            onClick={() => void loadNotifications()}
            disabled={loading || actionId !== null}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-error-red/50 bg-error-red/10 p-4 text-sm text-red-200" role="alert">
          เชื่อมต่อ Notification API ไม่สำเร็จ: {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" aria-label="ตัวกรองการแจ้งเตือน">
        <button
          onClick={() => setFilter('ALL')}
          className={`badge cursor-pointer transition-colors ${filter === 'ALL' ? 'border-white bg-white text-dark-navy' : 'badge-info'}`}
        >
          <Filter className="mr-1 inline h-3 w-3" /> ทั้งหมด
        </button>
        {(Object.keys(TYPE_CONFIG) as NotificationType[]).map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`badge cursor-pointer transition-opacity ${filter === type ? 'border-white bg-white text-dark-navy' : TYPE_CONFIG[type].badgeClass}`}
          >
            {TYPE_CONFIG[type].icon}<span className="ml-1">{type}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && notifications.length === 0 && (
          <div className="card py-12 text-center text-sm text-gray-400">กำลังโหลดข้อมูลจาก Backend...</div>
        )}

        {!loading && !error && filteredNotifications.length === 0 && (
          <div className="card py-12 text-center">
            <BellOff className="mx-auto h-12 w-12 text-gray-600" />
            <h2 className="mt-4 font-mono text-white">ไม่มีการแจ้งเตือน</h2>
            <p className="mt-2 text-sm text-gray-400">
              {filter === 'ALL' ? 'Backend ยังไม่มี Notification สำหรับบัญชีนี้' : `ไม่มีรายการประเภท ${filter}`}
            </p>
          </div>
        )}

        {filteredNotifications.map((notification) => {
          const type = notificationType(notification.type);
          const config = TYPE_CONFIG[type];
          const updating = actionId === notification.id;
          return (
            <button
              type="button"
              key={notification.id}
              className={`card w-full border-l-4 text-left transition-opacity ${notification.isRead ? 'border-gray-700 opacity-70' : config.border}`}
              onClick={() => void markAsRead(notification)}
              disabled={notification.isRead || actionId !== null}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${config.color}`}>{config.icon}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${config.badgeClass}`}>{type}</span>
                      {notification.channel && <span className="font-mono text-xs text-gray-500">{notification.channel}</span>}
                      <h3 className={`font-mono font-bold ${notification.isRead ? 'text-gray-400' : 'text-white'}`}>
                        {notification.title}
                      </h3>
                      {!notification.isRead && <span className="h-2 w-2 rounded-full bg-cyber-blue" />}
                    </div>
                    <p className="mt-1.5 break-words text-sm leading-relaxed text-gray-400">{notification.message}</p>
                    {updating && <p className="mt-2 text-xs text-cyber-blue">กำลังบันทึกสถานะอ่าน...</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 font-mono text-xs text-gray-500">
                  <Clock className="h-3.5 w-3.5" /> {formatTimestamp(notification.createdAt)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
