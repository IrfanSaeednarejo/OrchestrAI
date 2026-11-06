'use client';

// src/components/ops/conversation-table.tsx
// Phase 18 Step 4: Searchable and filterable table of all system conversations.

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { OpsConversation } from '../../types/ops';
import {
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Archive,
  Layers,
} from 'lucide-react';

interface ConversationTableProps {
  conversations: OpsConversation[];
  isLoading: boolean;
  onRefresh: () => void;
  className?: string;
}

export function ConversationTable({
  conversations,
  isLoading,
  onRefresh,
  className = '',
}: ConversationTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'escalated' | 'archived'>('all');

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Status filter
      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }
      // Search filter (id, user email, user name)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesId = c.id.toLowerCase().includes(query);
        const matchesEmail = c.user.email.toLowerCase().includes(query);
        const matchesName = c.user.name.toLowerCase().includes(query);
        return matchesId || matchesEmail || matchesName;
      }
      return true;
    });
  }, [conversations, statusFilter, searchTerm]);

  function formatTime(timestamp: string | null): string {
    if (!timestamp) return '—';
    try {
      const d = new Date(timestamp);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  }

  function renderStatusBadge(status: string) {
    switch (status) {
      case 'escalated':
        return (
          <span
            data-testid="status-escalated"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800"
          >
            <AlertTriangle className="h-3 w-3 text-rose-400" />
            <span>Escalated</span>
          </span>
        );
      case 'archived':
        return (
          <span
            data-testid="status-archived"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700"
          >
            <Archive className="h-3 w-3 text-slate-400" />
            <span>Archived</span>
          </span>
        );
      default:
        return (
          <span
            data-testid="status-active"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <span>Active</span>
          </span>
        );
    }
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="conversation-table-container">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-lg">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by ID, email, or customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="search-input"
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | 'escalated' | 'archived')
              }
              data-testid="status-filter-select"
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer text-xs"
            >
              <option value="all" className="bg-slate-900">All Statuses</option>
              <option value="active" className="bg-slate-900">Active</option>
              <option value="escalated" className="bg-slate-900">Escalated</option>
              <option value="archived" className="bg-slate-900">Archived</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="refresh-button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Conversations Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300" data-testid="conversations-table">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Conversation ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Turns</th>
                <th className="py-3 px-4">Last Updated</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {isLoading && conversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading conversations...
                  </td>
                </tr>
              ) : filteredConversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500" data-testid="no-results-row">
                    No conversations match the current search and filter.
                  </td>
                </tr>
              ) : (
                filteredConversations.map((c) => (
                  <tr
                    key={c.id}
                    data-testid={`conv-row-${c.id}`}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    {/* ID */}
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {c.id.substring(0, 8)}...
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-200">{c.user.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{c.user.email}</div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">{renderStatusBadge(c.status)}</td>

                    {/* Turns */}
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                        <Layers className="h-3 w-3 text-slate-500" />
                        <span>{c.turnCount}</span>
                      </span>
                    </td>

                    {/* Updated */}
                    <td className="py-3 px-4 text-slate-400">
                      {formatTime(c.updatedAt || c.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/ops/traces/${c.id}`}
                        data-testid={`inspect-btn-${c.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/90 hover:bg-indigo-600 text-white font-medium text-xs transition-colors shadow-sm"
                      >
                        <span>Inspect</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

