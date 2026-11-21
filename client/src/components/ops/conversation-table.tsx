'use client';

// src/components/ops/conversation-table.tsx
// Phase 34: Searchable and filterable table of conversations with Midnight Burgundy theme.

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { OpsConversation } from '../../types/ops';
import {
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Radio,
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
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/60"
          >
            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
            <span>Escalated</span>
          </span>
        );
      case 'archived':
        return (
          <span
            data-testid="status-archived"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-inset text-content-muted border border-edge-subtle"
          >
            <Archive className="h-3 w-3 text-content-muted shrink-0" />
            <span>Archived</span>
          </span>
        );
      default:
        return (
          <span
            data-testid="status-active"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-950/60 text-sky-400 border border-sky-800/60"
          >
            <Radio className="h-3 w-3 text-sky-400 shrink-0" />
            <span>Active</span>
          </span>
        );
    }
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="conversation-table-container">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface border border-edge-subtle p-3 rounded-xl shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-content-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by ID, email, or customer name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="search-input"
              className="w-full bg-surface-inset border border-edge-subtle rounded-lg pl-9 pr-3 py-1.5 text-xs text-content-primary placeholder-content-muted/60 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-surface-inset border border-edge-subtle rounded-lg px-2.5 py-1.5 text-xs text-content-secondary">
            <Filter className="h-3.5 w-3.5 text-content-muted" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | 'escalated' | 'archived')
              }
              data-testid="status-filter-select"
              className="bg-transparent text-content-primary focus:outline-none cursor-pointer text-xs"
            >
              <option value="all" className="bg-surface text-content-primary">All Statuses</option>
              <option value="active" className="bg-surface text-content-primary">Active</option>
              <option value="escalated" className="bg-surface text-content-primary">Escalated</option>
              <option value="archived" className="bg-surface text-content-primary">Archived</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="refresh-button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-inset hover:bg-surface-hover text-content-primary text-xs font-medium border border-edge-subtle transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Conversations Table */}
      <div className="rounded-xl border border-edge-subtle bg-surface overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-content-secondary" data-testid="conversations-table">
            <thead className="bg-surface-inset/80 border-b border-edge-subtle text-[11px] font-semibold text-content-muted uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Conversation ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Turns</th>
                <th className="py-3 px-4">Last Updated</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-subtle/60 font-sans">
              {isLoading && conversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-content-muted">
                    Loading conversations...
                  </td>
                </tr>
              ) : filteredConversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-content-muted" data-testid="no-results-row">
                    No conversations match the current search and filter.
                  </td>
                </tr>
              ) : (
                filteredConversations.map((c) => (
                  <tr
                    key={c.id}
                    data-testid={`conv-row-${c.id}`}
                    className="hover:bg-surface-hover/50 transition-colors"
                  >
                    {/* ID */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-semibold text-brand-link bg-surface-inset px-2.5 py-1 rounded-md border border-edge-subtle">
                        {c.id.substring(0, 8)}...
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-content-primary">{c.user.name}</div>
                      <div className="text-[11px] text-content-muted font-mono">{c.user.email}</div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">{renderStatusBadge(c.status)}</td>

                    {/* Turns */}
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-content-secondary font-medium">
                        <Layers className="h-3 w-3 text-content-muted" />
                        <span>{c.turnCount}</span>
                      </span>
                    </td>

                    {/* Updated */}
                    <td className="py-3 px-4 font-mono text-xs text-content-muted">
                      {formatTime(c.updatedAt || c.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/ops/traces/${c.id}`}
                        data-testid={`inspect-btn-${c.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-white font-semibold text-xs transition-colors shadow-xs"
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
