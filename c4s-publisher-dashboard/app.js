const state = {
  publishers: [],
  filtered: [],
  meta: {},
  activeView: 'new',
  activeStage: 'all',
  activeQueue: 'all',
};

function isPartner(item) {
  return item.status === 'active' || item.relationship_stage === 'active_partner';
}

function isNoFit(item) {
  return ['no-fit', 'no_fit', 'rejected'].includes(item.status)
    || ['no-fit', 'no_fit', 'rejected'].includes(item.fit_status)
    || ['no_fit', 'rejected'].includes(item.relationship_stage);
}

function isNewLead(item) {
  return item.status === 'prospect' || item.relationship_stage === 'researching' || item.segment === 'similar_sites';
}

const VIEWS = [
  {
    key: 'all',
    label: 'Publishers',
    description: 'All tracked',
    match: () => true,
  },
  {
    key: 'active',
    label: 'Partners',
    description: 'Working now',
    match: item => isPartner(item),
  },
  {
    key: 'reached',
    label: 'Reached',
    description: 'No fit',
    match: item => isNoFit(item),
  },
  {
    key: 'new',
    label: 'New',
    description: 'Research pool',
    match: item => isNewLead(item),
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
    description: 'All rows',
    match: () => true,
  },
  {
    key: 'terms_unknown',
    label: 'Unknown deal model',
    description: 'Terms missing',
    match: item => item._derived.dealKnown === false,
  },
  {
    key: 'needs_context',
    label: 'Missing market context',
    description: 'Need niche / geo / language',
    match: item => item._derived.contextMissing > 0,
  },
  {
    key: 'no_touch_history',
    label: 'No touch history',
    description: 'No last contact',
    match: item => !item.last_contact,
  },
  {
    key: 'followup_due',
    label: 'Follow-up scheduled',
    description: 'Has follow-up date',
    match: item => Boolean(item.next_followup),
  },
  {
    key: 'multi_placement',
    label: 'Multi-placement',
    description: 'Banner + widget',
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
const viewSelectEl = document.getElementById('viewSelect');
const tableEl = document.getElementById('publisherTable');
const mobileListEl = document.getElementById('mobileList');
const resultCountEl = document.getElementById('resultCount');
const heroTitleEl = document.getElementById('heroTitle');
const heroSubcopyEl = document.getElementById('heroSubcopy');
const heroStatsEl = document.getElementById('heroStats');
const heroNoteEl = document.getElementById('heroNote');
const listKickerEl = document.getElementById('listKicker');
const listTitleEl = document.getElementById('listTitle');
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
    'prospect',
    'approved',
    'unverified',
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

function publisherUrl(domain) {
  const value = String(domain || '').trim();
  if (!value) return '#';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function prettyLabel(value) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

function sourceShortLabel(label) {
  if (!label) return 'Source';
  return label
    .replace(/Denis screenshots? 2026-06-09\s*\/\s*/i, '')
    .replace(/similar-site research 2026-06-09\s*\/\s*/i, '')
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
    segment: item.segment || 'portfolio',
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
    active: rows.filter(item => isPartner(item)).length,
    noFit: rows.filter(item => isNoFit(item)).length,
    newLeads: rows.filter(item => isNewLead(item)).length,
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

function currentView() {
  return VIEWS.find(entry => entry.key === state.activeView) || VIEWS[0];
}

function renderHero() {
  const metrics = calculateMetrics(state.publishers);
  const shown = state.filtered.length;
  const view = currentView();

  const titles = {
    new: 'New sites first',
    active: 'Active partners',
    reached: 'Reached / no-fit',
    all: 'All publishers',
  };

  heroTitleEl.textContent = titles[view.key] || view.label;
  heroSubcopyEl.textContent = 'Open the site directly. Use the arrow for details only when you need them.';
  heroStatsEl.innerHTML = [
    ['New', metrics.newLeads, view.key === 'new'],
    ['Partners', metrics.active, view.key === 'active'],
    ['Reached', metrics.noFit, view.key === 'reached'],
  ].map(([label, value, active]) => `
    <span class="hero-chip ${active ? 'hero-chip-accent' : ''}">${label}: ${value}</span>
  `).join('');

  heroNoteEl.textContent = `${shown} shown now in ${view.label}. ${metrics.newLeads} new, ${metrics.active} partners, ${metrics.noFit} reached.`;
}

function countForStage(rows, key) {
  return rows.filter(item => {
    if (key === 'no_fit') return isNoFit(item);
    return item.relationship_stage === key;
  }).length;
}

function renderStats(rows) {
  const metrics = calculateMetrics(rows);
  const bannerOnly = metrics.banner - metrics.multiPlacement;
  const widgetOnly = metrics.widget - metrics.multiPlacement;
  const statCards = [
    ['Publishers', metrics.total, `${metrics.active} partners`],
    ['New', metrics.newLeads, 'Research pool'],
    ['Reached', metrics.noFit, 'No fit'],
    ['Banner capable', metrics.banner, `${bannerOnly} banner only`],
    ['Widget capable', metrics.widget, `${widgetOnly} widget only`],
    ['Unknown deal model', metrics.termsUnknown, 'Needs terms'],
  ];

  statsEl.innerHTML = statCards.map(([label, value, meta]) => `
    <article class="stat-card card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-meta">${meta}</div>
    </article>
  `).join('');
}

function renderViews(rows) {
  const counts = Object.fromEntries(VIEWS.map(view => [view.key, rows.filter(view.match).length]));
  viewStripEl.innerHTML = VIEWS.map(view => `
    <button class="view-pill ${state.activeView === view.key ? 'active' : ''}" type="button" data-view="${view.key}">
      <strong>${view.label}</strong>
      <span>${counts[view.key]} · ${view.description}</span>
    </button>
  `).join('');

  viewSelectEl.innerHTML = VIEWS.map(view => `
    <option value="${view.key}" ${state.activeView === view.key ? 'selected' : ''}>${view.label} · ${counts[view.key]} · ${view.description}</option>
  `).join('');

  viewStripEl.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeView = button.dataset.view;
      viewSelectEl.value = state.activeView;
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
        <p class="section-kicker">Overview</p>
        <h3>Current view</h3>
      </div>
    </div>
    <ul class="mini-list">
      <li><span>View</span><span class="metric-strong">${VIEWS.find(view => view.key === state.activeView)?.label || 'Publishers'}</span></li>
      <li><span>Stage</span><span class="metric-strong">${state.activeStage === 'all' ? 'All stages' : PIPELINE_STAGES.find(stage => stage.key === state.activeStage)?.label || state.activeStage}</span></li>
      <li><span>Shown</span><span class="metric-strong">${rows.length}</span></li>
      <li><span>Follow-ups</span><span class="metric-strong">${metrics.scheduledFollowups}</span></li>
    </ul>
    <div class="dual-metric">
      <div class="metric-box">
        <div class="label">Coverage</div>
        <div class="value">${metrics.avgCoverage}%</div>
      </div>
      <div class="metric-box">
        <div class="label">Unknown terms</div>
        <div class="value">${metrics.termsUnknown}</div>
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
  `;
}

function renderInsights(rows) {
  const insights = [];
  const metrics = calculateMetrics(rows);

  if (metrics.termsUnknown > 0) {
    insights.push({
      title: 'Unknown deal models',
      body: `${metrics.termsUnknown} publishers.`
    });
  }

  if (metrics.needsContext > 0) {
    insights.push({
      title: 'Missing context',
      body: `${metrics.needsContext} records missing niche, geo, or language.`
    });
  }

  if (metrics.noTouchHistory > 0) {
    insights.push({
      title: 'No touch history',
      body: `${metrics.noTouchHistory} records without last contact date.`
    });
  }

  if (!insights.length) {
    insights.push({
      title: 'No major gaps',
      body: 'All current fields are populated.'
    });
  }

  insightsCardEl.innerHTML = `
    <div class="side-head">
      <div>
        <p class="section-kicker">Notes</p>
        <h3>Gaps</h3>
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
  if (stageValue === 'no_fit') return isNoFit(item);
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

  const view = currentView();

  state.filtered = sortRows(state.publishers.filter(item => {
    const matchesQuery = !query || item.domain.toLowerCase().includes(query);
    const matchesStatus = status === 'all' || item.status === status;
    const matchesPlacement = placement === 'all' || item.placement_types.includes(placement);
    const matchesStageFilter = matchesStage(item, stageValue);
    const matchesStageCard = matchesStage(item, state.activeStage);
    const matchesView = view.match(item);
    return matchesQuery && matchesStatus && matchesPlacement && matchesStageFilter && matchesStageCard && matchesView && matchesQueue(item);
  }));

  renderHero();
  renderTable();
  renderOverview(state.filtered);
  renderCoverage(state.filtered);
  renderPlacement(state.filtered);
  renderInsights(state.filtered);
}

function renderMobileCards(rows) {
  if (!rows.length) {
    mobileListEl.innerHTML = '<article class="mobile-card empty">No publishers match the filters.</article>';
    return;
  }

  mobileListEl.innerHTML = rows.map(item => {
    const score = item._derived.coverageScore;
    const percent = Math.round((score / 6) * 100);
    return `
      <details class="mobile-card mobile-card-shell">
        <summary class="mobile-card-summary">
          <a class="domain-link mobile-domain-link" href="${publisherUrl(item.domain)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${item.domain}</a>
          <span class="mobile-card-arrow" aria-hidden="true"></span>
        </summary>

        <div class="mobile-card-body">
          <div class="meta-line mobile-meta-line">${item.id}</div>

          <div class="coverage mobile-coverage">
            <div class="coverage-top">
              <span>${score}/6 fields</span>
              <span>${percent}%</span>
            </div>
            <div class="coverage-bar">
              <div class="coverage-fill ${coverageClass(score)}" style="width:${percent}%"></div>
            </div>
          </div>

          <div class="inline-stack mobile-badge-row">
            <span class="badge ${badgeClass(item.status)}">${prettyLabel(item.status)}</span>
            <span class="badge ${badgeClass(item.fit_status || 'unknown')}">${prettyLabel(item.fit_status || 'unknown')}</span>
            <span class="badge ${badgeClass(item.relationship_stage || 'unknown')}">${prettyLabel(item.relationship_stage || 'unknown')}</span>
          </div>

          <div class="mobile-pill-row">
            ${item.placement_types.map(value => `<span class="pill">${prettyLabel(value)}</span>`).join('') || '<span class="muted">No placements set</span>'}
          </div>

          <div class="mobile-detail-grid">
            <div class="mobile-kv">
              <span class="stack-label">Deal model</span>
              <strong>${item.deal_model ? prettyLabel(item.deal_model) : '—'}</strong>
            </div>
            <div class="mobile-kv">
              <span class="stack-label">Last touch</span>
              <strong>${safeDate(item.last_contact)}</strong>
            </div>
            <div class="mobile-kv">
              <span class="stack-label">Next follow-up</span>
              <strong>${safeDate(item.next_followup)}</strong>
            </div>
            <div class="mobile-kv mobile-kv-wide">
              <span class="stack-label">Sources</span>
              <div class="pills">${item._derived.sourceSummary.map(value => `<span class="source-pill">${value}</span>`).join('')}</div>
            </div>
          </div>
        </div>
      </details>
    `;
  }).join('');
}

function renderTable() {
  const view = currentView();
  listKickerEl.textContent = view.key === 'new' ? 'Start here' : 'Publisher register';
  listTitleEl.textContent = view.key === 'new' ? 'New sites' : view.label;
  resultCountEl.textContent = `${state.filtered.length} shown`;

  if (!state.filtered.length) {
    tableEl.innerHTML = '<tr><td class="empty" colspan="9">No publishers match the filters.</td></tr>';
    renderMobileCards([]);
    return;
  }

  tableEl.innerHTML = state.filtered.map(item => {
    const score = item._derived.coverageScore;
    const percent = Math.round((score / 6) * 100);
    return `
      <tr>
        <td>
          <div class="domain"><a class="domain-link" href="${publisherUrl(item.domain)}" target="_blank" rel="noopener noreferrer">${item.domain}</a></div>
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

  renderMobileCards(state.filtered);
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
  state.activeView = 'new';
  state.activeStage = 'all';
  state.activeQueue = 'all';
  renderViews(state.publishers);
  renderPipeline(state.publishers);
  renderQueues(state.publishers);
  applyFilters();
}

async function init() {
  const res = await fetch('./data/publishers.dashboard.json?v=20260610f');
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
viewSelectEl.addEventListener('change', () => {
  state.activeView = viewSelectEl.value;
  applyFilters();
  renderViews(state.publishers);
});

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
