// Plain script, not an ES module (see hub/education/js/shell.js for the
// precedent). Requires admin-auth.js loaded first (TeiAdminAuth.signOut).

/**
 * Renders the sticky admin header: brand mark, full 9-module nav, sign-out.
 * `current` marks the active item -- one of:
 *   'home' | 'clients' | 'investments' | 'documents' | 'decisions' |
 *   'knowledge' | 'planning' | 'research' | 'workbench' | null
 *
 * Real modules (Clients, Investment Intelligence, Documents, Decisions &
 * History, Knowledge) and placeholder modules (Portfolio Planning, Research,
 * Workbench) share one nav -- no visual distinction between them here, since
 * each placeholder page itself states plainly that it isn't built yet.
 */
function renderAdminHeader(root, current) {
  function navClass(key) { return key === current ? "current" : ""; }
  root.innerHTML = `
    <a class="brand" href="/admin/index.html"><span class="mark">C</span>TEI Cortex</a>
    <nav class="admin-nav">
      <a href="/admin/index.html" class="${navClass('home')}">Home</a>
      <a href="/admin/clients.html" class="${navClass('clients')}">Clients</a>
      <a href="/admin/documents.html" class="${navClass('documents')}">Documents</a>
      <a href="/admin/investments.html" class="${navClass('investments')}">Investment Intelligence</a>
      <a href="/admin/decisions.html" class="${navClass('decisions')}">Decisions &amp; History</a>
      <a href="/admin/knowledge.html" class="${navClass('knowledge')}">Knowledge</a>
      <a href="/admin/portfolio-planning.html" class="${navClass('planning')}">Portfolio Planning</a>
      <a href="/admin/research.html" class="${navClass('research')}">Research</a>
      <a href="/admin/workbench.html" class="${navClass('workbench')}">Workbench</a>
    </nav>
    <a href="#" class="admin-signout" data-tei-signout>Sign out</a>
  `;
  var signOut = root.querySelector("[data-tei-signout]");
  signOut.addEventListener("click", function (e) {
    e.preventDefault();
    TeiAdminAuth.signOut();
  });
}
