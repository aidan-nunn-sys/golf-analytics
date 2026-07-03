import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/log", label: "Log" },
  { to: "/bag", label: "Bag" },
  { to: "/gapping", label: "Gapping" },
  { to: "/sessions", label: "Sessions" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center gap-4 border-b bg-white px-4 py-3 text-sm">
        <span className="font-semibold">⛳ Golf</span>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? "text-green-700 font-medium" : "text-gray-600")}
          >
            {l.label}
          </NavLink>
        ))}
        <button onClick={logout} className="ml-auto text-gray-500 hover:text-gray-800">
          {user?.display_name || user?.email} · Sign out
        </button>
      </nav>
      <main className="mx-auto max-w-3xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
