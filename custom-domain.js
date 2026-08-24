(() => {
  const showMaintenanceOnCustomDomain = false;
  const maintenanceHosts = new Set(['sasa-f.com', 'www.sasa-f.com']);
  if (showMaintenanceOnCustomDomain && maintenanceHosts.has(window.location.hostname.toLowerCase())) {
    document.documentElement.classList.add('show-domain-maintenance');
  }
})();
