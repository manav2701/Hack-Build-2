'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

interface TranscriptRailProps {
  messages: Message[];
}

/**
 * The conversation, set as a transcript rather than as chat bubbles: a hairline rule,
 * a tracked-out speaker label, and the words. Bubbles would import a messaging-app
 * idiom the rest of this page does not use.
 */
export const TranscriptRail: React.FC<TranscriptRailProps> = ({ messages }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <p className="border-t border-raw-ink/15 pt-5 font-sans text-sm leading-relaxed text-raw-mute">
        Your conversation appears here. Tap the face, or type a craving below.
      </p>
    );
  }

  return (
    <div className="max-h-72 space-y-5 overflow-y-auto border-t border-raw-ink/15 pr-2 pt-5">
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className={`label-raw ${isUser ? '' : 'text-raw-red'}`}>
                  {isUser ? 'You' : 'Dalal'}
                </span>
                <span className="font-sans text-[10px] tabular-nums text-raw-mute/70">
                  {msg.timestamp}
                </span>
              </div>
              <p
                className={`font-sans text-sm leading-relaxed ${
                  isUser ? 'text-raw-mute' : 'border-l-2 border-raw-red pl-3 text-raw-ink'
                }`}
              >
                {msg.text}
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={endRef} />
    </div>
  );
};
