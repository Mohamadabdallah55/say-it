import {createRoot} from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import './index.css';
import { installApiSessionFetch } from './utils/clientSession';

installApiSessionFetch();

createRoot(document.getElementById('root')!).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>);
