import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

/**
 * 
$env:K6_WEB_DASHBOARD="true"
$env:K6_WEB_DASHBOARD_EXPORT="performance/ai/report_load.html"

k6 run -e RUN_ONLY=load performance/ai-service.test.js
 */

// k6 run -e RUN_ONLY=load performance/ai-service.test.js
// k6 run -e RUN_ONLY=stress performance/ai-service.test.js
// k6 run -e RUN_ONLY=spike performance/ai-service.test.js
// k6 run -e RUN_ONLY=semantic performance/ai-service.test.js

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CONFIG = {
  backendUrl: __ENV.BACKEND_URL || 'http://localhost:8081',
  aiUrl: __ENV.AI_SERVICE_URL || 'http://localhost:8082/api/recommendations',

  // null = run all strategies sequentially.
  // 'smoke' | 'semantic' | 'load' | 'stress' | 'spike' | 'soak' |
  // 'breakpoint' | 'capacity' | 'scalability' | 'concurrency' | 'volume' |
  // 'recovery'
  runOnly: __ENV.RUN_ONLY || null,

  topK: 10,
  volumeTopK: 100,

  // Warm the semantic/similar endpoints once in setup().
  warmAi: true,
};

const SCENARIO_NAMES = [
  'smoke',
  'semantic',
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

// ---------------------------------------------------------------------------
// Profiles. Semantic runs separately; similar carries the high-RPS profiles.
// ---------------------------------------------------------------------------
const SCENARIOS = {
  smoke: {
    executor: 'per-vu-iterations',
    vus: 3,
    iterations: 3,
    maxDuration: '30s',
    startTime: '0s',
    gracefulStop: '5s',
  },

  load: {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    stages: [
      { target: 50, duration: '30s' },
      { target: 100, duration: '30s' },
      { target: 150, duration: '30s' },
      { target: 200, duration: '30s' },
      { target: 200, duration: '2m' },
    ],
    preAllocatedVUs: 100,
    maxVUs: 1000,
    startTime: '100s',
    gracefulStop: '15s',
  },

  stress: {
    executor: 'ramping-arrival-rate',
    startRate: 100,
    timeUnit: '1s',
    stages: [
      { target: 100, duration: '30s' }, // ramp up
      { target: 100, duration: '1m' }, // stable
      { target: 500, duration: '30s' }, // ramp up
      { target: 500, duration: '1m' }, // stable
      { target: 100, duration: '30s' }, // ramp up
      { target: 1000, duration: '1m' }, // stable
      { target: 0, duration: '1m' }, // ramp down
    ],
    preAllocatedVUs: 200,
    maxVUs: 1000,
    startTime: '170s',
    gracefulStop: '15s',
  },

  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 1000,
    timeUnit: '1s',
    stages: [
      { target: 2000, duration: '30s' },
      { target: 2000, duration: '2m' },
      { target: 0, duration: '30s' },
    ],
    preAllocatedVUs: 5000,
    maxVUs: 100000,
    startTime: '240s',
    gracefulStop: '15s',
  },

  breakpoint: {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    stages: [
      { target: 50, duration: '30s' },
      { target: 100, duration: '30s' },
      { target: 200, duration: '30s' },
      { target: 500, duration: '30s' },
      { target: 1000, duration: '30s' },
    ],
    preAllocatedVUs: 100,
    maxVUs: 500,
    startTime: '270s',
    gracefulStop: '15s',
  },

  soak: {
    executor: 'constant-arrival-rate',
    rate: 1000,
    timeUnit: '1s',
    duration: '2m',
    preAllocatedVUs: 1000,
    maxVUs: 5000,
    startTime: '340s',
    gracefulStop: '15s',
  },

  capacity: {
    executor: 'constant-arrival-rate',
    rate: 50000,
    timeUnit: '1s',
    duration: '1m',
    preAllocatedVUs: 5000,
    maxVUs: 50000,
    startTime: '460s',
    gracefulStop: '15s',
  },

  scalability: {
    executor: 'ramping-arrival-rate',
    startRate: 1000,
    timeUnit: '1s',
    stages: [
      { target: 1000, duration: '15s' },
      { target: 5000, duration: '15s' },
      { target: 10000, duration: '15s' },
      { target: 50000, duration: '15s' },
    ],
    preAllocatedVUs: 5000,
    maxVUs: 50000,
    startTime: '530s',
    gracefulStop: '15s',
  },

  concurrency: {
    executor: 'constant-vus',
    vus: 1000,
    duration: '30s',
    startTime: '600s',
    gracefulStop: '15s',
  },

  volume: {
    executor: 'constant-arrival-rate',
    rate: 1000,
    timeUnit: '1s',
    duration: '1m',
    preAllocatedVUs: 1000,
    maxVUs: 5000,
    startTime: '640s',
    gracefulStop: '15s',
  },

  recovery: {
    executor: 'ramping-arrival-rate',
    startRate: 1000,
    timeUnit: '1s',
    stages: [
      { target: 1000, duration: '1m' },
      { target: 50000, duration: '20s' },
      { target: 1000, duration: '1m' },
    ],
    preAllocatedVUs: 5000,
    maxVUs: 50000,
    startTime: '710s',
    gracefulStop: '15s',
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

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
const semanticDuration = new Trend('semantic_duration', true);
const similarDuration = new Trend('similar_duration', true);

const http4xx = new Counter('http_4xx');
const http5xx = new Counter('http_5xx');
const businessErrors = new Counter('business_errors');

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
export const options = {
  scenarios: ACTIVE_SCENARIOS,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<6000'],
    checks: ['rate>0.95'],

    'http_req_failed{api:semantic}': ['rate<0.05'],
    'http_req_duration{api:semantic}': ['p(95)<1500', 'p(99)<3000'],
    semantic_duration: ['p(95)<1500', 'p(99)<3000'],

    'http_req_failed{api:similar}': ['rate<0.05'],
    'http_req_duration{api:similar}': ['p(95)<800', 'p(99)<1500'],
    similar_duration: ['p(95)<800', 'p(99)<1500'],
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
  } catch {
    return null;
  }
}

function currentScenario() {
  return exec.scenario.name;
}

/**
 * __ITER resets per VU, so using it alone makes every VU pick the same branch.
 * Offset it by the VU id to keep a deterministic 50/50 mix across VUs without
 * random numbers.
 */
function iterationIndex() {
  return __ITER + exec.vu.idInTest;
}

function request(path, api, trend, extraTags) {
  const scenario = currentScenario();
  const tags = {
    api,
    scenario,
    ...(extraTags || {}),
  };

  const res = http.get(`${CONFIG.aiUrl}${path}`, { tags });

  if (trend) {
    trend.add(res.timings.duration, tags);
  }

  if (res.status >= 400 && res.status < 500) {
    http4xx.add(1, tags);
  }
  if (res.status >= 500) {
    http5xx.add(1, tags);
  }

  return res;
}

function markBusinessError(api) {
  businessErrors.add(1, { api, scenario: currentScenario() });
}

function checkEnvelope(res, name, api) {
  const body = parseJson(res);
  const ok = check(res, {
    [`${name}: status 200`]: (r) => r.status === 200,
    [`${name}: success=true`]: () => !!body && body.success === true,
    [`${name}: statusCode=200`]: () => !!body && body.statusCode === 200,
    [`${name}: result is array`]: () => !!body && Array.isArray(body.result),
  });

  if (!ok || !body || body.success !== true) {
    markBusinessError(api);
  }

  return body;
}

function checkPagination(body, name, topK) {
  if (!body) {
    return;
  }

  check(body, {
    [`${name}: pagination present`]: (b) =>
      !!b.pagination &&
      typeof b.pagination.total === 'number' &&
      typeof b.pagination.totalPages === 'number' &&
      typeof b.pagination.page === 'number' &&
      typeof b.pagination.limit === 'number',
    [`${name}: result length <= topK`]: (b) =>
      Array.isArray(b.result) && b.result.length <= topK,
    [`${name}: item shape`]: (b) =>
      Array.isArray(b.result) &&
      b.result.every(
        (item) =>
          item &&
          typeof item.id === 'number' &&
          typeof item.title === 'string' &&
          typeof item.similarityScore === 'number',
      ),
  });
}

// ---------------------------------------------------------------------------
// setup(): backend top-10 -> AI service ids + keywords
// ---------------------------------------------------------------------------
export function setup() {
  const backendHealth = http.get(`${CONFIG.backendUrl}/api/health`);
  if (backendHealth.status !== 200) {
    fail(
      `Backend health failed: GET /api/health -> HTTP ${backendHealth.status}. Is backend running at ${CONFIG.backendUrl}?`,
    );
  }

  const searchRes = http.get(
    `${CONFIG.backendUrl}/api/movies/search?page=1&limit=10&sort=viewCount:DESC`,
  );
  const searchBody = parseJson(searchRes);
  const movies = (searchBody && searchBody.result) || [];

  if (
    searchRes.status !== 200 ||
    !Array.isArray(movies) ||
    movies.length === 0
  ) {
    fail(
      `Cannot load top movies from backend search (HTTP ${searchRes.status}). Is backend seeded?`,
    );
  }

  const movieIds = [];
  const keywords = [];

  for (const movie of movies.slice(0, 10)) {
    const id = Number(movie && movie.id);
    if (Number.isFinite(id) && id > 0) {
      movieIds.push(id);
    }

    const keyword = String(
      (movie && (movie.titleVi || movie.title)) || '',
    ).trim();
    if (keyword.length > 0) {
      keywords.push(keyword);
    }
  }

  const uniqueMovieIds = Array.from(new Set(movieIds));
  const uniqueKeywords = Array.from(new Set(keywords));

  if (uniqueMovieIds.length === 0) {
    fail('Backend search returned no valid movie ids for /similar.');
  }

  const aiHealthRes = http.get(`${CONFIG.aiUrl}/health`);
  const aiHealth = parseJson(aiHealthRes);
  if (aiHealthRes.status !== 200 || !aiHealth || aiHealth.success !== true) {
    fail(
      `AI service health failed: GET ${CONFIG.aiUrl}/health -> HTTP ${aiHealthRes.status}. Is ai-service running at 8082?`,
    );
  }

  // Keep only ids that the AI service can resolve; a 404 here would pollute
  // the load test and is not a useful result.
  const validMovieIds = [];
  for (const id of uniqueMovieIds) {
    const res = http.get(`${CONFIG.aiUrl}/similar/${id}?topK=1`);
    if (res.status === 200) {
      validMovieIds.push(id);
    }
  }

  if (validMovieIds.length === 0) {
    fail('AI service returned 404 for every movie id from backend search.');
  }

  const loadMovieIds = validMovieIds.slice(0, 10);
  const loadKeywords =
    uniqueKeywords.length > 0 ? uniqueKeywords.slice(0, 10) : ['phim hay'];

  if (CONFIG.warmAi) {
    for (const keyword of loadKeywords) {
      http.get(
        `${CONFIG.aiUrl}/semantic-search?keyword=${encodeURIComponent(
          keyword,
        )}&topK=${CONFIG.topK}`,
      );
    }

    for (const id of loadMovieIds) {
      http.get(`${CONFIG.aiUrl}/similar/${id}?topK=${CONFIG.topK}`);
    }
  }

  return {
    movieIds: loadMovieIds,
    keywords: loadKeywords,
  };
}

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------
function runSemantic(data, opts) {
  const topK = (opts && opts.topK) || CONFIG.topK;
  const keyword =
    (opts && opts.keyword) ||
    data.keywords[iterationIndex() % data.keywords.length];

  const path = `/semantic-search?keyword=${encodeURIComponent(
    keyword,
  )}&topK=${topK}`;

  const res = request(path, 'semantic', semanticDuration, {
    topK: String(topK),
  });
  const body = checkEnvelope(res, 'semantic', 'semantic');
  checkPagination(body, 'semantic', topK);
}

function runSimilar(data, opts) {
  const topK = (opts && opts.topK) || CONFIG.topK;
  const movieId =
    (opts && opts.movieId) ||
    data.movieIds[iterationIndex() % data.movieIds.length];

  const path = `/similar/${movieId}?topK=${topK}`;

  const res = request(path, 'similar', similarDuration, {
    topK: String(topK),
  });
  const body = checkEnvelope(res, 'similar', 'similar');
  checkPagination(body, 'similar', topK);
}

function runSmoke(data) {
  const index = iterationIndex();
  runSemantic(data, {
    keyword: data.keywords[index % data.keywords.length],
    topK: CONFIG.topK,
  });
  runSimilar(data, {
    movieId: data.movieIds[index % data.movieIds.length],
    topK: CONFIG.topK,
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

  const isVolume = scenario === 'volume';
  const topK = isVolume ? CONFIG.volumeTopK : CONFIG.topK;

  if (scenario === 'semantic') {
    runSemantic(data, { topK });
    return;
  }

  runSimilar(data, { topK });
  runSemantic(data, { topK });

  // sleep
  sleep(0.5);
}
