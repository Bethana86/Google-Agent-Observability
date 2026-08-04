# Agent Platform Performance Monitoring System

A premium, production-grade multi-agent observability platform built on **Google Agent Development Kit (ADK)** and **OpenTelemetry (OTel)** standard `gcp.vertex.agent` metrics. Captures **56 active metrics** across agent performance, tool diagnostics, session workflows, model engine parameter metrics, system resources, and policy & governance guardrails.

---

## 🌟 Key Features

* **56 Production Observability Metrics**: Fully instrumented using standard OTel histogram, counter, and updowncounter metrics.
* **Interactive Live Prompt & Scenario Controller**: Type any custom query string or execute preset scenarios to trigger live multi-agent handoff flows and real-time telemetry streaming.
* **6 Metric Domains**: *Agent Performance*, *Tool Diagnostics*, *Session & Workflow*, *Model Engine*, *System Resources*, and *Policy & Governance*.
* **Dual Exporter Pipeline**: Real-time local `InMemoryMetricReader` for UI rendering + OTLP Exporter hooks for **Google Cloud Monitoring** & **Google Cloud Trace**.
* **Policy & Governance Security**: Integrated guardrails tracking **Google Cloud Armor** blocks/violations and **Model Armor** prompt injections, jailbreaks, PII leaks, and safety triggers.
* **Live DAG Handoff Visualizer**: Node execution state highlighting (Triage → Billing / Support / Technical) streamed over Server-Sent Events (SSE).
* **Production Container & Cloud Readiness**: Docker containerization (`Dockerfile`), `docker-compose.yml`, health checks (`/api/health`), and GCP Cloud Run deployment guide (`simulationtoproduction.md`).

---

## 🚀 Getting Started

### 📋 Prerequisites
* Python 3.10+
* Chrome or any modern web browser

### ⚙️ Installation & Quickstart
1. Navigate to the project directory:
   ```bash
   cd path/to/multi-agent-observability
   ```
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn opentelemetry-api opentelemetry-sdk google-adk
   ```
3. (Optional) Configure environment variables for Live Gemini LLM or OTLP export:
   ```bash
   cp .env.example .env
   ```
4. Launch the application:
   ```bash
   py backend/main.py
   ```
5. Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser. Type a custom prompt or click any preset scenario button to execute the flow.

### 🐳 Running with Docker
```bash
docker-compose up --build -d
```
Access the application at `http://localhost:8000`.

---

## 📖 Complete Guides & Documentation
* 📘 **[Metric Definitions Guide (`metricsdef.md`)](file:///C:/Users/ASUA/.gemini/antigravity/scratch/multi-agent-observability/metricsdef.md)**: Full breakdown of all 56 metrics, signal IDs, types, and units.
* 📗 **[Production Deployment Guide (`simulationtoproduction.md`)](file:///C:/Users/ASUA/.gemini/antigravity/scratch/multi-agent-observability/simulationtoproduction.md)**: GCP Cloud Run setup, OTLP collector configuration, and security guardrails.

## 📊 Metric Categories

### 🤖 1. Agent Performance (20 Metrics)
* `gen_ai.agent.invocation.duration` (Histogram, ms)
* `gen_ai.agent.request.size` (Histogram, Bytes)
* `gen_ai.agent.response.size` (Histogram, Bytes)
* `gen_ai.agent.workflow.steps` (Histogram, Count)
* `gen_ai.agent.calls.count` (Counter, Count)
* `gen_ai.agent.errors.count` (Counter, Count)
* `gen_ai.agent.token.prompt` (Counter, Tokens)
* `gen_ai.agent.token.completion` (Counter, Tokens)
* `gen_ai.agent.token.total` (Counter, Tokens)
* `gen_ai.agent.cost` (Histogram, USD)
* `gen_ai.agent.retry.count` (Counter, Count)
* `gen_ai.agent.latency.overhead` (Histogram, ms)
* `gen_ai.agent.handoff.count` (Counter, Count)
* `gen_ai.agent.reasoning.drift` (Histogram, drift score)
* `gen_ai.agent.root_cause.depth` (Histogram, nodes)
* `gen_ai.agent.root_cause.confidence` (Histogram, %)
* `gen_ai.agent.memory.reads` (Counter, Count)
* `gen_ai.agent.memory.writes` (Counter, Count)
* `gen_ai.agent.feedback.count` (Counter, Count)
* `gen_ai.agent.fallback.triggered` (Counter, Count)

### 🛠️ 2. Tool Diagnostics (8 Metrics)
* `gen_ai.tool.execution.duration` (Histogram, ms)
* `gen_ai.tool.calls.count` (Counter, Count)
* `gen_ai.tool.errors.count` (Counter, Count)
* `gen_ai.tool.cache.hit` (Counter, Count)
* `gen_ai.tool.cache.miss` (Counter, Count)
* `gen_ai.tool.payload.size` (Histogram, Bytes)
* `gen_ai.tool.concurrency` (UpDownCounter, Count)
* `gen_ai.tool.timeout.count` (Counter, Count)

### 🔄 3. Session & Workflow (10 Metrics)
* `gen_ai.workflow.duration` (Histogram, ms)
* `gen_ai.workflow.active_agents` (UpDownCounter, Count)
* `gen_ai.workflow.memory.usage` (Histogram, chars)
* `gen_ai.workflow.tokens.active` (Histogram, tokens)
* `gen_ai.workflow.turns.count` (Counter, turns)
* `gen_ai.workflow.success.count` (Counter, runs)
* `gen_ai.workflow.errors.count` (Counter, runs)
* `gen_ai.workflow.queue.delay` (Histogram, ms)
* `gen_ai.workflow.handoff.depth` (Histogram, depth)
* `gen_ai.workflow.concurrency.limit` (Histogram, slots)

### 🧠 4. Model Engine (6 Metrics)
* `gen_ai.model.response.latency` (Histogram, ms)
* `gen_ai.model.stream.chunk.count` (Counter, count)
* `gen_ai.model.stream.chunk.latency` (Histogram, ms)
* `gen_ai.model.temperature` (Histogram, value)
* `gen_ai.model.top_p` (Histogram, value)
* `gen_ai.model.top_k` (Histogram, value)

### 🖥️ 5. System Resources (6 Metrics)
* `gen_ai.system.cpu.utilization` (Histogram, %)
* `gen_ai.system.memory.utilization` (Histogram, %)
* `gen_ai.system.disk.utilization` (Histogram, %)
* `gen_ai.system.network.bytes.in` (Counter, Bytes)
* `gen_ai.system.network.bytes.out` (Counter, Bytes)
* `gen_ai.system.active.connections` (UpDownCounter, Count)
