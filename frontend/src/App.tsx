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
import { Settings } from "./routes/Settings";
import { CourseSearch } from "./routes/CourseSearch";
import { CourseNew } from "./routes/CourseNew";
import { CourseDetail } from "./routes/CourseDetail";
import { TeeSetup } from "./routes/TeeSetup";
import { RoundHistory } from "./routes/RoundHistory";
import { LiveRound } from "./routes/LiveRound";
import { RoundSummary } from "./routes/RoundSummary";
import { RoundEntry } from "./routes/RoundEntry";
import { Handicap } from "./routes/Handicap";

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
        <Route path="courses" element={<CourseSearch />} />
        <Route path="courses/new" element={<CourseNew />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="courses/:id/tees" element={<TeeSetup />} />
        <Route path="clubs/:id" element={<ClubDetail />} />
        <Route path="gapping" element={<Gapping />} />
        <Route path="rounds" element={<RoundHistory />} />
        <Route path="rounds/new" element={<RoundEntry />} />
        <Route path="handicap" element={<Handicap />} />
        <Route path="rounds/:id" element={<LiveRound />} />
        <Route path="rounds/:id/summary" element={<RoundSummary />} />
        <Route path="sessions" element={<SessionHistory />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
