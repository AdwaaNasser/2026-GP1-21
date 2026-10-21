import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Dashboard, { DashboardRouter } from './Dashboard.jsx';
import Home from './Home.jsx';
import Login from './Login.jsx';
import OrgSetup from './OrgSetup.jsx';
import ForgotPassword from './ForgotPassword.jsx';
import ResetPassword from './ResetPassword.jsx';
import EmployeeTasks from './EmployeeTasks.jsx';
import ManagerProjects from './ManagerProjects.jsx';
import ManagerTasks from './ManagerTasks.jsx';
import ProjectDetails from './ProjectDetails.jsx';
import './style.css';


const pages = {
  '/': Home,
  '/login': Login,
  '/setup': OrgSetup,
  '/set-password': App,
  '/forgot-password': ForgotPassword,
  '/reset-password': ResetPassword,
  '/dashboard/hr': () => <Dashboard role="HR" />,
  '/dashboard/manager': () => <DashboardRouter role="Manager" />,
  '/dashboard/employee': () => <DashboardRouter role="Employee" />,
  '/manager/projects': ManagerProjects,
  '/manager/project': () => <ProjectDetails role="Manager" />,
  '/manager/tasks': ManagerTasks,
  '/employee/tasks': EmployeeTasks,
  '/employee/project': () => <ProjectDetails role="Employee" />,
};

const Page = pages[window.location.pathname] || Home;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
