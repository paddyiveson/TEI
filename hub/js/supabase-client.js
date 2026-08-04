/**
 * Browser Supabase client with cookie-based sessions (required for Vercel middleware).
 * Loads @supabase/ssr via esm.sh and exposes window.teiSupabase + window.TeiAuth.
 */
(function () {
  var readyPromise = null;
  var RESET_PATH = "/hub/reset-password.html";

  /** Recovery links must land on reset-password.html; Supabase falls back to Site URL if redirectTo is not allowlisted. */
  function redirectRecoveryCallbackIfNeeded() {
    if (window.location.pathname.endsWith(RESET_PATH)) return;

    var search = window.location.search || "";
    var hash = window.location.hash || "";
    var params = new URLSearchParams(search);
    var isRecovery =
      params.get("type") === "recovery" || hash.indexOf("type=recovery") !== -1;
    var hasAuthPayload =
      params.has("code") || hash.indexOf("access_token=") !== -1;

    if (hasAuthPayload || isRecovery) {
      window.location.replace(RESET_PATH + search + hash);
    }
  }

  redirectRecoveryCallbackIfNeeded();

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
        var redirectTo = window.location.origin + RESET_PATH;
        return client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      });
    },

    /** Exchange PKCE ?code= from email links before reading the session. */
    finishAuthCallback: function () {
      return waitForReady().then(function (client) {
        var params = new URLSearchParams(window.location.search);
        var code = params.get("code");
        if (!code) return Promise.resolve({ data: null, error: null });
        return client.auth.exchangeCodeForSession(code);
      });
    },

    onAuthStateChange: function (callback) {
      return waitForReady().then(function (client) {
        return client.auth.onAuthStateChange(callback);
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
