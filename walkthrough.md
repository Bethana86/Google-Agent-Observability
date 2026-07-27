# Walkthrough: Google ADK Multi-Agent Observability Console

We have successfully built and verified the multi-agent observability application demonstrating Google Native ADK metrics and traces using OpenTelemetry, expanded to support **50 telemetry metrics** and advanced UI visualizations.

---

## 🛠️ What We Built

We created a project folder containing:

1. **FastAPI Backend (`backend/main.py`)**:
   * **OpenTelemetry Meter Setup**: Configured a global `MeterProvider` with an `InMemoryMetricReader` listening under the `gcp.vertex.agent` scope.
   * **50 Active Metrics**: Instrumented the system to record 50 custom agent performance, tool execution, session workflow, LLM engine parameter, and simulated host resource metrics.
   * **Mock Gemini LLM**: Subclassed `BaseLlm` and `BaseLlmConnection` to create `MockGeminiLlm` registered under the `LLMRegistry`. This intercepts model calls, simulating realistic timing, token counts, billing cost calculation, hyperparameter records, handoff actions, reasoning drift, and root cause analysis diagnostics.
   * **ADK Agent Configuration**: Established a 4-agent team (Triage, Support, Billing, Technical) with custom python tools (`get_knowledge_base`, `check_billing_status`, `process_refund`, `check_server_status`, `restart_service`).
   * **Endpoints Served**:
     - `/api/simulate?scenario=<scenario>`: Streams real-time trace events using Server-Sent Events (SSE) as the `InMemoryRunner` executes.
     - `/api/metrics`: Aggregates the OTel metric points for consumption by the frontend.
     - `/api/reset`: Clears the OTel metric registry cleanly.
     - `/static`: Serves static frontend files.

2. **Frontend UI (`frontend/`)**:
   * **Visual Structure (`index.html`)**: Layout featuring Simulation Scenarios, a Live Agent DAG Flowchart, a styled Cloud Trace & Logging Console, and OTel Metrics cards.
   * **Design Aesthetics (`style.css`)**: Glassmorphic panels, glowing neon states for active agents/tools, and dark theme design matching GCloud dashboard vibes. Added styling for tab controls and quick stats widgets.
   * **Client Controller (`app.js`)**: Triggers simulations, updates DAG highlighting dynamically, and uses Chart.js to render live graphs of all 50 metrics across 5 tabs, complete with dynamic linear canvas gradients for beautiful visuals, doughnut charts for system gauges, and real-time tab summary stat badge calculations.

---

## 📊 Summary of the 5 Dashboard Tabs (50 Metrics)

The metrics console is organized into 5 functional categories:

### 1. Agent Performance (20 Metrics)
* **Average Invocation Latency** (`gen_ai.agent.invocation.duration`)
* **Request Payload Size** (`gen_ai.agent.request.size`)
* **Response Payload Size** (`gen_ai.agent.response.size`)
* **Workflow Steps count** (`gen_ai.agent.workflow.steps`)
* **Total Invocations** (`gen_ai.agent.calls.count`)
* **Agent Execution Errors** (`gen_ai.agent.errors.count`)
* **Prompt Tokens** (`gen_ai.agent.token.prompt`)
* **Completion Tokens** (`gen_ai.agent.token.completion`)
* **Total Tokens** (`gen_ai.agent.token.total`)
* **Call Cost** (`gen_ai.agent.cost`)
* **Retry attempts** (`gen_ai.agent.retry.count`)
* **Framework Overhead** (`gen_ai.agent.latency.overhead`)
* **Control Handoffs** (`gen_ai.agent.handoff.count`)
* **Reasoning Drift** (`gen_ai.agent.reasoning.drift`)
* **RCA Search Depth** (`gen_ai.agent.root_cause.depth`)
* **RCA Confidence** (`gen_ai.agent.root_cause.confidence`)
* **Context Memory Reads** (`gen_ai.agent.memory.reads`)
* **Context Memory Writes** (`gen_ai.agent.memory.writes`)
* **Human Feedback Actions** (`gen_ai.agent.feedback.count`)
* **Fallback Policy Triggers** (`gen_ai.agent.fallback.triggered`)

### 2. Tool Diagnostics (8 Metrics)
* **Execution Latency** (`gen_ai.tool.execution.duration`)
* **Total Tool Calls** (`gen_ai.tool.calls.count`)
* **Tool Errors count** (`gen_ai.tool.errors.count`)
* **Tool Cache Hits** (`gen_ai.tool.cache.hit`)
* **Tool Cache Misses** (`gen_ai.tool.cache.miss`)
* **Tool Payload Size** (`gen_ai.tool.payload.size`)
* **Tool Concurrency** (`gen_ai.tool.concurrency`)
* **Tool Execution Timeouts** (`gen_ai.tool.timeout.count`)

### 3. Session & Workflow (10 Metrics)
* **Session Workflow Duration** (`gen_ai.workflow.duration`)
* **Concurrently Active Session Agents** (`gen_ai.workflow.active_agents`)
* **Active Session Memory** (`gen_ai.workflow.memory.usage`)
* **Estimated Active Session Tokens** (`gen_ai.workflow.tokens.active`)
* **Conversation Turns count** (`gen_ai.workflow.turns.count`)
* **Workflow Run Successes** (`gen_ai.workflow.success.count`)
* **Workflow Run Failures** (`gen_ai.workflow.errors.count`)
* **Event Queue Delay** (`gen_ai.workflow.queue.delay`)
* **Handoff Sequence Depth** (`gen_ai.workflow.handoff.depth`)
* **Session Concurrency Limit** (`gen_ai.workflow.concurrency.limit`)

### 4. Model Engine (6 Metrics)
* **Raw Model Latency** (`gen_ai.model.response.latency`)
* **Streaming Chunks Yielded** (`gen_ai.model.stream.chunk.count`)
* **Chunk Latency** (`gen_ai.model.stream.chunk.latency`)
* **Model Temperature config** (`gen_ai.model.temperature`)
* **Model Top_P config** (`gen_ai.model.top_p`)
* **Model Top_K config** (`gen_ai.model.top_k`)

### 5. System Resources (6 Metrics)
* **CPU Utilization** (`gen_ai.system.cpu.utilization`)
* **RAM Utilization** (`gen_ai.system.memory.utilization`)
* **Disk Utilization** (`gen_ai.system.disk.utilization`)
* **Inbound Traffic** (`gen_ai.system.network.bytes.in`)
* **Outbound Traffic** (`gen_ai.system.network.bytes.out`)
* **Active Connections** (`gen_ai.system.active.connections`)

---

## ✅ Verification Results

We verified the backend configuration by executing our simulation diagnostic test suite:
```bash
py C:\Users\ASUA\.gemini\antigravity\brain\bc73fef5-cca9-4841-9453-c088458dfef3\scratch\simulate_and_check_metrics.py
```
* **Status**: **`SUCCESS`**
* **Verification**: All 50 metrics are successfully registered in the OpenTelemetry meter and fetched correctly through the `/api/metrics` JSON interface after running a simulation query.

---

## 🚀 How to Run and Explore

1. Open a PowerShell/Command prompt and navigate to the project directory:
   ```powershell
   cd C:\Users\ASUA\.gemini\antigravity\scratch\multi-agent-observability
   ```
2. Run the application:
   ```bash
   py backend/main.py
   ```
3. Open your browser to **[http://127.0.0.1:8000](http://127.0.0.1:8000)**.
4. Select a scenario (e.g. **Billing Refund Request**) and click **Execute Flow**:
   * Watch the **Live Agent Flow DAG** light up as the Triage Agent routes control to the Billing Agent, executing database tools in sequence.
   * Browse through the **Agent Performance**, **Tool Diagnostics**, **Session & Workflow**, **Model Engine**, and **System Resources** tabs to see all 50 metrics plotted in glowing neon layouts, complete with real-time computed summary badges at the top!
