import { useEffect, useRef, useState } from 'react';

/* ==========================================================================
   Bayyinah landing page
   Its styles are in styles.css (section 18) and start with "lx-".
   SiteHeader and SiteFooter are still exported in case another page uses them.
   ========================================================================== */

// ==================== Shared helpers ====================

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// True once the element has scrolled into view (and stays true).
function useInView(threshold = 0.25) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold });
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const [ref, inView] = useInView(0.15);
  return (
    <Tag
      ref={ref}
      className={`lx-reveal${inView ? ' is-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function useCountUp(target, run, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return undefined;
    if (prefersReducedMotion()) {
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, duration]);
  return Math.round(value);
}

// Lets a card's glow follow the mouse.
function trackSpotlight(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--y', `${event.clientY - rect.top}px`);
}

function Example() {
  return <span className="lx-example">Illustrative example</span>;
}

function Brand({ small = false }) {
  return (
    <a className={`lx-brand${small ? ' lx-brand-small' : ''}`} href="/" aria-label="Bayyinah home">
      <img src="/bayyinah-logo.png" alt="" />
      <span>Bayyinah</span>
      <span className="lx-brand-ar" lang="ar" dir="rtl">بيّنة</span>
    </a>
  );
}

// ==================== Header ====================

const NAV = [
  ['#features', 'Features'],
  ['#burnout', 'Burnout assessment'],
  ['#assign', 'Task recommendations'],
  ['#roles', 'User roles'],
  ['#faq', 'FAQ'],
];

function LxHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`lx-header${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <a className="lx-skip" href="#main">Skip to content</a>
      <div className="lx-header-bar">
        <Brand />
        <nav className="lx-nav" aria-label="Main navigation">
          {NAV.map(([href, text]) => <a key={href} href={href}>{text}</a>)}
        </nav>
        <div className="lx-header-actions">
          <a className="lx-login" href="/login">Log in</a>
          <a className="lx-btn lx-btn-primary lx-btn-sm" href="/setup">Get started</a>
          <button
            type="button"
            className="lx-menu-btn"
            aria-expanded={open}
            aria-controls="lx-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            <span /><span />
          </button>
        </div>
      </div>
      <nav id="lx-mobile-nav" className="lx-mobile-nav" aria-label="Mobile navigation" hidden={!open}>
        {NAV.map(([href, text]) => <a key={href} href={href} onClick={() => setOpen(false)}>{text}</a>)}
        <a href="/login" onClick={() => setOpen(false)}>Log in</a>
        <a className="lx-btn lx-btn-primary" href="/setup">Get started</a>
      </nav>
    </header>
  );
}

// ==================== Hero ====================

const HEADLINE = ['Human', 'Resource', 'Management'];
const HEADLINE_ACCENT = ['and', 'Decision', 'Support'];

// Small line icons, drawn like the ones in the Bayyinah sidebar.
const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  tasks: <><path d="M3 6l2 2 3-3M3 13l2 2 3-3" /><path d="M11 7h10M11 14h10M11 20h10" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  performance: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

function Icon({ name }) {
  return (
    <svg className="lxm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const SIDE_NAV = [['overview', 'Overview'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['team', 'My team'], ['performance', 'Performance']];
const RISK_BARS = [['Low', 11, 'low'], ['Medium', 5, 'med'], ['High', 2, 'high']];

function HeroApp() {
  const ref = useRef(null);

  const onMove = (event) => {
    if (prefersReducedMotion()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    ref.current?.style.setProperty('--rx', `${(-py * 6).toFixed(2)}deg`);
    ref.current?.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="lx-stage" onMouseMove={onMove} onMouseLeave={onLeave}>
      <span className="lx-stage-badge"><Example /></span>
      <div className="lx-app lxm-app" ref={ref} role="img" aria-label="Illustrative Bayyinah manager overview showing task priorities and team workload">
        <aside className="lxm-side" aria-hidden="true">
          <div className="lxm-brand"><img src="/bayyinah-logo.png" alt="" /> Bayyinah</div>
          <nav>
            {SIDE_NAV.map(([icon, label], index) => (
              <span key={label} className={index === 0 ? 'is-active' : ''}><Icon name={icon} />{label}</span>
            ))}
          </nav>
          <div className="lxm-me"><span className="lxm-av lxm-av-dark">KA</span><span><b>Khalid Alsubaie</b><small>Manager</small></span></div>
        </aside>

        <div className="lxm-main" aria-hidden="true">
          <div className="lxm-top">
            <span className="lxm-page-icon"><Icon name="overview" /></span>
            <span className="lxm-top-title"><small>Workspace <i>›</i> <em>Overview</em></small><b>Overview</b></span>
            <span className="lxm-date"><Icon name="calendar" />Sunday 1 November</span>
            <span className="lxm-role">Manager</span>
            <span className="lxm-user"><Icon name="user" /></span>
          </div>

          <div className="lxm-content">
            <div className="lxm-hero">
              <div className="lxm-hero-copy">
                <b>Welcome, Khalid.</b>
                <p>18 open tasks across your team.</p>
                <div className="lxm-actions">
                  <span className="lxm-btn-orange"><Icon name="team" />View my team</span>
                  <span className="lxm-btn-line"><Icon name="tasks" />Open tasks</span>
                </div>
              </div>
              <div className="lxm-chart">
                <small>Open tasks by priority</small>
                <div className="lxm-bars">
                  {RISK_BARS.map(([label, value, level], index) => (
                    <span key={label} className={`lxm-bar lxm-bar-${level}`} style={{ '--h': `${(value / 11) * 100}%`, animationDelay: `${1000 + index * 160}ms` }}>
                      <b>{value}</b><i /><small>{label}</small>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="lxm-stats">
              <div><b>4</b><small>Projects</small></div>
              <div><b>18</b><small>Open tasks</small></div>
              <div className="lxm-stat-alert"><b>2</b><small>High priority</small></div>
              <div><b>0</b><small>Overdue</small></div>
            </div>
          </div>
        </div>
      </div>

      <div className="lx-float lx-float-alert" aria-hidden="true">
        <span className="lx-pulse" />
        <span><b>2 high-priority tasks</b><small>Review task priorities</small></span>
      </div>
      <div className="lx-float lx-float-suggest" aria-hidden="true">
        <span className="lx-float-icon">✦</span>
        <span><b>Suggested for “Fix bugs”: Nasser A.</b><small>Skills match · Estimated availability</small></span>
        <span className="lx-float-btn">Review</span>
      </div>
    </div>
  );
}

function Hero() {
  const ref = useRef(null);
  const onMove = (event) => {
    const rect = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    ref.current.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  let word = 0;
  return (
    <section className="lx-hero" ref={ref} onMouseMove={onMove} aria-labelledby="lx-hero-title">
      <div className="lx-hero-glow" aria-hidden="true" />
      <div className="lx-grid-bg" aria-hidden="true" />

      <div className="lx-wrap lx-hero-copy">
        <span className="lx-badge lx-fade" style={{ animationDelay: '0ms' }}>
          <span className="lx-badge-dot" /> AI-assisted HR platform for small and medium-sized businesses
        </span>
        <h1 id="lx-hero-title" className="lx-h1">
          {HEADLINE.map((text) => <span key={text} className="lx-word" style={{ animationDelay: `${120 + (word++) * 70}ms` }}>{text} </span>)}
          {HEADLINE_ACCENT.map((text) => <span key={text} className="lx-word lx-accent" style={{ animationDelay: `${120 + (word++) * 70}ms` }}>{text} </span>)}
        </h1>
        <p className="lx-hero-lead lx-fade" style={{ animationDelay: '750ms' }}>
          Bayyinah brings employee records, projects, tasks and performance goals into one platform for small and medium-sized enterprises (SMEs), with task recommendations and burnout risk prediction to support managers.
        </p>
        <div className="lx-actions lx-fade" style={{ animationDelay: '900ms' }}>
          <a className="lx-btn lx-btn-primary" href="/setup">Set up your organisation <span aria-hidden="true">→</span></a>
          <a className="lx-btn lx-btn-ghost" href="/login">Log in</a>
        </div>
      </div>

      <div className="lx-wrap lx-fade lx-hero-visual" style={{ animationDelay: '600ms' }}>
        <HeroApp />
      </div>
    </section>
  );
}

// ==================== Numbers ====================

const FACTS = [
  ['Employee management', 'Manage employee records, skills and organisational information.'],
  ['Projects & tasks', 'Manage projects, assign tasks and monitor work progress.'],
  ['Performance management', 'Set performance goals and track employee progress.'],
];

function Numbers() {
  return (
    <section className="lx-section lx-numbers" id="features" aria-labelledby="lx-numbers-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">Key features</span>
          <h2 id="lx-numbers-title" className="lx-h2">Core <span className="lx-accent">Management Features</span></h2>
        </Reveal>
        <div className="lx-facts">
          {FACTS.map(([title, text], index) => (
            <Reveal key={title} className="lx-fact" delay={index * 120}>
              <strong style={{fontSize: 'clamp(1.5rem, 3vw, 2.4rem)'}}>{title}</strong>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==================== Feature: burnout ====================

const FACTORS = [
  ['Stress score', 90, '+1.2', 'up'],
  ['Planned weekly hours', 45, '+0.6', 'up'],
  ['Sleep hours', 30, '−0.4', 'down'],
];

function BurnoutCard() {
  const [ref, inView] = useInView(0.35);
  const score = useCountUp(82, inView, 1500);
  return (
    <div ref={ref} className={`lxm lxm-window lx-demo${inView ? ' is-in' : ''}`}>
      <div className="lxm-profile">
        <span className="lxm-av lxm-av-big" aria-hidden="true">LA</span>
        <span className="lxm-profile-name"><b>Lama Alanazi</b><small>Backend Developer · IT</small></span>
        <div className="lxm-tiles">
          <div className="lxm-tile-risk"><small>Predicted score</small><b>{(score / 10).toFixed(1)}/10</b></div>
          <div><small>BAT zone</small><b>Red</b></div>
          <div><small>Combined status</small><b>Strong signal</b></div>
        </div>
      </div>

      <div className="lxm-card">
        <div className="lxm-card-head"><b>Illustrative risk estimate</b><Example /></div>
        <div className="lxm-risk-body">
          <div className="lxm-ring" role="img" aria-label="Example predicted burnout score: 8.2 out of 10, severe">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="lxm-ring-track" cx="50" cy="50" r="40" pathLength="100" />
              <circle className="lxm-ring-value" cx="50" cy="50" r="40" pathLength="100" />
            </svg>
            <span aria-hidden="true"><b>{(score / 10).toFixed(1)}</b><small>Severe · /10</small></span>
          </div>
          <div className="lxm-factors">
            <p>Largest model contributions (SHAP)</p>
            {FACTORS.map(([name, width, value, dir], index) => (
              <div className="lx-factor" key={name} style={{ '--d': `${400 + index * 140}ms` }}>
                <span>{name}</span>
                <span className="lxm-track"><i className={dir === 'up' ? 'lxm-fill-high' : 'lxm-fill-low'} style={{ '--w': `${width}%` }} /></span>
                <em className={dir === 'up' ? 'lxm-text-high' : 'lxm-text-low'}>{value}</em>
              </div>
            ))}
          </div>
        </div>
        <p className="lxm-note">Example values only. Model contributions do not establish causation.</p>
      </div>
    </div>
  );
}

// ==================== Feature: smart assignment ====================

const CANDIDATES = [
  ['NA', 'Nasser Alanazi', 'QA Engineer', 92, 'Top-ranked', ['Django · advanced', 'Python · advanced'], 'Estimated available: 12h'],
  ['FA', 'Fahad Alharthi', 'Mobile Developer', 74, 'Next-ranked', ['Python · intermediate', 'Django · intermediate'], 'Estimated available: 8h'],
];

function AssignCard() {
  const [ref, inView] = useInView(0.35);
  return (
    <div ref={ref} className={`lxm lxm-window lx-demo${inView ? ' is-in' : ''}`}>
      <div className="lxm-card">
        <div className="lxm-card-head"><b>Suggested assignees</b><Example /></div>
        <div className="lxm-task">
          <span className="lxm-task-name"><b>Fix bugs from the last release</b><small><Icon name="projects" />HR Portal v2 · Due 20 Nov</small></span>
          <span className="lxm-pill lxm-pill-flag">⚑ High</span>
        </div>
        <div className="lxm-needs"><small>Needs</small><span className="lxm-skill">Python · intermediate</span><span className="lxm-skill">Django · intermediate</span></div>

        <ol className="lxm-people">
          {CANDIDATES.map(([initials, name, job, match, fit, skills, free], index) => (
            <li key={name} className={`lx-candidate${index === 0 ? ' is-best' : ''}`} style={{ '--d': `${300 + index * 220}ms` }}>
              <div className="lxm-person">
                <span className="lxm-av" aria-hidden="true">{initials}</span>
                <span className="lxm-person-name"><b>{name}</b><small>{job}</small></span>
                <span className={`lxm-pill ${index === 0 ? 'lxm-pill-done' : 'lxm-pill-todo'}`}><i />{fit}</span>
              </div>
              <div className="lxm-person-body">
                <div className="lxm-skills">{skills.map((skill) => <span key={skill} className="lxm-skill">{skill}</span>)}</div>
                <div className="lx-match">
                  <span className="lxm-track"><i className="lxm-fill-orange" style={{ '--w': `${match}%` }} /></span>
                  <em>{match}/100</em>
                </div>
                <small className="lxm-free">{free}</small>
              </div>
              {index === 0 && <span className="lxm-assign">Assign</span>}
            </li>
          ))}
        </ol>

        <div className="lx-excluded lxm-excluded" style={{ '--d': '800ms' }}>
          <span className="lxm-av lxm-av-muted" aria-hidden="true">LA</span>
          <span><b>Lama Alanazi</b> not eligible</span>
          <span className="lxm-pill lxm-pill-todo"><i />No working days available</span>
        </div>
      </div>
    </div>
  );
}

function Feature({ id, eyebrow, title, accent, lead, points, flip = false, children }) {
  return (
    <section className="lx-section" id={id} aria-labelledby={`${id}-title`}>
      <div className={`lx-wrap lx-feature${flip ? ' lx-feature-flip' : ''}`}>
        <Reveal className="lx-feature-copy">
          <span className="lx-eyebrow">{eyebrow}</span>
          <h2 id={`${id}-title`} className="lx-h2">{title} <span className="lx-accent">{accent}</span></h2>
          <p className="lx-lead">{lead}</p>
          <ul className="lx-points">
            {points.map(([head, text]) => (
              <li key={head}>
                <span className="lx-check" aria-hidden="true">✓</span>
                <span><b>{head}</b><small>{text}</small></span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="lx-feature-visual" delay={120}>{children}</Reveal>
      </div>
    </section>
  );
}

// ==================== Roles ====================

const ROLES = [
  ['HR', 'Manage your organisation', 'Maintain employee records and manage access to the organisation.', ['Employee records', 'Organisation setup', 'Employee invitations']],
  ['Manager', 'Manage your team', 'Plan work, follow team progress and review recommendations before making decisions.', ['Task recommendations', 'Projects and goals', 'Team burnout insights']],
  ['Employee', 'Manage your work', 'Know what is assigned to you, follow your goals and update your progress.', ['Assigned tasks', 'Goals and progress', 'Monthly burnout survey']],
];

function Roles() {
  return (
    <section className="lx-section" id="roles" aria-labelledby="lx-roles-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">User roles</span>
          <h2 id="lx-roles-title" className="lx-h2">Platform Users <span className="lx-accent">and Access</span></h2>
          <p className="lx-lead">Bayyinah provides role-based access for HR professionals, managers and employees according to their responsibilities.</p>
        </Reveal>
        <div className="lx-roles">
          {ROLES.map(([role, title, text, list], index) => (
            <Reveal as="article" key={role} className="lx-card lx-role" delay={index * 120} onMouseMove={trackSpotlight}>
              <span className="lx-role-tag">{role}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <ul>{list.map((item) => <li key={item}>{item}</li>)}</ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==================== Steps ====================

const STEPS = [
  ['Set up your organisation', 'Add employee records individually or import a CSV file, then invite employees to join.'],
  ['Work management', 'Create projects and goals, assign tasks and follow employee progress.'],
  ['Decision support', 'Managers review task recommendations and team burnout insights as part of their decisions.'],
];

function Steps() {
  const [ref, inView] = useInView(0.3);
  return (
    <section className="lx-section" id="how" aria-labelledby="lx-how-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">How it works</span>
          <h2 id="lx-how-title" className="lx-h2">Getting Started <span className="lx-accent">with Bayyinah</span></h2>
        </Reveal>
        <ol ref={ref} className={`lx-steps${inView ? ' is-in' : ''}`}>
          {STEPS.map(([title, text], index) => (
            <li key={title} className="lx-step" style={{ '--d': `${index * 260}ms` }}>
              <span className="lx-step-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ==================== FAQ ====================

const FAQ = [
  ['What is Bayyinah?', 'Bayyinah is an AI-assisted HR platform that brings employee management, work management and managerial decision support together.'],
  ['How are employees recommended for tasks?', 'Eligible team members are ranked using available information on skills, relevant experience and estimated availability. Recommendations do not guarantee that a new task fits the employee’s schedule.'],
  ['How does burnout risk prediction work?', 'A monthly survey provides employee responses, which are used with work-related and employee data to estimate a burnout score. The manager reviews the estimate alongside the BAT-12 assessment.'],
  ['Who is Bayyinah for?', 'Bayyinah is designed for small and medium-sized enterprises that need to organise employee information and work in one platform, with decision support for managers.'],
  ['Can Bayyinah diagnose burnout?', 'No. Bayyinah uses a monthly BAT-12 assessment and a separate model estimate. Their categories are interpreted together to guide managerial follow-up, not medical diagnosis.'],
  ['Does Bayyinah assign tasks automatically?', 'No. Bayyinah ranks eligible employees using relevant skills, experience and estimated availability, including task similarity when available. Managers review suggestions and make the final decision. Availability is an estimate, not a guarantee.'],
  ['Who can access employee information and burnout results?', 'Access depends on role. HR manages employee records, managers access their own teams, and employees access their own work. Individual burnout results are available to the authorised manager, not employees or HR.'],
  ['How do employees join?', 'HR adds them one by one or imports a CSV file. Each person gets an email invitation and sets their own password.'],
];

function Faq() {
  return (
    <section className="lx-section" id="faq" aria-labelledby="lx-faq-title">
      <div className="lx-wrap lx-faq">
        <Reveal className="lx-head">
          <span className="lx-eyebrow">FAQ</span>
          <h2 id="lx-faq-title" className="lx-h2">Frequently Asked <span className="lx-accent">Questions</span></h2>
          <p className="lx-lead">Find answers about using Bayyinah, its recommendations and access to employee information.</p>
        </Reveal>
        <Reveal className="lx-faq-list" delay={120}>
          {FAQ.map(([question, answer]) => (
            <details key={question} className="lx-faq-item">
              <summary>{question}<span className="lx-plus" aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ==================== Closing CTA ====================

function Cta() {
  return (
    <section className="lx-section lx-cta-section" aria-labelledby="lx-cta-title">
      <div className="lx-wrap">
        <Reveal className="lx-cta" onMouseMove={trackSpotlight}>
          <div className="lx-cta-glow" aria-hidden="true" />
          <h2 id="lx-cta-title" className="lx-h2">Get Started <span className="lx-accent">with Bayyinah</span></h2>
          <p className="lx-lead">Register your organisation to access employee management and decision-support features.</p>
          <div className="lx-actions">
            <a className="lx-btn lx-btn-primary" href="/setup">Get started <span aria-hidden="true">→</span></a>
            <a className="lx-btn lx-btn-ghost" href="/login">Log in</a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ==================== Footer ====================

const FOOTER_COLUMNS = [
  ['Product', [['#burnout', 'Burnout assessment'], ['#assign', 'Task recommendations'], ['#roles', 'User roles'], ['#how', 'How it works']]],
  ['Help', [['#faq', 'FAQ'], ['/forgot-password', 'Reset password']]],
  ['Account', [['/login', 'Log in'], ['/setup', 'Set up your organisation']]],
];

function LxFooter() {
  return (
    <footer className="lx-footer">
      <div className="lx-wrap lx-footer-grid">
        <div className="lx-footer-brand">
          <Brand small />
          <p>An AI-assisted human resource management platform for small and medium-sized enterprises.</p>
        </div>
        {FOOTER_COLUMNS.map(([title, links]) => (
          <nav key={title} className="lx-footer-col" aria-label={title}>
            <h3>{title}</h3>
            {links.map(([href, text]) => <a key={href} href={href}>{text}</a>)}
          </nav>
        ))}
      </div>
      <div className="lx-wrap lx-footer-bottom">
        <span>© 2026 Bayyinah. All rights reserved.</span>
        <a href="#main">Back to top ↑</a>
      </div>
    </footer>
  );
}

// ==================== Page ====================

export function Home() {
  return (
    <div className="lx">
      <LxHeader />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Numbers />
        <Feature
          id="burnout"
          eyebrow="Burnout assessment and prediction"
          title="Employee Burnout"
          accent="Assessment and Prediction"
          lead="Review employee-reported burnout assessments and machine learning estimates to support managerial follow-up."
          points={[
            ['Burnout assessment', 'Employees complete a monthly survey that includes the 12-item Burnout Assessment Tool (BAT-12).'],
            ['Burnout risk prediction', 'Estimate burnout scores using employee responses and work-related data.'],
            ['Explainable predictions', 'Review the three main model contributions alongside the assessment and estimated score. Results support follow-up, not medical diagnosis.'],
          ]}
        >
          <BurnoutCard />
        </Feature>
        <Feature
          id="assign"
          flip
          eyebrow="Task recommendations"
          title="Employee Recommendations"
          accent="for Task Assignment"
          lead="Review ranked suggestions based on skills, relevant experience and estimated availability. Managers make the final assignment decision."
          points={[
            ['Skill matching', 'Identify employees who meet required skills and minimum skill levels and have working days available.'],
            ['Estimated availability', 'Consider estimated availability during the task period based on planned tasks, meetings and approved leave.'],
            ['Relevant experience', 'Consider completed work and semantic similarity when available.'],
          ]}
        >
          <AssignCard />
        </Feature>
        <Roles />
        <Steps />
        <Faq />
        <Cta />
      </main>
      <LxFooter />
    </div>
  );
}

// ==================== Old header and footer ====================
// The homepage no longer uses these. They stay exactly as before
// in case another page (for example Auth.jsx) still imports them.

const LINKS = [
  ['#burnout', 'Burnout insights'],
  ['#how', 'How it works'],
  ['#about', 'About us'],
  ['#faq', 'FAQ'],
];

export function SiteHeader() {
  return (
    <div className="mk-sticky">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Bayyinah home">
          <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
          <span className="brand-word"><span className="brand-latin">Bayyinah</span><span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span></span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          {LINKS.map(([href, text]) => <a key={href} className="nav-login mk-link" href={`/${href}`}>{text}</a>)}
          <a className="nav-login" href="/login">Log in</a>
          <a className="button button-primary button-small" href="/setup">Get started</a>
        </nav>
      </header>
    </div>
  );
}

const LINKS_SiteFooter = [
  ['/#burnout', 'Burnout insights'],
  ['/#faq', 'FAQ'],
  ['/login', 'Log in'],
];

export function SiteFooter() {
  return (
    <footer className="site-footer mk-footer">
      <a className="brand footer-brand" href="/" aria-label="Bayyinah home">
        <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
        <span className="brand-word"><span className="brand-latin">Bayyinah</span><span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span></span>
      </a>
      <nav className="mk-footer-links" aria-label="Footer">
        {LINKS_SiteFooter.map(([href, text]) => <a key={href} href={href}>{text}</a>)}
      </nav>
      <span>© 2026 Bayyinah Platform. All rights reserved.</span>
    </footer>
  );
}