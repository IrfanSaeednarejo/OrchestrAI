'use client';

// src/app/page.tsx
// Phase 17 Step 6b: Master Customer Chat interface assembling all components.
// Phase 21: Added real user AuthProvider, AuthModal, StorefrontModal, and live order tracking.

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserProvider, useUser } from '../context/user-context';
import { AuthProvider, useAuth } from '../context/auth-context';
import { useRequireAuth } from '../hooks/use-require-auth';
import { ConversationSidebar } from '../components/sidebar/conversation-sidebar';
import { ChatFeed } from '../components/chat/chat-feed';
import { MessageInput } from '../components/chat/message-input';
import { SpecialistBadge } from '../components/chat/specialist-badge';
import { VerificationPrompt } from '../components/chat/verification-prompt';
import { AuthModal } from '../components/auth/auth-modal';
import { StorefrontModal } from '../components/store/storefront-modal';
import { useChat } from '../hooks/use-chat';
import { fetchConversations } from '../lib/api-client';
import type { Conversation } from '../types/api';
import { TopNav } from '../components/navigation/top-nav';
import { AlertTriangle, CheckCircle, RefreshCw, ShoppingBag, Loader2 } from 'lucide-react';

function CustomerChatContent() {
  const searchParams = useSearchParams();
  const queryOrderId = searchParams?.get('orderId');
  const { user: authUser, token: authToken, isAuthenticated, isLoading: isAuthLoading } = useRequireAuth('/');
  const { currentUser } = useUser();

  const [initialDraft, setInitialDraft] = useState('');
  const [orderPromptPrefilled, setOrderPromptPrefilled] = useState(false);

  useEffect(() => {
    if (queryOrderId && !orderPromptPrefilled) {
      setInitialDraft(`Where is my order ${queryOrderId}? Can you give me the latest tracking status?`);
      setOrderPromptPrefilled(true);
    }
  }, [queryOrderId, orderPromptPrefilled]);

  // If real user is logged in, use their ID and token; otherwise fallback to demo/guest user
  const activeUserId = isAuthenticated && authUser ? authUser.id : currentUser.id;
  const activeToken = isAuthenticated ? authToken : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  // Modals state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isStorefrontModalOpen, setIsStorefrontModalOpen] = useState(false);

  const {
    state: chatState,
    sendMessage,
    loadConversation,
    resetChat,
  } = useChat(activeUserId, selectedConvId, activeToken);

  // Load conversations for the active user ID
  const loadUserConversations = useCallback(
    async (userId: string, token: string | null) => {
      setIsLoadingConvs(true);
      try {
        const res = await fetchConversations(userId, 20, 0, token);
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
    },
    []
  );

  // When active user or token changes: reset active chat state and fetch conversations
  useEffect(() => {
    if (!isAuthenticated) return;
    setSelectedConvId(null);
    resetChat();
    void loadUserConversations(activeUserId, activeToken);
  }, [isAuthenticated, activeUserId, activeToken, loadUserConversations, resetChat]);

  // Keep sidebar updated if a new conversation is created via chat
  useEffect(() => {
    if (chatState.conversationId && chatState.conversationId !== selectedConvId) {
      setSelectedConvId(chatState.conversationId);
      void loadUserConversations(activeUserId, activeToken);
    }
  }, [chatState.conversationId, selectedConvId, activeUserId, activeToken, loadUserConversations]);

  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        <span>Authenticating...</span>
      </div>
    );
  }

  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    loadConversation(convId);
  };

  const handleNewChat = () => {
    setSelectedConvId(null);
    resetChat();
  };

  const handleSend = async (text: string) => {
    await sendMessage(text);
    // Reload sidebar list after turn completes
    void loadUserConversations(activeUserId, activeToken);
  };

  // Called when user clicks "Ask Agent About This Order" from StorefrontModal
  const handleAskAgentAboutOrder = async (orderId: string) => {
    handleNewChat();
    await sendMessage(`Where is my order ${orderId}? Can you give me the latest tracking status?`);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TopNav />
      <div className="flex flex-1 min-h-0 overflow-hidden bg-white text-slate-900">
        {/* Sidebar (left) */}
        <ConversationSidebar
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onOpenStore={() => setIsStorefrontModalOpen(true)}
          onOpenAuth={() => setIsAuthModalOpen(true)}
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
              <button
                type="button"
                onClick={() => setIsStorefrontModalOpen(true)}
                data-testid="header-store-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200"
              >
                <ShoppingBag className="h-3.5 w-3.5 text-indigo-600" />
                <span>Storefront</span>
              </button>

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
            currentActivity={chatState.currentActivity}
            serviceOptions={chatState.serviceOptions}
            onOptionSelect={handleSend}
            isEscalated={chatState.workflowStatus === 'ESCALATED'}
            className="flex-1"
          />

          {/* Verification Prompt (if verification is active) */}
          {chatState.blockedBy && (
            <div className="px-4 md:px-6 pt-2 pb-0 bg-slate-50">
              <VerificationPrompt
                blockedBy={chatState.blockedBy}
                currentStep={chatState.currentStep}
                userId={activeUserId}
              />
            </div>
          )}

          {/* Message Input Bottom Area */}
          <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-200">
            <MessageInput
              onSend={handleSend}
              isStreaming={chatState.isStreaming}
              workflowStatus={chatState.workflowStatus}
              initialValue={initialDraft}
              placeholder={
                chatState.workflowStatus === 'ESCALATED'
                  ? 'Conversation escalated. Input is disabled.'
                  : chatState.blockedBy === 'VERIFICATION_FULL' &&
                    chatState.currentStep === 'verify_identity'
                  ? 'Enter your 6-digit verification code...'
                  : chatState.blockedBy === 'VERIFICATION_FULL'
                  ? 'Ask for a verification code or enter your 6-digit code...'
                  : 'Type your message here...'
              }
            />
          </div>
        </main>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Storefront Modal */}
      <StorefrontModal
        isOpen={isStorefrontModalOpen}
        onClose={() => setIsStorefrontModalOpen(false)}
        onAskAgent={handleAskAgentAboutOrder}
        onOpenAuth={() => {
          setIsStorefrontModalOpen(false);
          setIsAuthModalOpen(true);
        }}
      />
    </div>
  );
}

function EnsureAuthProvider({ children }: { children: React.ReactNode }) {
  let hasAuth = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = useAuth();
    if (ctx) hasAuth = true;
  } catch {
    hasAuth = false;
  }

  if (hasAuth) {
    return <>{children}</>;
  }
  return <AuthProvider>{children}</AuthProvider>;
}

export default function HomePage() {
  return (
    <EnsureAuthProvider>
      <UserProvider>
        <Suspense
          fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              <span>Loading chat...</span>
            </div>
          }
        >
          <CustomerChatContent />
        </Suspense>
      </UserProvider>
    </EnsureAuthProvider>
  );
}
