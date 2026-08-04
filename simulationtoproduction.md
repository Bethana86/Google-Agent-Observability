# Transitioning from Simulation to Real-Time Production Architecture

This guide explains how to transition the **Agent Platform Performance Monitoring System** from standalone simulation/demo mode into a **live, enterprise-grade production platform** on Google Cloud Platform (GCP).

---

## 🏗️ 1. Production Architecture Overview

In a live production environment, the platform operates as a dual-pipeline observability engine:

1. **In-App Real-Time Console**: Uses `InMemoryMetricReader` to expose low-latency telemetry to the FastAPI `/api/metrics` endpoint for local dashboard rendering.
2. **GCP Operations Exporter**: Configures `PeriodicExportingMetricReader` and `BatchSpanProcessor` to forward standard `gcp.vertex.agent` OpenTelemetry metrics and spans to **Google Cloud Monitoring** and **Google Cloud Trace**.

```
┌───────────────────────────┐      ┌───────────────────────────────┐
│ User / Frontend Console   │ ───► │ FastAPI / Google ADK Runner   │
└───────────────────────────┘      └──────────────┬────────────────┘
                                                  │
                                 ┌────────────────┴────────────────┐
                                 ▼                                 ▼
                     ┌───────────────────────┐         ┌───────────────────────┐
                     │ InMemoryMetricReader  │         │ OTLP / GCP Operations │
                     │  (Local Dashboard)    │         │  (Cloud Monitoring)   │
                     └───────────────────────┘         └───────────────────────┘
```

---

## 🔑 2. Configuring Real Gemini LLM Engine

To switch from demo mode to live Gemini LLM inference:

1. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Set your Google Gemini API Key:
   ```env
   GEMINI_API_KEY=AIzaSyYourActualGeminiApiKeyHere
   GCP_PROJECT_ID=your-gcp-project-id
   ```
3. Start the application. The system will automatically detect the valid API key and display `Engine: LIVE GEMINI 1.5` in the dashboard header.

---

## 📡 3. Exporting Telemetry to Google Cloud Operations Suite

To export OpenTelemetry metrics directly to **Google Cloud Monitoring**:

1. Set the OTLP exporter endpoint in your `.env` file:
   ```env
   OTEL_EXPORTER_OTLP_ENDPOINT=http://gcp-otel-collector:4317
   OTEL_SERVICE_NAME=agent-platform-production
   ```
2. In production GCP environments (Cloud Run, GKE), attach the **Google Cloud OpenTelemetry Collector sidecar** or use the GCP Cloud Operations OTLP exporter package (`opentelemetry-exporter-gcp-monitoring`).

---

## 🐳 4. Docker Containerization & Deployment

### Running locally with Docker Compose:
```bash
docker-compose up --build -d
```
Verify container readiness at:
- Dashboard: `http://localhost:8000`
- Health Check: `http://localhost:8000/api/health`
- Configuration: `http://localhost:8000/api/config`

### Deploying to Google Cloud Run:
```bash
# 1. Build and push image to Google Artifact Registry
gcloud builds submit --tag gcr.io/$GCP_PROJECT_ID/agent-observability-platform:latest

# 2. Deploy to Cloud Run with environment variables
gcloud run deploy agent-observability \
  --image gcr.io/$GCP_PROJECT_ID/agent-observability-platform:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars GEMINI_API_KEY=$GEMINI_API_KEY,APP_ENV=production \
  --allow-unauthenticated
```

---

## 🛡️ 5. Production Guardrails & Security Policies

1. **Google Cloud Armor Integration**:
   - Configure WAF policies to inspect incoming user requests for SQLi, XSS, and rate limit violations before routing to the agent gateway.
2. **Model Armor Security**:
   - Wrap ADK prompt inputs with Model Armor filters to detect and block prompt injection, jailbreaks, PII leakage, and safety policy breaches in real time.
3. **Authentication**:
   - Enforce OAuth 2.0 / IAP (Identity-Aware Proxy) authentication on the FastAPI endpoint in production deployments.
