import { AuthProvider } from './context/AuthContext';
import { Router } from './router/Router';

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}

export default App;
