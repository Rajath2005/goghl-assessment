# AGENTS.md — Switchboard | GoGHL.ai live assessment

## Mission and source of truth
Build the actual Switchboard product: a multi-tenant, real-time shared customer-support inbox for human agents. Customers are simulated by Pigeon; do not build a customer app or AI chatbot. The official BRIEF.md, START_HERE.md, PIGEON.md, environment configuration, provider contracts and SUBMISSION.md override these notes. Use REFERENCE.html/PDF as a lookup. Read relevant scaffold and harness source before implementing. Record assumptions, trade-offs and omissions in DECISIONS.md.

Use the provided Express/TypeScript and React/Vite scaffold unless a compelling reason requires otherwise. Maintain Node.js 22 compatibility, MongoDB and Redis integration, and clean-clone install/start through switchboard.json. Do not hardcode service URLs, secrets or the application port; follow .env.example and PORT.

## Execution and time
- The assessment is live. Continue from the current implementation state; do not restart the plan, repeat completed setup, or provide tutorials. Inspect existing changes and actual test results before editing.
- Make a concise prioritized plan and execute immediately without waiting for routine plan approval. Implement small working vertical slices, run relevant tests and fix real failures.
- Follow the official order: Level 1, Level 5, Level 2, Level 3. Implement written Level 4 rules throughout. Get one webhook stored and one reply sent, then run the checker early. Build a functional frontend alongside the core workflow before optional features.
- Make genuine Git commits at least every 15 minutes, including unfinished progress if necessary. Flag checkpoint and transcript export reminders. Keep the repository private; push only to the verified private remote when I authorize it. Never rewrite or fabricate history. Do not publish or submit without my approval.
- Stop feature development by 7:50 PM IST; submission closes at 8:00 PM IST. Aim to finish feature work and prepare README, decisions and transcript checkpoints before 7:50. I track the clock; do not assume background timers or autonomous reminders are available. Follow any updated official instructions.
- Report concise milestones: implemented features, actual commands and results, remaining blockers, next priority. Do not claim unverified success.

## Core product and reliability
- Pigeon webhook: verify HMAC-SHA256 over the exact raw body and signed timestamp using constant-time comparison. Follow PIGEON.md response rules precisely, including malformed signatures, stale timestamps, invalid JSON, unknown types/workspaces/status targets and acknowledgment within five seconds after durable storage. Deduplicate events and message IDs; order inbound messages by occurred_at. Prevent stale status updates from regressing final states.
- Inbox: workspace-scoped conversations per contact, newest activity first and paginated; chronological message history; atomic assignment with same-holder retries succeeding and conflicting claims returning 409; close/reopen; create conversations on first inbound, reply or claim as specified.
- Replies: durable acceptance before 202, stable client_ref and provider Idempotency-Key across retries/restarts, atomic deduplication, recoverable work claims/leases or equivalent. Handle ambiguous timeouts, 429 Retry-After, 503 and outages without losing accepted replies or duplicating customer sends. Coordinate the provider's per-workspace bucket (capacity 8, refill 4/sec) and cooldown across instances. Recover abandoned work within the brief's 60-second bound. Avoid marking transient failures as terminal.
- OIDC: authorization code + PKCE S256, verified token signature and claims, state/nonce checks, shared sessions, safe cookie settings. Authorize every workspace operation from verified membership and role; use the required 401/403 semantics. Never rely on a client-provided workspace or identity alone.
- WebSocket: authenticate upgrades using the session cookie and workspace membership, emit required events and increasing integer seq per workspace, replay all missed events after the supplied cursor and transition to live without gaps across instances. Persist necessary replay history; ephemeral Pub/Sub alone is insufficient.
- Keep shared business state durable in MongoDB. Use unique indexes, atomic conditional updates and recoverable processing. Inspect the supplied deployment before assuming transactions or Redis persistence are available. Handle crash boundaries between records, jobs and events; do not claim exactly-once guarantees without evidence.
- Validate inputs and environment configuration, handle errors explicitly, use useful non-sensitive logs, and avoid unnecessary abstractions/dependencies. No destructive or privileged operations outside the authorized assessment workflow without approval.

## Official checker and verification
Implement exact paths, payloads, status codes and snapshot shape from BRIEF.md, including /healthz, /webhooks/pigeon, /__grader/reset, /__grader/snapshot, /__grader/reply, /__grader/claim, /auth/login, /auth/callback, /api/me, /api/conversations and /ws. Protect grader endpoints with x-grader-token and GRADER_TOKEN; share actual business logic with UI APIs. Reset only application state as specified, including relevant MongoDB and Redis data.

Read harness/check.js to understand the contracts; never alter the checker or simulators to bypass requirements, hardcode expected outputs, fake tests, or hide failures. Stop your dev server before checks: the official checker launches its own server and deletes application data. Use npm run check, npm run check -- --levels 5, then levels 2 and 3 as appropriate; finish with npm run check:full. Keep the clean-clone startup functional throughout. Write focused tests for the riskiest logic and verify key UI flows. Preserve actual results and document failures honestly.

## Model routing and AI usage
- Current primary: GPT-6.2 Astra, High reasoning, explicitly approved by me and selected in Codex. Continue using this session. AGENTS.md does not itself change the active model; .codex/config.toml and /model control it.
- Prefer the primary agent for implementation. Recommend Sol Medium for ordinary work or Sol High for complex debugging if switching would improve speed/usage. Use lighter effort for routine tasks when appropriate. I control main model switches. Avoid Extra High/Fast mode and unnecessary parallel sessions unless explicitly approved.
- Use configured read-only architect, reviewer or explorer specialists only for narrowly scoped tasks with clear benefit, with my approval, if the model is available and its transcript can be exported. At most one specialist at a time. Primary agent integrates changes. If a specialist is unavailable, continue in the primary session rather than debugging agent configuration.
- Avoid redundant file reads, repeated setup, excessive explanation and large rewrites. If usage approaches exhaustion, notify me promptly and checkpoint current work. I may request the organizer-provided Claude Code fallback; use it only after access is confirmed and at no extra cost. Preserve all transcripts and continue from the same repository.

## Frontend UI/UX and resource policy
Act as an experienced frontend engineer and product designer. Create a distinctive, professional and accessible Switchboard interface: actual OIDC sign-in, authorized workspace selector, paginated inbox with latest previews, open/closed filters, conversation detail with chronological messages, assignment and claim controls, reply composer, delivery states, close/reopen, and live connection/reconnection feedback. Provide responsive layouts, keyboard accessibility, consistent typography and spacing, and loading/empty/error/success states. Use real APIs; no fake completed workflows or fabricated data. Prioritize usability and core correctness over decorative polish; avoid generic gradients, excessive cards, glassmorphism and gratuitous animations.

When useful, briefly research free resources from:
- https://21st.dev/
- https://ui.shadcn.com/
- https://reactbits.dev/
- https://magicui.design/
- https://ui.aceternity.com/
- https://originui.com/
- https://motion.dev/
- https://lucide.dev/
- https://fonts.google.com/
- https://godly.website/
- https://land-book.com/
- https://www.awwwards.com/

Use only relevant, appropriately licensed resources; galleries are inspiration, not permission to copy protected designs. Verify licenses and retain required notices. Prefer local/open-source alternatives, original components and minimal dependencies. Use free shadcn, Context7 or Playwright MCP tools if already available and useful; do not spend assessment time installing or troubleshooting optional MCP servers. Limit design research to a few minutes. Test real UI flows with Playwright or available browser tools when feasible; otherwise document manual verification and limitations.

## Zero additional budget
Existing ChatGPT Plus is the only paid AI subscription. Additional development budget is zero. The organizer-provided Claude Code fallback is acceptable only if confirmed free to me. No paid APIs, metered services, paid API keys, subscriptions, premium templates or paid components (including 21st.dev premium, Magic UI Pro and Aceternity Pro). No purchases, paywall or license circumvention. Choose free alternatives or implement original equivalents. Provided Pigeon, IdP and Paybox are local simulators; do not connect real messaging, identity or payment services.

## Optional features and scope cuts
Once the reliable core and usable frontend are working, consider end-to-end encrypted private notes (server must not be able to read them; PROTOCOL.md must explain key holders, stored data and three attacks not prevented), focused tests and workspace-scoped Elasticsearch search. Billing through Paybox is bonus only; start it last and only when the full checker is satisfactory. Do not sacrifice mandatory functionality or submission time. Document omitted/incomplete features; do not present plaintext notes as end-to-end encrypted.

## Mandatory AI conversation logging
- Export every AI session used for the assessment into ai-logs/, one file per session in the tool's native export format (Markdown, text or JSON). Include other tools and specialist sessions if used, as required by SUBMISSION.md.
- Remind me to manually export at milestones, before switching tools or starting a new session, and before final submission. Use the CLI's available export command; verify files actually exist and are current. Do not assume automatic session history is a submitted export.
- Never fabricate, edit or substitute summaries for original transcripts. Before publication, check for secrets and personal sensitive information; ask organizers how to handle sensitive material rather than silently editing required evidence. Avoid introducing real credentials into transcripts in the first place.
- Ensure all required exports are included in the final commit. If a tool cannot export its sessions, notify me immediately and avoid creating additional unexportable sessions.

## Deliverables and submission
Required: source code and genuine commit history, README.md with working clean-clone instructions, switchboard.json with correct install/start/health configuration, half-page DECISIONS.md (built, cut and why, assumptions, known faults), actual CHECK_REPORT.json from the final full check, all AI transcripts in ai-logs/, and PROTOCOL.md if encrypted notes were attempted. No .env, node_modules or real credentials in the repository. If the full check cannot finish in time, follow SUBMISSION.md's fallback and explain it in DECISIONS.md.

At 7:50 PM stop building, stop the dev server, run the full check, retain its actual report, export transcripts and verify deliverables. With my approval, commit and push the final state, obtain the full SHA (git rev-parse HEAD), make the repository public, verify it opens without login, and submit the form before 8 PM. I submit my name/email, repository URL, final commit SHA and AI tools used. Leave the repository public and unchanged for 14 days. Understand the submitted code and be able to explain and debug its decisions and limitations.
