import { Button } from '../components/ui/Button.jsx';
import { useAuth } from '../context/authContext.js';

// Temporary Phase 5 screen; replaced by the full chat layout in Phase 6.
export default function ChatPage() {
  const { user, logout } = useAuth();
  return (
    <main className="grid h-full place-items-center">
      <div className="text-center">
        <p className="mb-4">Signed in as {user.name}</p>
        <Button onClick={logout}>Log out</Button>
      </div>
    </main>
  );
}
