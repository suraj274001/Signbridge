import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, Moon, Sun, X, Languages, Type } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { FontScale, SpokenLanguageCode } from '../types/signbridge';

const NAV_LINKS = [
  { to: '/translate', label: 'Translate' },
  { to: '/speak', label: 'Speak' },
  { to: '/conversation', label: 'Conversation' },
  { to: '/library', label: 'Library' },
  { to: '/train', label: 'Train' },
  { to: '/lab', label: 'Lab' },
  { to: '/evaluation', label: 'Evaluation' },
  { to: '/about', label: 'About' },
];

export function Navbar() {
  const {
    theme,
    toggleTheme,
    spokenLanguage,
    setSpokenLanguage,
    signLanguage,
    setSignLanguage,
    fontScale,
    setFontScale,
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const cycleFontScale = () => {
    const order: FontScale[] = ['sm', 'md', 'lg', 'xl'];
    const idx = order.indexOf(fontScale);
    setFontScale(order[(idx + 1) % order.length]);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-700 focus:text-white focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          aria-label="SignBridge home"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="text-blue-700 dark:text-blue-400 shrink-0"
          >
            <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M7.5 14.5C7.5 11.8 9.2 9.5 12 9.5C14.8 9.5 16.5 11.8 16.5 14.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="8" cy="14.5" r="1.5" fill="currentColor" />
            <circle cx="16" cy="14.5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="9.5" r="1.5" fill="#0d9488" />
          </svg>
          <span>SignBridge</span>
        </Link>

        {/* Zone 2: Primary Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-5 text-sm font-medium"
        >
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400 border-blue-700 dark:border-blue-400'
                    : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Zone 3: Language, Accessibility Font Scale, Theme Toggle, Mobile Hamburger */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <label htmlFor="nav-lang-select" className="sr-only">
              Spoken language
            </label>
            <div className="relative flex items-center">
              <Languages className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-2.5 pointer-events-none" aria-hidden="true" />
              <select
                id="nav-lang-select"
                value={spokenLanguage}
                onChange={(e) => setSpokenLanguage(e.target.value as SpokenLanguageCode)}
                aria-label="Select spoken language"
                className="pl-7 pr-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                <option value="en-IN">English (IN)</option>
                <option value="hi-IN">हिन्दी (HI)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setSignLanguage(signLanguage === 'ISL' ? 'ASL' : 'ISL')}
              aria-label={`Sign language pack: ${signLanguage}. Click to switch.`}
              title={`Active sign pack: ${signLanguage}`}
              className="px-2.5 py-1.5 text-xs font-mono font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {signLanguage}
            </button>
          </div>

          <button
            type="button"
            onClick={cycleFontScale}
            aria-label={`Change text size (current: ${fontScale.toUpperCase()})`}
            title={`Text size: ${fontScale.toUpperCase()}`}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Type className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="font-mono uppercase">{fontScale}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-menu"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div
          id="mobile-nav-menu"
          className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 space-y-4"
        >
          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <label htmlFor="mobile-lang-select" className="sr-only">
              Spoken language
            </label>
            <select
              id="mobile-lang-select"
              value={spokenLanguage}
              onChange={(e) => setSpokenLanguage(e.target.value as SpokenLanguageCode)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">हिन्दी (Hindi)</option>
              <option value="en-US">English (US)</option>
            </select>

            <button
              type="button"
              onClick={() => setSignLanguage(signLanguage === 'ISL' ? 'ASL' : 'ISL')}
              className="px-3 py-2 text-xs font-mono font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              Pack: {signLanguage}
            </button>

            <button
              type="button"
              onClick={cycleFontScale}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              Text: {fontScale.toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
