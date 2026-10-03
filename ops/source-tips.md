# Private Source Tips destination

The Source Tip form sends a URL, explanation, optional contact and optional Person reference to a separate private SQL queue. The app never fetches a submitted URL or promotes a Source Tip to public evidence. Source Tips create no Person, Tenure, Filing or Source Document. Public manifests and snapshots do not read the queue.

Set server-only `SOURCE_TIPS_DATABASE_URL` and `SOURCE_TIPS_AUTH_TOKEN` for a dedicated private Turso database. Do not use the Archive database or token. The app rejects the same file path or remote hostname, including HTTPS/libSQL aliases. Give reviewers authenticated access to that private destination through Turso's native console. Do not expose the queue through a public route, dump, analytics event or Git file.

Set a separate server-only `SOURCE_TIPS_RATE_LIMIT_SECRET` of at least 32 random characters. Netlify supplies the trusted client address through the action context. The app stores its HMAC, never the address, and accepts at most five tips from that client in ten minutes. The check and insertion use the same private write transaction. Request headers cannot change the limit. Both form and enhanced `.data` submissions use this check. Explicit local file queues without a Netlify context share one local development limit.

Initialize a local destination with `SOURCE_TIPS_DATABASE_URL=file:.data/source-tips.db npm run archive:source-tip-destination -- --environment local`. For a named remote staging destination, set `SOURCE_TIPS_ENVIRONMENT=staging` and use `--environment staging`. This command never creates a production destination through the generic migration CLI. Missing configuration keeps the public form unavailable. An uninitialized, full or failed destination produces a retry message rather than a receipt.

Run the initializer again for an existing private destination before deploying this change. It adds the private rate key and index without changing old tips. A client limit returns 429 with `Retry-After: 600`; other queue failures return 503. The limit controls one client's burst. Reviewers still need retention and must monitor distributed abuse.

The request boundary accepts only same-origin URL-encoded POSTs, checks allowed fields, caps the streamed body at 64 KiB, rejects embedded URL credentials and uploads, and uses a hidden honeypot. The first private queue is capped at 1,000 tips in an atomic transaction. Reviewers must establish a retention process before that volume. Contact details remain optional and private. Responses have `no-store`; automatic form capture and session recording are disabled.

Reviewers inspect a candidate independently, acquire exact source bytes, establish attribution and provenance, and then write the reviewed public manifest through the normal editorial workflow. Never copy contact details or private commentary into that manifest. Reviewer publication and any communication to the contributor remain separate actions. No account, uploaded-file store or public submission listing is provided.

Local verification uses only synthetic `example.invalid` contacts and a separate ignored database. A live private destination and its access controls must be verified during isolated develop acceptance before Source Tips can be considered operational there.
