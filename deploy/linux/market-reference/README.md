# Separate read-only market reference process

This process imports only Node built-ins and its own `.mjs` files. It has no API,
database, wallet, signer, environment-secret file or transaction dependency. No
provider request occurs when a module is imported. Production has three fixed
public Kraken GET URLs and normal HTTPS certificate/hostname verification.

Copy the reviewed four modules from `api/src/market-reference/` into the same
relative layout under `/opt/zeeswap-market-reference/`. Preserve owner-controlled
read-only files. Review the public systemd template for the actual Node path and
host policy before installation. It uses a dynamic unprivileged identity, 80 MiB
memory high watermark, 96 MiB hard limit, a 24 MiB V8 old-space limit and no access
to the existing application directory. Root's actual native provider sample used
63,356,928 bytes RSS (reported max RSS 62,000 KiB), making the initial 64 MiB hard
limit too close before cgroup overhead. The revised cap follows that measurement;
the operator still checks actual service memory/health after startup.

```sh
/usr/bin/node --max-old-space-size=24 /opt/zeeswap-market-reference/api/src/market-reference/main.mjs
```

The only environment setting is the listener `PORT` (default `3032`), bound to
`127.0.0.1`. No provider URL or TLS override is configurable. A disabled normal
TLS verifier causes provider reads to fail closed. There are no keys or paid API
credentials. The process reports unavailable while its first bounded sample is
pending, on validation/transport failure or when the cached reference expires.

After checking that port 3032 is unused, Root may install the reviewed unit and
add this exact-path location in the existing site's HTTPS server block. Preserve
all existing financial API locations and do not restart their process:

```nginx
location = /market-reference {
    proxy_pass http://127.0.0.1:3032/market-reference;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_connect_timeout 2s;
    proxy_read_timeout 5s;
    proxy_send_timeout 5s;
    proxy_cache off;
    proxy_intercept_errors off;
    add_header Cache-Control "no-store" always;
}
```

Verify Nginx configuration before reload, then inspect the actual public GET and
HEAD response, source pair identities, HTTP 503 behavior and the frontend label.
The service allows only GET/HEAD/OPTIONS on its exact path, rejects request bodies
and query/path proxies, and never makes provider requests per browser request.
One process polls every 15 seconds with singleflight deduplication and no retry.
Keep one instance; multiple replicas multiply upstream sampling.

Rollback removes only this exact Nginx location and stops/disables this unit.
It does not alter quotes, testnet payout amounts, admission policy or financial
state. The existing fixed testnet quote remains the payout authority.
