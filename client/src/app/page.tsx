'use client';

// src/app/page.tsx
// Phase 17 Step 6b: Master Customer Chat interface assembling all components.

import React, { useState, useEffect, useCallback } from 'react';
import { UserProvider, useUser } from '../context/user-context';
import { ConversationSidebar } from '../components/sidebar/conversation-sidebar';
import { ChatFeed } from '../components/chat/chat-feed';
import { MessageInput } from '../components/chat/message-input';
import { SpecialistBadge } from '../components/chat/specialist-badge';
import { VerificationPrompt } from '../components/chat/verification-prompt';
import { useChat } from '../hooks/use-chat';
import { fetchConversations, createConversation } from '../lib/api-client';
import type { Conversation } from '../types/api';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

function CustomerChatContent() {
  const { currentUser } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const {
    state: chatState,
    sendMessage,
    loadConversation,
  } = useChat(currentUser.id, selectedConvId);

  // Load conversations whenever the active user changes
  const loadUserConversations = useCallback(async () => {
    setIsLoadingConvs(true);
    try {
      const res = await fetchConversations(currentUser.id);
      setConversations(res.conversations);
      setSelectedConvId((prev) => {
        if (prev && !res.conversations.some((c) => c.id === prev)) {
          return null;
        }
        return prev;
      });
    } catch {
      setConversations([]);
      setSelectedConvId(null);
    } finally {
      setIsLoadingConvs(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    loadUserConversations();
  }, [loadUserConversations]);

  // Keep sidebar updated if a new conversation is created via chat
  useEffect(() => {
    if (chatState.conversationId && chatState.conversationId !== selectedConvId) {
      setSelectedConvId(chatState.conversationId);
      loadUserConversations();
    }
  }, [chatState.conversationId, selectedConvId, loadUserConversations]);

  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    loadConversation(convId);
  };

  const handleNewChat = () => {
    setSelectedConvId(null);
  };

  const handleSend = async (text: string) => {
    await sendMessage(text);
    // Reload sidebar list after turn completes
    loadUserConversations();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-slate-900">
      {/* Sidebar (left) */}
      <ConversationSidebar
        conversations={conversations}
        selectedId={selectedConvId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        isLoading={isLoadingConvs}
        className="w-72 md:w-80 shrink-0"
      />

      {/* Main Chat Area (right) */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-slate-50">
        {/* Header */}
        <header
          data-testid="chat-header"
          className="h-16 px-6 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm shrink-0"
        >
          <div className="flex items-center gap-3">
            <SpecialistBadge
              currentAgent={chatState.currentAgent}
              handoffCount={chatState.handoffCount}
            />

            {chatState.conversationId && (
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                ID: {chatState.conversationId.substring(0, 8)}...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {chatState.workflowStatus === 'ESCALATED' && (
              <span
                data-testid="escalated-badge"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Escalated to Human</span>
              </span>
            )}

            {chatState.workflowStatus === 'COMPLETED' && (
              <span
                data-testid="completed-badge"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Turn Resolved</span>
              </span>
            )}
          </div>
        </header>

        {/* Escalation Notice Banner */}
        {chatState.workflowStatus === 'ESCALATED' && (
          <div
            data-testid="escalation-alert-banner"
            className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-800 flex items-center gap-2 font-medium"
          >
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>
              This conversation has been escalated to a human support specialist. Chat input is disabled.
            </span>
          </div>
        )}

        {/* Recoverable Error Banner */}
        {chatState.workflowStatus === 'FAILED' && (
          <div
            data-testid="error-alert-banner"
            className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-2"
          >
            <span>
              {chatState.error || 'A temporary communication issue occurred.'}
            </span>
            <button
              type="button"
              onClick={() => selectedConvId && loadConversation(selectedConvId)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Chat Feed */}
        <ChatFeed
          messages={chatState.messages}
          isStreaming={chatState.isStreaming}
          streamingText={chatState.streamingText}
          currentNode={chatState.currentNode}
          className="flex-1"
        />

        {/* Verification Prompt (if verification is active) */}
        {chatState.blockedBy && (
          <div className="px-4 md:px-6 pt-2 pb-0 bg-slate-50">
            <VerificationPrompt
              blockedBy={chatState.blockedBy}
              currentStep={chatState.currentStep}
              userId={currentUser.id}
            />
          </div>
        )}

        {/* Message Input Bottom Area */}
        <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-200">
          <MessageInput
            onSend={handleSend}
            isStreaming={chatState.isStreaming}
            workflowStatus={chatState.workflowStatus}
            placeholder={
              chatState.workflowStatus === 'ESCALATED'
                ? 'Conversation escalated. Input is disabled.'
                : chatState.blockedBy === 'VERIFICATION_FULL' &&
                  chatState.currentStep === 'verify_identity'
                ? 'Enter your 6-digit verification code...'
                : 'Type your message here...'
            }
          />
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <UserProvider>
      <CustomerChatContent />
    </UserProvider>
  );
}
