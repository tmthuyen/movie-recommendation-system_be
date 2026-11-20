/**
 * Public API performance test — fixed 10 search variants, all 11 k6 strategies.
 *
 * Run everything (no env, no extra runner):
 *   k6 run performance/public-api-fixed.test.js
 *
 * Optional: edit CONFIG.runOnly below to run one strategy, e.g. 'smoke'.
 *
 * Scope:
 *   - GET /api/movies/search (10 fixed URLs: 5 sorts x 2 pages)
 *   - GET /api/movies/:id
 *   - GET /api/recommendations/similar/:id/cursor   (cursor + limit, NO topK)
 *   - GET /api/recommendations/semantic-search/cursor (cursor + limit, NO topK)
 *
 * No random page/keyword/genre/country/sort in the workload. The mix is
 * deterministic by __ITER so repeated runs are comparable and cache-friendly.
 *
 * Health/genres/countries are fetched once in setup(), not in the load mix.
 * Rate limit (100 req/min/IP) is user-managed; this file does not modify backend.
 */

import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// CONFIG — edit this block if you want a longer/shorter run.
// ---------------------------------------------------------------------------
const CONFIG = {
  baseUrl: 'http://localhost:8081',

  // null = run all 11 strategies sequentially.
  // 'smoke' | 'load' | 'stress' | 'spike' | 'soak' | 'breakpoint' |
  // 'capacity' | 'scalability' | 'concurrency' | 'volume' | 'recovery'
  runOnly: __ENV.RUN_ONLY || null,

  workload: {
    search: 50,
    detail: 30,
    similarCursor: 10,
    semanticCursor: 10,
  },

  cursorLimit: 12,
  // Fetch page 2 on every Nth iteration instead of a random probability.
  cursorNextEvery: 2,

  // Warm all 10 fixed search URLs once in setup(). Set false to measure
  // cold search / DB search instead of the cache-hit path.
  warmSearch: true,
};

const SCENARIO_NAMES = [
  'smoke',
  'load',
  'stress',
  'spike',
  'breakpoint',
  'soak',
  'capacity',
  'scalability',
  'concurrency',
  'volume',
  'recovery',
];

if (CONFIG.runOnly && !SCENARIO_NAMES.includes(CONFIG.runOnly)) {
  fail(
    `Unknown CONFIG.runOnly="${CONFIG.runOnly}". Use one of: ${SCENARIO_NAMES.join(
      ', ',
    )}`,
  );
}

const TOTAL_WEIGHT =
  CONFIG.workload.search +
  CONFIG.workload.detail +
  CONFIG.workload.similarCursor +
  CONFIG.workload.semanticCursor;

if (TOTAL_WEIGHT <= 0) {
  fail('CONFIG.workload must have a positive total weight.');
}

// 10 fixed search URLs: 5 sorts x 2 pages. No keyword/genre/country filters.
const SEARCH_SORTS = [
  'viewCount:DESC',
  'likeCount:DESC',
  'releaseDate:DESC',
  'voteAverage:DESC',
  'createdAt:DESC',
];

const SEARCH_VARIANTS = [];
for (const page of [1, 2]) {
  for (const sort of SEARCH_SORTS) {
    SEARCH_VARIANTS.push(
      `/api/movies/search?page=${page}&limit=10&sort=${sort}`,
    );
  }
}

if (SEARCH_VARIANTS.length !== 10) {
  fail(`Expected 10 fixed search variants, got ${SEARCH_VARIANTS.length}.`);
}

// ---------------------------------------------------------------------------
// Profiles. Start times are sequential; each scenario has a 5s gap.
// Quick profile: total ~11m45s.
// ---------------------------------------------------------------------------
const SCENARIOS = {
  smoke: {
    executor: 'per-vu-iterations',
    vus: 5,
    iterations: 2,
    maxDuration: '30s',
    startTime: '0s',
    gracefulStop: '5s',
  },

  load: {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    stages: [
      { target: 50, duration: '1m' },
      { target: 100, duration: '1m' },
      { target: 200, duration: '1m' },
      { target: 500, duration: '1m' },
      { target: 1000, duration: '1m' },
      { target: 1000, duration: '3m' },
      // { target: 1000, duration: '1m' },
    ],
    preAllocatedVUs: 100,
    maxVUs: 1000,
    startTime: '35s',
    gracefulStop: '5s',
  },

  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 100,
    timeUnit: '1s',
    stages: [
      { target: 100, duration: '30s' }, // ramp up
      { target: 100, duration: '2m' }, // stable
      { target: 500, duration: '30s' }, // ramp up
      { target: 500, duration: '2m' }, // stable
      { target: 1000, duration: '30s' }, // ramp up
      { target: 1000, duration: '2m' }, // stable
      { target: 2000, duration: '30s' }, // ramp up
      { target: 2000, duration: '2m' }, // stable
      { target: 0, duration: '2m' }, // ramp down
    ],
    preAllocatedVUs: 200,
    maxVUs: 750,
    startTime: '90s',
    gracefulStop: '5s',
  },

  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 100,
    timeUnit: '1s',
    stages: [
      { target: 200, duration: '30s' },
      { target: 2000, duration: '3m' },
      { target: 0, duration: '30s' },
    ],
    preAllocatedVUs: 200,
    maxVUs: 750,
    startTime: '135s',
    gracefulStop: '5s',
  },

  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    stages: [
      { target: 50, duration: '1m' },
      { target: 100, duration: '1m' },
      { target: 200, duration: '1m' },
      { target: 500, duration: '1m' },
      { target: 750, duration: '1m' },
    ],
    preAllocatedVUs: 100,
    maxVUs: 750,
    startTime: '270s',
    gracefulStop: '15s',
  },

  soak: {
    executor: 'constant-arrival-rate',
    rate: 200,
    timeUnit: '1s',
    duration: '2m',
    preAllocatedVUs: 500,
    maxVUs: 20000,
    startTime: '230s',
    gracefulStop: '5s',
  },

  capacity: {
    executor: 'constant-arrival-rate',
    rate: 1000,
    timeUnit: '1s',
    duration: '1m',
    preAllocatedVUs: 500,
    maxVUs: 20000,
    startTime: '355s',
    gracefulStop: '5s',
  },

  scalability: {
    executor: 'ramping-arrival-rate',
    startRate: 500,
    timeUnit: '1s',
    stages: [
      { target: 500, duration: '10s' },
      { target: 1000, duration: '10s' },
      { target: 2000, duration: '10s' },
      { target: 5000, duration: '10s' },
    ],
    preAllocatedVUs: 500,
    maxVUs: 20000,
    startTime: '420s',
    gracefulStop: '5s',
  },

  concurrency: {
    executor: 'constant-vus',
    vus: 750,
    duration: '30s',
    startTime: '465s',
    gracefulStop: '5s',
  },

  volume: {
    executor: 'constant-vus',
    vus: 20,
    duration: '1m',
    startTime: '500s',
    gracefulStop: '5s',
  },

  recovery: {
    executor: 'ramping-arrival-rate',
    startRate: 200,
    timeUnit: '1s',
    stages: [
      { target: 200, duration: '1m' },
      { target: 2000, duration: '20s' },
      { target: 200, duration: '1m' },
    ],
    preAllocatedVUs: 500,
    maxVUs: 20000,
    startTime: '565s',
    gracefulStop: '5s',
  },
};

function buildScenarios() {
  if (!CONFIG.runOnly) {
    return SCENARIOS;
  }

  return {
    [CONFIG.runOnly]: {
      ...SCENARIOS[CONFIG.runOnly],
      startTime: '0s',
    },
  };
}

const ACTIVE_SCENARIOS = buildScenarios();
const ACTIVE_SCENARIO_NAMES = Object.keys(ACTIVE_SCENARIOS);

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const searchDuration = new Trend('search_duration', true);
const detailDuration = new Trend('detail_duration', true);
const similarCursorDuration = new Trend('similar_cursor_duration', true);
const semanticCursorDuration = new Trend('semantic_cursor_duration', true);

const http4xx = new Counter('http_4xx');
const http5xx = new Counter('http_5xx');
const businessErrors = new Counter('business_errors');
const rateLimited429 = new Counter('rate_limited_429');

const scenarioMetrics = {};
for (const name of SCENARIO_NAMES) {
  scenarioMetrics[name] = {
    duration: new Trend(`scenario_${name}_duration`, true),
    requests: new Counter(`scenario_${name}_requests`),
    errors: new Counter(`scenario_${name}_errors`),
  };
}

// ---------------------------------------------------------------------------
// Stage tags (for ramping scenarios). The summary is per scenario; these tags
// are useful if you later export raw k6 metrics.
// ---------------------------------------------------------------------------
const TEST_START = Date.now();

const STAGE_SPECS = {
  load: {
    startTime: 35,
    stages: [
      { duration: 10, name: '100' },
      { duration: 10, name: '500' },
      { duration: 10, name: '1k' },
      { duration: 10, name: '2k' },
      { duration: 10, name: '5k' },
    ],
  },
  stress: {
    startTime: 90,
    stages: [
      { duration: 10, name: '1k' },
      { duration: 10, name: '2k' },
      { duration: 10, name: '5k' },
      { duration: 10, name: '10k' },
    ],
  },
  spike: {
    startTime: 135,
    stages: [
      { duration: 5, name: '100' },
      { duration: 5, name: '1k' },
      { duration: 5, name: '5k' },
      { duration: 5, name: '10k' },
      { duration: 5, name: 'back-100' },
    ],
  },
  breakpoint: {
    startTime: 165,
    stages: [
      { duration: 10, name: '100' },
      { duration: 10, name: '500' },
      { duration: 10, name: '1k' },
      { duration: 10, name: '2k' },
      { duration: 10, name: '5k' },
      { duration: 10, name: '10k' },
    ],
  },
  scalability: {
    startTime: 420,
    stages: [
      { duration: 10, name: '500' },
      { duration: 10, name: '1k' },
      { duration: 10, name: '2k' },
      { duration: 10, name: '5k' },
    ],
  },
  recovery: {
    startTime: 565,
    stages: [
      { duration: 60, name: 'baseline' },
      { duration: 20, name: 'spike' },
      { duration: 60, name: 'recovery' },
    ],
  },
};

function getStageTag(scenario) {
  const spec = STAGE_SPECS[scenario];
  if (!spec) {
    return scenario === 'smoke' ? 'smoke' : 'steady';
  }

  const elapsed = (Date.now() - TEST_START) / 1000 - spec.startTime;
  if (elapsed < 0) {
    return 'pre';
  }

  let boundary = 0;
  for (const stage of spec.stages) {
    boundary += stage.duration;
    if (elapsed < boundary) {
      return stage.name;
    }
  }

  return 'post';
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
export const options = {
  scenarios: ACTIVE_SCENARIOS,
  thresholds: {
    // Overall: relaxed enough to include AI recommendation latency.
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    checks: ['rate>0.95'],

    // Per endpoint group.
    'http_req_failed{api:search}': ['rate<0.01'],
    'http_req_duration{api:search}': ['p(95)<800', 'p(99)<1500'],
    search_duration: ['p(95)<800', 'p(99)<1500'],

    'http_req_failed{api:detail}': ['rate<0.01'],
    'http_req_duration{api:detail}': ['p(95)<400', 'p(99)<800'],
    detail_duration: ['p(95)<400', 'p(99)<800'],

    'http_req_failed{api:similar_cursor}': ['rate<0.05'],
    'http_req_duration{api:similar_cursor}': ['p(95)<1500', 'p(99)<3000'],
    similar_cursor_duration: ['p(95)<1500', 'p(99)<3000'],

    'http_req_failed{api:semantic_cursor}': ['rate<0.05'],
    'http_req_duration{api:semantic_cursor}': ['p(95)<2000', 'p(99)<4000'],
    semantic_cursor_duration: ['p(95)<2000', 'p(99)<4000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  summaryTimeUnit: 'ms',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseJson(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

function currentScenario() {
  return exec.scenario.name;
}

function addScenarioRequest(scenario, duration) {
  const metrics = scenarioMetrics[scenario];
  if (!metrics) {
    return;
  }
  metrics.requests.add(1);
  metrics.duration.add(duration);
}

function addScenarioError(scenario) {
  const metrics = scenarioMetrics[scenario];
  if (!metrics) {
    return;
  }
  metrics.errors.add(1);
}

function request(path, api, trend, extraTags) {
  const scenario = currentScenario();
  const tags = {
    api,
    scenario,
    stage: getStageTag(scenario),
    ...(extraTags || {}),
  };

  const res = http.get(`${CONFIG.baseUrl}${path}`, { tags });

  if (trend) {
    trend.add(res.timings.duration, tags);
  }

  addScenarioRequest(scenario, res.timings.duration);

  if (res.status >= 400 && res.status < 500) {
    http4xx.add(1, tags);
  }
  if (res.status >= 500) {
    http5xx.add(1, tags);
  }
  if (res.status === 429) {
    rateLimited429.add(1, tags);
  }

  return res;
}

function markBusinessError(api) {
  const scenario = currentScenario();
  businessErrors.add(1, { api, scenario });
  addScenarioError(scenario);
}

function checkEnvelope(res, name, api) {
  const body = parseJson(res);
  const ok = check(res, {
    [`${name}: status 200`]: (r) => r.status === 200,
    [`${name}: success=true`]: () => !!body && body.success === true,
    [`${name}: result present`]: () =>
      !!body && body.result !== undefined && body.result !== null,
  });

  if (!ok || !body || body.success !== true) {
    markBusinessError(api);
  }

  return body;
}

function checkCursor(res, name, api, previousFirstId) {
  const body = checkEnvelope(res, name, api);
  if (!body) {
    return null;
  }

  check(body, {
    [`${name}: result is array`]: (b) => Array.isArray(b.result),
    [`${name}: cursor pagination`]: (b) =>
      !!b.pagination &&
      typeof b.pagination.limit === 'number' &&
      typeof b.pagination.hasMore === 'boolean' &&
      (b.pagination.nextCursor === null ||
        typeof b.pagination.nextCursor === 'string' ||
        typeof b.pagination.nextCursor === 'number'),
    [`${name}: nextCursor consistency`]: (b) =>
      !!b.pagination &&
      (b.pagination.hasMore
        ? b.pagination.nextCursor !== null &&
          b.pagination.nextCursor !== undefined
        : b.pagination.nextCursor === null),
  });

  if (
    previousFirstId !== undefined &&
    previousFirstId !== null &&
    Array.isArray(body.result) &&
    body.result.length > 0
  ) {
    check(body, {
      [`${name}: next page advances`]: (b) =>
        b.result[0].id !== previousFirstId,
    });
  }

  return body;
}

// ---------------------------------------------------------------------------
// setup(): health + catalog once. No load-test requests here.
// ---------------------------------------------------------------------------
export function setup() {
  const healthRes = http.get(`${CONFIG.baseUrl}/api/health`);
  const health = parseJson(healthRes);
  if (healthRes.status !== 200) {
    fail(
      `Health check failed: GET /api/health -> HTTP ${healthRes.status}. Is backend running at ${CONFIG.baseUrl}?`,
    );
  }
  if (!health || health.status !== 'ok') {
    fail(
      `Health check failed: expected status="ok", got ${JSON.stringify(health)}`,
    );
  }

  const searchRes = http.get(
    `${CONFIG.baseUrl}/api/movies/search?page=1&limit=20&sort=viewCount:DESC`,
  );
  const searchBody = parseJson(searchRes);
  const movies = (searchBody && searchBody.result) || [];

  if (
    searchRes.status !== 200 ||
    !Array.isArray(movies) ||
    movies.length === 0
  ) {
    fail(
      `Cannot load movies from /api/movies/search (HTTP ${searchRes.status}). Is backend seeded?`,
    );
  }

  const genresRes = http.get(`${CONFIG.baseUrl}/api/genres?page=1&limit=50`);
  const genresBody = parseJson(genresRes);
  const genres = (genresBody && genresBody.result) || [];

  const countriesRes = http.get(
    `${CONFIG.baseUrl}/api/countries?page=1&limit=50`,
  );
  const countriesBody = parseJson(countriesRes);
  const countries = (countriesBody && countriesBody.result) || [];

  const keywordSet = new Set();
  for (const movie of movies) {
    const candidates = [movie.titleVi, movie.title, movie.originalTitle];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        keywordSet.add(candidate.trim());
      }
    }
  }
  let keywords = Array.from(keywordSet);
  if (keywords.length === 0) {
    keywords = ['the', 'love', 'war', 'family', 'future'];
  }

  const firstMovie = movies[0];
  const releaseYear =
    Number(String(firstMovie.releaseDate || '').slice(0, 4)) || 2000;
  const hotKeyword = keywords[0];
  const longKeyword = `${hotKeyword} ${hotKeyword} ${hotKeyword}`;
  const releaseYearFrom = Math.max(1900, releaseYear - 10);
  const releaseYearTo = Math.min(2100, releaseYear + 1);

  // Fixed pools: rotate by __ITER, never pick randomly.
  const fixedMovies = movies.slice(0, 10);
  const fixedKeywords = Array.from({ length: 10 }, (_, index) => {
    return keywords[index % keywords.length];
  });

  // One heavy, fixed search URL for the volume scenario.
  let volumeSearchPath =
    `/api/movies/search?page=100&limit=50&sort=viewCount:DESC` +
    `&keyword=${encodeURIComponent(longKeyword)}` +
    `&releaseYearFrom=${releaseYearFrom}&releaseYearTo=${releaseYearTo}`;
  if (genres.length > 0) {
    volumeSearchPath += `&genreIds=${genres[0].id}`;
  }
  if (countries.length > 0) {
    volumeSearchPath += `&countryIds=${countries[0].id}`;
  }

  // Warm the 10 fixed search URLs once so the load scenarios measure the
  // steady-state (mostly cache-hit) path. These requests are not in the mix.
  if (CONFIG.warmSearch) {
    for (const path of SEARCH_VARIANTS) {
      http.get(`${CONFIG.baseUrl}${path}`);
    }
  }

  return {
    movies,
    genres,
    countries,
    keywords,
    fixedMovies,
    fixedKeywords,
    searchVariants: SEARCH_VARIANTS,
    volumeSearchPath,
    hotMovie: firstMovie,
    hotKeyword,
    longKeyword,
    releaseYearFrom,
    releaseYearTo,
  };
}

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------
function runSearch(data, opts) {
  const isVolume = !!opts.volume;
  let path;

  if (isVolume) {
    path = data.volumeSearchPath;
  } else {
    const variantIndex =
      opts.variantIndex === undefined
        ? __ITER % data.searchVariants.length
        : opts.variantIndex % data.searchVariants.length;
    path = data.searchVariants[variantIndex];
  }

  const res = request(path, 'search', searchDuration);
  const body = checkEnvelope(res, 'search', 'search');

  check(body, {
    'search: result is array': (b) => !!b && Array.isArray(b.result),
    'search: pagination total': (b) =>
      !!b && !!b.pagination && typeof b.pagination.total === 'number',
  });
}

function runDetail(data, movie) {
  const target = movie || data.fixedMovies[__ITER % data.fixedMovies.length];
  const res = request(`/api/movies/${target.id}`, 'detail', detailDuration);
  const body = checkEnvelope(res, 'detail', 'detail');

  check(body, {
    'detail: id matches': (b) => !!b && !!b.result && b.result.id === target.id,
  });
}

function runSimilarCursor(data, movie, opts) {
  const target = movie || data.fixedMovies[__ITER % data.fixedMovies.length];
  const limit = opts.limit || CONFIG.cursorLimit;
  const forceNext = !!opts.forceNext;

  const firstPath = `/api/recommendations/similar/${target.id}/cursor?limit=${limit}`;
  const firstRes = request(firstPath, 'similar_cursor', similarCursorDuration, {
    cursor_page: 'first',
  });
  const firstBody = checkCursor(firstRes, 'similar cursor', 'similar_cursor');

  if (
    !firstBody ||
    !firstBody.pagination ||
    !firstBody.pagination.hasMore ||
    firstBody.pagination.nextCursor === null ||
    firstBody.pagination.nextCursor === undefined
  ) {
    return;
  }

  if (!forceNext && __ITER % CONFIG.cursorNextEvery !== 0) {
    return;
  }

  const firstId =
    Array.isArray(firstBody.result) && firstBody.result.length > 0
      ? firstBody.result[0].id
      : undefined;

  const nextPath =
    `/api/recommendations/similar/${target.id}/cursor?limit=${limit}` +
    `&cursor=${encodeURIComponent(String(firstBody.pagination.nextCursor))}`;
  const nextRes = request(nextPath, 'similar_cursor', similarCursorDuration, {
    cursor_page: 'next',
  });
  checkCursor(nextRes, 'similar cursor next', 'similar_cursor', firstId);
}

function runSemanticCursor(data, keyword, opts) {
  const searchKeyword =
    keyword || data.fixedKeywords[__ITER % data.fixedKeywords.length];
  const limit = opts.limit || CONFIG.cursorLimit;
  const forceNext = !!opts.forceNext;

  const firstPath = `/api/recommendations/semantic-search/cursor?keyword=${encodeURIComponent(
    searchKeyword,
  )}&limit=${limit}`;
  const firstRes = request(
    firstPath,
    'semantic_cursor',
    semanticCursorDuration,
    { cursor_page: 'first' },
  );
  const firstBody = checkCursor(firstRes, 'semantic cursor', 'semantic_cursor');

  if (
    !firstBody ||
    !firstBody.pagination ||
    !firstBody.pagination.hasMore ||
    firstBody.pagination.nextCursor === null ||
    firstBody.pagination.nextCursor === undefined
  ) {
    return;
  }

  if (!forceNext && __ITER % CONFIG.cursorNextEvery !== 0) {
    return;
  }

  const firstId =
    Array.isArray(firstBody.result) && firstBody.result.length > 0
      ? firstBody.result[0].id
      : undefined;

  const nextPath =
    `/api/recommendations/semantic-search/cursor?keyword=${encodeURIComponent(
      searchKeyword,
    )}&limit=${limit}` +
    `&cursor=${encodeURIComponent(String(firstBody.pagination.nextCursor))}`;
  const nextRes = request(nextPath, 'semantic_cursor', semanticCursorDuration, {
    cursor_page: 'next',
  });
  checkCursor(nextRes, 'semantic cursor next', 'semantic_cursor', firstId);
}

function runSmoke(data) {
  const movie = data.fixedMovies[__ITER % data.fixedMovies.length];
  const keyword = data.fixedKeywords[__ITER % data.fixedKeywords.length];

  runSearch(data, { variantIndex: __ITER % data.searchVariants.length });
  runDetail(data, movie);
  runSimilarCursor(data, movie, {
    limit: CONFIG.cursorLimit,
    forceNext: true,
  });
  runSemanticCursor(data, keyword, {
    limit: CONFIG.cursorLimit,
    forceNext: true,
  });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------
export default function (data) {
  const scenario = currentScenario();

  if (scenario === 'smoke') {
    runSmoke(data);
    return;
  }

  const isHot = scenario === 'concurrency';
  const isVolume = scenario === 'volume';

  const movie = isHot
    ? data.hotMovie
    : data.fixedMovies[__ITER % data.fixedMovies.length];
  const keyword = isHot
    ? data.hotKeyword
    : data.fixedKeywords[__ITER % data.fixedKeywords.length];

  const cursorLimit = isVolume ? 50 : CONFIG.cursorLimit;
  const forceNext = isVolume;

  const roll = __ITER % TOTAL_WEIGHT;

  if (roll < CONFIG.workload.search) {
    runSearch(data, { volume: isVolume });
    return;
  }

  if (roll < CONFIG.workload.search + CONFIG.workload.detail) {
    runDetail(data, movie);
    return;
  }

  if (
    roll <
    CONFIG.workload.search +
      CONFIG.workload.detail +
      CONFIG.workload.similarCursor
  ) {
    runSimilarCursor(data, movie, {
      limit: cursorLimit,
      forceNext,
    });
    return;
  }

  runSemanticCursor(data, keyword, {
    limit: cursorLimit,
    forceNext,
  });

  // sleep
  sleep(1);
}
