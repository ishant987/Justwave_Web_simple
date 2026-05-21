import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { BillDashboardPage } from './pages/BillDashboardPage';
import { GeneratedPassesPage } from './pages/GeneratedPassesPage';
import { NewWalkInPage } from './pages/NewWalkInPage';
import { OccupancyPage } from './pages/OccupancyPage';
import { OvertimePage } from './pages/OvertimePage';
import { PassesPage } from './pages/PassesPage';
import { PaymentPage } from './pages/PaymentPage';
import { ScanEntryPage } from './pages/ScanEntryPage';
import { ScanExitPage } from './pages/ScanExitPage';
import { VisitHistoryPage } from './pages/VisitHistoryPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/walkin/new" replace />} />
        <Route path="/walkin/new" element={<NewWalkInPage />} />
        <Route path="/walkin/payment" element={<PaymentPage />} />
        <Route path="/walkin/scan-entry" element={<ScanEntryPage />} />
        <Route path="/walkin/overtime" element={<OvertimePage />} />
        <Route path="/walkin/scan-exit" element={<ScanExitPage />} />
        <Route path="/walkin/occupancy" element={<OccupancyPage />} />
        <Route path="/walkin/passes" element={<PassesPage />} />
        <Route path="/walkin/bills" element={<BillDashboardPage />} />
        <Route path="/walkin/generated-passes" element={<GeneratedPassesPage />} />
        <Route path="/walkin/history" element={<VisitHistoryPage />} />
      </Route>
    </Routes>
  );
}
