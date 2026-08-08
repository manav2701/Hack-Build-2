'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, User } from 'lucide-react';

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="w-full space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-3 text-xs"
            >
              {/* Avatar Icon */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  isUser
                    ? 'bg-slate-800 border-slate-700 text-slate-300'
                    : 'bg-gradient-to-tr from-amber-500 to-orange-500 border-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Smile className="w-4 h-4 font-bold" />}
              </div>

              {/* Message Bubble Container */}
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`font-semibold ${isUser ? 'text-slate-400' : 'text-amber-400'}`}>
                    {isUser ? 'You' : 'DaleelBites AI'}
                  </span>
                  <span className="text-[10px] text-slate-500">{msg.timestamp || 'Just now'}</span>
                </div>

                <div
                  className={`p-3 rounded-xl border leading-relaxed ${
                    isUser
                      ? 'bg-slate-900/80 border-slate-800 text-slate-200'
                      : 'bg-slate-900 border-amber-500/30 text-slate-100 shadow-md shadow-amber-500/5'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  );
};
