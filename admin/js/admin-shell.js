// Plain script, not an ES module (see hub/education/js/shell.js for the
// precedent). Requires admin-auth.js loaded first (TeiAdminAuth.signOut).

/**
 * Renders the sticky admin header: brand mark, top nav (Pipeline / Clients /
 * Blueprint), and a sign-out link. `current` marks which nav item is active
 * (one of 'pipeline' | 'clients' | 'blueprint' | null).
 */
function renderAdminHeader(root, current) {
  function navClass(key) { return key === current ? "current" : ""; }
  root.innerHTML = `
    <a class="brand" href="/admin/index.html"><span class="mark">C</span>TEI Cortex</a>
    <nav class="admin-nav">
      <a href="/admin/index.html" class="${navClass('pipeline')}">Pipeline</a>
      <a href="/admin/client-workspace.html" class="${navClass('workspace')}">Clients</a>
      <a href="/admin/clients.html" class="${navClass('clients')}">Client Notes</a>
      <a href="/admin/portfolio-blueprint.html" class="${navClass('blueprint')}">Portfolio Blueprint</a>
    </nav>
    <a href="#" class="admin-signout" data-tei-signout>Sign out</a>
  `;
  var signOut = root.querySelector("[data-tei-signout]");
  signOut.addEventListener("click", function (e) {
    e.preventDefault();
    TeiAdminAuth.signOut();
  });
}
