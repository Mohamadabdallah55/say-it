import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AccountProvider } from './context/AccountContext';
import './index.css';
import { installApiSessionFetch } from './utils/clientSession';

installApiSessionFetch();

// Load diagnostics only when explicitly requested in the current browser.
if (new URLSearchParams(window.location.search).get('perf') === '1') {
  void import('./utils/performanceDiagnostics').then(m => m.installPerformanceDiagnostics()).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AccountProvider>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </AccountProvider>
  </ErrorBoundary>,
);
