/* ============================================================================
   PORTFOLIO OPTIMISATION LAB — V1 (standalone)
   The Everyday Investor

   conversation.js — the "What's on your mind" conversational feature
   (rule-based intent routing, V1, no AI call).

   This NEVER answers "what should I do" with a resolved recommendation.
   It only does two things:
     1. States facts the Lab has already computed (weight, value, rank, concentration).
     2. Routes to existing mechanisms (presets), always presenting options in the
        plural where more than one applies, in neutral "this relates to..." language.
   ============================================================================ */

const INTENT_PATTERNS = {
  factual:   /\bwhat('|)s\b|\bhow much\b|\bhow big\b|\bhow large\b|\bweight\b|\bpercent\b|%|\bworth\b|\bhow does\b|\bcurrently\b/,
  increase:  /\bmore\b|\bincrease\b|\bgrow\b|\bbigger\b|\bhigher\b|\bprominence\b|\bboost\b|\badd to\b|\bconviction\b|\bup\b/,
  decrease:  /\bless\b|\bdecrease\b|\breduce\b|\blower\b|\bsmaller\b|\bcut\b|\btrim\b|\bdown\b|\bnervous about\b|\bworried about\b/,
  cap:       /\bcap\b|\blimit\b|\bmaximum\b|\bceiling\b|\bno more than\b/,
  equalize:  /\bequal\b|\beven(ly)?\b|\bbalance(d)?\b|\bsame weight\b/,
  consolidate:/\bconsolidat|\bmerge\b|\bcombine\b|\bsimplify\b|\btidy up\b/,
  cash:      /\bcash\b|\bliquidity\b|\braise cash\b/,
  target:    /\btarget\b|\ballocation\b/,
  adviceSeeking: /\bwhat should i do\b|\bshould i\b|\bwhat do you think\b|\bwhat would you do\b|\brecommend(ation)?\b|\badvice\b|\bwhat('|)s the best\b/,
};

function parseQuery(text, holdings){
  const lower = text.toLowerCase();
  const weighted = computeTotals(holdings).sort((a,b)=>b.weight-a.weight);

  let matched = [];
  weighted.forEach(h => {
    if (!h.ticker) return;
    const tickerRe = new RegExp('\\b'+escapeRegex(h.ticker.toLowerCase())+'\\b');
    const tm = lower.match(tickerRe);
    if (tm){ matched.push({...h, _idx: tm.index}); return; }
    if (h.name){
      const nameWords = h.name.toLowerCase().split(/\s+/).filter(w=>w.length>3);
      for (const w of nameWords){
        const wi = lower.indexOf(w);
        if (wi > -1){ matched.push({...h, _idx: wi}); return; }
      }
    }
  });

  const topPhrase = lower.match(/\b(top|biggest|largest|highest[- ]weighted)\s+(holding|position)\b/);
  if (topPhrase && weighted.length && !matched.some(m=>m.id===weighted[0].id)){
    matched.push({...weighted[0], _idx: topPhrase.index});
  }
  const bottomPhrase = lower.match(/\b(smallest|lowest[- ]weighted|least)\s+(holding|position)\b/);
  if (bottomPhrase && weighted.length && !matched.some(m=>m.id===weighted[weighted.length-1].id)){
    matched.push({...weighted[weighted.length-1], _idx: bottomPhrase.index});
  }

  matched.sort((a,b)=>a._idx-b._idx);
  // dedupe keeping first occurrence
  const seen = new Set();
  matched = matched.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });

  const flags = {};
  Object.keys(INTENT_PATTERNS).forEach(k => flags[k] = INTENT_PATTERNS[k].test(lower));

  const pctMatch = lower.match(/(\d+(\.\d+)?)\s*%/);
  const explicitPct = pctMatch ? parseFloat(pctMatch[1]) : null;

  return { matched, flags, weighted, explicitPct };
}

function factLines(matched, weighted, flags){
  const lines = [];
  if (matched.length){
    matched.slice(0,3).forEach(h => {
      const rank = weighted.findIndex(w=>w.id===h.id) + 1;
      lines.push(`<span class="convo-fact-pill"><b>${escapeHtml(h.ticker)}</b> · ${fmtPctPlain(h.weight)} of the portfolio · ${fmtGBP(h.value)} · ranked ${rank} of ${weighted.length}</span>`);
    });
  } else if (flags.factual){
    const conc = concentrationSummary(weighted);
    lines.push(`<span class="convo-fact-pill">Top holding ${fmtPctPlain(conc.top1)}</span><span class="convo-fact-pill">Top 3 ${fmtPctPlain(conc.top3)}</span><span class="convo-fact-pill">Top 5 ${fmtPctPlain(conc.top5)}</span>`);
  }
  return lines;
}

// mode: 'freshcash' | 'move' | 'both' — which route(s) to surface for an increase
function buildIncreaseCards(h, donor, explicitPct, mode){
  const cards = [];
  if (mode !== 'move'){
    cards.push({presetId:'freshcash', title:'Allocate fresh cash', desc:`Models new capital going into ${escapeHtml(h.ticker)} — nothing else moves.`, prefill:{toId:h.id, amount:1000}});
  }
  if (mode !== 'freshcash' && donor){
    cards.push({presetId:'move', title:'Move £X from A to B', desc:`Reallocates from ${escapeHtml(donor.ticker)} into ${escapeHtml(h.ticker)} — total stays the same.`, prefill:{fromId:donor.id, toId:h.id, amount:1000}});
  }
  return cards;
}
// mode: 'cap' | 'move' | 'both' — which route(s) to surface for a decrease
function buildDecreaseCards(h, dest, explicitPct, mode){
  const cards = [];
  const capPct = explicitPct !== null ? explicitPct : Math.max(1, Math.round(h.weight-5));
  if (mode !== 'move'){
    cards.push({presetId:'cap', title:'Maximum holding size', desc:`Caps ${escapeHtml(h.ticker)} at a chosen %, redistributing the excess — try starting near ${fmtPctPlain(capPct)}.`, prefill:{capPct}});
  }
  if (mode !== 'cap' && dest){
    cards.push({presetId:'move', title:'Move £X from A to B', desc:`Reallocates out of ${escapeHtml(h.ticker)} into ${escapeHtml(dest.ticker)} — adjust the amount in the form.`, prefill:{fromId:h.id, toId:dest.id, amount:1000}});
  }
  return cards;
}

function buildMechanismCards(flags, matched, weighted, explicitPct){
  const cards = [];
  const other = id => weighted.find(w=>w.id!==id);

  if (flags.cash){
    const cashHolding = weighted.find(h=>h.ticker==='CASH');
    const currentCashWeight = cashHolding ? cashHolding.weight : 0;
    const targetPct = explicitPct !== null ? explicitPct : Math.round(currentCashWeight+5);
    cards.push({presetId:'raisecash', title:'Raise cash to X%', desc:'Withdraws proportionally from holdings until cash reaches a target %.', prefill:{targetPct}});
  }
  if (flags.equalize){
    cards.push({presetId:'equal', title:'Equal weight', desc:`Rebalances all ${weighted.length} holdings to ${fmtPctPlain(100/Math.max(weighted.length,1))} each.`, prefill:{}});
  }
  if (flags.consolidate && matched.length>=1){
    const targetH = matched[matched.length-1];
    const sourceIds = matched.filter(m=>m.id!==targetH.id).map(m=>m.id);
    if (sourceIds.length===0 && weighted.length>1){ sourceIds.push(...weighted.filter(w=>w.id!==targetH.id).slice(-2).map(w=>w.id)); }
    cards.push({presetId:'consolidate', title:'Consolidate holdings', desc:`Merges the mentioned holdings into ${escapeHtml(targetH.ticker)}.`, prefill:{sourceIds, targetId: targetH.id}});
  }
  if (flags.cap && matched.length){
    const h = matched[0];
    const capPct = explicitPct !== null ? explicitPct : Math.max(1, Math.round(h.weight-2));
    cards.push({presetId:'cap', title:'Maximum holding size', desc:`Caps holdings at a chosen %, redistributing the excess — try starting near ${fmtPctPlain(capPct)}.`, prefill:{capPct}});
  }
  // increase/decrease with a solo target are intercepted earlier as a clarifying question (see buildResponse).
  // Reaching here means either 2+ holdings were named explicitly (so the donor/destination is already known),
  // or a clarifying question has already been answered via resolveClarification.
  if (flags.increase && matched.length>=2){
    cards.push(...buildIncreaseCards(matched[0], matched[1], explicitPct, 'both'));
  }
  if (flags.decrease && matched.length>=2){
    cards.push(...buildDecreaseCards(matched[0], matched[1], explicitPct, 'both'));
  }
  if (flags.target){
    cards.push({presetId:'target', title:'Target allocation', desc:'Enter target weights directly inside a scenario and see the exact trades required.', prefill:{}});
  }
  // de-dupe by presetId+prefill signature, cap at 3
  const seen = new Set();
  return cards.filter(c => { const k = c.presetId+JSON.stringify(c.prefill); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0,3);
}

// Called when the client answers a clarifying question — via chip click or an interpreted
// free-text reply. overrideOther lets a directly-named holding take precedence over the default.
function resolveClarification(resolver, optionKey, holdings, overrideOther){
  const weighted = computeTotals(holdings).sort((a,b)=>b.weight-a.weight);
  const h = weighted.find(w=>w.id===resolver.holdingId);
  if (!h) return { lines:[`That holding isn't in your portfolio anymore — try asking again.`], cards: [] };
  const other = overrideOther ? weighted.find(w=>w.id===overrideOther.id) : weighted.find(w=>w.id!==h.id);
  const cards = resolver.kind==='increase'
    ? buildIncreaseCards(h, other, resolver.explicitPct, optionKey)
    : buildDecreaseCards(h, other, resolver.explicitPct, optionKey);
  const lead = cards.length>1 ? `Both routes work for that:` : (cards.length===1 ? `Here's the mechanism for that:` : `I couldn't find another holding to route this through — try adding more holdings first.`);
  return { lines:[lead], cards };
}

// Interprets a free-text reply against a still-open clarifying question — covers common
// natural phrasings for each option, plus directly naming a different holding (which
// implies "move it there" regardless of wording). Returns null if it genuinely can't tell,
// rather than guessing: a wrong silent guess is worse than asking again.
function classifyAnswerToQuestion(text, question, holdings){
  const lower = text.toLowerCase();
  const weighted = computeTotals(holdings);

  let overrideOther = null;
  weighted.forEach(h => {
    if (h.id === question.resolver.holdingId || !h.ticker) return;
    const re = new RegExp('\\b'+escapeRegex(h.ticker.toLowerCase())+'\\b');
    if (re.test(lower)) overrideOther = h;
  });

  const bothRe = /\bnot sure\b|\bdon'?t know\b|\bboth\b|\beither\b|\bdoesn'?t matter\b|\bno preference\b|\bwhatever\b/;
  if (bothRe.test(lower)) return {optionKey:'both', overrideOther};

  if (question.resolver.kind === 'increase'){
    const freshRe = /\bnew money\b|\bfresh (cash|capital|money)\b|\bwithout touching\b|\badditional (cash|money)\b|\btop(ping)? up\b|\badd(ing)? (more )?cash\b|\bnew capital\b|\bnew cash\b/;
    const moveRe = /\bmake room\b|\btrim\b|\breallocat|\bmove (money|some|it)? ?from\b|\bfree up\b|\bswap\b|\bsell (something|another)\b|\bshift\b|\bother holding/;
    if (freshRe.test(lower) && !moveRe.test(lower)) return {optionKey:'freshcash', overrideOther};
    if (moveRe.test(lower) && !freshRe.test(lower)) return {optionKey:'move', overrideOther};
    if (overrideOther) return {optionKey:'move', overrideOther};
  } else {
    const capRe = /\btoo (large|big|much|heavy|dominant)\b|\bconcentrat|\brisky\b|\bnervous\b|\bworried\b/;
    const moveRe = /\b(specific|another|different) holding\b|\bmove it\b|\bswap\b|\breallocat/;
    if (moveRe.test(lower) || overrideOther) return {optionKey:'move', overrideOther};
    if (capRe.test(lower)) return {optionKey:'cap', overrideOther};
  }
  return null;
}

// Routes a free-text send: if the previous system message left a question open, try to
// interpret the reply as an answer to it first; otherwise (or if that fails) fall through
// to the normal parser.
function handleUserMessage(text, holdings){
  const lastMsg = state.conversation[state.conversation.length-1];
  const pending = (lastMsg && lastMsg.role==='system' && lastMsg.question && !lastMsg.question.answered) ? lastMsg.question : null;

  if (pending){
    const cls = classifyAnswerToQuestion(text, pending, holdings);
    if (cls){
      pending.answered = true;
      return resolveClarification(pending.resolver, cls.optionKey, holdings, cls.overrideOther);
    }
  }
  const general = buildResponse(text, holdings);
  if (pending && general.cards.length===0 && !general.question){
    general.lines.push(`I couldn't tell how that answers the question above — you can tap one of those options directly, or try naming what you'd change more plainly (e.g. "new money" or "trim something else").`);
  }
  return general;
}

function buildResponse(text, holdings){
  const {matched, flags, weighted, explicitPct} = parseQuery(text, holdings);
  const mechanismFlags = ['increase','decrease','cap','equalize','consolidate','cash','target'];
  const hasMechanismIntent = mechanismFlags.some(f=>flags[f]);
  const lines = [];

  if (matched.length || flags.factual) lines.push(...factLines(matched, weighted, flags));

  // A single holding named with "more"/"less" language is genuinely ambiguous about *how* —
  // ask, the same way we'd ask before building anything, rather than guessing.
  const specificOtherIntent = flags.cap || flags.equalize || flags.consolidate || flags.cash || flags.target;
  const soloTarget = matched.length === 1;

  if (flags.increase && soloTarget && !specificOtherIntent){
    const h = matched[0];
    return {
      lines: [...lines, `Before pointing you anywhere — what's the goal in giving ${escapeHtml(h.ticker)} more prominence?`],
      cards: [],
      question: {
        options: [
          {key:'freshcash', label:'I want to add new money into it, without touching anything else'},
          {key:'move', label:'I want my other holdings to make room for it'},
          {key:'both', label:"Not sure yet — show me both routes"},
        ],
        resolver: {kind:'increase', holdingId:h.id, explicitPct},
      },
    };
  }
  if (flags.decrease && soloTarget && !specificOtherIntent){
    const h = matched[0];
    return {
      lines: [...lines, `What's driving the wish to reduce ${escapeHtml(h.ticker)}?`],
      cards: [],
      question: {
        options: [
          {key:'cap', label:"It's grown into too large a share of my portfolio"},
          {key:'move', label:'I want that money in a specific other holding'},
          {key:'both', label:"Not sure yet — show me both routes"},
        ],
        resolver: {kind:'decrease', holdingId:h.id, explicitPct},
      },
    };
  }

  let cards = [];
  if (hasMechanismIntent){
    cards = buildMechanismCards(flags, matched, weighted, explicitPct);
    if (cards.length === 0){
      lines.push(`I can see the direction, but not which holding — try naming it directly, e.g. "increase JEPQ" or "cap AAPL at 20%".`);
    } else if (flags.adviceSeeking){
      lines.push(`I can't tell you what to do — that's a decision for you, and for a regulated adviser if you want a recommendation on it. What I can do is show you the mechanisms that relate to what you've described:`);
    } else {
      lines.push(cards.length>1 ? `A few mechanisms relate to this:` : `This relates to a mechanism already in the Lab:`);
    }
  } else if (flags.adviceSeeking){
    lines.push(`I can't tell you what to do. Try describing the change you're weighing — e.g. "reduce my top holding" or "raise cash to 10%" — and I'll point you to the relevant mechanism.`);
  } else if (matched.length && !flags.factual){
    lines.push(`Noted on ${matched.map(m=>escapeHtml(m.ticker)).join(', ')}. If you want to explore a change, tell me what direction — more, less, capped, consolidated — and I'll surface the mechanism.`);
  } else if (!matched.length && !flags.factual){
    lines.push(`I couldn't tie that to a specific holding or mechanism. Try naming a holding directly (e.g. "JEPQ"), or describing a change (e.g. "cap my top holding at 15%", "raise cash to 10%", "equal weight everything").`);
  }

  return { lines, cards };
}

/* =============================== conversation panel =============================== */
function renderConversationPanel(host){
  host.innerHTML = `
    <div class="card card-pad convo-card">
      <div class="section-title">What's on your mind?</div>
      <p class="section-sub">Describe what you're thinking — a holding, a worry, a change you're weighing. This points you to facts already on the page or to relevant mechanisms. It never tells you what to do.</p>
      <div class="convo-feed" id="convo-feed"></div>
      <div class="convo-input-row">
        <textarea id="convo-input" placeholder="e.g. I want JEPQ to have more prominence, what should I do?"></textarea>
        <button class="btn btn-gold" id="convo-send">Ask</button>
      </div>
    </div>
  `;
  renderConvoFeed();
  const input = document.getElementById('convo-input');
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    const result = handleUserMessage(text, state.portfolio.holdings);
    state.conversation.push({role:'user', text});
    state.conversation.push({role:'system', lines: result.lines, cards: result.cards, question: result.question});
    input.value = '';
    renderConvoFeed();
  };
  document.getElementById('convo-send').onclick = send;
  input.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } };
}

function renderConvoFeed(){
  const feed = document.getElementById('convo-feed');
  if (!feed) return;
  if (state.conversation.length===0){
    feed.innerHTML = `<div class="convo-empty">No questions yet — try asking about a specific holding, or describe a change you're considering.</div>`;
    return;
  }
  feed.innerHTML = state.conversation.slice(-12).map(m => {
    if (m.role==='user'){
      return `<div class="convo-msg user"><div class="convo-bubble">${escapeHtml(m.text)}</div></div>`;
    }
    const cardsHtml = (m.cards && m.cards.length) ? `<div class="convo-cards">${m.cards.map((c,i) => `
      <button class="convo-card-item" data-card="${state.conversation.indexOf(m)}-${i}">
        <div class="ct">${escapeHtml(c.title)}</div>
        <div class="cd">${escapeHtml(c.desc)}</div>
        <span class="btn btn-ghost btn-sm" style="pointer-events:none;">Open this mechanism</span>
      </button>
    `).join('')}</div>` : '';
    const questionHtml = m.question ? `<div class="convo-question-options">${m.question.options.map(o => `
      <button class="convo-question-chip" data-qmsg="${state.conversation.indexOf(m)}" data-okey="${o.key}">${escapeHtml(o.label)}</button>
    `).join('')}</div>` : '';
    return `<div class="convo-msg system"><div class="convo-bubble">${m.lines.map(l=>`<p>${l}</p>`).join('')}${cardsHtml}${questionHtml}</div></div>`;
  }).join('');

  feed.querySelectorAll('.convo-card-item').forEach(btn => {
    btn.onclick = () => {
      const [msgIdx, cardIdx] = btn.dataset.card.split('-').map(Number);
      const msg = state.conversation[msgIdx];
      const card = msg.cards[cardIdx];
      routeToMechanism(card);
    };
  });
  feed.querySelectorAll('.convo-question-chip').forEach(btn => {
    btn.onclick = () => {
      const msgIdx = Number(btn.dataset.qmsg);
      const msg = state.conversation[msgIdx];
      msg.question.answered = true;
      const result = resolveClarification(msg.question.resolver, btn.dataset.okey, state.portfolio.holdings);
      state.conversation.push({role:'system', lines: result.lines, cards: result.cards});
      renderConvoFeed();
    };
  });
  feed.scrollTop = feed.scrollHeight;
}

function routeToMechanism(card){
  if (card.presetId === 'target'){
    state.view = 'optimise';
    render();
    let sc = state.currentScenarioTabId !== 'current' ? getScenario(state.currentScenarioTabId) : null;
    if (!sc){
      if (state.activeScenarioIds.length>=3){ showToast('Up to 3 scenarios can be active at once. Select an existing scenario tab, or close one first.'); return; }
      sc = createScenario('Scenario ' + (state.scenarios.length+1));
      state.currentScenarioTabId = sc.id;
      renderScenarioTabs(); renderScenarioBody();
    }
    document.getElementById('target-weights-root')?.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  if (state.view !== 'optimise'){ state.view = 'optimise'; render(); }
  openPresetModal(card.presetId, card.prefill);
}
