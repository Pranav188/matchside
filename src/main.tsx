import React from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');
createRoot(root).render(<React.StrictMode><App /><Analytics /></React.StrictMode>);
