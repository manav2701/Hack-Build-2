'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { useAuth } from './AuthProvider';
import { Blobs } from './Blobs';
import { Rise } from './Rise';

/** Mirrors MIN_PASSWORD_LENGTH in apps/api/app/services/auth.py. */
const MIN_PASSWORD = 8;

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export const AuthForm: React.FC<AuthFormProps> = ({ mode }) => {
  const isSignup = mode === 'signup';
  const router = useRouter();
  const { login, signup } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Checked here as well as server-side so the user learns it before a round trip;
    // the server remains the authority.
    if (isSignup && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (isSignup) await signup(email, password, name);
      else await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col">
      <Blobs />

      <div className="px-6 pt-7 sm:px-10">
        <Link href="/" className="font-display text-2xl uppercase leading-none tracking-brutal">
          Daleel<span className="text-raw-red">Bites</span>
        </Link>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-16 px-6 py-16 sm:px-10 lg:grid-cols-2">
        <Rise>
          <h1
            className="font-display uppercase leading-poster tracking-brutal"
            style={{ fontSize: 'clamp(3rem, 9vw, 7rem)' }}
          >
            {isSignup ? (
              <>
                Make it
                <br />
                <span className="text-raw-red">yours.</span>
              </>
            ) : (
              <>
                Welcome
                <br />
                <span className="text-raw-red">back.</span>
              </>
            )}
          </h1>
          <p className="mt-8 max-w-sm font-sans text-lg leading-relaxed text-raw-mute">
            {isSignup
              ? 'An account keeps every craving you research, so the verdict is still there when you come back to order.'
              : 'Sign in to pick up your saved cravings and their verdicts.'}
          </p>
        </Rise>

        <Rise
          as="form"
          delay={0.12}
          onSubmit={handleSubmit}
          className="w-full max-w-md"
        >
          <p className="label-raw border-t-2 border-raw-ink pt-4">
            {isSignup ? 'Create account' : 'Sign in'}
          </p>

          <div className="mt-6 space-y-6">
            {isSignup && (
              <div>
                <label htmlFor="name" className="label-raw">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Amin"
                  className="field-raw mt-1"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label-raw">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.ae"
                className="field-raw mt-1"
              />
            </div>

            <div>
              <label htmlFor="password" className="label-raw">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : '••••••••'}
                className="field-raw mt-1"
              />
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-6 border-l-2 border-raw-red bg-raw-red/10 py-2 pl-3 font-sans text-xs text-raw-ink"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-raw mt-8 w-full">
            <span>{busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-6 font-sans text-xs text-raw-mute">
            {isSignup ? 'Already have an account? ' : 'No account yet? '}
            <Link href={isSignup ? '/login' : '/signup'} className="link-raw">
              {isSignup ? 'Sign in' : 'Sign up'}
            </Link>
          </p>

          <p className="mt-4 font-sans text-xs text-raw-mute/80">
            You can also{' '}
            <Link href="/" className="underline decoration-raw-red underline-offset-2">
              keep browsing without an account
            </Link>
            — cravings just will not be saved.
          </p>
        </Rise>
      </div>
    </main>
  );
};
