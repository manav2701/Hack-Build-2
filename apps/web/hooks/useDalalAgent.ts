'use client';

import { useState, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Message } from '../components/TranscriptRail';

export function useDalalAgent(onJobStarted?: (jobId: string) => void) {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'speaking'>('disconnected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => setStatus('connected'),
    onDisconnect: () => setStatus('disconnected'),
    onMessage: (message: any) => {
      if (message.source === 'user') {
        setMessages((prev) => [
          ...prev,
          { id: Math.random().toString(), sender: 'user', text: message.message, timestamp: new Date().toLocaleTimeString() }
        ]);
      } else if (message.source === 'ai') {
        setStatus('speaking');
        setMessages((prev) => [
          ...prev,
          { id: Math.random().toString(), sender: 'agent', text: message.message, timestamp: new Date().toLocaleTimeString() }
        ]);
      }
    },
    onError: (error) => {
      console.error('ElevenLabs WebRTC Error:', error);
      setStatus('disconnected');
    },
  });

  const startSession = useCallback(async () => {
    setStatus('connecting');
    try {
      // Mint token or connect directly
      const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'demo_agent';
      await conversation.startSession({ agentId });
      setStatus('connected');
    } catch (err) {
      console.error('Failed to start ElevenLabs session:', err);
      // Fallback connected status for local demo preview
      setStatus('connected');
    }
  }, [conversation]);

  const stopSession = useCallback(async () => {
    await conversation.endSession();
    setStatus('disconnected');
  }, [conversation]);

  const sendContextualUpdate = useCallback((contextText: string) => {
    try {
      if (typeof (conversation as any).sendContextualUpdate === 'function') {
        (conversation as any).sendContextualUpdate(contextText);
      } else {
        console.log('Contextual Update:', contextText);
      }
    } catch (err) {
      console.warn('sendContextualUpdate fallback:', err);
    }
  }, [conversation]);

  return {
    status,
    messages,
    currentJobId,
    setCurrentJobId,
    startSession,
    stopSession,
    sendContextualUpdate,
    isSpeaking: conversation.isSpeaking,
  };
}
