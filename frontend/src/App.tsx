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
import { OfflineRounds } from "./routes/OfflineRounds";
import { CourseManage } from "./routes/CourseManage";
import { CourseFileImport } from "./routes/CourseFileImport";
import { CourseNew } from "./routes/CourseNew";
import { CourseDetail } from "./routes/CourseDetail";
import { ScorecardImport } from "./routes/ScorecardImport";
import { TeeSetup } from "./routes/TeeSetup";
import { RoundManage } from "./routes/RoundManage";
import { RoundHistory } from "./routes/RoundHistory";
import { lazy, Suspense } from "react";
const LiveRound = lazy(() => import("./routes/LiveRound").then((module) => ({ default: module.LiveRound })));
import { RoundSummary } from "./routes/RoundSummary";
import { RoundEntry } from "./routes/RoundEntry";
import { Handicap } from "./routes/Handicap";

import { BagAdvice } from "./routes/BagAdvice";
import { AppUpdates } from "./routes/AppUpdates";
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
        <Route path="offline" element={<OfflineRounds />} />
        <Route path="offline/:id" element={<Suspense fallback={<div role="status" className="panel">Opening your round…</div>}><LiveRound /></Suspense>} />
        <Route index element={<Dashboard />} />
        <Route path="log" element={<LogEntry />} />
        <Route path="bag" element={<Bag />} />
        <Route path="courses" element={<CourseSearch />} />
        <Route path="courses/file" element={<CourseFileImport />} />
        <Route path="courses/:id/edit" element={<CourseManage />} />
        <Route path="courses/new" element={<CourseNew />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="courses/:id/import" element={<ScorecardImport />} />
        <Route path="courses/:id/tees" element={<TeeSetup />} />
        <Route path="clubs/:id" element={<ClubDetail />} />
        <Route path="advice" element={<BagAdvice />} />
        <Route path="updates" element={<AppUpdates />} />
        <Route path="gapping" element={<Gapping />} />
        <Route path="rounds" element={<RoundHistory />} />
        <Route path="rounds/new" element={<RoundEntry />} />
        <Route path="handicap" element={<Handicap />} />
        <Route path="rounds/:id" element={<Suspense fallback={<div role="status" className="panel">Loading your round…</div>}><LiveRound /></Suspense>} />
        <Route path="rounds/:id/edit" element={<RoundManage />} />
        <Route path="rounds/:id/summary" element={<RoundSummary />} />
        <Route path="sessions" element={<SessionHistory />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
