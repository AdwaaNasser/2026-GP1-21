import React from 'react';
import { createRoot } from 'react-dom/client';
import { SetPassword, Login, OrgSetup, ForgotPassword, ResetPassword } from './Auth.jsx';
import { Dashboard, DashboardRouter } from './Dashboard.jsx';
import { Home } from './Home.jsx';
import { EmployeePerformance, HRPerformance, ManagerGoals } from './Performance.jsx';
import { HrTeam, ManagerTeam } from './Team.jsx';
import { enhanceSelects } from './ui.jsx';
import { EmployeeTasks, ManagerProjects, ManagerTasks, ProjectDetails } from './Work.jsx';
import './styles.css';

const pages = {
  '/': Home,
  '/login': Login,
  '/setup': OrgSetup,
  '/set-password': SetPassword,
  '/forgot-password': ForgotPassword,
  '/reset-password': ResetPassword,
  '/dashboard/hr': () => <Dashboard role="HR" />,
  '/dashboard/manager': () => <DashboardRouter role="Manager" />,
  '/dashboard/employee': () => <DashboardRouter role="Employee" />,
  '/manager/projects': ManagerProjects,
  '/manager/project': () => <ProjectDetails role="Manager" />,
  '/manager/tasks': ManagerTasks,
  '/manager/goals': ManagerGoals,
  '/manager/team': ManagerTeam,
  '/employee/tasks': EmployeeTasks,
  '/employee/performance': EmployeePerformance,
  '/hr/performance': HRPerformance,
  '/hr/team': HrTeam,
  '/hr/employees': HrTeam, // the old Manage employees page now lives in Import team
  '/employee/project': () => <ProjectDetails role="Employee" />,
};

const Page = pages[window.location.pathname] || Home;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);

enhanceSelects();
