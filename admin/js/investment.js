/**
 * Investment Record + Decision History controller (Screens 2+3, one page,
 * two tabs). Requires admin-auth.js and cortex-client.js loaded first.
 */
(function () {
  var LIFECYCLE_STATUSES = ['idea', 'research', 'watch', 'approved', 'portfolio_candidate', 'held', 'archived', 'rejected'];
  var SUB_STATUSES = ['monitor', 'reduce', 'exit'];
  var INVESTMENT_ROLES = [
    ['compounder', 'Compounder'],
    ['growth_opportunity', 'Growth Opportunity'],
    ['undervalued_opportunity', 'Undervalued Opportunity'],
    ['turnaround_special_situation', 'Turnaround / Special Situation'],
    ['defensive_resilience', 'Defensive / Resilience'],
    ['income', 'Income / Cash Generation'],
  ];
  var CONVICTION_BANDS = ['core', 'developing', 'watch'];
  var CONVICTION_DIMENSIONS = [
    ['conviction_opportunity', 'Opportunity'],
    ['conviction_business', 'Business'],
    ['conviction_management', 'Management'],
    ['conviction_financial', 'Financial'],
    ['conviction_valuation', 'Valuation'],
  ];
  var DECISION_CHANGE_TYPES = [
    ['conviction_change', 'Conviction change'],
    ['status_change', 'Status change'],
    ['position_change', 'Position change'],
    ['no_change', 'Reviewed, no change'],
  ];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function val(id) { return document.getElementById(id).value; }
  function setVal(id, v) { document.getElementById(id).value = v == null ? '' : v; }

  function init(supabase) {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var loadingState = document.getElementById('loadingState');
    var recordRoot = document.getElementById('recordRoot');

    if (!id) {
      loadingState.textContent = 'No investment id given.';
      return;
    }

    var dirty = false;
    function markDirty() {
      dirty = true;
      document.getElementById('saveRecordBtn').disabled = false;
      document.getElementById('dirtyBanner').classList.add('show');
    }
    function clearDirty() {
      dirty = false;
      document.getElementById('saveRecordBtn').disabled = true;
      document.getElementById('dirtyBanner').classList.remove('show');
    }

    Promise.all([
      CortexClient.getInvestment(supabase, id),
      CortexClient.listDecisions(supabase, id),
    ]).then(function (results) {
      var inv = results[0];
      var decisions = results[1];
      renderRecord(inv);
      renderDecisions(decisions);
      loadingState.style.display = 'none';
      recordRoot.style.display = 'block';
      wireTabs();
      wireDirtyTracking(markDirty);
      wireStatusControl(supabase, id, inv);
      wireSaveButton(supabase, id, clearDirty);
      wireDecisionForm(supabase, id);
    }).catch(function (err) {
      loadingState.textContent = 'Could not load this investment: ' + (err.message || err);
    });

    function renderRecord(inv) {
      document.getElementById('statusEyebrow').textContent = inv.ticker;
      document.getElementById('companyHeading').textContent = inv.company_name;
      document.title = inv.company_name + ' — TEI Cortex';

      setVal('fCompanyName', inv.company_name);
      setVal('fTicker', inv.ticker);
      setVal('fSector', inv.sector);
      setVal('fIndustry', inv.industry);
      setVal('fTheme', inv.theme);
      setVal('fRole', inv.investment_role);
      document.getElementById('fCyclical').checked = !!inv.cyclical_flag;

      setVal('lifecycleStatus', inv.lifecycle_status);
      setVal('subStatus', inv.sub_status || '');
      toggleSubStatusVisibility(inv.lifecycle_status);
      togglePortfolioCandidateVisibility(inv.lifecycle_status);

      setVal('fStoryOpportunity', inv.story_opportunity);
      setVal('fStoryWhyExists', inv.story_why_exists);
      setVal('fStoryLongTermCase', inv.story_long_term_case);
      setVal('fStoryAssumptions', inv.story_assumptions);
      setVal('fStoryWhatCouldBeWrong', inv.story_what_could_be_wrong);

      setVal('fQualityManagement', inv.quality_management);
      setVal('fQualityBusiness', inv.quality_business);
      setVal('fQualityCompetitiveAdvantage', inv.quality_competitive_advantage);
      setVal('fQualityFinancialStrength', inv.quality_financial_strength);

      CONVICTION_DIMENSIONS.forEach(function (d) { setVal('f_' + d[0], inv[d[0]]); });
      setVal('fConvictionBand', inv.conviction_band || '');
      setVal('fConvictionReason', inv.conviction_reason);

      setVal('fTriggerConditions', inv.trigger_conditions);

      setVal('fPcOpportunityCost', inv.portfolio_candidate_opportunity_cost);
      setVal('fPcPortfolioFit', inv.portfolio_candidate_portfolio_fit);
      setVal('fPcClientNotes', inv.portfolio_candidate_client_notes);
    }

    function toggleSubStatusVisibility(status) {
      document.getElementById('subStatusField').style.display = status === 'held' ? 'block' : 'none';
    }
    function togglePortfolioCandidateVisibility(status) {
      var card = document.getElementById('portfolioCandidateCard');
      if (status === 'portfolio_candidate') {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    }

    function wireTabs() {
      var buttons = document.querySelectorAll('.tab-bar button');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          buttons.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
          document.getElementById(btn.getAttribute('data-tab') + 'Panel').classList.add('active');
        });
      });
    }

    // Every editable field in the Record tab marks the page dirty, except
    // lifecycleStatus/subStatus which save immediately on their own (see
    // wireStatusControl) -- a status move is a discrete event the adviser
    // shouldn't be able to leave un-persisted by forgetting the page Save.
    function wireDirtyTracking(onDirty) {
      var ids = [
        'fCompanyName', 'fTicker', 'fSector', 'fIndustry', 'fTheme', 'fRole', 'fCyclical',
        'fStoryOpportunity', 'fStoryWhyExists', 'fStoryLongTermCase', 'fStoryAssumptions', 'fStoryWhatCouldBeWrong',
        'fQualityManagement', 'fQualityBusiness', 'fQualityCompetitiveAdvantage', 'fQualityFinancialStrength',
        'fConvictionBand', 'fConvictionReason', 'fTriggerConditions',
        'fPcOpportunityCost', 'fPcPortfolioFit', 'fPcClientNotes',
      ].concat(CONVICTION_DIMENSIONS.map(function (d) { return 'f_' + d[0]; }));
      ids.forEach(function (fid) {
        var el = document.getElementById(fid);
        el.addEventListener('input', onDirty);
        el.addEventListener('change', onDirty);
      });
    }

    function wireStatusControl(supabase, id, inv) {
      document.getElementById('lifecycleStatus').addEventListener('change', function () {
        var newStatus = this.value;
        toggleSubStatusVisibility(newStatus);
        togglePortfolioCandidateVisibility(newStatus);
        CortexClient.updateInvestment(supabase, id, { lifecycle_status: newStatus }).then(function () {
          if (newStatus === 'portfolio_candidate') {
            document.getElementById('portfolioCandidateCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }).catch(function (err) {
          alert('Could not save status change: ' + (err.message || err));
        });
      });
      document.getElementById('subStatus').addEventListener('change', function () {
        CortexClient.updateInvestment(supabase, id, { sub_status: this.value || null }).catch(function (err) {
          alert('Could not save sub-status: ' + (err.message || err));
        });
      });
    }

    function wireSaveButton(supabase, id, onSaved) {
      document.getElementById('saveRecordBtn').addEventListener('click', function () {
        var band = val('fConvictionBand');
        var reason = val('fConvictionReason').trim();
        var reasonField = document.getElementById('fConvictionReason').closest('.field');
        var reasonError = document.getElementById('convictionReasonError');

        if (band && !reason) {
          reasonField.classList.add('has-error');
          reasonError.classList.add('show');
          document.getElementById('fConvictionReason').focus();
          return;
        }
        reasonField.classList.remove('has-error');
        reasonError.classList.remove('show');

        var patch = {
          company_name: val('fCompanyName').trim(),
          ticker: val('fTicker').trim().toUpperCase(),
          sector: val('fSector').trim() || null,
          industry: val('fIndustry').trim() || null,
          theme: val('fTheme').trim() || null,
          investment_role: val('fRole'),
          cyclical_flag: document.getElementById('fCyclical').checked,
          story_opportunity: val('fStoryOpportunity').trim() || null,
          story_why_exists: val('fStoryWhyExists').trim() || null,
          story_long_term_case: val('fStoryLongTermCase').trim() || null,
          story_assumptions: val('fStoryAssumptions').trim() || null,
          story_what_could_be_wrong: val('fStoryWhatCouldBeWrong').trim() || null,
          quality_management: val('fQualityManagement').trim() || null,
          quality_business: val('fQualityBusiness').trim() || null,
          quality_competitive_advantage: val('fQualityCompetitiveAdvantage').trim() || null,
          quality_financial_strength: val('fQualityFinancialStrength').trim() || null,
          conviction_band: band || null,
          conviction_reason: reason || null,
          trigger_conditions: val('fTriggerConditions').trim() || null,
          portfolio_candidate_opportunity_cost: val('fPcOpportunityCost').trim() || null,
          portfolio_candidate_portfolio_fit: val('fPcPortfolioFit').trim() || null,
          portfolio_candidate_client_notes: val('fPcClientNotes').trim() || null,
        };
        CONVICTION_DIMENSIONS.forEach(function (d) {
          var raw = val('f_' + d[0]);
          patch[d[0]] = raw === '' ? null : Number(raw);
        });

        var btn = document.getElementById('saveRecordBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        CortexClient.updateInvestment(supabase, id, patch).then(function (inv) {
          document.getElementById('statusEyebrow').textContent = inv.ticker;
          document.getElementById('companyHeading').textContent = inv.company_name;
          btn.textContent = 'Save changes';
          onSaved();
        }).catch(function (err) {
          btn.textContent = 'Save changes';
          btn.disabled = false;
          alert('Could not save: ' + (err.message || err));
        });
      });
    }

    function renderDecisions(decisions) {
      var list = document.getElementById('decisionList');
      if (!decisions.length) {
        list.innerHTML = '<p class="pipeline-empty">No decisions logged yet.</p>';
        return;
      }
      list.innerHTML = decisions.map(decisionItemHtml).join('');
    }

    function decisionItemHtml(d) {
      var whatLabel = (DECISION_CHANGE_TYPES.filter(function (t) { return t[0] === d.what_changed; })[0] || [d.what_changed, d.what_changed])[1];
      var next = d.what_would_change_mind_next
        ? '<p class="decision-next"><span class="k">What would change my mind next:</span> ' + escapeHtml(d.what_would_change_mind_next) + '</p>'
        : '';
      return (
        '<li class="decision-item">' +
          '<div class="decision-head">' +
            '<span class="decision-what">' + escapeHtml(whatLabel) + '</span>' +
            '<span class="decision-date">' + new Date(d.created_at).toLocaleString() + '</span>' +
          '</div>' +
          '<p class="decision-reason">' + escapeHtml(d.reason) + '</p>' +
          next +
        '</li>'
      );
    }

    function wireDecisionForm(supabase, id) {
      document.getElementById('decisionForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var errorEl = document.getElementById('decisionError');
        errorEl.classList.remove('show');
        var reason = val('dReason').trim();
        if (!reason) {
          errorEl.textContent = 'A reason is required.';
          errorEl.classList.add('show');
          return;
        }
        var submitBtn = document.getElementById('decisionSubmit');
        submitBtn.disabled = true;
        CortexClient.addDecision(supabase, id, {
          what_changed: val('dWhatChanged'),
          reason: reason,
          what_would_change_mind_next: val('dNext').trim() || null,
        }).then(function () {
          return CortexClient.listDecisions(supabase, id);
        }).then(function (decisions) {
          renderDecisions(decisions);
          document.getElementById('decisionForm').reset();
          submitBtn.disabled = false;
        }).catch(function (err) {
          errorEl.textContent = err.message || 'Could not log decision.';
          errorEl.classList.add('show');
          submitBtn.disabled = false;
        });
      });
    }
  }

  window.InvestmentController = {
    init: init,
    LIFECYCLE_STATUSES: LIFECYCLE_STATUSES,
    SUB_STATUSES: SUB_STATUSES,
    INVESTMENT_ROLES: INVESTMENT_ROLES,
    CONVICTION_BANDS: CONVICTION_BANDS,
    CONVICTION_DIMENSIONS: CONVICTION_DIMENSIONS,
    DECISION_CHANGE_TYPES: DECISION_CHANGE_TYPES,
  };
})();
