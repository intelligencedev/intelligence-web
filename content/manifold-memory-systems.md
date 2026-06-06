---
title: "Total Recall: How Manifold Gives Its Agents a Memory"
date: 2026-06-05
description: "A field guide to Manifold's four memory lanes — Summarization, Transit, Evolving Memory, and MAGMA — and how they turn forgetful chatbots into agents that finish long-horizon work."
tags: ["manifold", "memory", "agents", "rag", "long-horizon"]
---

<style>
/* ── Scoped styles for the memory article ───────────────────────── */
.content { --evolving:#61f4d0; --transit:#6aaefc; --magma:#ff7a59; --rag:#c792ea; --belief:#ffd166; }
.content h2 { margin-top: 2.4em; padding-top: .6em; border-top: 1px solid rgba(230,237,243,.10); }
.content h3 { color: rgba(154,180,255,.9); margin-top: 1.8em; }
.content img { max-width: 100%; height: auto; display: block; border-radius: 12px; }

.mem-lead { font-size: 1.12rem; line-height: 1.75; color: #c9d4e0; }

.mem-anim { margin: 22px 0 34px; display: grid; gap: 10px; }
.mem-anim .lane {
  position: relative; height: 38px; border-radius: 999px; overflow: hidden;
  border: 1px solid rgba(230,237,243,.10); background: rgba(255,255,255,.025);
}
.mem-anim .tag {
  position: absolute; left: 16px; top: 50%; transform: translateY(-50%); z-index: 2;
  font: 600 .72rem/1 'Space Grotesk', system-ui, sans-serif; letter-spacing: .12em;
  text-transform: uppercase; color: var(--c);
}
.mem-anim .pkt {
  position: absolute; top: 50%; width: 11px; height: 11px; margin-top: -5.5px;
  border-radius: 50%; background: var(--c); box-shadow: 0 0 12px var(--c);
  left: -5%; animation: memflow var(--d,4.5s) linear infinite var(--delay,0s);
}
@keyframes memflow {
  0% { left: -5%; opacity: 0; } 8% { opacity: 1; }
  92% { opacity: 1; } 100% { left: 105%; opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .mem-anim .pkt { animation: none; left: 55%; } }

.mem-cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 14px; margin: 26px 0; }
.mem-card { border: 1px solid rgba(230,237,243,.10); border-radius: 14px; padding: 16px 18px; background: rgba(255,255,255,.02); }
.mem-card h4 { margin: 0 0 6px; font-size: .98rem; }
.mem-card p { margin: 0; font-size: .85rem; color: #9fb0c2; line-height: 1.55; }
.mem-chip { display:inline-block; font: 600 .66rem/1 'Space Grotesk',system-ui,sans-serif; letter-spacing:.1em; text-transform:uppercase; padding: 3px 9px; border-radius: 999px; margin-bottom: 9px; color:#0b0c10; }

.mem-figure { margin: 30px 0; border: 1px solid rgba(230,237,243,.10); border-radius: 14px; overflow: hidden; background: linear-gradient(180deg,#0f1219,#0b0c10); }
.mem-figure img { border-radius: 0; }
.mem-figcap { font-size: .84rem; color: #8aa0b6; padding: 11px 15px; border-top: 1px solid rgba(230,237,243,.08); }

.mermaid { margin: 28px 0; text-align: center; }
.content table { border-collapse: collapse; width: 100%; font-size: .86rem; margin: 18px 0; }
.content th, .content td { border: 1px solid rgba(230,237,243,.12); padding: 8px 11px; text-align: left; vertical-align: top; }
.content th { background: rgba(255,255,255,.03); }
.tldr { border-left: 3px solid var(--transit); background: rgba(106,174,252,.06); padding: 14px 18px; border-radius: 0 10px 10px 0; margin: 24px 0; }
</style>

<p class="mem-lead">Picture the most brilliant colleague you have ever worked with. They can read a thousand-page spec in seconds, write flawless code, and reason through a thorny migration plan. There is just one problem: every morning they wake up with total amnesia. Yesterday never happened. The painful lesson they learned at 4&nbsp;PM is gone by 9&nbsp;AM. That, in a nutshell, is a raw large language model — and it is the central obstacle to getting agents to finish <em>long-horizon</em> work that spans hours, days, or many sessions.</p>

Manifold's answer is not a single "memory feature." It is a small fleet of cooperating memory systems — the UI literally calls them **Memory Lanes** — each tuned for a different kind of remembering. This article is a tour of those lanes: what each one does, how they fit together, and why the combination is what lets a team of agents grind through a multi-day objective without losing the plot.

<div class="mem-anim" role="img" aria-label="Animated diagram of four memory lanes carrying packets of information">
  <div class="lane" style="--c:var(--evolving)"><span class="tag">Evolving</span><span class="pkt" style="--d:4.8s;--delay:0s"></span><span class="pkt" style="--d:4.8s;--delay:2.4s"></span></div>
  <div class="lane" style="--c:var(--transit)"><span class="tag">Transit</span><span class="pkt" style="--d:3.9s;--delay:.6s"></span><span class="pkt" style="--d:3.9s;--delay:2.5s"></span></div>
  <div class="lane" style="--c:var(--magma)"><span class="tag">MAGMA</span><span class="pkt" style="--d:5.6s;--delay:.3s"></span><span class="pkt" style="--d:5.6s;--delay:3.1s"></span></div>
  <div class="lane" style="--c:var(--rag)"><span class="tag">RAG&nbsp;+&nbsp;Embeddings</span><span class="pkt" style="--d:4.3s;--delay:1.1s"></span><span class="pkt" style="--d:4.3s;--delay:3.0s"></span></div>
</div>

<div class="tldr">
<strong>TL;DR.</strong> Manifold layers four complementary memory systems on top of an LLM: <strong>Summarization</strong> keeps a single conversation inside the context window; <strong>Transit</strong> is durable, addressable shared memory for coordinating multiple agents; <strong>Evolving Memory</strong> stores reusable <em>lessons</em> from finished tasks and retrieves them for new ones; and <strong>MAGMA</strong> is a multi-graph memory that links events by meaning, time, cause, and entity. Together they turn a stateless predictor into something that behaves like it has experience.
</div>

## Why one context window is never enough

An LLM's working memory is its **context window** — the tokens it can see in a single pass. It is generous on modern models but still finite, and worse, it is *volatile*. When the window fills, something has to go. When the session ends, everything goes. A long-horizon agent runs head-first into three different walls:

1. **The conversation gets too long.** A single chat blows past the token budget.
2. **The work outlives the chat.** A research objective spans dozens of runs and several specialists who never share a context window.
3. **The agent keeps re-learning the same lessons.** Without durable experience, mistake #1 on Monday is also mistake #1 on Friday.

Each wall needs a different tool, which is exactly why Manifold ships several. Here is the high-level picture before we zoom into each lane.

<pre class="mermaid">
flowchart TD
    U["User goal / long-horizon objective"] --> ENG["Agent engine run"]
    subgraph CTX["Context assembly (per call)"]
      direction TB
      SUM["Summarization<br/>fit the live chat in budget"]
      EM["Evolving Memory<br/>reusable lessons from past runs"]
      TR["Transit<br/>durable shared key/value memory"]
      MG["MAGMA + RAG<br/>graph + vector knowledge"]
    end
    ENG --> CTX
    SUM --> LLM["LLM call"]
    EM --> LLM
    TR --> LLM
    MG --> LLM
    LLM --> OUT["Action / answer"]
    OUT -->|"distill lesson"| EM
    OUT -->|"write shared note"| TR
    OUT -->|"ingest event"| MG
    OUT --> U
</pre>

Notice the feedback arrows at the bottom: the agent does not just *read* memory, it *writes back* after acting. That loop — act, reflect, store, reuse — is the difference between a chatbot and an agent that gets better at a job over time.

## Lane 1 — Summarization: keeping a conversation in its lane

The simplest memory problem is also the most common: a chat that grows longer than the model can read. Manifold's **summarization engine** solves it with a token-budget and a *reserve buffer*, a pattern borrowed from OpenAI's guidance for reasoning models ([`docs/summarization.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/summarization.md)).

The math is refreshingly boring, which is what you want in a safety valve:

```text
token_budget = context_window − reserve_buffer
```

The reserve buffer is space set aside for the model's *output*, including the invisible reasoning tokens that models like o-series burn through. With a 128K window and a 25K reserve, you get ~103K tokens of input headroom. Before **every** LLM call the engine counts the current input, and only if it exceeds the budget does it compress older turns.

<pre class="mermaid">
flowchart TD
    A["Build messages from history"] --> B["Count input tokens<br/>(preflight)"]
    B --> C{"input &gt; token_budget?"}
    C -->|No| D["Send as-is to LLM"]
    C -->|Yes| E["Preserve system message"]
    E --> F["Keep last N recent messages<br/>(SummaryMinKeepLastMessages, default 4)"]
    F --> G["Summarize older messages<br/>into a condensed note"]
    G --> H["Prepend summary + recent tail"]
    H --> D
</pre>

Crucially, the summary is *selective*, not a lossy blur. The prompt is told to preserve user goals and preferences, key decisions and facts, important identifiers (files, URLs, IDs), tool results and errors, and any open questions. Token counting is provider-aware: it uses OpenAI's `/v1/responses/input_tokens` endpoint and Anthropic's `/v1/messages/count_tokens` for exact counts, and falls back to a conservative `len/4` heuristic elsewhere.

A nice touch for humans: when compression happens, the backend fires an SSE `summary` event and the chat header shows a dismissible **"Context summarized"** badge with a tooltip like *"Summarized 38 of 42 messages (105,000 tokens exceeded 103,000 budget)."* You can see exactly when and why your agent tightened its belt.

```yaml
# Turn it on (opt-in). See docs/summarization.md
summaryEnabled: true
summaryReserveBufferTokens: 25000   # ~25k for reasoning models
summaryMinKeepLastMessages: 4
summaryMaxSummaryChunkTokens: 4096
```

> **Lane summary:** Summarization is *intra-conversation* memory. It keeps a single thread coherent and affordable. It does **not** try to remember across sessions — that is the next three lanes' job.

## Lane 2 — Transit: a shared whiteboard for a team of agents

The moment you have more than one agent — an orchestrator handing work to specialists, or a team grinding on an objective overnight — chat history stops being a good coordination medium. Specialists do not share a context window, and important state gets buried in transcripts. **Transit** is Manifold's fix: a durable, addressable **shared-memory layer** where agents coordinate through explicit keys instead of by shouting across a chat log ([`docs/transit.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/transit.md), [`internal/transit/service.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/transit/service.go)).

Think of it as a team whiteboard with stable, hierarchical addresses:

```json
{
  "keyName": "research/webgpu-wiki/plan",
  "description": "Master wiki outline and structure",
  "value": "1. index.md  2. wiki.config.md  3. rendering-pipeline.md ...",
  "embed": true,
  "embedSource": "value"
}
```

Keys are hierarchical and stable (`project/demo/brief`), validated to letters, numbers, and `_ . / @ -`. Records carry a `version` for optimistic concurrency, so two agents updating the same note do not silently clobber each other — an update can require `ifVersion` and fail loudly if the world moved on. Writes are authoritative and synchronous; the same record is *also* best-effort indexed into full-text and (optionally) vector search so another agent can find it by keyword or by meaning later.

Here is the pattern that makes long-horizon teamwork actually work — durable handoff through a key, not through a transcript:

<pre class="mermaid">
sequenceDiagram
    autonumber
    participant O as Orchestrator
    participant T as Transit store
    participant R as Researcher
    participant W as Writer
    O->>T: transit_create("research/webgpu-wiki/request", objective)
    O->>T: transit_create("research/webgpu-wiki/plan", outline)
    O->>R: delegate "gather sources"
    R->>T: transit_search("webgpu rendering pipeline")
    T-->>R: plan + request records
    R->>T: transit_update("research/webgpu-wiki/sources", refs, ifVersion=1)
    O->>W: delegate "write the wiki"
    W->>T: transit_get(["plan","sources"])
    T-->>W: durable shared context
    W->>T: transit_update("research/webgpu-wiki/status", "drafted")
</pre>

The researcher and the writer never shared a single message, yet they collaborated through a handful of well-named keys that outlive any one run. Transit ships eight internal tools — `transit_create`, `transit_get`, `transit_update`, `transit_delete`, `transit_search`, `transit_discover` (metadata-only, to save context), `transit_list_keys`, and `transit_list_recent` — plus authenticated HTTP endpoints under `/api/transit/`.

```yaml
enableTools: true
transit:
  enabled: true
  defaultSearchLimit: 10
  defaultListLimit: 100
  maxBatchSize: 100
  enableVectorSearch: true
```

Today Transit is an **owner-scoped MVP**: the tenant boundary is the current Manifold user (or the system tenant when auth is off), with namespace ACLs, subscriptions, and federation on the roadmap. Persistence rides the shared `databases.defaultDSN`; with no Postgres configured it falls back to an in-memory store for local development.

> **Lane summary:** Transit is *cross-agent, cross-session* working memory you write on purpose. It is the explicit shared state that makes a team of specialists more than a pile of disconnected chats.

## Lane 3 — Evolving Memory: learning from experience (and from mistakes)

Summarization and Transit help agents *remember what was said and decided*. **Evolving Memory** is the lane that helps an agent *get better* — it stores compact **lessons** distilled from completed tasks and retrieves the relevant ones when a similar task shows up again. It is explicitly separate from chat summarization: summarization keeps a conversation small; evolving memory stores reusable task experience so future runs avoid old mistakes and reuse winning strategies ([`docs/evolving_memory.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/evolving_memory.md), [`internal/agent/memory/evolving.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving.go)).

At runtime it follows a **Search → Synthesis → Evolve** loop, with an optional **ReMem** memory-preparation step bolted on the front:

<pre class="mermaid">
stateDiagram-v2
    [*] --> Search
    Search: Search — embed the task, retrieve relevant memories
    Synthesis: Synthesis — format memories into agent context
    Evolve: Evolve — distill the run into a new lesson + store it
    state ReMem {
      [*] --> THINK
      THINK --> REFINE_MEMORY: maintenance edit
      REFINE_MEMORY --> THINK
      THINK --> ACT: hand off to main agent
      ACT --> [*]
    }
    Search --> ReMem: if reMemEnabled
    ReMem --> Synthesis
    Search --> Synthesis: if ReMem disabled
    Synthesis --> MainAgent
    MainAgent: Main agent answers / acts
    MainAgent --> Evolve
    Evolve --> [*]
</pre>

**ReMem is a memory controller, not the answer path.** Before the main agent runs, ReMem can inspect retrieved memories and emit JSON actions — `THINK` (operational notes), `REFINE_MEMORY` (safe maintenance edits), or `ACT` (finish prep and hand off). Its edit operations are deliberately conservative: `PRUNE` an obsolete or unsafe memory, `MERGE` redundant ones, or `UPDATE_TAG` to annotate a useful memory without deleting it. (If your memory model can't reliably emit valid JSON, the docs are blunt: turn ReMem off.)

### What gets stored

Each memory is a small, structured experience record — not a raw transcript. Stored text is bounded, and the summarizer is instructed never to capture secrets, credentials, or one-off private details ([`internal/agent/memory/evolving_types.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving_types.go)):

<pre class="mermaid">
classDiagram
    class EvolvingMemory {
      +string Input
      +string Output
      +string Feedback
      +string Summary
      +string StrategyCard
      +MemoryType Type
      +MemoryScope Scope
      +float Embedding
      +int AccessCount
      +float RelevanceScore
      +time CreatedAt
      +time ExpiresAt
    }
    class MemoryType {
      <<enumeration>>
      factual
      procedural
      episodic
    }
    class MemoryScope {
      <<enumeration>>
      session
      user
    }
    EvolvingMemory --> MemoryType
    EvolvingMemory --> MemoryScope
</pre>

The **strategy card** is a compact, reusable strategy distilled from non-trivial runs — the "here's how I'd tackle this kind of thing next time" note. Successful *procedural* memories can even be **promoted** from `session` scope to `user` scope once they've proven useful enough times (`promotionAccessThreshold`, default 5), graduating a one-off trick into a durable personal playbook.

### How retrieval ranks memories

When `enableRAG` is on and Postgres is available, retrieval is genuinely hybrid and then carefully rescored — it is not just nearest-neighbor cosine ([`internal/agent/memory/evolving_search.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving_search.go), [`evolving_scoring.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving_scoring.go)):

<pre class="mermaid">
flowchart LR
    Q["Incoming task"] --> E["Embed query"]
    E --> V["pgvector cosine search"]
    Q --> K["Full-text keyword search<br/>input · output · feedback · summary · strategy_card"]
    V --> F["Reciprocal-rank fusion"]
    K --> F
    F --> RS["Rescore:<br/>similarity + recency decay<br/>+ feedback quality + access boost"]
    RS --> M["MMR diversification"]
    M --> TK["Top-K injected (default 4)"]
</pre>

That blend matters. Pure similarity returns near-duplicates; recency decay keeps things current; structured-feedback quality rewards lessons that actually worked; an access-count boost surfaces battle-tested memories; and **MMR diversification** ensures the top-K aren't four phrasings of the same idea. If query embedding fails, search degrades gracefully to keyword results; if write-time embedding fails, the lesson is still stored and findable by keyword.

### Keeping the corpus healthy

Memory that only grows becomes a junk drawer. With smart pruning enabled, Evolving Memory merges near-duplicates (`pruneThreshold` ~0.95–0.97), ages entries with a daily `relevanceDecay`, prunes low-relevance rows once `maxSize` is exceeded, and **protects** frequently reused successful memories (`pruneQualityFloor`). With pruning off, it falls back to simple FIFO. A recommended starting point:

```yaml
evolvingMemory:
  enabled: true
  enableRAG: true
  topK: 4
  windowSize: 20          # ExpRecent sliding window
  reMemEnabled: true
  maxInnerSteps: 3        # cap ReMem THINK/REFINE before forcing ACT
  enableSmartPrune: true
  pruneThreshold: 0.97
  promotionAccessThreshold: 5
```

It is **opt-in by design** — the shipped example config keeps it off so new installs stay predictable until embeddings, the database, and a memory model are all wired up. Observability is first-class: debug routes under `/api/debug/memory/...` (including an `explain` endpoint that shows each ranking component) and metrics at `/api/metrics/memory`.

> **Lane summary:** Evolving Memory is *experience*. It is the lane that turns "a model that's smart" into "an agent that's seasoned."

## Lane 4 — MAGMA: memory with a sense of meaning, time, cause, and who

The final lane is the most ambitious. **MAGMA** is an optional **multi-graph memory** for RAG and long-running agents. Instead of storing an event and forgetting how it relates to everything else, MAGMA stores each event **once** and then links it through four *typed* graph views, each answering a different question about the same memory ([`docs/magma_memory.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/magma_memory.md), [`internal/rag/service/magma.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/rag/service/magma.go)):

<div class="mem-cards">
  <div class="mem-card"><span class="mem-chip" style="background:var(--rag)">Semantic</span><h4>What is this like?</h4><p>Similarity edges between related events.</p></div>
  <div class="mem-card"><span class="mem-chip" style="background:var(--transit)">Temporal</span><h4>When did it happen?</h4><p><code>BEFORE</code>, <code>AFTER</code>, and <code>CONCURRENT</code> ordering.</p></div>
  <div class="mem-card"><span class="mem-chip" style="background:var(--magma)">Causal</span><h4>What led to what?</h4><p><code>CAUSES</code> edges from grounded text or LLM consolidation.</p></div>
  <div class="mem-card"><span class="mem-chip" style="background:var(--belief)">Entity</span><h4>Who/what is involved?</h4><p><code>MENTIONS</code> and entity-to-entity <code>RELATED_TO</code> edges.</p></div>
</div>

A single event becomes a hub in four overlapping graphs:

<pre class="mermaid">
graph TB
    EV["event: 'WebGPU wiki research run'"]
    EV -. semantic .-> S1["event: 'WGSL shader notes'"]
    EV -- "BEFORE (temporal)" --> T1["event: 'wiki drafted'"]
    EV == "CAUSES (causal)" ==> C1["event: '500 server error fixed'"]
    EV -- "MENTIONS (entity)" --> N1["entity: WebGPU"]
    N1 -- "RELATED_TO" --> N2["entity: rendering pipeline"]
    EV -- "MENTIONS (entity)" --> N3["entity: research_team/webgpu-wiki"]
</pre>

### Two paths: fast write, smart read

On the **write path**, `rag_ingest` stores the normal RAG document and, when MAGMA is on, writes a MAGMA event on a *fast path* — embed the raw event, store the node, mirror the vector, and queue it. The heavy lifting (resolving temporal attributes, entity mentions, and semantic/temporal/causal links, optionally with LLM extraction) happens **asynchronously** in consolidation workers, so ingestion stays snappy.

On the **read path**, `rag_retrieve` classifies the query's *intent* — temporal, entity, semantic, causal, or mixed — then selects which graph views to traverse and how far, finds anchor nodes via entity links or vector search, walks the typed graphs, and assembles structured context: timelines, entity profiles, causal chains, semantic clusters, and the raw events behind them.

<pre class="mermaid">
flowchart TD
    subgraph Write["Write path (fast)"]
      ING["rag_ingest"] --> EVN["store event node + mirror vector"] --> Q["queue"]
      Q --> CON["async consolidation workers<br/>semantic · temporal · causal · entity"]
    end
    subgraph Read["Read path"]
      QRY["rag_retrieve"] --> IC["classify intent<br/>temporal / entity / semantic / causal / mixed"]
      IC --> AN["find anchors (entity + vector)"]
      AN --> TRV["traverse typed graph views"]
      TRV --> CTX["structured context:<br/>timelines · profiles · causal chains · clusters"]
    end
</pre>

Because graphs can sprawl, MAGMA includes **lifecycle hardening**: `Prune` expires old events and trims low-weight or high-fanout edges, `ReviewEdges`/`ApproveEdge`/`RetractEdge` provide a human-in-the-loop for suspicious links, and a background worker can run pruning on a schedule. Defaults are deliberately conservative — TTLs and pruning are `0` (disabled) out of the box, so MAGMA never silently eats your data. When MAGMA is disabled entirely, ordinary RAG behavior is unchanged, and tool calls can still opt in per request with `options.magma.enabled`.

> **Lane summary:** MAGMA is *associative* memory. It is the lane that remembers not just facts, but how facts hang together across meaning, time, cause, and the cast of characters involved.

## The Memory Command Center: watching it all happen

All four lanes converge in Manifold's UI under the **Memory** tab — the **Memory Command Center** — at `http://localhost:32180/?tab=memory`. It's a live observability surface for everything described above: retrieval counts and latency, write throughput, the memory queue, and a browsable graph of nodes and edges.

<figure class="mem-figure">
  <img src="/assets/img/memory/memory-command-center.png" alt="Manifold's Memory Command Center: top-row metrics for searches, search latency, writes, memory queue, and graph size; a Graph Memory panel listing MENTIONS and RELATED_TO edges; and a Memory Lanes column showing Evolving, Belief, MAGMA, and RAG + Embeddings all online." />
  <figcaption class="mem-figcap">The Memory Command Center, captured live from a running Manifold instance. Top metrics: <strong>12 searches</strong> (1.17 hits/search), <strong>40 writes</strong> (0 errors), an empty memory queue, and a graph holding <strong>377 nodes · 500 edges</strong>. The right rail shows the four Memory Lanes — Evolving, Belief, MAGMA, and RAG + Embeddings — reporting <em>online</em>, with the Graph Memory panel enumerating real <code>MENTIONS</code> and <code>RELATED_TO</code> edges from a WebGPU research run.</figcaption>
</figure>

A few things worth pointing out in that screenshot. The metric cards across the top are the same numbers exposed by `/api/metrics/memory`. The **Graph Memory** panel is MAGMA made visible — every `MENTIONS` and `RELATED_TO` row is a real edge you can select and, with the guarded controls, retract. And the **Memory Lanes** rail on the right is the mental model this whole article is built around, rendered as live status: *Evolving* ("experience summaries and retrieval scoring"), *Belief* ("shared beliefs, evidence, and promotion" — an emerging lane backed by [`internal/agent/memory/belief`](https://github.com/intelligencedev/manifold/tree/develop/internal/agent/memory/belief)), *MAGMA* (377 nodes · 500 edges), and *RAG + Embeddings*. Filters for tenant, session, and graph type let you scope the view down to a single run.

## How the lanes cooperate over a long horizon

Each lane is useful alone, but the magic is in the relay. Consider a multi-day "build a WebGPU wiki" objective — the very data visible in the screenshot above — and watch which lane carries the baton at each moment:

<pre class="mermaid">
timeline
    title One long-horizon objective, four memory lanes
    Day 1 morning  : Transit — orchestrator writes request + plan keys
                   : Evolving — retrieve lessons from past research runs
    Day 1 afternoon: Summarization — keep the long research chat in budget
                   : MAGMA — ingest findings as linked events
    Day 2          : Transit — writer reads plan + sources by key
                   : MAGMA — traverse entity + causal graphs for context
    Day 2 later    : Evolving — distill a strategy card, promote it to user scope
    Future runs    : Evolving + MAGMA — reuse the lesson and the graph
</pre>

The same division of labor maps cleanly onto the three walls from the start of the article:

| Wall | Lane that handles it | Scope | You write it… |
|---|---|---|---|
| Conversation too long | Summarization | One chat | Automatically |
| Work outlives the chat | Transit | Cross-agent, durable | On purpose, by key |
| Re-learning the same lessons | Evolving Memory | Cross-run experience | Automatically (distilled) |
| No sense of how facts relate | MAGMA | Cross-event graph | Automatically (on ingest) |

That is the whole thesis: **long-horizon autonomy is a memory problem before it is a reasoning problem.** A model that can reason brilliantly for ten minutes but forgets everything afterward will never finish a ten-hour job. Give it lanes to keep the conversation coherent, coordinate a team, learn from experience, and relate events to one another — and the forgetful genius finally shows up to work remembering yesterday.

## Try it yourself

- **Summarization** — flip `summaryEnabled: true` and watch for the *Context summarized* badge in chat.
- **Transit** — set `enableTools: true` and `transit.enabled: true`, then have an agent stash a note under `project/demo/brief` and another retrieve it.
- **Evolving Memory** — enable it with `enableRAG: true`, run a few similar tasks, and open `/api/debug/memory/explain` to see *why* a memory was retrieved.
- **MAGMA** — set `magma.enabled: true`, ingest a few documents, and explore the Graph Memory panel in the Memory tab.

---

### Source map (develop branch)

Everything above is grounded in the Manifold source and docs on the `develop` branch:

- **Memory package overview** — [`internal/agent/memory/README.md`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/README.md)
- **Summarization** — [`docs/summarization.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/summarization.md)
- **Transit** — [`docs/transit.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/transit.md) · [`internal/transit/service.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/transit/service.go) · [`store.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/transit/store.go) · [`types.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/transit/types.go)
- **Evolving Memory + ReMem** — [`docs/evolving_memory.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/evolving_memory.md) · [`evolving.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving.go) · [`evolving_search.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving_search.go) · [`evolving_scoring.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/evolving_scoring.go) · [`remem.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/remem.go) · [`metrics.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/agent/memory/metrics.go)
- **Belief lane** — [`internal/agent/memory/belief`](https://github.com/intelligencedev/manifold/tree/develop/internal/agent/memory/belief)
- **MAGMA** — [`docs/magma_memory.md`](https://github.com/intelligencedev/manifold/blob/develop/docs/magma_memory.md) · [`internal/rag/service/magma.go`](https://github.com/intelligencedev/manifold/blob/develop/internal/rag/service/magma.go)
- **Project** — [github.com/intelligencedev/manifold](https://github.com/intelligencedev/manifold)

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    securityLevel: 'loose',
    flowchart: { curve: 'basis', htmlLabels: true },
    themeVariables: {
      fontFamily: "'Inter Tight', system-ui, sans-serif",
      primaryColor: '#0f1219',
      primaryBorderColor: '#3a5170',
      primaryTextColor: '#e6edf3',
      lineColor: '#6aaefc',
      secondaryColor: '#11161f',
      tertiaryColor: '#0b0c10'
    }
  });
</script>
