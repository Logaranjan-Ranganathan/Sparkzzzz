// Central URL map. Existing tab ids stay; the address bar is the source of truth.

export const TAB_PATHS = {
  home: '/',
  portal: '/portal',
  citizenDashboard: '/citizen/dashboard',
  report: '/report-issue',
  reports: '/my-complaints',
  tracker: '/track-complaint',
  wardmap: '/ward-map',
  login: '/login',
  register: '/register',
  officerLogin: '/officer/login',
  dashboard: '/officer/dashboard',
  heatmap: '/officer/heatmap',
  performance: '/officer/performance',
  comparison: '/officer/comparison',
  analytics: '/officer/analytics',
  admin: '/officer/admin',
  settings: '/officer/settings',
};

export const OFFICER_TABS = ['dashboard', 'heatmap', 'performance', 'comparison', 'analytics', 'admin', 'settings'];

export const pathForTab = (tab, param) => {
  if (tab === 'detail') return param ? `/officer/issues/${encodeURIComponent(param)}` : '/officer/issues';
  if (tab === 'tracker' && param) return `/track-complaint/${encodeURIComponent(param)}`;
  return TAB_PATHS[tab] || '/';
};

export const matchRoute = (pathname) => {
  const clean = pathname.replace(/\/+$/, '') || '/';

  const track = clean.match(/^\/track-complaint\/([^/]+)$/) || clean.match(/^\/complaints\/(?!new$)([^/]+)$/);
  if (track) return { tab: 'tracker', param: decodeURIComponent(track[1]) };

  if (clean === '/complaints/new' || clean === '/complaints') return { tab: 'report' };

  const issue = clean.match(/^\/officer\/issues\/([^/]+)$/);
  if (issue) return { tab: 'detail', param: decodeURIComponent(issue[1]) };

  if (clean === '/officer/issues') return { tab: 'dashboard' };
  if (clean === '/auth') return { tab: 'portal' };
  if (clean === '/citizen-dashboard') return { tab: 'citizenDashboard' };

  const found = Object.entries(TAB_PATHS).find(([, path]) => path === clean);
  if (found) return { tab: found[0] };

  return { tab: 'notFound', path: clean };
};

export const isOfficerPath = (pathname) => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return /^\/officer(\/|$)/.test(clean) && clean !== '/officer/login';
};
