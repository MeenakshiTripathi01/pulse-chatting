import { Navigate, Route, Routes } from 'react-router';
import { ProtectedRoute, PublicOnlyRoute } from './components/routing/RouteGuards.jsx';
import { FullPageStatus } from './components/ui/FullPageStatus.jsx';
import { useAuth } from './context/authContext.js';
import ChatPage from './pages/ChatPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

export default function App() {
  const { status, error, retry } = useAuth();

  if (status === 'error') {
    return <FullPageStatus error={`We couldn't check your session. ${error}`} onRetry={retry} />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
