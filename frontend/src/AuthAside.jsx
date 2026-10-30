import { Icon } from './taskUi.jsx';

// The brand panel on the left of every sign-in and account-setup box.
const FEATURES = [
  { icon: 'tasks', title: 'Tasks and projects', text: 'Keep work moving and every deadline in view.' },
  { icon: 'flag', title: 'Goals and performance', text: 'Clear goals and fair ratings for everyone on the team.' },
  { icon: 'users', title: 'Skills and teams', text: 'Know who does what, and where each person is growing.' },
  { icon: 'pulse', title: 'Burnout insights', text: 'Spot overload early and look after your people.' },
];

function Pulse() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export default function AuthAside() {
  return (
    <aside className="auth-aside">
      <a className="brand brand-light" href="/" aria-label="Bayyinah home">
        <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
        <span className="brand-word">
          <span className="brand-latin">Bayyinah</span>
          <span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span>
        </span>
      </a>
      <h2>Everything your team needs, in one place.</h2>
      <ul className="auth-features">
        {FEATURES.map((feature, index) => (
          <li key={feature.title} style={{ '--i': index }}>
            <span className="auth-feature-icon">
              {feature.icon === 'pulse' ? <Pulse /> : <Icon name={feature.icon} size={20} />}
            </span>
            <span>
              <strong>{feature.title}</strong>
              <small>{feature.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
