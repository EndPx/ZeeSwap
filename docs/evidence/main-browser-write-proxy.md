# Main browser write proxy correction

29 October 2026. Deployment routing evidence; no wallet payment or settlement
is established by this correction.

The actual browser quote request was rejected at Nginx by the generic `/v1/`
loopback-only write rule. It received 403 HTML rather than an API JSON response.
The web client's JSON decode therefore produced its unsupported-response warning.
This was not a quote DTO mismatch. No frontend parser or application code changed.

Root added the narrowly scoped public Main route:

```nginx
location ~ ^/v1/(quotes$|orders/[0-9a-f-]+/(accept|funding)$)
```

That route proxies to 127.0.0.1:3031 and permits GET, HEAD, POST and OPTIONS.
It covers quote creation and the authenticated original-order accept/funding
endpoints. Other methods remain denied. The generic `/v1/` write restriction,
including Bridge writes, remains limited to 127.0.0.1 and ::1; public GET/HEAD
reads remain available. The repository TLS template now matches this routing.
Backend capability, idempotency, admission, Source, amount and payment guards
remain authoritative; permitting the HTTP method does not bypass them.

Root preserved the old configuration privately. Actual `nginx -t` and reload
passed without restarting the API, worker or observer. An external HTTPS
unauthenticated `POST /v1/quotes` with an empty JSON object and production Origin
then returned **401**, `application/json`, `AUTH_REQUIRED`, replacing the earlier
403 HTML. That authentication refusal proves the request reaches the API;
it creates no quote, acceptance or payment.

The user was instructed to retry the same form button while retaining the
existing addresses and idempotency request. Root did not create a real quote,
accept an order or send funds for this verification. The production frontend
artifact remains unchanged. No new checks or remote mutations were performed
by the coding agent; live observations above are Root's reported operator result.
