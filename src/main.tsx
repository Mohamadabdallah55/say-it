import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AccountProvider } from './context/AccountContext';
import './index.css';
import { installApiSessionFetch } from './utils/clientSession';

installApiSessionFetch();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AccountProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </AccountProvider>
  </ErrorBoundary>,
);
