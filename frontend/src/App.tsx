import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { Login } from "./routes/Login";
import { Dashboard } from "./routes/Dashboard";
import { Bag } from "./routes/Bag";
import { LogEntry } from "./routes/LogEntry";
import { ClubDetail } from "./routes/ClubDetail";
import { Gapping } from "./routes/Gapping";
import { SessionHistory } from "./routes/SessionHistory";

function Placeholder({ name }: { name: string }) {
  return <div className="text-gray-500">{name} — coming soon.</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="log" element={<LogEntry />} />
        <Route path="bag" element={<Bag />} />
        <Route path="clubs/:id" element={<ClubDetail />} />
        <Route path="gapping" element={<Gapping />} />
        <Route path="sessions" element={<SessionHistory />} />
        <Route path="settings" element={<Placeholder name="Settings" />} />
      </Route>
    </Routes>
  );
}
