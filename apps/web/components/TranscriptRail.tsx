'use client';

import React from 'react';
import { MessageSquare, User, Bot } from 'lucide-react';

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface TranscriptRailProps {
  messages: Message[];
}

export const TranscriptRail: React.FC<TranscriptRailProps> = ({ messages }) => {
  if (messages.length === 0) return null;

  return (
    <div className="w-full bg-slate-900/40 rounded-xl p-4 border border-slate-800/60 my-4 max-h-48 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-amber-400" />
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Transcript</h4>
      </div>

      <div className="space-y-2.5">
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 text-xs">
            {msg.sender === 'user' ? (
              <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <div>
              <span className={`font-semibold mr-1.5 ${msg.sender === 'user' ? 'text-slate-300' : 'text-amber-400'}`}>
                {msg.sender === 'user' ? 'You:' : 'Dalal:'}
              </span>
              <span className="text-slate-300 leading-normal">{msg.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
