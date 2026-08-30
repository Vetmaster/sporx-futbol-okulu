(() => {
  const showMaintenanceOnCustomDomain = false;
  const maintenanceHosts = new Set(['sasa-f.com', 'www.sasa-f.com']);
  const managerLoginRequested = new URLSearchParams(window.location.search).get('giris') === '1';
  if (showMaintenanceOnCustomDomain && !managerLoginRequested && maintenanceHosts.has(window.location.hostname.toLowerCase())) {
    document.documentElement.classList.add('show-domain-maintenance');
  }
})();
