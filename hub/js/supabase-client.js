/**
 * Browser Supabase client with cookie-based sessions (required for Vercel middleware).
 * Loads @supabase/ssr via esm.sh and exposes window.teiSupabase + window.TeiAuth.
 */
(function () {
  var readyPromise = null;

  function getConfig() {
    var url = window.TEI_SUPABASE_URL;
    var key = window.TEI_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Supabase config missing. Load supabase-config.js first.");
    }
    return { url: url, key: key };
  }

  function waitForReady() {
    if (window.teiSupabase) return Promise.resolve(window.teiSupabase);
    if (!readyPromise) {
      readyPromise = new Promise(function (resolve, reject) {
        import("https://esm.sh/@supabase/ssr@0.6.1")
          .then(function (mod) {
            var cfg = getConfig();
            window.teiSupabase = mod.createBrowserClient(cfg.url, cfg.key);
            resolve(window.teiSupabase);
          })
          .catch(reject);
      });
    }
    return readyPromise;
  }

  window.TeiAuth = {
    waitForReady: waitForReady,

    signIn: function (email, password) {
      return waitForReady().then(function (client) {
        return client.auth.signInWithPassword({ email: email, password: password });
      });
    },

    signOut: function () {
      return waitForReady().then(function (client) {
        return client.auth.signOut();
      });
    },

    getUser: function () {
      return waitForReady().then(function (client) {
        return client.auth.getUser();
      });
    },

    resetPassword: function (email) {
      return waitForReady().then(function (client) {
        var redirectTo = window.location.origin + "/hub/reset-password.html";
        return client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      });
    },

    updatePassword: function (password) {
      return waitForReady().then(function (client) {
        return client.auth.updateUser({ password: password });
      });
    },
  };

  waitForReady().catch(function (err) {
    console.error("Failed to initialise Supabase client:", err);
  });
})();
