'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';

type AppUser = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserForm = {
  name: string;
  email: string;
  password: string;
};

const emptyForm: UserForm = { name: '', email: '', password: '' };
const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || `Request failed (${response.status})`);
  }
  return (payload?.data ?? payload) as T;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [actionBusy, setActionBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/users`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      setUsers(await readResponse<AppUser[]>(response));
    } catch (requestError) {
      setUsers([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.name, user.email, user.role].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, users]);

  function openCreateModal() {
    setEditingUser(null);
    setForm(emptyForm);
    setShowCreateModal(true);
    setNotice('');
  }

  function openEditModal(user: AppUser) {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, password: '' });
    setShowCreateModal(true);
    setNotice('');
  }

  function closeFormModal() {
    if (actionBusy) return;
    setShowCreateModal(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const actionId = editingUser ? `edit:${editingUser.id}` : 'create';
    setActionBusy(actionId);
    setError('');
    setNotice('');

    try {
      const body: Record<string, string> = {
        name: form.name.trim(),
        email: form.email.trim(),
      };
      if (form.password) body.password = form.password;

      const response = await fetch(
        editingUser ? `${apiUrl}/api/v1/users/${editingUser.id}` : `${apiUrl}/api/v1/users`,
        {
          method: editingUser ? 'PATCH' : 'POST',
          headers: authHeaders(true),
          body: JSON.stringify(body),
        },
      );
      await readResponse<AppUser>(response);
      setNotice(editingUser ? 'User updated successfully.' : 'User created successfully.');
      setShowCreateModal(false);
      setEditingUser(null);
      setForm(emptyForm);
      await fetchUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save user');
    } finally {
      setActionBusy('');
    }
  }

  async function deleteUser(user: AppUser) {
    setActionBusy(`delete:${user.id}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      await readResponse<AppUser>(response);
      setConfirmDelete(null);
      setNotice('User deleted successfully.');
      await fetchUsers();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete user');
    } finally {
      setActionBusy('');
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-cyber-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-2xl font-bold text-white">
            <UsersIcon className="h-6 w-6 text-cyber-blue" />
            User Management
          </h1>
          <p className="mt-1 font-mono text-sm text-gray-400">
            {users.length} users from the backend
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline flex items-center gap-2" onClick={() => void fetchUsers()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={openCreateModal}>
            <UserPlus className="h-4 w-4" /> Create User
          </button>
        </div>
      </div>

      <div className="card border-warning-orange/60 bg-warning-orange/10 font-mono text-sm text-warning-orange">
        Role and active-status changes are read-only here because the current Users API only supports updating name, email, and password. Email invitations are not supported by the API.
      </div>
      {error && <div className="card border-error-red bg-error-red/10 font-mono text-sm text-error-red">{error}</div>}
      {notice && <div className="card border-status-green bg-status-green/10 font-mono text-sm text-status-green">{notice}</div>}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="search"
          placeholder="Search by name, email, or role..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded border-2 border-pixel-border bg-navy-800 py-2 pl-10 pr-4 font-mono text-sm text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left font-mono text-sm">
            <thead>
              <tr className="bg-navy-700 text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Supported Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    {search ? 'No users match your search.' : error ? 'Backend data is unavailable.' : 'No users exist yet.'}
                  </td>
                </tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-gray-800 transition-colors hover:bg-navy-700/50">
                  <td className="px-4 py-3 font-bold text-white">{user.name}</td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={user.isActive} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-2 text-gray-400 transition-colors hover:bg-navy-700 hover:text-cyber-blue"
                        title="Edit name, email, or password"
                        onClick={() => openEditModal(user)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-2 text-gray-400 transition-colors hover:bg-navy-700 hover:text-error-red"
                        title="Delete user"
                        onClick={() => setConfirmDelete(user)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <>
          <button className="fixed inset-0 z-40 bg-black/60" aria-label="Close dialog" onClick={closeFormModal} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded border-2 border-pixel-border bg-navy-800 p-6 shadow-2xl">
            <h2 className="mb-4 flex items-center gap-2 font-mono text-lg font-bold text-white">
              {editingUser ? <Edit3 className="h-5 w-5 text-cyber-blue" /> : <Plus className="h-5 w-5 text-cyber-blue" />}
              {editingUser ? 'Edit User' : 'Create User'}
            </h2>
            <form className="space-y-4" onSubmit={submitUser}>
              <FormField label="Name" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} required />
              <FormField label="Email" type="email" value={form.email} onChange={(email) => setForm((current) => ({ ...current, email }))} required />
              <FormField
                label={editingUser ? 'New password (optional)' : 'Password'}
                type="password"
                value={form.password}
                onChange={(password) => setForm((current) => ({ ...current, password }))}
                required={!editingUser}
                minLength={8}
              />
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-outline text-sm" onClick={closeFormModal}>Cancel</button>
                <button type="submit" className="btn-primary flex items-center justify-center gap-2 text-sm" disabled={Boolean(actionBusy)}>
                  {actionBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {confirmDelete && (
        <>
          <button className="fixed inset-0 z-40 bg-black/60" aria-label="Close dialog" onClick={() => setConfirmDelete(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded border-2 border-error-red bg-navy-800 p-6 shadow-2xl">
            <h2 className="mb-2 font-mono text-lg font-bold text-error-red">Delete User?</h2>
            <p className="mb-5 break-all font-mono text-sm text-gray-400">
              The backend will permanently delete {confirmDelete.email}. This action cannot be undone.
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn-outline text-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-danger flex items-center justify-center gap-2 text-sm"
                onClick={() => void deleteUser(confirmDelete)}
                disabled={actionBusy === `delete:${confirmDelete.id}`}
              >
                {actionBusy === `delete:${confirmDelete.id}` ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={minLength}
        className="w-full rounded border-2 border-pixel-border bg-navy-700 px-3 py-2 font-mono text-sm text-white focus:border-cyber-blue focus:outline-none"
      />
    </label>
  );
}

function RoleBadge({ role }: { role?: string }) {
  const normalizedRole = (role || 'USER').toUpperCase();
  const className = normalizedRole === 'ADMIN' || normalizedRole === 'OWNER' || normalizedRole === 'SUPER_ADMIN'
    ? 'border-purple-600 bg-purple-600/20 text-purple-400'
    : normalizedRole === 'MANAGER'
      ? 'border-cyber-blue bg-cyber-blue/20 text-cyber-blue'
      : normalizedRole === 'OPERATOR'
        ? 'border-status-green bg-status-green/20 text-status-green'
        : 'border-gray-600 bg-gray-600/20 text-gray-400';
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${className}`}>{normalizedRole}</span>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'badge-success' : 'badge-error'}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span>;
}
