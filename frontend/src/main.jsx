import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard from './Dashboard.jsx';
import Home from './Home.jsx';
import Login from './Login.jsx';
import OrgSetup from './OrgSetup.jsx';
import ForgotPassword from './ForgotPassword.jsx';
import ResetPassword from './ResetPassword.jsx';
import './style.css';

const pages = {
  '/': Home,
  '/login': Login,
  '/setup': OrgSetup,
  '/set-password': App,
  '/forgot-password': ForgotPassword,
  '/reset-password': ResetPassword,
  '/dashboard/hr': () => <Dashboard role="HR" />,
  '/dashboard/manager': () => <Dashboard role="Manager" />,
  '/dashboard/employee': () => <Dashboard role="Employee" />,
};
const Page = pages[window.location.pathname] || Home;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
