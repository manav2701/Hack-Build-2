'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, Sparkles, Smile } from 'lucide-react';

interface VoiceOrbProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'speaking';
  isSpeaking: boolean;
  onToggleConnect: () => void;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ status, isSpeaking, onToggleConnect }) => {
  const isConnected = status === 'connected' || status === 'speaking';

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative flex items-center justify-center">
        {/* Pulsing Ripple outer rings */}
        {isConnected && (
          <>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className="absolute w-44 h-44 rounded-full bg-amber-500/20 blur-sm"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
              transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
              className="absolute w-36 h-36 rounded-full bg-orange-500/30"
            />
          </>
        )}

        {/* Main Glowing Circle Orb */}
        <button
          onClick={onToggleConnect}
          aria-label={isConnected ? 'Disconnect DaleelBites voice session' : 'Start talking to DaleelBites AI'}
          className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 transform hover:scale-105 ${
            isConnected
              ? 'bg-gradient-to-tr from-amber-600 via-orange-500 to-amber-400 shadow-amber-500/40 ring-4 ring-amber-400/50 text-slate-950'
              : 'bg-slate-900 hover:bg-slate-800 border-2 border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/5'
          }`}
        >
          {status === 'connecting' ? (
            <Sparkles className="w-10 h-10 animate-spin" />
          ) : isConnected ? (
            isSpeaking ? (
              <Volume2 className="w-10 h-10 animate-pulse" />
            ) : (
              <Smile className="w-11 h-11" />
            )
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>
      </div>

      {/* Audio Wave Equalizer Animation */}
      {isConnected && (
        <div className="flex items-center gap-1 mt-5 h-6">
          {[0.6, 1.2, 0.4, 0.9, 1.5, 0.7, 1.1, 0.5, 1.3, 0.8, 1.0, 0.4].map((h, i) => (
            <motion.div
              key={i}
              animate={{ height: isSpeaking ? [4, h * 16, 4] : [4, 8, 4] }}
              transition={{ repeat: Infinity, duration: 0.8 + (i % 4) * 0.2 }}
              className="w-1 bg-amber-400 rounded-full"
            />
          ))}
        </div>
      )}

      {/* Status Pill */}
      <div className="mt-3 text-center">
        <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
          isConnected
            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
            : 'bg-slate-900 text-slate-400 border border-slate-800'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
          {status === 'disconnected' && 'Click Mic to Speak to DaleelBites'}
          {status === 'connecting' && 'Connecting WebRTC Session...'}
          {status === 'connected' && 'Listening...'}
          {status === 'speaking' && 'DaleelBites Speaking...'}
        </span>
      </div>
    </div>
  );
};
