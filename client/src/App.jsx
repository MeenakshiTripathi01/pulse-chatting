import { Route, Routes } from 'react-router';
import { ProtectedRoute, PublicOnlyRoute } from './components/routing/RouteGuards.jsx';
import { FullPageStatus } from './components/ui/FullPageStatus.jsx';
import { useAuth } from './context/authContext.js';
import { SocketProvider } from './context/SocketProvider.jsx';
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
      {/* One route for "/" and "/c/:conversationId" so the socket and chat state survive
          switching conversations. ChatPage reads the conversation id from the URL. */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SocketProvider>
              <ChatPage />
            </SocketProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
