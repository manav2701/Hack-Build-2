'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from './AuthProvider';

/**
 * The only chrome left at the top of the page.
 *
 * The old navigation bar (Home / Discover / Cravings / Reservations) linked nowhere —
 * this product is one screen that turns a spoken craving into an order link. What
 * remains is the wordmark and the account control, sitting directly on the paper with
 * no bar, border or backdrop, so the hero type is still the first thing you read.
 */
export const AccountBar: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative z-30 flex items-start justify-between px-6 pt-7 sm:px-10">
      <Link href="/" className="group block">
        <span className="font-display text-2xl uppercase leading-none tracking-brutal text-raw-ink">
          Daleel<span className="text-raw-red">Bites</span>
        </span>
        <span className="label-raw mt-1.5 block transition-colors group-hover:text-raw-red">
          UAE Voice Food Broker
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <span className="label-raw hidden sm:inline">Dubai, UAE</span>

        {loading ? (
          <span className="label-raw">···</span>
        ) : user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 border-b-2 border-raw-ink/20 pb-1 font-sans text-xs font-bold uppercase tracking-wide2 text-raw-ink transition-colors hover:border-raw-red hover:text-raw-red"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <UserIcon className="h-3.5 w-3.5" />
              {user.name || user.email}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-3 w-52 border-2 border-raw-ink bg-raw-base p-1 shadow-[6px_6px_0_0_var(--raw-ink)]"
              >
                <Link
                  href="/history"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-wide2 transition-colors hover:bg-raw-ink hover:text-raw-base"
                >
                  My cravings
                </Link>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans text-xs font-bold uppercase tracking-wide2 transition-colors hover:bg-raw-red hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/login" className="link-raw">
              Log in
            </Link>
            <Link
              href="/signup"
              className="bg-raw-ink px-4 py-2 font-sans text-[11px] font-bold uppercase tracking-wide2 text-raw-base transition-colors hover:bg-raw-red"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
