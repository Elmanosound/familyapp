import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { DashboardPage } from '../pages/DashboardPage';
import { CalendarPage } from '../pages/CalendarPage';
import { ListsPage } from '../pages/ListsPage';
import { ChatPage } from '../pages/ChatPage';
import { MediaPage } from '../pages/MediaPage';
import { LocationPage } from '../pages/LocationPage';
import { BudgetPage } from '../pages/BudgetPage';
import { MealPlanPage } from '../pages/MealPlanPage';
import { FamilySettingsPage } from '../pages/FamilySettingsPage';
import { ProfilePage } from '../pages/ProfilePage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="location" element={<LocationPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="meals" element={<MealPlanPage />} />
          <Route path="family/settings" element={<FamilySettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
