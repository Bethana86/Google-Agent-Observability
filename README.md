# Google ADK & OpenTelemetry Observability Console

A premium, interactive multi-agent observability dashboard demonstrating native **Google Cloud Vertex AI Agent Engine (ADK)** telemetry. This application exposes **50 production-grade OpenTelemetry metrics** capturing agent performance, tool diagnostics, session workflows, LLM parameter metrics, and system resources.

## 🌟 Key Features

* **50 Production Observability Metrics**: Completely instrumented utilizing standard semantic OTel histogram, counter, and updowncounter naming specs.
* **Interactive APM Dashboard**: 5 tabs (*Agent Performance*, *Tool Diagnostics*, *Session & Workflow*, *Model Engine*, and *System Resources*) containing 50 individual Chart.js graphs.
* **Summary Stats Row**: Live computation of crucial metrics like Cache Hit Rate, Success Rate, Average Overhead, Network throughput, and Token usage.
* **Beautiful Premium Visuals**: Dark-themed glassmorphism console with custom linear neon gradients and hollow doughnut gauges.
* **Live Agent Handoff Flow DAG**: Real-time interactive node visualization highlighting Hand-offs (Triage → Billing/Support/Tech) and tool executions.
* **Cloud Trace Logging Terminal**: SSE console output mimicking production Stackdriver log outputs.

---

## 🚀 Getting Started

### 📋 Prerequisites
* Python 3.10+
* Chrome or any modern web browser

### ⚙️ Installation
1. Navigate to the project directory:
   ```bash
   cd C:\Users\ASUA\.gemini\antigravity\scratch\multi-agent-observability
   ```
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn opentelemetry-api opentelemetry-sdk google-adk
   ```

### ⚡ Running the Application
Launch the server:
```bash
py backend/main.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser. Select any conversational scenario (e.g. *System Troubleshooting* or *Billing Refund Request*) and hit **Execute Flow** to trigger real-time telemetry streaming.

---

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
