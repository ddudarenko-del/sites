const state = {
  publishers: [],
  filtered: [],
  meta: {},
  activeView: 'all',
  activeStage: 'all',
  activeQueue: 'all',
};

const VIEWS = [
  {
    key: 'all',
    label: 'All publishers',
    description: 'Complete register',
    match: () => true,
  },
  {
    key: 'active',
    label: 'Active partners',
    description: 'Live relationships',
    match: item => item.status === 'active' || item.relationship_stage === 'active_partner',
  },
  {
    key: 'banner',
    label: 'Banner inventory',
    description: 'Banner-capable sites',
    match: item => item.placement_types.includes('banner'),
  },
  {
    key: 'widget',
    label: 'Widget inventory',
    description: 'Widget-capable sites',
    match: item => item.placement_types.includes('widget'),
  },
  {
    key: 'incomplete',
    label: 'Needs enrichment',
    description: 'Missing key context',
    match: item => item._derived.coverageScore < 4,
  },
];

const PIPELINE_STAGES = [
  { key: 'researching', label: 'Researching', description: 'Not yet qualified' },
  { key: 'contacted', label: 'Contacted', description: 'Initial touch sent' },
  { key: 'waiting_reply', label: 'Waiting reply', description: 'Awaiting response' },
  { key: 'negotiating', label: 'Negotiating', description: 'Terms in motion' },
  { key: 'active_partner', label: 'Active', description: 'Live partner' },
  { key: 'paused', label: 'Paused', description: 'On hold' },
  { key: 'no_fit', label: 'No-fit', description: 'Not commercially viable' },
];

const QUEUES = [
  {
    key: 'all',
    label: 'Everything',
    description: 'No queue filter',
    match: () => true,
  },
  {
    key: 'terms_unknown',
    label: 'Unknown deal model',
    description: 'Terms still missing',
    match: item => item._derived.dealKnown === false,
  },
  {
    key: 'needs_context',
    label: 'Missing market context',
    description: 'Add niche / geo / language',
    match: item => item._derived.contextMissing > 0,
  },
  {
    key: 'no_touch_history',
    label: 'No touch history',
    description: 'No visible last contact',
    match: item => !item.last_contact,
  },
  {
    key: 'followup_due',
    label: 'Follow-up scheduled',
    description: 'Has next action date',
    match: item => Boolean(item.next_followup),
  },
  {
    key: 'multi_placement',
    label: 'Multi-placement',
    description: 'Can run banner + widget',
    match: item => item._derived.multiPlacement,
  },
];

const statusFilter = document.getElementById('statusFilter');
const placementFilter = document.getElementById('placementFilter');
const stageFilter = document.getElementById('stageFilter');
const sortFilter = document.getElementById('sortFilter');
const searchInput = document.getElementById('searchInput');
const statsEl = document.getElementById('stats');
const pipelineBoardEl = document.getElementById('pipelineBoard');
const queueGridEl = document.getElementById('queueGrid');
const viewStripEl = document.getElementById('viewStrip');
const tableEl = document.getElementById('publisherTable');
const resultCountEl = document.getElementById('resultCount');
const heroNoteEl = document.getElementById('heroNote');
const overviewCardEl = document.getElementById('overviewCard');
const coverageCardEl = document.getElementById('coverageCard');
const placementCardEl = document.getElementById('placementCard');
const insightsCardEl = document.getElementById('insightsCard');

function slug(value) {
  return String(value || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'default';
}

function badgeClass(value) {
  const key = slug(value);
  const allowed = new Set([
    'active',
    'approved',
    'active_partner',
    'negotiating',
    'contacted',
    'researching',
    'waiting_reply',
    'unknown',
    'needs_enrichment',
    'no_fit',
    'rejected',
    'paused',
  ]);
  return allowed.has(key) ? key : 'default';
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysFromToday(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function safeDate(value) {
  return value || '—';
}

function prettyLabel(value) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

function sourceShortLabel(label) {
  if (!label) return 'Source';
  return label
    .replace(/Denis screenshots? 2026-06-09\s*\/\s*/i, '')
    .replace(/publishers?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function derivePublisher(item) {
  const nicheKnown = Boolean(item.niche);
  const geoKnown = Array.isArray(item.geo) && item.geo.length > 0;
  const languageKnown = Array.isArray(item.languages) && item.languages.length > 0;
  const dealKnown = Boolean(item.deal_model && item.deal_model !== 'unknown');
  const lastTouchKnown = Boolean(item.last_contact);
  const nextStepKnown = Boolean(item.next_followup);
  const coverageScore = [nicheKnown, geoKnown, languageKnown, dealKnown, lastTouchKnown, nextStepKnown].filter(Boolean).length;
  const followupDays = daysFromToday(item.next_followup);
  const lastTouchDays = daysFromToday(item.last_contact);

  return {
    nicheKnown,
    geoKnown,
    languageKnown,
    dealKnown,
    lastTouchKnown,
    nextStepKnown,
    coverageScore,
    contextMissing: [nicheKnown, geoKnown, languageKnown].filter(flag => !flag).length,
    followupDays,
    lastTouchDays,
    overdue: followupDays !== null && followupDays < 0,
    upcoming: followupDays !== null && followupDays >= 0 && followupDays <= 7,
    staleTouch: lastTouchDays !== null && lastTouchDays <= -14,
    multiPlacement: (item.placement_types || []).length > 1,
    placementSummary: (item.placement_types || []).join(' + ') || '—',
    sourceSummary: uniq((item.source_labels || []).map(sourceShortLabel)),
  };
}

function withDerivedData(rows) {
  return rows.map(item => ({
    ...item,
    placement_types: item.placement_types || [],
    source_labels: item.source_labels || [],
    geo: item.geo || [],
    languages: item.languages || [],
    _derived: derivePublisher(item),
  }));
}

function calculateMetrics(rows) {
  return {
    total: rows.length,
    active: rows.filter(item => item.status === 'active' || item.relationship_stage === 'active_partner').length,
    banner: rows.filter(item => item.placement_types.includes('banner')).length,
    widget: rows.filter(item => item.placement_types.includes('widget')).length,
    multiPlacement: rows.filter(item => item._derived.multiPlacement).length,
    termsUnknown: rows.filter(item => !item._derived.dealKnown).length,
    needsContext: rows.filter(item => item._derived.contextMissing > 0).length,
    noTouchHistory: rows.filter(item => !item._derived.lastTouchKnown).length,
    scheduledFollowups: rows.filter(item => item._derived.nextStepKnown).length,
    overdue: rows.filter(item => item._derived.overdue).length,
    avgCoverage: rows.length
      ? Math.round((rows.reduce((sum, item) => sum + item._derived.coverageScore, 0) / (rows.length * 6)) * 100)
      : 0,
  };
}

function countForStage(rows, key) {
  return rows.filter(item => {
    if (key === 'no_fit') return item.status === 'no-fit' || item.relationship_stage === 'no_fit';
    return item.relationship_stage === key;
  }).length;
}

function renderStats(rows) {
  const metrics = calculateMetrics(rows);
  const bannerOnly = metrics.banner - metrics.multiPlacement;
  const widgetOnly = metrics.widget - metrics.multiPlacement;
  const statCards = [
    ['Total publishers', metrics.total, `${metrics.active} currently marked active`],
    ['Banner capable', metrics.banner, `${bannerOnly} banner-only publishers`],
    ['Widget capable', metrics.widget, `${widgetOnly} widget-only publishers`],
    ['Unknown deal model', metrics.termsUnknown, 'Fill in terms for cleaner CRM visibility'],
    ['Need context', metrics.needsContext, 'Niche / geo / language missing'],
    ['Coverage score', `${metrics.avgCoverage}%`, 'Visible profile completeness'],
  ];

  statsEl.innerHTML = statCards.map(([label, value, meta]) => `
    <article class="stat-card card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-meta">${meta}</div>
    </article>
  `).join('');

  heroNoteEl.textContent = `${metrics.active} active partners tracked. ${metrics.termsUnknown} still need explicit deal-model capture, and ${metrics.needsContext} need richer market context to behave like a real CRM.`;
}

function renderViews(rows) {
  const counts = Object.fromEntries(VIEWS.map(view => [view.key, rows.filter(view.match).length]));
  viewStripEl.innerHTML = VIEWS.map(view => `
    <button class="view-pill ${state.activeView === view.key ? 'active' : ''}" type="button" data-view="${view.key}">
      <strong>${view.label}</strong>
      <span>${counts[view.key]} · ${view.description}</span>
    </button>
  `).join('');

  viewStripEl.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
      applyFilters();
      renderViews(state.publishers);
    });
  });
}

function renderPipeline(rows) {
  const total = rows.length || 1;
  pipelineBoardEl.innerHTML = PIPELINE_STAGES.map(stage => {
    const value = countForStage(rows, stage.key);
    const width = Math.max((value / total) * 100, value ? 6 : 0);
    const active = state.activeStage === stage.key;
    return `
      <button class="pipeline-card ${active ? 'active' : ''}" type="button" data-stage="${stage.key}">
        <div class="pipeline-top">
          <div>
            <div class="pipeline-name">${stage.label}</div>
            <div class="pipeline-meta">${stage.description}</div>
          </div>
          <div class="pipeline-value">${value}</div>
        </div>
        <div class="pipeline-bar"><div class="pipeline-fill" style="width:${width}%"></div></div>
      </button>
    `;
  }).join('');

  pipelineBoardEl.querySelectorAll('[data-stage]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeStage = state.activeStage === button.dataset.stage ? 'all' : button.dataset.stage;
      applyFilters();
      renderPipeline(state.publishers);
    });
  });
}

function renderQueues(rows) {
  const total = rows.length || 1;
  queueGridEl.innerHTML = QUEUES.filter(queue => queue.key !== 'all').map(queue => {
    const value = rows.filter(queue.match).length;
    const active = state.activeQueue === queue.key;
    return `
      <button class="queue-card ${active ? 'active' : ''}" type="button" data-queue="${queue.key}">
        <div class="queue-top">
          <div>
            <div class="queue-name">${queue.label}</div>
            <div class="queue-meta">${queue.description}</div>
          </div>
          <div class="queue-value">${value}</div>
        </div>
        <div class="pipeline-bar"><div class="pipeline-fill" style="width:${Math.max((value / total) * 100, value ? 6 : 0)}%"></div></div>
      </button>
    `;
  }).join('');

  queueGridEl.querySelectorAll('[data-queue]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeQueue = state.activeQueue === button.dataset.queue ? 'all' : button.dataset.queue;
      applyFilters();
      renderQueues(state.publishers);
    });
  });
}

function coverageClass(score) {
  if (score <= 2) return 'low';
  if (score <= 4) return 'medium';
  return 'high';
}

function renderOverview(rows) {
  const metrics = calculateMetrics(rows);
  overviewCardEl.innerHTML = `
    <div class="side-head">
      <div>
        <p class="section-kicker">Operating posture</p>
        <h3>CRM health</h3>
      </div>
    </div>
    <ul class="mini-list">
      <li><span>Source of truth</span><span class="metric-strong">Git-backed repo</span></li>
      <li><span>Share policy</span><span class="metric-strong">Sanitized export only</span></li>
      <li><span>Current active view</span><span class="metric-strong">${VIEWS.find(view => view.key === state.activeView)?.label || 'All publishers'}</span></li>
      <li><span>Current stage focus</span><span class="metric-strong">${state.activeStage === 'all' ? 'All stages' : PIPELINE_STAGES.find(stage => stage.key === state.activeStage)?.label || state.activeStage}</span></li>
    </ul>
    <div class="dual-metric">
      <div class="metric-box">
        <div class="label">Visible coverage</div>
        <div class="value">${metrics.avgCoverage}%</div>
      </div>
      <div class="metric-box">
        <div class="label">Scheduled follow-ups</div>
        <div class="value">${metrics.scheduledFollowups}</div>
      </div>
    </div>
  `;
}

function renderCoverage(rows) {
  const missingTerms = rows.filter(item => !item._derived.dealKnown).length;
  const missingContext = rows.filter(item => item._derived.contextMissing > 0).length;
  const missingTouch = rows.filter(item => !item._derived.lastTouchKnown).length;
  const lowCoverage = rows.filter(item => item._derived.coverageScore <= 2).length;

  coverageCardEl.innerHTML = `
    <div class="side-head">
      <div>
        <p class="section-kicker">Coverage gaps</p>
        <h3>Data completeness</h3>
      </div>
    </div>
    <ul class="mini-list">
      <li><span>Missing deal model</span><span class="metric-strong">${missingTerms}</span></li>
      <li><span>Missing market context</span><span class="metric-strong">${missingContext}</span></li>
      <li><span>No touch history</span><span class="metric-strong">${missingTouch}</span></li>
      <li><span>Low-coverage profiles</span><span class="metric-strong">${lowCoverage}</span></li>
    </ul>
    <p class="hint">Coverage uses only share-safe fields: niche, geo, language, deal model, last touch, and next follow-up.</p>
  `;
}

function renderPlacement(rows) {
  const bannerOnly = rows.filter(item => item.placement_types.includes('banner') && !item.placement_types.includes('widget')).length;
  const widgetOnly = rows.filter(item => item.placement_types.includes('widget') && !item.placement_types.includes('banner')).length;
  const both = rows.filter(item => item._derived.multiPlacement).length;

  placementCardEl.innerHTML = `
    <div class="side-head">
      <div>
        <p class="section-kicker">Inventory mix</p>
        <h3>Placement coverage</h3>
      </div>
    </div>
    <ul class="mini-list">
      <li><span>Banner only</span><span class="metric-strong">${bannerOnly}</span></li>
      <li><span>Widget only</span><span class="metric-strong">${widgetOnly}</span></li>
      <li><span>Multi-placement</span><span class="metric-strong">${both}</span></li>
    </ul>
    <p class="hint">Use this split to see whether the supply side is concentrated in banner inventory or balanced across placements.</p>
  `;
}

function renderInsights(rows) {
  const insights = [];
  const metrics = calculateMetrics(rows);

  if (metrics.termsUnknown > 0) {
    insights.push({
      title: 'Deal-model capture is the biggest gap',
      body: `${metrics.termsUnknown} publishers still show unknown terms, so CRM visibility is weaker than it should be.`
    });
  }

  if (metrics.needsContext > 0) {
    insights.push({
      title: 'Context enrichment should be the first cleanup pass',
      body: `${metrics.needsContext} records still lack niche, geo, or language context.`
    });
  }

  if (metrics.noTouchHistory > 0) {
    insights.push({
      title: 'Outreach timeline is not yet visible',
      body: `${metrics.noTouchHistory} records do not expose any last-contact date in the dashboard layer.`
    });
  }

  if (!insights.length) {
    insights.push({
      title: 'Dashboard is healthy',
      body: 'All current share-safe CRM signals look populated.'
    });
  }

  insightsCardEl.innerHTML = `
    <div class="side-head">
      <div>
        <p class="section-kicker">Insights</p>
        <h3>Operator notes</h3>
      </div>
    </div>
    <div class="insight-list">
      ${insights.map(insight => `
        <article class="insight">
          <strong>${insight.title}</strong>
          <div class="muted">${insight.body}</div>
        </article>
      `).join('')}
    </div>
  `;
}

function matchesStage(item, stageValue) {
  if (stageValue === 'all') return true;
  if (stageValue === 'no_fit') return item.status === 'no-fit' || item.relationship_stage === 'no_fit';
  return item.relationship_stage === stageValue;
}

function matchesQueue(item) {
  const queue = QUEUES.find(entry => entry.key === state.activeQueue) || QUEUES[0];
  return queue.match(item);
}

function sortRows(rows) {
  const sorter = sortFilter.value;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sorter === 'domain_asc') return a.domain.localeCompare(b.domain);
    if (sorter === 'next_followup_asc') {
      const aDays = a._derived.followupDays;
      const bDays = b._derived.followupDays;
      if (aDays === null && bDays === null) return a.domain.localeCompare(b.domain);
      if (aDays === null) return 1;
      if (bDays === null) return -1;
      return aDays - bDays;
    }
    if (sorter === 'last_contact_desc') {
      const aDate = parseDate(a.last_contact)?.getTime() || 0;
      const bDate = parseDate(b.last_contact)?.getTime() || 0;
      return bDate - aDate || a.domain.localeCompare(b.domain);
    }
    const aDate = parseDate(a.updated_at)?.getTime() || 0;
    const bDate = parseDate(b.updated_at)?.getTime() || 0;
    return bDate - aDate || a.domain.localeCompare(b.domain);
  });
  return sorted;
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const placement = placementFilter.value;
  const stageValue = stageFilter.value;

  const view = VIEWS.find(entry => entry.key === state.activeView) || VIEWS[0];

  state.filtered = sortRows(state.publishers.filter(item => {
    const matchesQuery = !query || item.domain.toLowerCase().includes(query);
    const matchesStatus = status === 'all' || item.status === status;
    const matchesPlacement = placement === 'all' || item.placement_types.includes(placement);
    const matchesStageFilter = matchesStage(item, stageValue);
    const matchesStageCard = matchesStage(item, state.activeStage);
    const matchesView = view.match(item);
    return matchesQuery && matchesStatus && matchesPlacement && matchesStageFilter && matchesStageCard && matchesView && matchesQueue(item);
  }));

  renderTable();
  renderOverview(state.filtered);
  renderCoverage(state.filtered);
  renderPlacement(state.filtered);
  renderInsights(state.filtered);
}

function renderTable() {
  resultCountEl.textContent = `${state.filtered.length} shown`;

  if (!state.filtered.length) {
    tableEl.innerHTML = '<tr><td class="empty" colspan="9">No publishers match the current CRM filters.</td></tr>';
    return;
  }

  tableEl.innerHTML = state.filtered.map(item => {
    const score = item._derived.coverageScore;
    const percent = Math.round((score / 6) * 100);
    return `
      <tr>
        <td>
          <div class="domain">${item.domain}</div>
          <div class="meta-line">${item.id}</div>
        </td>
        <td>
          <div class="coverage">
            <div class="coverage-top">
              <span>${score}/6 fields</span>
              <span>${percent}%</span>
            </div>
            <div class="coverage-bar">
              <div class="coverage-fill ${coverageClass(score)}" style="width:${percent}%"></div>
            </div>
          </div>
        </td>
        <td>
          <div class="inline-stack">
            <span class="badge ${badgeClass(item.status)}">${prettyLabel(item.status)}</span>
            <span class="badge ${badgeClass(item.fit_status || 'unknown')}">${prettyLabel(item.fit_status || 'unknown')}</span>
          </div>
        </td>
        <td><span class="badge ${badgeClass(item.relationship_stage || 'unknown')}">${prettyLabel(item.relationship_stage || 'unknown')}</span></td>
        <td><div class="pills">${item.placement_types.map(value => `<span class="pill">${prettyLabel(value)}</span>`).join('')}</div></td>
        <td>${item.deal_model ? `<span class="badge ${badgeClass(item.deal_model)}">${prettyLabel(item.deal_model)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${safeDate(item.last_contact)}</td>
        <td>${safeDate(item.next_followup)}</td>
        <td><div class="pills">${item._derived.sourceSummary.map(value => `<span class="source-pill">${value}</span>`).join('')}</div></td>
      </tr>
    `;
  }).join('');
}

function populateFilters(rows) {
  const statuses = uniq(rows.map(item => item.status)).sort();
  const placements = uniq(rows.flatMap(item => item.placement_types)).sort();

  statusFilter.innerHTML = '<option value="all">All statuses</option>' + statuses.map(value => `<option value="${value}">${prettyLabel(value)}</option>`).join('');
  placementFilter.innerHTML = '<option value="all">All placements</option>' + placements.map(value => `<option value="${value}">${prettyLabel(value)}</option>`).join('');
  stageFilter.innerHTML = '<option value="all">All stages</option>' + PIPELINE_STAGES.map(stage => `<option value="${stage.key}">${stage.label}</option>`).join('');
}

function resetFilters() {
  searchInput.value = '';
  statusFilter.value = 'all';
  placementFilter.value = 'all';
  stageFilter.value = 'all';
  sortFilter.value = 'updated_desc';
  state.activeView = 'all';
  state.activeStage = 'all';
  state.activeQueue = 'all';
  renderViews(state.publishers);
  renderPipeline(state.publishers);
  renderQueues(state.publishers);
  applyFilters();
}

async function init() {
  const res = await fetch('./data/publishers.dashboard.json');
  const payload = await res.json();
  state.meta = payload.meta || {};
  state.publishers = withDerivedData(payload.publishers || []);

  populateFilters(state.publishers);
  renderStats(state.publishers);
  renderViews(state.publishers);
  renderPipeline(state.publishers);
  renderQueues(state.publishers);
  applyFilters();
}

searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);
placementFilter.addEventListener('change', applyFilters);
stageFilter.addEventListener('change', applyFilters);
sortFilter.addEventListener('change', applyFilters);

document.getElementById('clearFiltersButton').addEventListener('click', resetFilters);
document.getElementById('resetStageButton').addEventListener('click', () => {
  state.activeStage = 'all';
  renderPipeline(state.publishers);
  applyFilters();
});
document.getElementById('resetQueueButton').addEventListener('click', () => {
  state.activeQueue = 'all';
  renderQueues(state.publishers);
  applyFilters();
});

init().catch(err => {
  console.error(err);
  resultCountEl.textContent = 'Failed to load dashboard data';
  tableEl.innerHTML = '<tr><td class="empty" colspan="9">Dashboard data could not be loaded.</td></tr>';
});
