const LINKS = [
  ['#burnout', 'Burnout insights'],
  ['#about', 'About us'],
  ['#faq', 'Get to know us'],
  ['/login', 'Log in'],
];

export default function SiteFooter() {
  return (
    <footer className="site-footer mk-footer">
      <a className="brand footer-brand" href="/" aria-label="Bayyinah home">
        <img className="brand-logo" src="/bayyinah-logo.png" alt="" />
        <span className="brand-word"><span className="brand-latin">Bayyinah</span><span className="brand-arabic" lang="ar" dir="rtl">بيّنة</span></span>
      </a>
      <nav className="mk-footer-links" aria-label="Footer">
        {LINKS.map(([href, text]) => <a key={href} href={href}>{text}</a>)}
      </nav>
      <span>© 2026 Bayyinah Platform. All rights reserved.</span>
    </footer>
  );
}
