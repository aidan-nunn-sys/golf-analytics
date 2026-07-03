import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { Login } from "./routes/Login";
import { Dashboard } from "./routes/Dashboard";

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
        <Route path="log" element={<Placeholder name="Log" />} />
        <Route path="bag" element={<Placeholder name="Bag" />} />
        <Route path="clubs/:id" element={<Placeholder name="Club detail" />} />
        <Route path="gapping" element={<Placeholder name="Gapping" />} />
        <Route path="sessions" element={<Placeholder name="Sessions" />} />
        <Route path="settings" element={<Placeholder name="Settings" />} />
      </Route>
    </Routes>
  );
}
