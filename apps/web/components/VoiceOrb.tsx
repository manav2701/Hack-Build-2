'use client';

import React from 'react';
import { Mic, MicOff, Volume2, Sparkles } from 'lucide-react';

interface VoiceOrbProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'speaking';
  isSpeaking: boolean;
  onToggleConnect: () => void;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ status, isSpeaking, onToggleConnect }) => {
  const isConnected = status === 'connected' || status === 'speaking';

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="relative flex items-center justify-center">
        {/* Pulsing Ripple outer rings */}
        {isConnected && (
          <>
            <div className="absolute w-44 h-44 rounded-full bg-amber-500/20 animate-ping" />
            <div className="absolute w-36 h-36 rounded-full bg-emerald-500/30 animate-pulse-slow" />
          </>
        )}

        {/* Main Mic Button */}
        <button
          onClick={onToggleConnect}
          className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 transform hover:scale-105 ${
            isConnected
              ? 'bg-gradient-to-tr from-amber-500 to-emerald-400 shadow-amber-500/40 ring-4 ring-amber-400/50'
              : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
          }`}
        >
          {status === 'connecting' ? (
            <Sparkles className="w-10 h-10 text-amber-400 animate-spin" />
          ) : isConnected ? (
            isSpeaking ? (
              <Volume2 className="w-12 h-12 text-slate-950 animate-bounce" />
            ) : (
              <Mic className="w-12 h-12 text-slate-950" />
            )
          ) : (
            <MicOff className="w-10 h-10 text-slate-400" />
          )}
        </button>
      </div>

      <div className="mt-4 text-center">
        <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
          isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
          {status === 'disconnected' && 'Click Mic to Talk to Dalal'}
          {status === 'connecting' && 'Connecting WebRTC Session...'}
          {status === 'connected' && 'Dalal Listening...'}
          {status === 'speaking' && 'Dalal Speaking...'}
        </span>
      </div>
    </div>
  );
};
