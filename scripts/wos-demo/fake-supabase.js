/* Test-only stand-in for window.teiSupabase, so Wealth OS runs in a test
   browser with a demo client and never touches the live database.
   Loaded in place of /hub/js/supabase-config.js by the checks and the
   homepage capture script (scripts/capture-home-previews.js). It answers
   the query-builder calls Wealth OS makes (schema, from, select, eq, in,
   order, limit, single, maybeSingle, insert, update, upsert, delete, rpc)
   from window.WOS_DEMO.tables, and keeps writes in memory for the page's
   life. Never ship this to a real page. */
(function(){
  'use strict';
  window.TEI_SUPABASE_URL = 'https://demo.invalid';
  window.TEI_SUPABASE_ANON_KEY = 'demo';
  var uid = 0;
  function newId(){ uid++; return '00000000-0000-4000-8000-' + String(100000000000 + uid); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  function Query(tables, name){
    this.tables = tables; this.name = name; this.filters = []; this.op = 'select';
    this.payload = null; this.one = null; this.orderBy = null; this.lim = null; this.conflict = null; this.wantRows = false;
  }
  Query.prototype.select = function(){ if(this.op !== 'select') this.wantRows = true; return this; };
  Query.prototype.eq = function(c, v){ this.filters.push(function(r){ return r[c] === v; }); return this; };
  Query.prototype.neq = function(c, v){ this.filters.push(function(r){ return r[c] !== v; }); return this; };
  Query.prototype.in = function(c, vs){ this.filters.push(function(r){ return vs.indexOf(r[c]) >= 0; }); return this; };
  Query.prototype.is = function(c, v){ this.filters.push(function(r){ return (r[c] == null ? null : r[c]) === v; }); return this; };
  Query.prototype.gte = function(c, v){ this.filters.push(function(r){ return r[c] >= v; }); return this; };
  Query.prototype.lte = function(c, v){ this.filters.push(function(r){ return r[c] <= v; }); return this; };
  Query.prototype.order = function(c, o){ this.orderBy = {c:c, asc: !o || o.ascending !== false}; return this; };
  Query.prototype.limit = function(n){ this.lim = n; return this; };
  Query.prototype.single = function(){ this.one = 'single'; return this; };
  Query.prototype.maybeSingle = function(){ this.one = 'maybe'; return this; };
  Query.prototype.insert = function(p){ this.op = 'insert'; this.payload = p; return this; };
  Query.prototype.update = function(p){ this.op = 'update'; this.payload = p; return this; };
  Query.prototype.upsert = function(p, o){ this.op = 'upsert'; this.payload = p; this.conflict = o && o.onConflict; return this; };
  Query.prototype.delete = function(){ this.op = 'delete'; return this; };
  Query.prototype.run = function(){
    var t = this.tables[this.name] = this.tables[this.name] || [];
    var match = function(r){ return this.filters.every(function(f){ return f(r); }); }.bind(this);
    var rows;
    if(this.op === 'select'){
      rows = t.filter(match);
    } else if(this.op === 'insert'){
      var list = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = list.map(function(p){ var r = Object.assign({id: newId(), created_at: new Date().toISOString()}, p); t.push(r); return r; });
    } else if(this.op === 'update'){
      rows = t.filter(match);
      rows.forEach(function(r){ Object.assign(r, this.payload); }, this);
    } else if(this.op === 'upsert'){
      var keys = (this.conflict || 'id').split(',');
      var list2 = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = list2.map(function(p){
        var found = t.find(function(r){ return keys.every(function(k){ return r[k] === p[k]; }); });
        if(found){ Object.assign(found, p); return found; }
        var r = Object.assign({id: newId()}, p); t.push(r); return r;
      });
    } else if(this.op === 'delete'){
      rows = t.filter(match);
      this.tables[this.name] = t.filter(function(r){ return !match(r); });
    }
    rows = clone(rows);
    if(this.orderBy){
      var c = this.orderBy.c, asc = this.orderBy.asc;
      rows.sort(function(a, b){ return (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1); });
    }
    if(this.lim != null) rows = rows.slice(0, this.lim);
    if(this.one === 'single') return rows.length ? {data: rows[0], error: null} : {data: null, error: {message: 'No rows'}};
    if(this.one === 'maybe') return {data: rows[0] || null, error: null};
    return {data: rows, error: null};
  };
  Query.prototype.then = function(res, rej){
    var out;
    try{ out = this.run(); } catch(e){ return Promise.reject(e).then(res, rej); }
    return Promise.resolve(out).then(res, rej);
  };

  function client(){
    var d = window.WOS_DEMO || {tables:{}, user:null};
    var api = {
      schema: function(){ return api; },
      from: function(name){ return new Query(d.tables, name); },
      rpc: function(){ return Promise.resolve({data: null, error: null}); },
      auth: {
        getUser: function(){ return Promise.resolve({data: {user: d.user}, error: null}); },
        getSession: function(){ return Promise.resolve({data: {session: d.user ? {user: d.user} : null}, error: null}); },
        onAuthStateChange: function(){ return {data: {subscription: {unsubscribe: function(){}}}}; },
        signOut: function(){ return Promise.resolve({error: null}); }
      },
      storage: {
        from: function(){ return {
          createSignedUrl: function(){ return Promise.resolve({data: null, error: {message: 'Demo: no files'}}); },
          download: function(){ return Promise.resolve({data: null, error: {message: 'Demo: no files'}}); },
          upload: function(){ return Promise.resolve({data: null, error: {message: 'Demo: no uploads'}}); },
          remove: function(){ return Promise.resolve({data: null, error: null}); }
        }; }
      },
      functions: { invoke: function(){ return Promise.resolve({data: null, error: {message: 'Demo'}}); } }
    };
    return api;
  }
  Object.defineProperty(window, 'teiSupabase', {configurable: true, get: function(){ return client(); }, set: function(){}});
})();
