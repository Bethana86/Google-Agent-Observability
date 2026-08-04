import os
import time
import json
import random
import asyncio
import builtins
from typing import AsyncGenerator, Any

# 1. Initialize OpenTelemetry Metric Reader and Meter Provider globally
# MUST be set up before importing google.adk to prevent ADK from initializing noop meters!
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader

from config import settings
from production_exporter import setup_production_telemetry

# Persist the metric reader using a process-wide builtins singleton to avoid reference loss on re-imports
if not hasattr(builtins, "_demo_metric_reader"):
    metric_reader = InMemoryMetricReader()
    builtins._demo_metric_reader = metric_reader
    meter_provider = MeterProvider(metric_readers=[metric_reader])
    try:
        metrics.set_meter_provider(meter_provider)
    except Exception:
        pass
    
    # Initialize production OTLP pipeline if configured
    setup_production_telemetry(meter_provider)
else:
    metric_reader = builtins._demo_metric_reader

# Create the global meter instance
meter = metrics.get_meter("gcp.vertex.agent")

# Custom metrics (bringing the total to 50 including the 5 ADK default metrics)
# Agent Performance (20 total: 4 ADK default + 16 custom)
agent_calls_counter = meter.create_counter("gen_ai.agent.calls.count", description="Total agent invocations")
agent_errors_counter = meter.create_counter("gen_ai.agent.errors.count", description="Total agent execution errors")
agent_token_prompt = meter.create_counter("gen_ai.agent.token.prompt", description="Total input prompt tokens")
agent_token_completion = meter.create_counter("gen_ai.agent.token.completion", description="Total output completion tokens")
agent_token_total = meter.create_counter("gen_ai.agent.token.total", description="Total input + output tokens")
agent_handoff_counter = meter.create_counter("gen_ai.agent.handoff.count", description="Control handoffs to other agents")
agent_cost_histogram = meter.create_histogram("gen_ai.agent.cost", description="Estimated API call cost in USD")
agent_retry_counter = meter.create_counter("gen_ai.agent.retry.count", description="Number of agent call retries")
agent_overhead_histogram = meter.create_histogram("gen_ai.agent.latency.overhead", description="Scheduling overhead in ms")
agent_reasoning_drift = meter.create_histogram("gen_ai.agent.reasoning.drift", description="Reasoning shift score over iterations")
agent_rca_depth = meter.create_histogram("gen_ai.agent.root_cause.depth", description="Root cause search depth in diagnostics")
agent_rca_confidence = meter.create_histogram("gen_ai.agent.root_cause.confidence", description="Root cause analyzer confidence percent")
agent_mem_reads = meter.create_counter("gen_ai.agent.memory.reads", description="Total context memory reads")
agent_mem_writes = meter.create_counter("gen_ai.agent.memory.writes", description="Total context memory writes")
agent_feedback_count = meter.create_counter("gen_ai.agent.feedback.count", description="Human-in-the-loop feedback actions")
agent_fallback_triggered = meter.create_counter("gen_ai.agent.fallback.triggered", description="Fallback grounding policy triggers")

# Tool Diagnostics (8 total: 1 ADK default + 7 custom)
tool_calls_counter = meter.create_counter("gen_ai.tool.calls.count", description="Total tool executions")
tool_errors_counter = meter.create_counter("gen_ai.tool.errors.count", description="Total tool failures")
tool_cache_hit = meter.create_counter("gen_ai.tool.cache.hit", description="Tool results retrieved from cache")
tool_cache_miss = meter.create_counter("gen_ai.tool.cache.miss", description="Tool results missed from cache")
tool_payload_size = meter.create_histogram("gen_ai.tool.payload.size", description="Tool request/response payload size in bytes")
tool_concurrency = meter.create_up_down_counter("gen_ai.tool.concurrency", description="Active concurrent tool executions")
tool_timeout_count = meter.create_counter("gen_ai.tool.timeout.count", description="Total tool execution timeouts")

# Session & Workflow (10 total: 10 custom)
workflow_duration = meter.create_histogram("gen_ai.workflow.duration", description="Total session workflow duration in ms")
workflow_active = meter.create_up_down_counter("gen_ai.workflow.active_agents", description="Number of concurrently active agents")
workflow_memory = meter.create_histogram("gen_ai.workflow.memory.usage", description="Session context window size in characters")
workflow_tokens_active = meter.create_histogram("gen_ai.workflow.tokens.active", description="Estimated active session tokens")
workflow_turns = meter.create_counter("gen_ai.workflow.turns.count", description="Number of conversation turns in the session")
workflow_errors = meter.create_counter("gen_ai.workflow.errors.count", description="Total workflow run failures")
workflow_success = meter.create_counter("gen_ai.workflow.success.count", description="Total workflow run successes")
workflow_queue_delay = meter.create_histogram("gen_ai.workflow.queue.delay", description="Scheduling queue wait time in ms")
workflow_handoff_depth = meter.create_histogram("gen_ai.workflow.handoff.depth", description="Total handoff sequence depth")
workflow_concurrency_limit = meter.create_histogram("gen_ai.workflow.concurrency.limit", description="Max concurrency session limit")

# LLM Engine Metrics (6 total: 6 custom)
model_latency = meter.create_histogram("gen_ai.model.response.latency", description="Raw model response latency in ms")
model_chunks = meter.create_counter("gen_ai.model.stream.chunk.count", description="Streaming chunks yielded")
model_chunk_latency = meter.create_histogram("gen_ai.model.stream.chunk.latency", description="Time between streaming chunks in ms")
model_temp = meter.create_histogram("gen_ai.model.temperature", description="Temperature parameter value")
model_top_p = meter.create_histogram("gen_ai.model.top_p", description="Top_p parameter value")
model_top_k = meter.create_histogram("gen_ai.model.top_k", description="Top_k parameter value")

# System Resources (6 total: 6 custom)
sys_cpu = meter.create_histogram("gen_ai.system.cpu.utilization", description="Host CPU utilization percentage")
sys_ram = meter.create_histogram("gen_ai.system.memory.utilization", description="Host RAM utilization percentage")
sys_disk = meter.create_histogram("gen_ai.system.disk.utilization", description="Host disk utilization percentage")
sys_net_in = meter.create_counter("gen_ai.system.network.bytes.in", description="Inbound network traffic in bytes")
sys_net_out = meter.create_counter("gen_ai.system.network.bytes.out", description="Outbound network traffic in bytes")
sys_active_conns = meter.create_up_down_counter("gen_ai.system.active.connections", description="Active consumer connections")

# Policy & Governance (6 total: 6 custom)
cloud_armor_blocked = meter.create_counter("gen_ai.security.cloud_armor.blocked", description="Requests blocked by Cloud Armor policies")
cloud_armor_violations = meter.create_counter("gen_ai.security.cloud_armor.violations", description="SQL injection or XSS violations flagged")
model_armor_prompt_injection = meter.create_counter("gen_ai.security.model_armor.prompt_injection", description="Prompt injection attempts blocked by Model Armor")
model_armor_jailbreak = meter.create_counter("gen_ai.security.model_armor.jailbreak", description="Jailbreak attempts flagged by Model Armor")
model_armor_pii_leak = meter.create_counter("gen_ai.security.model_armor.pii_leak", description="PII leaks blocked by Model Armor filters")
model_armor_safety = meter.create_counter("gen_ai.security.model_armor.safety_triggers", description="Toxicity, hate speech or harassment blocks")

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Google ADK Imports
from google.adk.models.base_llm import BaseLlm
from google.adk.models.base_llm_connection import BaseLlmConnection
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.models.registry import LLMRegistry
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types


from bigquery_service import bq_service
from model_router import model_router


# 2. Define the Application Tools (BigQuery Synthetic Dataset Integration)
def query_bigquery_policy_coverage(policy_id: str) -> str:
    """Queries BigQuery claims_db.policyholders table to verify coverage limits and deductibles.
    
    Args:
        policy_id: The unique policy identifier (e.g. POL-88219).
    """
    agent_name = "policy_verification_agent"
    tool_name = "query_bigquery_policy_coverage"
    tool_calls_counter.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_errors_counter.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_concurrency.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_payload_size.record(len(policy_id) + 120, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    
    if random.random() < 0.35:
        tool_cache_hit.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
        tool_cache_miss.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    else:
        tool_cache_hit.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
        tool_cache_miss.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
        
    res = bq_service.query_policy_coverage(policy_id)
    tool_concurrency.add(-1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    return f"BIGQUERY_POLICY_RESULT: Dataset: {res['dataset']}, Policy: {res['data']['policy_id']}, Type: {res['data']['policy_type']}, Status: {res['data']['status']}, Limit: ${res['data']['coverage_limit']}, Deductible: ${res['data']['deductible']}."

def query_bigquery_fraud_anomalies(claim_id: str, policy_id: str) -> str:
    """Queries BigQuery claims_db.fraud_indicators table and runs ML anomaly detection.
    
    Args:
        claim_id: The claim identifier (e.g. CLM-7701).
        policy_id: The policy identifier.
    """
    agent_name = "fraud_assessment_agent"
    tool_name = "query_bigquery_fraud_anomalies"
    tool_calls_counter.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_errors_counter.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_concurrency.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_payload_size.record(len(claim_id) + len(policy_id) + 140, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    
    tool_cache_hit.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_cache_miss.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    
    res = bq_service.query_fraud_indicators(claim_id, policy_id)
    tool_concurrency.add(-1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    flags = ", ".join(res['data']['anomaly_flags']) if res['data']['anomaly_flags'] else "None"
    return f"BIGQUERY_FRAUD_RESULT: Risk Score: {res['data']['fraud_risk_score']}, Anomaly Flags: [{flags}], Recommendation: {res['data']['recommendation']}."

def calculate_claim_payout(claim_amount: float, policy_id: str) -> str:
    """Calculates final claim settlement payout considering deductibles and policy limits.
    
    Args:
        claim_amount: Claimed loss amount in USD.
        policy_id: The policy identifier.
    """
    agent_name = "claim_adjudication_agent"
    tool_name = "calculate_claim_payout"
    tool_calls_counter.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_errors_counter.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_concurrency.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_payload_size.record(len(policy_id) + 100, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    
    tool_cache_hit.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    tool_cache_miss.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    
    policy_res = bq_service.query_policy_coverage(policy_id)
    deductible = policy_res['data']['deductible']
    limit = policy_res['data']['coverage_limit']
    
    payout = max(0.0, min(claim_amount - deductible, limit))
    tool_concurrency.add(-1, {"gen_ai.agent.name": agent_name, "gen_ai.tool.name": tool_name})
    return f"PAYOUT_CALCULATION: Claimed: ${claim_amount:.2f}, Deductible: ${deductible:.2f}, Approved Payout: ${payout:.2f}."

# 3. Implement custom Mock LLM Connection simulating Gemma 2 & Gemini 2.5 Multi-Model Routing
class MockGeminiLlmConnection(BaseLlmConnection):
    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        sys_inst = llm_request.config.system_instruction if llm_request.config else None
        
        agent_instruction = ""
        if sys_inst:
            if isinstance(sys_inst, str):
                agent_instruction = sys_inst
            elif hasattr(sys_inst, "parts") and sys_inst.parts:
                agent_instruction = " ".join([p.text for p in sys_inst.parts if p.text])
        
        inst_lower = agent_instruction.lower()
        is_policy = "you are policy_verification_agent" in inst_lower or 'internal name is "policy_verification_agent"' in inst_lower
        is_fraud = "you are fraud_assessment_agent" in inst_lower or 'internal name is "fraud_assessment_agent"' in inst_lower
        is_adjudication = "you are claim_adjudication_agent" in inst_lower or 'internal name is "claim_adjudication_agent"' in inst_lower
        is_intake = "you are claim_intake_agent" in inst_lower or 'internal name is "claim_intake_agent"' in inst_lower or not (is_policy or is_fraud or is_adjudication)
        
        user_query = ""
        for content in llm_request.contents:
            if content.role == "user" and content.parts:
                for part in content.parts:
                    if part.text and not ("returned result:" in part.text or "context:" in part.text):
                        user_query += part.text + " "
                if user_query.strip():
                    break
        user_query = user_query.strip().lower()
        
        agent_name = "claim_intake_agent"
        if is_policy:
            agent_name = "policy_verification_agent"
        elif is_fraud:
            agent_name = "fraud_assessment_agent"
        elif is_adjudication:
            agent_name = "claim_adjudication_agent"
            
        route = model_router.get_route_for_agent(agent_name)
        active_model_id = route["model_id"]
        
        print(f"[MultiModelRouter] Agent: {agent_name} -> Assigned Model: {active_model_id} ({route['display_name']})", flush=True)
        
        agent_calls_counter.add(1, {"gen_ai.agent.name": agent_name, "gen_ai.model": active_model_id})
        agent_errors_counter.add(0, {"gen_ai.agent.name": agent_name, "gen_ai.model": active_model_id})
        
        prompt_len = sum(len(p.text or "") for c in llm_request.contents for p in c.parts)
        prompt_tokens = int(prompt_len / 4) + 12
        completion_tokens = random.randint(20, 80)
        agent_token_prompt.add(prompt_tokens, {"gen_ai.agent.name": agent_name})
        agent_token_completion.add(completion_tokens, {"gen_ai.agent.name": agent_name})
        agent_token_total.add(prompt_tokens + completion_tokens, {"gen_ai.agent.name": agent_name})
        
        cost = (prompt_tokens * 0.0000025) + (completion_tokens * 0.000010)
        agent_cost_histogram.record(cost, {"gen_ai.agent.name": agent_name})
        agent_overhead_histogram.record(random.uniform(2.0, 5.0), {"gen_ai.agent.name": agent_name})
        agent_retry_counter.add(0, {"gen_ai.agent.name": agent_name})
        
        model_temp.record(route["temperature"], {"gen_ai.agent.name": agent_name, "gen_ai.model": active_model_id})
        model_top_p.record(route["top_p"], {"gen_ai.agent.name": agent_name, "gen_ai.model": active_model_id})
        model_top_k.record(route["top_k"], {"gen_ai.agent.name": agent_name, "gen_ai.model": active_model_id})
        
        model_latency.record(random.uniform(150.0, 450.0) if route["route_type"] == "routine" else random.uniform(400.0, 850.0), {"gen_ai.agent.name": agent_name})
        model_chunks.add(random.randint(4, 10), {"gen_ai.agent.name": agent_name})
        model_chunk_latency.record(random.uniform(8.0, 20.0), {"gen_ai.agent.name": agent_name})
        workflow_queue_delay.record(random.uniform(1.0, 4.0), {"gen_ai.agent.name": agent_name})
        
        agent_reasoning_drift.record(random.uniform(0.01, 0.12), {"gen_ai.agent.name": agent_name})
        agent_rca_depth.record(random.randint(1, 3), {"gen_ai.agent.name": agent_name})
        agent_rca_confidence.record(random.uniform(90.0, 99.5), {"gen_ai.agent.name": agent_name})
        agent_mem_reads.add(random.randint(1, 4), {"gen_ai.agent.name": agent_name})
        agent_mem_writes.add(random.randint(1, 2), {"gen_ai.agent.name": agent_name})
        agent_feedback_count.add(0, {"gen_ai.agent.name": agent_name})
        agent_fallback_triggered.add(0, {"gen_ai.agent.name": agent_name})
        
        await asyncio.sleep(random.uniform(0.5, 1.0))
        
        if is_intake or agent_name == "claim_intake_agent":
            # Handoff to Policy Verification Agent
            agent_handoff_counter.add(1, {"gen_ai.agent.name": "claim_intake_agent", "gen_ai.target.agent": "policy_verification_agent"})
            func_call = types.FunctionCall(
                name="transfer_to_agent",
                args={"agent_name": "policy_verification_agent"},
                id="call_handoff_policy"
            )
            part = types.Part(function_call=func_call)
            content_obj = types.Content(role="model", parts=[part])
            yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            
        elif is_policy:
            has_policy_res = False
            for c in llm_request.contents:
                if c.parts:
                    for p in c.parts:
                        if hasattr(p, "function_response") and p.function_response and getattr(p.function_response, "name", "") == "query_bigquery_policy_coverage":
                            has_policy_res = True
                            break
                            
            if has_policy_res:
                # Handoff to Fraud Assessment Agent
                agent_handoff_counter.add(1, {"gen_ai.agent.name": "policy_verification_agent", "gen_ai.target.agent": "fraud_assessment_agent"})
                func_call = types.FunctionCall(
                    name="transfer_to_agent",
                    args={"agent_name": "fraud_assessment_agent"},
                    id="call_handoff_fraud"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                target_pol = "POL-33018" if "fraud" in user_query or "fire" in user_query else ("POL-99402" if "medical" in user_query else "POL-88219")
                func_call = types.FunctionCall(
                    name="query_bigquery_policy_coverage",
                    args={"policy_id": target_pol},
                    id="call_bq_policy"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                
        elif is_fraud:
            has_fraud_res = False
            for c in llm_request.contents:
                if c.parts:
                    for p in c.parts:
                        if hasattr(p, "function_response") and p.function_response and getattr(p.function_response, "name", "") == "query_bigquery_fraud_anomalies":
                            has_fraud_res = True
                            break
                            
            if has_fraud_res:
                # Handoff to Adjudication Agent
                agent_handoff_counter.add(1, {"gen_ai.agent.name": "fraud_assessment_agent", "gen_ai.target.agent": "claim_adjudication_agent"})
                func_call = types.FunctionCall(
                    name="transfer_to_agent",
                    args={"agent_name": "claim_adjudication_agent"},
                    id="call_handoff_adjudicate"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                target_clm = "CLM-9904" if "fraud" in user_query or "fire" in user_query else "CLM-7701"
                target_pol = "POL-33018" if "fraud" in user_query or "fire" in user_query else "POL-88219"
                func_call = types.FunctionCall(
                    name="query_bigquery_fraud_anomalies",
                    args={"claim_id": target_clm, "policy_id": target_pol},
                    id="call_bq_fraud"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                
        elif is_adjudication:
            has_payout_res = False
            for c in llm_request.contents:
                if c.parts:
                    for p in c.parts:
                        if hasattr(p, "function_response") and p.function_response and getattr(p.function_response, "name", "") == "calculate_claim_payout":
                            has_payout_res = True
                            break
                            
            if has_payout_res:
                summary_text = "Claim Adjudication Expert (Gemini 2.5): Claim POL-88219 evaluated successfully. Policy is active, fraud score is 0.08 (Low), and claim is approved for payout of $3,700.00 after $500.00 deductible."
                if "fraud" in user_query or "fire" in user_query:
                    summary_text = "Claim Adjudication Expert (Gemini 2.5): ALERT - Claim CLM-9904 flagged for high fraud risk (0.84 score, suspicious repair shop). Claim processing is PAUSED and routed to Special Investigation Unit (SIU)."
                content_obj = types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=summary_text)]
                )
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                amt = 85000.0 if ("fraud" in user_query or "fire" in user_query) else (12500.0 if "medical" in user_query else 4200.0)
                pol = "POL-33018" if ("fraud" in user_query or "fire" in user_query) else ("POL-99402" if "medical" in user_query else "POL-88219")
                func_call = types.FunctionCall(
                    name="calculate_claim_payout",
                    args={"claim_amount": amt, "policy_id": pol},
                    id="call_calc_payout"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version=active_model_id, content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)

class MockGeminiLlm(BaseLlm):
    def connect(self, llm_request: LlmRequest) -> MockGeminiLlmConnection:
        return MockGeminiLlmConnection()
        
    @classmethod
    def supported_models(cls) -> list[str]:
        return [r"gemini-.*", r"gemma-.*", r"mock-gemini"]
        
    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        conn = self.connect(llm_request)
        async for response in conn.generate_content_async(llm_request, stream):
            yield response

# Register the Mock LLM in the ADK registry
LLMRegistry.register(MockGeminiLlm)

# 4. Construct the Insurance ADK Multi-Agent System with Multi-Model Routing
policy_verification_agent = Agent(
    name="policy_verification_agent",
    model="mock-gemini",
    instruction="You are policy_verification_agent (Model: Gemma 2 9B). Verify policy coverage limits and deductibles using query_bigquery_policy_coverage.",
    tools=[query_bigquery_policy_coverage]
)

fraud_assessment_agent = Agent(
    name="fraud_assessment_agent",
    model="mock-gemini",
    instruction="You are fraud_assessment_agent (Model: Gemini 2.5 Deep Reasoning). Analyze fraud risk indicators using query_bigquery_fraud_anomalies.",
    tools=[query_bigquery_fraud_anomalies]
)

claim_adjudication_agent = Agent(
    name="claim_adjudication_agent",
    model="mock-gemini",
    instruction="You are claim_adjudication_agent (Model: Gemini 2.5 Deep Reasoning). Calculate final settlement payout using calculate_claim_payout.",
    tools=[calculate_claim_payout]
)

claim_intake_agent = Agent(
    name="claim_intake_agent",
    model="mock-gemini",
    instruction="You are claim_intake_agent (Model: Gemma 2 9B). Triage incoming claims and transfer control to policy_verification_agent.",
    sub_agents=[policy_verification_agent, fraud_assessment_agent, claim_adjudication_agent]
)

# 5. Helper function to format and serialize ADK Events
def serialize_event(event) -> dict:
    event_dict = {
        "author": event.author,
        "type": "text",
        "text": "",
        "tool_call": None,
        "tool_response": None
    }
    
    if event.content:
        for part in event.content.parts:
            if part.text:
                event_dict["text"] += part.text
            elif part.function_call:
                event_dict["type"] = "tool_call"
                event_dict["tool_call"] = {
                    "name": part.function_call.name,
                    "args": dict(part.function_call.args) if part.function_call.args else {},
                    "id": part.function_call.id
                }
            elif part.function_response:
                event_dict["type"] = "tool_response"
                event_dict["tool_response"] = {
                    "name": part.function_response.name,
                    "response": dict(part.function_response.response) if part.function_response.response else {},
                    "id": part.function_response.id
                }
    return event_dict

# 6. Initialize FastAPI Application
app = FastAPI(title="Google ADK Observability Console")

@app.on_event("startup")
async def startup_event():
    # Seed baseline host resource telemetry so dashboard has data on boot
    sys_cpu.record(15.4, {"node": "collector-us-central"})
    sys_ram.record(52.1, {"node": "collector-us-central"})
    sys_disk.record(42.3, {"node": "collector-us-central"})
    sys_net_in.add(1024, {"node": "collector-us-central"})
    sys_net_out.add(2048, {"node": "collector-us-central"})
    sys_active_conns.add(2, {"node": "collector-us-central"})
    
    # Seed compliance metrics
    cloud_armor_blocked.add(0, {"policy": "default-security-policy"})
    cloud_armor_violations.add(0, {"policy": "default-security-policy"})
    model_armor_prompt_injection.add(0, {"model": "gemini-1.5-pro"})
    model_armor_jailbreak.add(0, {"model": "gemini-1.5-pro"})
    model_armor_pii_leak.add(0, {"model": "gemini-1.5-pro"})
    model_armor_safety.add(0, {"model": "gemini-1.5-pro"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serves static frontend files
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "frontend")), name="static")

@app.get("/")
async def root():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(os.path.dirname(__file__), "..", "frontend", "index.html"))

# 7. Endpoint: Simulation triggering Server-Sent Events (SSE)
@app.get("/api/simulate")
async def simulate(scenario: str = "general"):
    if scenario in ["auto_claim", "billing"]:
        query = "I need to file an auto accident claim for $4,200 repair cost under policy POL-88219."
    elif scenario in ["medical_claim", "support"]:
        query = "Please process a health insurance claim for $12,500 emergency medical bill under policy POL-99402."
    elif scenario in ["fraud_claim", "technical"]:
        query = "Filing a commercial property fire loss claim of $85,000 under policy POL-33018."
    else:
        query = "I want to submit a new insurance claim for policy POL-88219."

    async def event_generator():
        # Setup session in ADK
        runner = InMemoryRunner(agent=claim_intake_agent)
        session_id = f"sess_{random.randint(1000, 9999)}"
        user_id = "user_demo"
        
        # OTel Workflow start metrics
        workflow_active.add(1, {"session_id": session_id})
        workflow_success.add(0, {"session_id": session_id})
        workflow_errors.add(0, {"session_id": session_id})
        start_time = time.time()
        
        # Record host resource telemetry
        sys_cpu.record(random.uniform(10.0, 30.0), {"node": "collector-us-central"})
        sys_ram.record(random.uniform(50.0, 70.0), {"node": "collector-us-central"})
        sys_disk.record(random.uniform(40.0, 45.0), {"node": "collector-us-central"})
        sys_net_in.add(random.randint(2000, 5000), {"node": "collector-us-central"})
        sys_net_out.add(random.randint(4000, 9000), {"node": "collector-us-central"})
        sys_active_conns.add(1, {"node": "collector-us-central"})
        
        await runner.session_service.create_session(
            session_id=session_id,
            user_id=user_id,
            app_name="InMemoryRunner"
        )
        
        user_msg = types.Content(parts=[types.Part.from_text(text=query)], role="user")
        
        yield f"data: {json.dumps({'type': 'start', 'query': query, 'session_id': session_id})}\n\n"
        
        had_error = False
        try:
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=user_msg):
                serialized = serialize_event(event)
                yield f"data: {json.dumps({'type': 'event', 'data': serialized})}\n\n"
        except Exception as e:
            had_error = True
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
        # OTel Workflow end metrics
        duration = (time.time() - start_time) * 1000
        workflow_duration.record(duration, {"session_id": session_id})
        workflow_active.add(-1, {"session_id": session_id})
        
        # Record outcome success/error
        if had_error:
            workflow_errors.add(1, {"session_id": session_id})
        else:
            workflow_success.add(1, {"session_id": session_id})
            
        simulated_context_size = len(query) * 5 + random.randint(150, 400)
        workflow_memory.record(simulated_context_size, {"session_id": session_id})
        workflow_tokens_active.record(int(simulated_context_size / 4), {"session_id": session_id})
        workflow_turns.add(4, {"session_id": session_id})
        
        workflow_handoff_depth.record(3, {"session_id": session_id})
        workflow_concurrency_limit.record(10.0, {"session_id": session_id})
        tool_timeout_count.add(0, {"gen_ai.agent.name": "claim_intake_agent"})
        
        sys_net_out.add(random.randint(5000, 10000), {"node": "collector-us-central"})
        sys_active_conns.add(-1, {"node": "collector-us-central"})
        
        cloud_armor_blocked.add(random.choice([0, 0, 0, 1]), {"policy": "default-security-policy"})
        cloud_armor_violations.add(random.choice([0, 0, 0, 0, 1]) if scenario == "fraud_claim" else 0, {"policy": "default-security-policy"})
        model_armor_prompt_injection.add(random.choice([0, 0, 0, 1]) if scenario == "fraud_claim" else 0, {"model": "gemini-2.5-flash"})
        model_armor_jailbreak.add(0, {"model": "gemini-2.5-flash"})
        model_armor_pii_leak.add(random.choice([0, 0, 1, 0]) if scenario == "auto_claim" else 0, {"model": "gemini-2.5-flash"})
        model_armor_safety.add(0, {"model": "gemini-2.5-flash"})
            
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# 7.1 Production Interactive Chat Endpoint (SSE)
@app.get("/api/chat")
@app.post("/api/chat")
async def chat(request: Request):
    query = "I want to file an insurance claim for auto accident loss."
    
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict) and "query" in body and body["query"].strip():
                query = body["query"].strip()
        except Exception:
            pass
    elif request.method == "GET":
        q = request.query_params.get("query")
        if q and q.strip():
            query = q.strip()

    async def event_generator():
        runner = InMemoryRunner(agent=claim_intake_agent)
        session_id = f"sess_chat_{random.randint(10000, 99999)}"
        user_id = "live_user"
        
        workflow_active.add(1, {"session_id": session_id})
        workflow_success.add(0, {"session_id": session_id})
        workflow_errors.add(0, {"session_id": session_id})
        start_time = time.time()
        
        sys_cpu.record(random.uniform(12.0, 35.0), {"node": "collector-us-central"})
        sys_ram.record(random.uniform(55.0, 72.0), {"node": "collector-us-central"})
        sys_disk.record(random.uniform(42.0, 48.0), {"node": "collector-us-central"})
        sys_net_in.add(random.randint(2500, 6000), {"node": "collector-us-central"})
        sys_net_out.add(random.randint(4500, 11000), {"node": "collector-us-central"})
        sys_active_conns.add(1, {"node": "collector-us-central"})
        
        await runner.session_service.create_session(
            session_id=session_id,
            user_id=user_id,
            app_name="InMemoryRunner"
        )
        
        user_msg = types.Content(parts=[types.Part.from_text(text=query)], role="user")
        
        yield f"data: {json.dumps({'type': 'start', 'query': query, 'session_id': session_id})}\n\n"
        
        had_error = False
        try:
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=user_msg):
                serialized = serialize_event(event)
                yield f"data: {json.dumps({'type': 'event', 'data': serialized})}\n\n"
        except Exception as e:
            had_error = True
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
        duration = (time.time() - start_time) * 1000
        workflow_duration.record(duration, {"session_id": session_id})
        workflow_active.add(-1, {"session_id": session_id})
        
        if had_error:
            workflow_errors.add(1, {"session_id": session_id})
        else:
            workflow_success.add(1, {"session_id": session_id})
            
        simulated_context_size = len(query) * 5 + random.randint(150, 450)
        workflow_memory.record(simulated_context_size, {"session_id": session_id})
        workflow_tokens_active.record(int(simulated_context_size / 4), {"session_id": session_id})
        workflow_turns.add(3 if scenario in ["billing", "technical"] else 2, {"session_id": session_id})
        workflow_handoff_depth.record(2 if scenario in ["billing", "technical"] else 1, {"session_id": session_id})
        workflow_concurrency_limit.record(10.0, {"session_id": session_id})
        tool_timeout_count.add(0, {"gen_ai.agent.name": "triage_agent"})
        
        sys_net_out.add(random.randint(6000, 12000), {"node": "collector-us-central"})
        sys_active_conns.add(-1, {"node": "collector-us-central"})
        
        cloud_armor_blocked.add(random.choice([0, 0, 0, 1]), {"policy": "default-security-policy"})
        cloud_armor_violations.add(random.choice([0, 0, 0, 1]) if scenario == "technical" else 0, {"policy": "default-security-policy"})
        model_armor_prompt_injection.add(random.choice([0, 0, 0, 1]) if scenario == "technical" else 0, {"model": "gemini-1.5-pro"})
        model_armor_jailbreak.add(0, {"model": "gemini-1.5-pro"})
        model_armor_pii_leak.add(random.choice([0, 0, 1, 0]) if scenario == "billing" else 0, {"model": "gemini-1.5-pro"})
        model_armor_safety.add(0, {"model": "gemini-1.5-pro"})
            
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# 7.2 Production System Config & Health Check Endpoints
app_start_timestamp = time.time()

@app.get("/api/config")
async def get_config():
    return {
        "app_env": settings.APP_ENV,
        "is_live_gemini": settings.is_live_gemini,
        "is_otlp_enabled": settings.is_otlp_enabled,
        "service_name": settings.OTEL_SERVICE_NAME,
        "gcp_project": settings.GCP_PROJECT_ID or "gcp-default-project",
        "otlp_endpoint": settings.OTEL_EXPORTER_OTLP_ENDPOINT or "None (InMemory metric reader active)"
    }

@app.get("/api/health")
async def get_health():
    return {
        "status": "healthy",
        "uptime_seconds": round(time.time() - app_start_timestamp, 2),
        "engine": "live_gemini" if settings.is_live_gemini else "simulation_mode",
        "otlp_exporter": "enabled" if settings.is_otlp_enabled else "disabled",
        "metric_reader": "active"
    }

# 8. Endpoint: Exposing OpenTelemetry metrics to Dashboard
metrics_reset_timestamp = 0.0

@app.get("/api/raw_metrics")
async def get_raw_metrics():
    metrics_data = metric_reader.get_metrics_data()
    if not metrics_data:
        return {"status": "none"}
    
    scopes = []
    if hasattr(metrics_data, "resource_metrics") and metrics_data.resource_metrics:
        for rm in metrics_data.resource_metrics:
            for sm in rm.scope_metrics:
                scopes.append({
                    "name": sm.scope.name,
                    "metrics_count": len(sm.metrics)
                })
    return {
        "status": "present",
        "scopes": scopes
    }

@app.get("/api/metrics")
async def get_metrics():
    metrics_data = metric_reader.get_metrics_data()
    formatted_metrics = {}

    if not metrics_data or not hasattr(metrics_data, "resource_metrics") or not metrics_data.resource_metrics:
        return JSONResponse(content={})

    for resource_metric in metrics_data.resource_metrics:
        for scope_metric in resource_metric.scope_metrics:
            if scope_metric.scope.name == "gcp.vertex.agent":
                for metric in scope_metric.metrics:
                    name = metric.name
                    data_points = []
                    for point in metric.data.data_points:
                        # Filter out data points recorded before the last reset
                        if point.time_unix_nano < metrics_reset_timestamp * 1e9:
                            continue
                            
                        pt_info = {
                            "attributes": dict(point.attributes),
                            "time_nano": point.time_unix_nano,
                        }
                        if hasattr(point, "value"):
                            pt_info["value"] = point.value
                        elif hasattr(point, "count"):
                            pt_info["count"] = point.count
                            pt_info["sum"] = point.sum
                            pt_info["min"] = point.min if hasattr(point, "min") else None
                            pt_info["max"] = point.max if hasattr(point, "max") else None
                            if hasattr(point, "bucket_counts") and hasattr(point, "explicit_bounds"):
                                pt_info["bucket_counts"] = list(point.bucket_counts)
                                pt_info["explicit_bounds"] = list(point.explicit_bounds)
                        data_points.append(pt_info)
                    
                    if data_points:
                        formatted_metrics[name] = data_points

    return JSONResponse(content=formatted_metrics)

# 9. Endpoint: Reset metrics
@app.post("/api/reset")
async def reset_metrics():
    global metrics_reset_timestamp
    metrics_reset_timestamp = time.time()
    return {"status": "success", "message": "Metrics reset successfully"}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("Backend validation mode: Running agent simulation...")
        import asyncio
        async def run_test_sim():
            runner = InMemoryRunner(agent=triage_agent)
            session_id = "test_sim_sess"
            user_id = "test_sim_user"
            await runner.session_service.create_session(
                session_id=session_id,
                user_id=user_id,
                app_name="InMemoryRunner"
            )
            query = "My subscription was charged twice. Can you check my status and process a refund of $49.99?"
            user_msg = types.Content(parts=[types.Part.from_text(text=query)], role="user")
            
            count = 0
            async for event in runner.run_async(user_id=user_id, session_id=session_id, new_message=user_msg):
                count += 1
                print(f"Event {count}: {event.author} -> text: {event.content.parts[0].text if event.content and event.content.parts else ''}")
            print(f"Simulation completed with {count} events.")
            
            # Print metrics
            print("\nCollected metrics:")
            metrics_data = metric_reader.get_metrics_data()
            if not metrics_data or not metrics_data.resource_metrics:
                print("No metrics collected!")
            else:
                for rm in metrics_data.resource_metrics:
                    for sm in rm.scope_metrics:
                        print(f"Scope: {sm.scope.name}")
                        for m in sm.metrics:
                            print(f"  Metric: {m.name}")
                            for pt in m.data.data_points:
                                print(f"    Pt attributes: {pt.attributes}")
                                print(f"    Pt stats: sum={getattr(pt, 'sum', None)}, count={getattr(pt, 'count', None)}")
        
        asyncio.run(run_test_sim())
        sys.exit(0)
    
    import uvicorn
    print("Starting server on http://0.0.0.0:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
