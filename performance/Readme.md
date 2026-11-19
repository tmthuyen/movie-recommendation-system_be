# Test performance với k6

## Public API

- Run

```bash

$env:K6_WEB_DASHBOARD="true"
$env:K6_WEB_DASHBOARD_EXPORT="performance/report_public_api.html"

k6 run performance/public-api.test.js
```

```bash

$env:K6_WEB_DASHBOARD="true"
$env:K6_WEB_DASHBOARD_EXPORT="performance/fixed/report_public_api.html"

k6 run performance/public-api-fixed.test.js
```

- Run theo scenario

```bash
$env:K6_WEB_DASHBOARD="true"
$env:K6_WEB_DASHBOARD_EXPORT="performance/report_load.html"

k6 run -e RUN_ONLY=load performance/public-api.test.js
```

```bash
$env:K6_WEB_DASHBOARD="true"
$env:K6_WEB_DASHBOARD_EXPORT="performance/fixed/report_load.html"

k6 run -e RUN_ONLY=load performance/public-api-fixed.test.js
```
