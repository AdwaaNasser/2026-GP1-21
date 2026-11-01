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
  ['#burnout', 'Burnout insights'],
  ['#assign', 'Smart assignment'],
  ['#roles', 'For your team'],
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

const HEADLINE = ['See', 'your', 'workforce', 'clearly.'];
const HEADLINE_ACCENT = ['Decide', 'with', 'confidence.'];

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
                <b>Good evening, Khalid.</b>
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
        <span><b>2 high-priority tasks</b><small>Review upcoming deadlines</small></span>
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
          <span className="lx-badge-dot" /> Workforce insights + smart task recommendations
        </span>
        <h1 id="lx-hero-title" className="lx-h1">
          {HEADLINE.map((text) => <span key={text} className="lx-word" style={{ animationDelay: `${120 + (word++) * 70}ms` }}>{text} </span>)}
          {HEADLINE_ACCENT.map((text) => <span key={text} className="lx-word lx-accent" style={{ animationDelay: `${120 + (word++) * 70}ms` }}>{text} </span>)}
        </h1>
        <p className="lx-hero-lead lx-fade" style={{ animationDelay: '750ms' }}>
          Bayyinah brings employee records, projects, tasks and goals into one workspace.
          It supports task-assignment decisions and helps HR review burnout-related insights.
        </p>
        <div className="lx-actions lx-fade" style={{ animationDelay: '900ms' }}>
          <a className="lx-btn lx-btn-primary" href="/setup">Set up your organization <span aria-hidden="true">→</span></a>
          <a className="lx-btn lx-btn-ghost" href="/login">I already have an account</a>
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
  [67, 'of full-time employees feel burned out at work at least sometimes.'],
  [48, 'of employees in the Middle East and North Africa felt a lot of stress the day before.'],
  [14, 'of employees in the Middle East and North Africa feel engaged at work.'],
];

function Fact({ value, text, delay }) {
  const [ref, inView] = useInView(0.4);
  const shown = useCountUp(value, inView);
  return (
    <Reveal className="lx-fact" delay={delay}>
      <strong ref={ref}>
        <span className="lx-sr">{value}%</span>
        <span aria-hidden="true">{shown}<small>%</small></span>
      </strong>
      <p>{text}</p>
    </Reveal>
  );
}

function Numbers() {
  return (
    <section className="lx-section lx-numbers" aria-labelledby="lx-numbers-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">Why it matters</span>
          <h2 id="lx-numbers-title" className="lx-h2">Workplace pressure is real. <span className="lx-accent">Better decisions need context.</span></h2>
        </Reveal>
        <div className="lx-facts">
          {FACTS.map(([value, text], index) => <Fact key={text} value={value} text={text} delay={index * 120} />)}
        </div>
        <p className="lx-source">
          Sources: Gallup,{' '}
          <a href="https://www.gallup.com/workplace/237059/employee-burnout-part-main-causes.aspx" target="_blank" rel="noreferrer">Employee Burnout, Part 1</a>
          {' '}(2018, nearly 7,500 full-time employees) and{' '}
          <a href="https://www.gallup.com/file/workplace/697829/SOGW_Region_2025_MiddleEastAndNorthAfrica.pdf" target="_blank" rel="noreferrer">State of the Global Workplace</a>
          {' '}(2025, Middle East and North Africa).
        </p>
      </div>
    </section>
  );
}

// ==================== Feature: burnout ====================

const FACTORS = [
  ['Overdue tasks', 90, '+31', 'up'],
  ['Overtime hours', 66, '+22', 'up'],
  ['Meeting load', 42, '+14', 'up'],
  ['Days off taken', 24, '−8', 'down'],
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
          <div className="lxm-tile-risk"><small>Burnout risk</small><b>{score}%</b></div>
          <div><small>Open tasks</small><b>5</b></div>
          <div><small>Overdue</small><b>3</b></div>
        </div>
      </div>

      <div className="lxm-card">
        <div className="lxm-card-head"><b>Illustrative risk estimate</b><Example /></div>
        <div className="lxm-risk-body">
          <div className="lxm-ring" role="img" aria-label="Example burnout risk: 82 percent, high">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle className="lxm-ring-track" cx="50" cy="50" r="40" pathLength="100" />
              <circle className="lxm-ring-value" cx="50" cy="50" r="40" pathLength="100" />
            </svg>
            <span aria-hidden="true"><b>{score}%</b><small>High risk</small></span>
          </div>
          <div className="lxm-factors">
            <p>Sample explanatory factors</p>
            {FACTORS.map(([name, width, value, dir], index) => (
              <div className="lx-factor" key={name} style={{ '--d': `${400 + index * 140}ms` }}>
                <span>{name}</span>
                <span className="lxm-track"><i className={dir === 'up' ? 'lxm-fill-high' : 'lxm-fill-low'} style={{ '--w': `${width}%` }} /></span>
                <em className={dir === 'up' ? 'lxm-text-high' : 'lxm-text-low'}>{value}</em>
              </div>
            ))}
          </div>
        </div>
        <p className="lxm-note">Illustrative values only; not a live prediction or clinical diagnosis.</p>
      </div>
    </div>
  );
}

// ==================== Feature: smart assignment ====================

const CANDIDATES = [
  ['NA', 'Nasser Alanazi', 'QA Engineer', 92, 'Best match', ['Django · advanced', 'Python · advanced'], 'Estimated available: 12h'],
  ['FA', 'Fahad Alharthi', 'Mobile Developer', 74, 'Good match', ['Python · intermediate'], 'Estimated available: 8h'],
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
                  <em>{match}%</em>
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
          <span className="lxm-pill lxm-pill-todo"><i />Unavailable in task period</span>
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
  ['HR', 'Support people with better information', 'Maintain employee records and review workforce and burnout-related information through dedicated HR views.', ['Employee records', 'Burnout management', 'Organization overview']],
  ['Manager', 'Plan work with more context', 'Manage projects and tasks, follow goals, and review recommendations before assigning work.', ['Smart task assignment', 'Projects and tasks', 'Goals and KPIs']],
  ['Employee', 'Stay connected to your work', 'View assigned tasks and goals, update task status, and follow your own progress.', ['My assigned tasks', 'Goals and progress', 'My work information']],
];

function Roles() {
  return (
    <section className="lx-section" id="roles" aria-labelledby="lx-roles-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">For your team</span>
          <h2 id="lx-roles-title" className="lx-h2">One workspace. <span className="lx-accent">Three views.</span></h2>
          <p className="lx-lead">HR, managers and employees access different views based on their responsibilities.</p>
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
  ['Set up', 'HR adds employees or imports them using a CSV file, then invites users to join.'],
  ['Organize work', 'Managers manage projects, goals and tasks, and review employee suggestions before assignment.'],
  ['Review insights', 'HR reviews burnout assessments and predictive risk insights as support for follow-up, not diagnosis.'],
];

function Steps() {
  const [ref, inView] = useInView(0.3);
  return (
    <section className="lx-section" id="how" aria-labelledby="lx-how-title">
      <div className="lx-wrap">
        <Reveal className="lx-head lx-head-center">
          <span className="lx-eyebrow">How it works</span>
          <h2 id="lx-how-title" className="lx-h2">Up and running in <span className="lx-accent">three steps.</span></h2>
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
  ['How does Bayyinah support burnout management?', 'It combines BAT-based burnout assessment with a separate predictive risk estimate. These insights support HR review and are not medical diagnoses.'],
  ['How are employees recommended for tasks?', 'Bayyinah considers required skills, relevant completed tasks and estimated availability during the selected dates. Availability is an estimate, not a guarantee that the task will fit.'],
  ['Does Bayyinah assign tasks automatically?', 'No. It ranks suggested employees and provides reasons. The manager makes the final assignment decision.'],
  ['Who can access information?', 'Access depends on role: HR handles organizational records and authorized HR insights, managers manage their teams, and employees access their own work.'],
  ['How do employees join?', 'HR adds them one by one or imports a CSV file. Each person gets an email invitation and sets their own password.'],
];

function Faq() {
  return (
    <section className="lx-section" id="faq" aria-labelledby="lx-faq-title">
      <div className="lx-wrap lx-faq">
        <Reveal className="lx-head">
          <span className="lx-eyebrow">FAQ</span>
          <h2 id="lx-faq-title" className="lx-h2">Questions, <span className="lx-accent">answered.</span></h2>
          <p className="lx-lead">The short version of how Bayyinah works.</p>
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
          <h2 id="lx-cta-title" className="lx-h2">Bring work together. <span className="lx-accent">Make informed decisions.</span></h2>
          <p className="lx-lead">Connect your team, tasks and goals in one workspace.</p>
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
  ['Product', [['#burnout', 'Burnout insights'], ['#assign', 'Smart assignment'], ['#roles', 'For your team'], ['#how', 'How it works']]],
  ['Help', [['#faq', 'FAQ'], ['/forgot-password', 'Reset password']]],
  ['Account', [['/login', 'Log in'], ['/setup', 'Set up your organization']]],
];

function LxFooter() {
  return (
    <footer className="lx-footer">
      <div className="lx-wrap lx-footer-grid">
        <div className="lx-footer-brand">
          <Brand small />
          <p>One workspace for employees, projects, tasks and goals, with insights that support better workforce decisions.</p>
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
          eyebrow="Burnout insights"
          title="See burnout from"
          accent="more than one angle."
          lead="Bayyinah brings together BAT-based burnout assessment and a separate predictive risk estimate for HR review. Neither should be treated as a medical diagnosis."
          points={[
            ['BAT-based assessment', 'A structured survey captures employee-reported burnout experiences.'],
            ['Predictive risk insights', 'A separate model estimates risk as an additional signal, not a confirmed condition.'],
            ['HR-led review', 'Sensitive burnout information stays separate from routine task assignment.'],
          ]}
        >
          <BurnoutCard />
        </Feature>
        <Feature
          id="assign"
          flip
          eyebrow="Smart task assignment"
          title="Find a good match"
          accent="for each task."
          lead="Bayyinah suggests employees from the manager’s team using required skills, relevant completed tasks and estimated availability during the task dates."
          points={[
            ['Checks required skills', 'Employees who do not meet mandatory skill requirements are excluded with a reason.'],
            ['Uses estimated availability', 'Existing tasks, meetings and approved leave inform the ranking; time sufficiency for the new task is not guaranteed.'],
            ['The manager decides', 'Review each suggestion and its reasons before assigning the task.'],
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