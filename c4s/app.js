const state = {
  rawPublishers: [],
  manualPublishers: [],
  publishers: [],
  filtered: [],
  meta: {},
  activeView: 'new',
  activeStage: 'all',
  activeQueue: 'all',
  stageOverrides: {},
  githubToken: '',
};

const GITHUB_TOKEN_STORAGE_KEY = 'c4s-dashboard-github-token-v1';
const GITHUB_OWNER = 'ddudarenko-del';
const GITHUB_REPO = 'sites';
const GITHUB_BRANCH = 'main';
const GITHUB_DATA_PATH = 'c4s/data/publishers.dashboard.json';
const DASHBOARD_DATA_URL = './data/publishers.dashboard.json';
const GITHUB_API_VERSION = '2022-11-28';

const MOVE_STAGE_OPTIONS = [
  { key: 'researching', label: 'New' },
  { key: 'waiting_reply', label: 'Awaiting reply' },
  { key: 'active_partner', label: 'We are partners' },
  { key: 'no_fit', label: 'Cannot work' },
];

function isPartner(item) {
  return item.status === 'active' || item.relationship_stage === 'active_partner';
}

function isNoFit(item) {
  return ['no-fit', 'no_fit', 'rejected'].includes(item.status)
    || ['no-fit', 'no_fit', 'rejected'].includes(item.fit_status)
    || ['no_fit', 'rejected'].includes(item.relationship_stage);
}

function isNewLead(item) {
  return !isPartner(item)
    && !isNoFit(item)
    && item.relationship_stage !== 'waiting_reply'
    && (
      item.status === 'prospect'
      || ['researching', 'contacted', 'negotiating'].includes(item.relationship_stage)
      || item.segment === 'similar_sites'
    );
}

function isAwaitingReply(item) {
  return item.relationship_stage === 'waiting_reply';
}

const VIEWS = [
  {
    key: 'new',
    label: 'New',
    description: 'Research pool',
    match: item => isNewLead(item),
  },
  {
    key: 'awaiting',
    label: 'Awaiting reply',
    description: 'Waiting for answer',
    match: item => isAwaitingReply(item),
  },
  {
    key: 'active',
    label: 'Partners',
    description: 'Working now',
    match: item => isPartner(item),
  },
  {
    key: 'no_fit',
    label: 'No fit',
    description: 'No fit',
    match: item => isNoFit(item),
  },
  {
    key: 'all',
    label: 'All publishers',
    description: 'All tracked',
    match: () => true,
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
const tableScrollEl = document.querySelector('.table-scroll');
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
const primaryListCardEl = document.getElementById('primaryListCard');
const clearFiltersButtonEl = document.getElementById('clearFiltersButton');
const resetStageButtonEl = document.getElementById('resetStageButton');
const resetQueueButtonEl = document.getElementById('resetQueueButton');
const toggleAddSiteButtonEl = document.getElementById('toggleAddSiteButton');
const toggleGitPanelButtonEl = document.getElementById('toggleGitPanelButton');
const addSitePanelEl = document.getElementById('addSitePanel');
const gitPanelEl = document.getElementById('gitPanel');
const addSiteInputEl = document.getElementById('addSiteInput');
const gitTokenInputEl = document.getElementById('gitTokenInput');
const addSiteSubmitButtonEl = document.getElementById('addSiteSubmitButton');
const saveGitTokenButtonEl = document.getElementById('saveGitTokenButton');
const clearGitTokenButtonEl = document.getElementById('clearGitTokenButton');
const addSiteMessageEl = document.getElementById('addSiteMessage');
const gitStatusMessageEl = document.getElementById('gitStatusMessage');

function setGitStatusMessage(message, tone = 'info') {
  gitStatusMessageEl.textContent = message;
  gitStatusMessageEl.className = `inline-feedback ${tone}`;
  gitStatusMessageEl.hidden = !message;
}

function toggleGitPanel(forceOpen) {
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : gitPanelEl.hidden;
  gitPanelEl.hidden = !willOpen;

  if (willOpen) {
    window.setTimeout(() => gitTokenInputEl.focus(), 0);
  } else {
    gitTokenInputEl.value = '';
  }
}

function setGitControlsBusy(isBusy) {
  [toggleGitPanelButtonEl, saveGitTokenButtonEl, clearGitTokenButtonEl, addSiteSubmitButtonEl, toggleAddSiteButtonEl].forEach(element => {
    if (element) {
      element.disabled = isBusy;
    }
  });

  if (gitTokenInputEl) {
    gitTokenInputEl.disabled = isBusy;
  }
}

function updateGitPanelUI() {
  const configured = hasGitHubToken();
  toggleGitPanelButtonEl.textContent = configured ? 'Git ready' : 'Connect Git';
  saveGitTokenButtonEl.textContent = configured ? 'Replace token' : 'Save token';
  clearGitTokenButtonEl.hidden = !configured;
  gitTokenInputEl.placeholder = configured
    ? 'Token saved on this browser. Paste a new one to replace it.'
    : 'Fine-grained PAT for ddudarenko-del/sites';
}

function requireGitWriteAccess(actionLabel) {
  if (hasGitHubToken()) return true;
  toggleGitPanel(true);
  setGitStatusMessage(`${actionLabel} needs a GitHub token on this device.`, 'error');
  window.setTimeout(() => gitTokenInputEl.focus(), 0);
  return false;
}

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

function addedLabel(value) {
  return `Added ${safeDate(value)}`;
}

function publisherUrl(domain) {
  const value = String(domain || '').trim();
  if (!value) return '#';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, '').trim();
  } catch (error) {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .trim();
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function decodeBase64Utf8(base64Text) {
  const normalized = String(base64Text || '').replace(/\n/g, '');
  const binary = window.atob(normalized);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubApiRequest({ method = 'GET', token, body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? (() => {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return { message: raw };
    }
  })() : null;

  if (!response.ok) {
    throw new Error(data?.message || `GitHub API failed with status ${response.status}`);
  }

  return data;
}

async function fetchGitHubDashboardData(token) {
  const data = await githubApiRequest({ token });
  return {
    payload: JSON.parse(decodeBase64Utf8(data.content || '')),
    sha: data.sha,
  };
}

function buildDashboardMeta(publishers, previousMeta = {}) {
  const statusCounts = {
    active: 0,
    prospect: 0,
    'no-fit': 0,
  };

  publishers.forEach(item => {
    if (isPartner(item)) {
      statusCounts.active += 1;
    } else if (isNoFit(item)) {
      statusCounts['no-fit'] += 1;
    } else {
      statusCounts.prospect += 1;
    }
  });

  return {
    ...previousMeta,
    publisher_count: publishers.length,
    status_counts: statusCounts,
    source_of_truth: GITHUB_DATA_PATH,
    updated_at: new Date().toISOString(),
  };
}

async function writeGitHubDashboardData(token, payload, sha, message) {
  return githubApiRequest({
    method: 'PUT',
    token,
    body: {
      message,
      content: encodeBase64Utf8(`${JSON.stringify(payload, null, 2)}\n`),
      sha,
      branch: GITHUB_BRANCH,
    },
  });
}

function clonePublishers(publishers) {
  return publishers.map(item => ({
    ...item,
    placement_types: [...(item.placement_types || [])],
    geo: [...(item.geo || [])],
    languages: [...(item.languages || [])],
    source_labels: [...(item.source_labels || [])],
  }));
}

function syncStateFromPayload(payload) {
  state.meta = payload.meta || {};
  state.rawPublishers = Array.isArray(payload.publishers) ? payload.publishers : [];
  state.manualPublishers = [];
  state.stageOverrides = {};
  rebuildPublishers();
  refreshDashboardChrome();
}

async function persistDashboardMutation({ message, mutator }) {
  if (!hasGitHubToken()) {
    throw new Error('GitHub token is not configured on this device.');
  }

  const { payload, sha } = await fetchGitHubDashboardData(state.githubToken);
  const remotePublishers = clonePublishers(Array.isArray(payload.publishers) ? payload.publishers : []);
  const nextPublishers = mutator(remotePublishers);
  const nextPayload = {
    ...payload,
    meta: buildDashboardMeta(nextPublishers, payload.meta || {}),
    publishers: nextPublishers,
  };

  await writeGitHubDashboardData(state.githubToken, nextPayload, sha, message);
  syncStateFromPayload(nextPayload);
  return nextPayload;
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

function loadGitHubToken() {
  try {
    return window.localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) || '';
  } catch (error) {
    console.warn('Failed to load GitHub token', error);
    return '';
  }
}

function saveGitHubToken(token) {
  try {
    window.localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.warn('Failed to save GitHub token', error);
  }
}

function clearGitHubToken() {
  try {
    window.localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear GitHub token', error);
  }
}

function hasGitHubToken() {
  return Boolean(state.githubToken);
}

function nextPublisherId(publishers = state.rawPublishers) {
  const maxNumericId = publishers.reduce((max, item) => {
    const match = String(item.id || '').match(/^pub-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `pub-${String(maxNumericId + 1).padStart(3, '0')}`;
}

function findDuplicatePublisher(domain) {
  const normalized = normalizeDomain(domain);
  return state.publishers.find(item => normalizeDomain(item.domain) === normalized) || null;
}

function buildManualPublisher(domain, publishers = state.rawPublishers) {
  const today = todayIso();
  return {
    id: nextPublisherId(publishers),
    domain,
    status: 'prospect',
    relationship_stage: 'researching',
    fit_status: 'unverified',
    deal_model: 'unknown',
    placement_types: ['banner'],
    niche: null,
    geo: [],
    languages: [],
    source_labels: ['Manual add / Git dashboard'],
    last_contact: null,
    next_followup: null,
    visibility: 'team-safe',
    created_at: today,
    updated_at: today,
    segment: 'manual_add',
  };
}

function focusPublisher(domain) {
  const duplicate = findDuplicatePublisher(domain);
  if (!duplicate) return;
  resetFilters();
  state.activeView = isNewLead(duplicate) ? 'new' : 'all';
  searchInput.value = duplicate.domain;
  applyFilters();
  renderViews(state.publishers);
}

function setAddSiteMessage(message, tone = 'success') {
  addSiteMessageEl.textContent = message;
  addSiteMessageEl.className = `inline-feedback ${tone}`;
  addSiteMessageEl.hidden = !message;
}

function toggleAddSitePanel(forceOpen) {
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : addSitePanelEl.hidden;
  addSitePanelEl.hidden = !willOpen;

  if (willOpen) {
    window.setTimeout(() => addSiteInputEl.focus(), 0);
  } else {
    addSiteInputEl.value = '';
    setAddSiteMessage('');
  }
}

async function connectGitToken() {
  const token = gitTokenInputEl.value.trim();

  if (!token) {
    setGitStatusMessage('Paste a GitHub token first.', 'error');
    gitTokenInputEl.focus();
    return;
  }

  try {
    setGitControlsBusy(true);
    await fetchGitHubDashboardData(token);
    state.githubToken = token;
    saveGitHubToken(token);
    gitTokenInputEl.value = '';
    updateGitPanelUI();
    setGitStatusMessage(`Git writes are enabled on this browser. Changes now save to ${GITHUB_DATA_PATH}.`, 'success');
  } catch (error) {
    console.error(error);
    setGitStatusMessage(error.message || 'Git token validation failed.', 'error');
  } finally {
    setGitControlsBusy(false);
  }
}

function disconnectGitToken() {
  state.githubToken = '';
  clearGitHubToken();
  gitTokenInputEl.value = '';
  updateGitPanelUI();
  setGitStatusMessage('Git token removed from this browser. The dashboard is read-only again.', 'info');
}

async function addPublisherFromInput() {
  const normalized = normalizeDomain(addSiteInputEl.value);

  if (!normalized || !normalized.includes('.')) {
    setAddSiteMessage('Enter a valid domain first.', 'error');
    addSiteInputEl.focus();
    return;
  }

  const duplicate = findDuplicatePublisher(normalized);
  if (duplicate) {
    focusPublisher(duplicate.domain);
    setAddSiteMessage(`${duplicate.domain} is already in the list as ${duplicate.id}.`, 'error');
    return;
  }

  if (!requireGitWriteAccess('Adding a new site')) {
    setAddSiteMessage('Connect Git first, then try adding the site again.', 'error');
    return;
  }

  try {
    setGitControlsBusy(true);
    await persistDashboardMutation({
      message: `c4s: add publisher ${normalized}`,
      mutator: publishers => {
        const existing = publishers.find(item => normalizeDomain(item.domain) === normalized);
        if (existing) {
          const duplicateError = new Error(`${existing.domain} is already in the list as ${existing.id}.`);
          duplicateError.duplicateDomain = existing.domain;
          throw duplicateError;
        }
        return [buildManualPublisher(normalized, publishers), ...publishers];
      },
    });

    resetFilters();
    addSiteInputEl.value = '';
    setAddSiteMessage(`${normalized} saved to Git and added to New.`, 'success');
    setGitStatusMessage(`${normalized} was committed to ${GITHUB_DATA_PATH}.`, 'success');
  } catch (error) {
    console.error(error);
    if (error.duplicateDomain) {
      focusPublisher(error.duplicateDomain);
    }
    setAddSiteMessage(error.message || 'Failed to save the new site to Git.', 'error');
    setGitStatusMessage(error.message || 'Failed to save the new site to Git.', 'error');
  } finally {
    setGitControlsBusy(false);
  }
}

function applyStageOverride(item, stageKey) {
  if (!stageKey) return { ...item };

  if (stageKey === 'active_partner') {
    return {
      ...item,
      status: 'active',
      fit_status: 'approved',
      relationship_stage: 'active_partner',
    };
  }

  if (stageKey === 'no_fit') {
    return {
      ...item,
      status: 'no-fit',
      fit_status: 'rejected',
      relationship_stage: 'no_fit',
    };
  }

  if (stageKey === 'waiting_reply') {
    return {
      ...item,
      status: 'prospect',
      fit_status: item.fit_status === 'rejected' ? 'unverified' : (item.fit_status || 'unverified'),
      relationship_stage: 'waiting_reply',
    };
  }

  return {
    ...item,
    status: 'prospect',
    fit_status: item.fit_status === 'approved' || item.fit_status === 'rejected' ? 'unverified' : (item.fit_status || 'unverified'),
    relationship_stage: 'researching',
  };
}

function rebuildPublishers() {
  state.publishers = withDerivedData(
    state.rawPublishers.map(item => ({ ...item }))
  );
}

function moveControlOptions(currentStage) {
  return MOVE_STAGE_OPTIONS.map(option => `
    <option value="${option.key}" ${currentStage === option.key ? 'selected' : ''}>${option.label}</option>
  `).join('');
}

function moveStageValue(item) {
  if (isPartner(item)) return 'active_partner';
  if (isNoFit(item)) return 'no_fit';
  if (isAwaitingReply(item)) return 'waiting_reply';
  return 'researching';
}

function renderMoveControl(item, context = 'table') {
  return `
    <label class="move-control move-control-${context}">
      <span class="move-control-label">Move to</span>
      <select data-stage-move="${item.id}" aria-label="Move ${item.domain} to stage">
        ${moveControlOptions(moveStageValue(item))}
      </select>
    </label>
  `;
}

function refreshDashboardChrome() {
  populateFilters(state.publishers);
  renderStats(state.publishers);
  renderViews(state.publishers);
  renderPipeline(state.publishers);
  renderQueues(state.publishers);
  applyFilters();
}

async function updatePublisherStage(id, nextStage) {
  const currentItem = state.rawPublishers.find(item => item.id === id);
  if (!currentItem) {
    setGitStatusMessage('That publisher could not be found in the Git JSON file.', 'error');
    refreshDashboardChrome();
    return false;
  }

  if (!requireGitWriteAccess('Saving status changes')) {
    refreshDashboardChrome();
    return false;
  }

  const nextOption = MOVE_STAGE_OPTIONS.find(option => option.key === nextStage);
  const nextLabel = nextOption ? nextOption.label : nextStage;

  try {
    setGitControlsBusy(true);
    await persistDashboardMutation({
      message: `c4s: move ${currentItem.domain} to ${nextStage}`,
      mutator: publishers => {
        const index = publishers.findIndex(item => item.id === id);
        if (index === -1) {
          throw new Error(`${currentItem.domain} no longer exists in ${GITHUB_DATA_PATH}.`);
        }

        const nextPublishers = [...publishers];
        nextPublishers[index] = {
          ...applyStageOverride(publishers[index], nextStage),
          updated_at: todayIso(),
        };
        return nextPublishers;
      },
    });

    setGitStatusMessage(`${currentItem.domain} saved to Git as ${nextLabel}.`, 'success');
    return true;
  } catch (error) {
    console.error(error);
    setGitStatusMessage(error.message || 'Failed to save the stage change to Git.', 'error');
    refreshDashboardChrome();
    return false;
  } finally {
    setGitControlsBusy(false);
  }
}

function bindStageMoveControls(scope = document) {
  scope.querySelectorAll('[data-stage-move]').forEach(select => {
    select.addEventListener('change', async event => {
      event.stopPropagation();
      select.disabled = true;
      try {
        await updatePublisherStage(select.dataset.stageMove, select.value);
      } finally {
        select.disabled = false;
      }
    });
    select.addEventListener('click', event => event.stopPropagation());
  });
}

function updateActionButtons() {
  const atDefaultNewView = state.activeView === 'new'
    && state.activeStage === 'all'
    && state.activeQueue === 'all'
    && !searchInput.value.trim()
    && statusFilter.value === 'all'
    && placementFilter.value === 'all'
    && stageFilter.value === 'all'
    && sortFilter.value === 'updated_desc';

  const canAddNewSite = state.activeView === 'new';
  clearFiltersButtonEl.hidden = atDefaultNewView;
  resetStageButtonEl.hidden = state.activeStage === 'all' && stageFilter.value === 'all';
  resetQueueButtonEl.hidden = state.activeQueue === 'all';
  toggleAddSiteButtonEl.hidden = !canAddNewSite;

  if (!canAddNewSite) {
    toggleAddSitePanel(false);
  }
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
    awaiting: 'Awaiting reply',
    active: 'Active partners',
    no_fit: 'Cannot work',
    all: 'All publishers',
  };

  heroTitleEl.textContent = titles[view.key] || view.label;
  heroSubcopyEl.textContent = 'Open the site directly. Use the arrow for details only when you need them.';
  heroStatsEl.innerHTML = [
    ['New', metrics.newLeads, view.key === 'new'],
    ['Awaiting', state.publishers.filter(item => isAwaitingReply(item)).length, view.key === 'awaiting'],
    ['Partners', metrics.active, view.key === 'active'],
    ['No fit', metrics.noFit, view.key === 'no_fit'],
  ].map(([label, value, active]) => `
    <span class="hero-chip ${active ? 'hero-chip-accent' : ''}">${label}: ${value}</span>
  `).join('');

  heroNoteEl.textContent = `${shown} shown now in ${view.label}. ${metrics.newLeads} new, ${state.publishers.filter(item => isAwaitingReply(item)).length} awaiting, ${metrics.active} partners, ${metrics.noFit} no fit.`;
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
  const awaiting = rows.filter(item => isAwaitingReply(item)).length;
  const statCards = [
    ['Publishers', metrics.total, `${metrics.active} partners`],
    ['New', metrics.newLeads, 'Research pool'],
    ['Awaiting', awaiting, 'Waiting for answer'],
    ['No fit', metrics.noFit, 'Cannot work'],
    ['Banner capable', metrics.banner, `${bannerOnly} banner only`],
    ['Widget capable', metrics.widget, `${widgetOnly} widget only`],
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

  const quickMoveView = state.activeView === 'new';

  mobileListEl.innerHTML = rows.map(item => {
    const score = item._derived.coverageScore;
    const percent = Math.round((score / 6) * 100);
    return `
      <details class="mobile-card mobile-card-shell">
        <summary class="mobile-card-summary ${quickMoveView ? 'mobile-card-summary-with-actions' : ''}">
          <div class="mobile-summary-primary">
            <a class="domain-link mobile-domain-link" href="${publisherUrl(item.domain)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${item.domain}</a>
            <span class="summary-submeta">${addedLabel(item.created_at)}</span>
          </div>
          ${quickMoveView ? `
            <div class="mobile-card-summary-actions">
              ${renderMoveControl(item, 'mobile-summary')}
              <span class="mobile-card-arrow" aria-hidden="true"></span>
            </div>
          ` : '<span class="mobile-card-arrow" aria-hidden="true"></span>'}
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

          ${quickMoveView ? '' : renderMoveControl(item, 'mobile-expanded')}

          <div class="mobile-detail-grid">
            <div class="mobile-kv">
              <span class="stack-label">Deal model</span>
              <strong>${item.deal_model ? prettyLabel(item.deal_model) : '—'}</strong>
            </div>
            <div class="mobile-kv">
              <span class="stack-label">Added</span>
              <strong>${safeDate(item.created_at)}</strong>
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

  bindStageMoveControls(mobileListEl);
}

function renderTable() {
  const view = currentView();
  const compactStartHere = view.key === 'new';
  listKickerEl.textContent = view.key === 'new' ? 'Start here' : 'Publisher register';
  listTitleEl.textContent = view.key === 'new' ? 'New sites' : view.label;
  resultCountEl.textContent = `${state.filtered.length} shown`;
  updateActionButtons();
  primaryListCardEl.classList.toggle('primary-focus', compactStartHere);

  tableScrollEl.classList.toggle('compact-hidden', compactStartHere);
  mobileListEl.classList.toggle('force-visible', compactStartHere);

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
          <div class="meta-line">${item.id} · ${addedLabel(item.created_at)}</div>
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
        <td>
          <div class="table-stage-cell">
            <span class="badge ${badgeClass(item.relationship_stage || 'unknown')}">${prettyLabel(item.relationship_stage || 'unknown')}</span>
            ${renderMoveControl(item, 'table')}
          </div>
        </td>
        <td><div class="pills">${item.placement_types.map(value => `<span class="pill">${prettyLabel(value)}</span>`).join('')}</div></td>
        <td>${item.deal_model ? `<span class="badge ${badgeClass(item.deal_model)}">${prettyLabel(item.deal_model)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${safeDate(item.last_contact)}</td>
        <td>${safeDate(item.next_followup)}</td>
        <td><div class="pills">${item._derived.sourceSummary.map(value => `<span class="source-pill">${value}</span>`).join('')}</div></td>
      </tr>
    `;
  }).join('');

  bindStageMoveControls(tableEl);
  renderMobileCards(state.filtered);
}

function populateFilters(rows) {
  const prevStatus = statusFilter.value || 'all';
  const prevPlacement = placementFilter.value || 'all';
  const prevStage = stageFilter.value || 'all';
  const statuses = uniq(rows.map(item => item.status)).sort();
  const placements = uniq(rows.flatMap(item => item.placement_types)).sort();

  statusFilter.innerHTML = '<option value="all">All statuses</option>' + statuses.map(value => `<option value="${value}">${prettyLabel(value)}</option>`).join('');
  placementFilter.innerHTML = '<option value="all">All placements</option>' + placements.map(value => `<option value="${value}">${prettyLabel(value)}</option>`).join('');
  stageFilter.innerHTML = '<option value="all">All stages</option>' + PIPELINE_STAGES.map(stage => `<option value="${stage.key}">${stage.label}</option>`).join('');

  statusFilter.value = statuses.includes(prevStatus) ? prevStatus : 'all';
  placementFilter.value = placements.includes(prevPlacement) ? prevPlacement : 'all';
  stageFilter.value = ['all', ...PIPELINE_STAGES.map(stage => stage.key)].includes(prevStage) ? prevStage : 'all';
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
  refreshDashboardChrome();
}

async function init() {
  state.githubToken = loadGitHubToken();
  updateGitPanelUI();
  if (hasGitHubToken()) {
    setGitStatusMessage(`Git writes on this browser go straight to ${GITHUB_DATA_PATH}.`, 'success');
  }

  const res = await fetch(`${DASHBOARD_DATA_URL}?v=${Date.now()}`);
  const payload = await res.json();
  state.meta = payload.meta || {};
  state.rawPublishers = payload.publishers || [];
  state.manualPublishers = [];
  state.stageOverrides = {};
  rebuildPublishers();
  refreshDashboardChrome();
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

clearFiltersButtonEl.addEventListener('click', resetFilters);
resetStageButtonEl.addEventListener('click', () => {
  state.activeStage = 'all';
  renderPipeline(state.publishers);
  applyFilters();
});
resetQueueButtonEl.addEventListener('click', () => {
  state.activeQueue = 'all';
  renderQueues(state.publishers);
  applyFilters();
});
toggleAddSiteButtonEl.addEventListener('click', () => {
  toggleAddSitePanel();
});
toggleGitPanelButtonEl.addEventListener('click', () => {
  toggleGitPanel();
});
addSiteSubmitButtonEl.addEventListener('click', addPublisherFromInput);
saveGitTokenButtonEl.addEventListener('click', connectGitToken);
clearGitTokenButtonEl.addEventListener('click', disconnectGitToken);
addSiteInputEl.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addPublisherFromInput();
  }
});
gitTokenInputEl.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    connectGitToken();
  }
});

init().catch(err => {
  console.error(err);
  resultCountEl.textContent = 'Failed to load dashboard data';
  tableEl.innerHTML = '<tr><td class="empty" colspan="9">Dashboard data could not be loaded.</td></tr>';
});
