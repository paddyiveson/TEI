window.TEI = window.TEI || {};

(function(){
  if(window.Chart){
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = 'rgba(247,244,237,0.65)';
    Chart.defaults.plugins.legend.display = false;
  }

  const NAVY = '#7FA3C7', GOLD = '#C9A84C', OXBLOOD = '#B96878', FOREST = '#7FAE8C', GRID = 'rgba(247,244,237,0.08)';
  const FILL_NAVY = 'rgba(127,163,199,0.14)';
  const ACCT_COLORS = ['#C9A84C', '#7FA3C7', '#7FAE8C', '#B96878', '#B49BD1', '#D9BE6B'];

  const chartRefs = {};
  function makeChart(id, config){
    const el = document.getElementById(id);
    if(!el || !window.Chart) return null;
    if(chartRefs[id]) chartRefs[id].destroy();
    chartRefs[id] = new Chart(el, config);
    return chartRefs[id];
  }
  // Chart.defaults.color is a fixed cream tone (correct for dark mode only) —
  // any chart element that does not override its color inherits it, and goes
  // invisible against light mode's cream page background. Chart elements are
  // drawn once at creation time and do not auto-update on a theme toggle, so
  // this reads the live theme at the moment each chart is actually built.
  //
  // This used to read --k-ink/--k-ink-softer via getComputedStyle, which on
  // paper should track the theme fine (the CSS custom properties themselves
  // are correct and every plain HTML element using them renders correctly) —
  // but repeated real-world testing kept showing washed-out axis labels in
  // light mode regardless, i.e. this specific getComputedStyle read was not
  // reliably resolving before Chart.js consumed the value. currentGrid()
  // below never had that problem because it just checks the data-theme
  // attribute directly with no CSS custom property lookup in between --
  // switched to the same direct approach here rather than keep chasing the
  // computed-style path.
  function currentInk(){
    const theme = document.getElementById('clientApp').getAttribute('data-theme');
    return theme === 'light' ? '#1D2733' : '#F7F4ED';
  }
  function currentInkSoft(){
    const theme = document.getElementById('clientApp').getAttribute('data-theme');
    return theme === 'light' ? '#44608A' : 'rgba(247,244,237,0.7)';
  }
  function currentGrid(){
    const theme = document.getElementById('clientApp').getAttribute('data-theme');
    return theme === 'light' ? 'rgba(29,53,87,0.10)' : 'rgba(247,244,237,0.08)';
  }
  // Same problem again, but for the wealth-projection scenario lines: NAVY/
  // OXBLOOD/FOREST are pastels tuned to pop against a dark card and go
  // low-contrast against light mode's white/cream one. Darker, same-hue-family
  // stand-ins (matching --k-down-ink/--k-up-ink's light-theme values) keep dark
  // mode's look untouched and fix light mode.
  function currentRateColor(key){
    const theme = document.getElementById('clientApp').getAttribute('data-theme');
    if(theme === 'light'){
      return {conservative:'#93414C', base:'#2C4A73', optimistic:'#3F6A4A'}[key];
    }
    return {conservative:OXBLOOD, base:NAVY, optimistic:FOREST}[key];
  }

  TEI.charts = { NAVY, GOLD, OXBLOOD, FOREST, GRID, FILL_NAVY, ACCT_COLORS, makeChart, currentInk, currentInkSoft, currentGrid, currentRateColor };
})();

