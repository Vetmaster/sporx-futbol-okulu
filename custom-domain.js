(() => {
  const maintenanceHosts = new Set(['sasa-f.com', 'www.sasa-f.com']);
  if (maintenanceHosts.has(window.location.hostname.toLowerCase())) {
    document.documentElement.classList.add('show-domain-maintenance');
  }
})();
