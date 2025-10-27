import 'bootstrap/dist/css/bootstrap.min.css';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { UserContextProvider } from './context/UserContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <UserContextProvider>
    <App />
  </UserContextProvider>
)
