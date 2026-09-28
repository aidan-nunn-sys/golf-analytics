import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { useAuth } from "../auth/AuthContext";

import { UpdateNotice } from "./UpdateNotice";
const links = [
  { to: "/", label: "Dashboard", end: true, icon: "home" },
  { to: "/courses", label: "Courses", icon: "flag" },
  { to: "/rounds", label: "Rounds", icon: "card" },
  { to: "/bag", label: "Bag", icon: "bag" },
  { to: "/handicap", label: "Handicap", icon: "chart" },
  { to: "/advice", label: "Club advice", icon: "bag" },
  { to: "/gapping", label: "Gapping", icon: "chart" },
  { to: "/log", label: "Log shots", icon: "plus" },
  { to: "/sessions", label: "Sessions", icon: "card" },
  { to: "/offline", label: "Offline rounds", icon: "card" },
  { to: "/settings", label: "Settings", icon: "settings" },
];
const paths: Record<string, string> = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  flag: "M5 21V3m0 1h14l-4 4 4 4H5",
  card: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h4",
  bag: "M6 8h12l-1 13H7L6 8Zm3 0V3h2m3 5V2h2",
  chart: "M4 20V4m0 16h17M8 16v-5m5 5V7m5 9V3",
  plus: "M12 4v16M4 12h16",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  more: "M4 6h16M4 12h16M4 18h16",
};
function Icon({ name }: { name: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const playing = /^\/(?:rounds|offline)\/-?\d+$/.test(location.pathname);
  const [more, setMore] = useState(false);
  return (
    <div className={`min-h-screen bg-slate-50 ${playing ? "play-mode" : ""}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <NavLink to="/" className="flex items-center gap-3" aria-label="Golf Analytics home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900 text-lime-200"><Icon name="flag" /></span>
            <span><span className="block text-base font-bold tracking-tight">Golf Analytics</span><span className="block text-xs text-slate-500">Your game. Your data.</span></span>
          </NavLink>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-48 truncate text-slate-500 sm:block">{user?.display_name || user?.email}</span>
            <button onClick={logout} className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Sign out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden px-4 py-8 md:block">
          <nav aria-label="Main navigation" className="sticky top-28 space-y-1">
            <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Your clubhouse</p>
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${isActive ? "bg-emerald-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}><Icon name={l.icon} />{l.label}</NavLink>)}
          </nav>
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 px-4 py-6 pb-32 outline-none sm:px-8 md:py-8">{!playing && <UpdateNotice />}<PageErrorBoundary key={location.pathname}><Outlet /></PageErrorBoundary></main>
      </div>
      {more && <nav id="more-navigation" aria-label="More navigation" className="fixed bottom-24 left-4 right-4 z-40 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl md:hidden">
        {links.slice(4).map((l) => <NavLink key={l.to} to={l.to} onClick={() => setMore(false)} className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"><Icon name={l.icon} />{l.label}</NavLink>)}
      </nav>}
      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-2 pt-2 shadow-lg md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {links.slice(0, 4).map((l) => <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setMore(false)} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold ${isActive ? "bg-emerald-50 text-emerald-800" : "text-slate-500"}`}><Icon name={l.icon} />{l.label === "Dashboard" ? "Home" : l.label}</NavLink>)}
        <button type="button" aria-expanded={more} aria-controls="more-navigation" onClick={() => setMore(!more)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-slate-500"><Icon name="more" />More</button>
      </nav>
    </div>
  );
}
