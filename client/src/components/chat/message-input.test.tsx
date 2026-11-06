// src/components/chat/message-input.test.tsx
// Phase 17 Step 5a: Tests for MessageInput lock states and keyboard interactions.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from './message-input';

describe('MessageInput Component', () => {
  it('allows user to type and submit message via send button', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText('Message input');
    const sendButton = screen.getByLabelText('Send message');

    await userEvent.type(textarea, 'Where is my order?');
    expect(textarea).toHaveValue('Where is my order?');

    fireEvent.click(sendButton);

    expect(onSend).toHaveBeenCalledWith('Where is my order?');
    expect(textarea).toHaveValue('');
  });

  it('submits on Enter key without Shift', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText('Message input');
    await userEvent.type(textarea, 'Check shipment');

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('Check shipment');
  });

  it('does NOT submit on Shift+Enter (allows multiline)', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText('Message input');
    await userEvent.type(textarea, 'Line 1');

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send empty or whitespace-only messages', () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText('Message input');
    const sendButton = screen.getByLabelText('Send message');

    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(sendButton);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input and shows escalation lock message when workflowStatus is ESCALATED', () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} workflowStatus="ESCALATED" />);

    const textarea = screen.getByLabelText('Message input');
    const sendButton = screen.getByLabelText('Send message');

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(textarea).toHaveAttribute('placeholder', 'Conversation escalated to human agent');
    expect(
      screen.getByText(/transferred to human support/i)
    ).toBeInTheDocument();
  });

  it('disables input when isStreaming is true', () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} isStreaming={true} />);

    const textarea = screen.getByLabelText('Message input');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute('placeholder', 'Agent is thinking...');
  });
});
