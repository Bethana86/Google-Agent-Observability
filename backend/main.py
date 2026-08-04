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


# 2. Define the Application Tools with latency
def get_knowledge_base(topic: str) -> str:
    """Search knowledge base articles for help.
    
    Args:
        topic: The topic search query.
    """
    tool_calls_counter.add(1, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    tool_errors_counter.add(0, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    tool_concurrency.add(1, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    tool_payload_size.record(len(topic) + 80, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    
    if random.random() < 0.30:
        tool_cache_hit.add(1, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
        tool_cache_miss.add(0, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    else:
        tool_cache_hit.add(0, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
        tool_cache_miss.add(1, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    time.sleep(0.4)
    tool_concurrency.add(-1, {"gen_ai.agent.name": "support_agent", "gen_ai.tool.name": "get_knowledge_base"})
    return f"KNOWLEDGE_BASE: Found article. Service portal is fully operational. topic: '{topic}'."

def check_billing_status(user_id: str) -> str:
    """Check the user's billing record and subscription status.
    
    Args:
        user_id: The unique user identifier.
    """
    tool_calls_counter.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    tool_errors_counter.add(0, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    tool_concurrency.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    tool_payload_size.record(len(user_id) + 100, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    
    if random.random() < 0.30:
        tool_cache_hit.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
        tool_cache_miss.add(0, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    else:
        tool_cache_hit.add(0, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
        tool_cache_miss.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    time.sleep(0.5)
    tool_concurrency.add(-1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "check_billing_status"})
    return f"BILLING_STATUS: User {user_id} subscription Plan: Gold, Status: Active, Last invoice: $49.99 (PAID)."

def process_refund(user_id: str, amount: float) -> str:
    """Process a billing refund for a transaction.
    
    Args:
        user_id: The unique user identifier.
        amount: The refund amount in USD.
    """
    tool_calls_counter.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    tool_errors_counter.add(0, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    tool_concurrency.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    tool_payload_size.record(len(user_id) + 110, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    
    tool_cache_hit.add(0, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    tool_cache_miss.add(1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    time.sleep(0.7)
    tool_concurrency.add(-1, {"gen_ai.agent.name": "billing_agent", "gen_ai.tool.name": "process_refund"})
    return f"REFUND_SUCCESS: Refund of ${amount} approved for user {user_id}. Transaction Reference: REF_TX_98122."

def check_server_status(server_name: str) -> str:
    """Check the health status and resource utilization of a server.
    
    Args:
        server_name: The hostname or identifier of the server.
    """
    tool_calls_counter.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    tool_errors_counter.add(0, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    tool_concurrency.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    tool_payload_size.record(len(server_name) + 115, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    
    if random.random() < 0.30:
        tool_cache_hit.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
        tool_cache_miss.add(0, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    else:
        tool_cache_hit.add(0, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
        tool_cache_miss.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    time.sleep(0.4)
    tool_concurrency.add(-1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "check_server_status"})
    return f"SERVER_STATUS: Server '{server_name}' UP. CPU: 14%, RAM: 62% utilized, Disk: 48% free. Health: HEALTHY."

def restart_service(service_name: str) -> str:
    """Perform a service restart on the production server.
    
    Args:
        service_name: The name of the service to restart (e.g. web_server).
    """
    tool_calls_counter.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    tool_errors_counter.add(0, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    tool_concurrency.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    tool_payload_size.record(len(service_name) + 90, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    
    tool_cache_hit.add(0, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    tool_cache_miss.add(1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    time.sleep(0.9)
    tool_concurrency.add(-1, {"gen_ai.agent.name": "technical_agent", "gen_ai.tool.name": "restart_service"})
    return f"RESTART_SUCCESS: Service '{service_name}' restarted. PID: 8829, Status: RUNNING."

# 3. Implement custom Mock LLM Connection to simulate Gemini
class MockGeminiLlmConnection(BaseLlmConnection):
    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        # Extract system instructions to know which agent is executing
        sys_inst = llm_request.config.system_instruction if llm_request.config else None
        print(f"\n[MockLlm] generate_content_async called for model: {llm_request.model}, sys_inst: {sys_inst}", flush=True)
        
        agent_instruction = ""
        if sys_inst:
            if isinstance(sys_inst, str):
                agent_instruction = sys_inst
            elif hasattr(sys_inst, "parts") and sys_inst.parts:
                agent_instruction = " ".join([p.text for p in sys_inst.parts if p.text])
        
        # Identify agent type strictly by checking for unique name mappings
        is_triage = "you are triage_agent" in agent_instruction.lower() or "your internal name is \"triage_agent\"" in agent_instruction.lower()
        is_support = "you are support_agent" in agent_instruction.lower() or "your internal name is \"support_agent\"" in agent_instruction.lower()
        is_billing = "you are billing_agent" in agent_instruction.lower() or "your internal name is \"billing_agent\"" in agent_instruction.lower()
        is_technical = "you are technical_agent" in agent_instruction.lower() or "your internal name is \"technical_agent\"" in agent_instruction.lower()
        
        # Extract original user query (the first user prompt, avoiding system context and tool result messages)
        user_query = ""
        for content in llm_request.contents:
            if content.role == "user" and content.parts:
                for part in content.parts:
                    if part.text and not ("returned result:" in part.text or "context:" in part.text):
                        user_query += part.text + " "
                if user_query.strip():
                    break
        user_query = user_query.strip().lower()
        print(f"[MockLlm] Agent: Triage={is_triage}, Support={is_support}, Billing={is_billing}, Technical={is_technical} | Query: '{user_query}'", flush=True)
        
        # Resolve executing agent name
        agent_name = "unknown_agent"
        if is_triage:
            agent_name = "triage_agent"
        elif is_support:
            agent_name = "support_agent"
        elif is_billing:
            agent_name = "billing_agent"
        elif is_technical:
            agent_name = "technical_agent"
            
        # Record agent call count and error count (0 by default)
        agent_calls_counter.add(1, {"gen_ai.agent.name": agent_name})
        agent_errors_counter.add(0, {"gen_ai.agent.name": agent_name})
        
        # Record token usage (simulate prompt / completion tokens)
        prompt_len = sum(len(p.text or "") for c in llm_request.contents for p in c.parts)
        prompt_tokens = int(prompt_len / 4) + 10
        completion_tokens = random.randint(15, 60)
        agent_token_prompt.add(prompt_tokens, {"gen_ai.agent.name": agent_name})
        agent_token_completion.add(completion_tokens, {"gen_ai.agent.name": agent_name})
        agent_token_total.add(prompt_tokens + completion_tokens, {"gen_ai.agent.name": agent_name})
        
        # Cost: prompt is $0.0000025 per token, completion is $0.000010 per token
        cost = (prompt_tokens * 0.0000025) + (completion_tokens * 0.000010)
        agent_cost_histogram.record(cost, {"gen_ai.agent.name": agent_name})
        
        # Framework overhead: simulated scheduling overhead of 2-5ms
        agent_overhead_histogram.record(random.uniform(2.0, 5.0), {"gen_ai.agent.name": agent_name})
        
        # Retries: 5% chance of simulated retry
        if random.random() < 0.05:
            agent_retry_counter.add(1, {"gen_ai.agent.name": agent_name})
        else:
            agent_retry_counter.add(0, {"gen_ai.agent.name": agent_name})
            
        # Record LLM parameters
        temp = llm_request.config.temperature if llm_request.config and hasattr(llm_request.config, "temperature") and llm_request.config.temperature is not None else 0.7
        top_p = llm_request.config.top_p if llm_request.config and hasattr(llm_request.config, "top_p") and llm_request.config.top_p is not None else 0.95
        top_k = llm_request.config.top_k if llm_request.config and hasattr(llm_request.config, "top_k") and llm_request.config.top_k is not None else 40
        model_temp.record(temp, {"gen_ai.agent.name": agent_name})
        model_top_p.record(top_p, {"gen_ai.agent.name": agent_name})
        model_top_k.record(top_k, {"gen_ai.agent.name": agent_name})
        
        # Record model latencies & chunks
        model_latency.record(random.uniform(200.0, 500.0), {"gen_ai.agent.name": agent_name})
        model_chunks.add(random.randint(5, 12), {"gen_ai.agent.name": agent_name})
        model_chunk_latency.record(random.uniform(10.0, 25.0), {"gen_ai.agent.name": agent_name})
        workflow_queue_delay.record(random.uniform(1.0, 4.0), {"gen_ai.agent.name": agent_name})
        
        # Record reasoning diagnostics and memory operations
        agent_reasoning_drift.record(random.uniform(0.01, 0.15), {"gen_ai.agent.name": agent_name})
        agent_rca_depth.record(random.randint(1, 4), {"gen_ai.agent.name": agent_name})
        agent_rca_confidence.record(random.uniform(85.0, 99.0), {"gen_ai.agent.name": agent_name})
        agent_mem_reads.add(random.randint(1, 3), {"gen_ai.agent.name": agent_name})
        agent_mem_writes.add(random.randint(0, 2), {"gen_ai.agent.name": agent_name})
        agent_feedback_count.add(0, {"gen_ai.agent.name": agent_name})
        agent_fallback_triggered.add(0, {"gen_ai.agent.name": agent_name})
        
        # Simulate thinking latency
        await asyncio.sleep(random.uniform(0.6, 1.2))
        
        if is_triage:
            # Route request by suggesting a tool call to handoff control
            if any(k in user_query for k in ["billing", "refund", "charge", "invoice"]):
                agent_handoff_counter.add(1, {"gen_ai.agent.name": "triage_agent", "gen_ai.target.agent": "billing_agent"})
                func_call = types.FunctionCall(
                    name="transfer_to_agent",
                    args={"agent_name": "billing_agent"},
                    id="call_handoff_billing"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            elif any(k in user_query for k in ["technical", "status", "restart", "server", "slow", "down"]):
                agent_handoff_counter.add(1, {"gen_ai.agent.name": "triage_agent", "gen_ai.target.agent": "technical_agent"})
                func_call = types.FunctionCall(
                    name="transfer_to_agent",
                    args={"agent_name": "technical_agent"},
                    id="call_handoff_tech"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                agent_handoff_counter.add(1, {"gen_ai.agent.name": "triage_agent", "gen_ai.target.agent": "support_agent"})
                func_call = types.FunctionCall(
                    name="transfer_to_agent",
                    args={"agent_name": "support_agent"},
                    id="call_handoff_support"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                
        elif is_support:
            has_kb_response = False
            for content in reversed(llm_request.contents):
                if content.parts:
                    for part in content.parts:
                        if part.function_response and part.function_response.name == "get_knowledge_base":
                            has_kb_response = True
                            break
            
            if has_kb_response:
                content_obj = types.Content(
                    role="model",
                    parts=[types.Part.from_text(text="General Support Agent: I've checked our database. The main portal server is operational. You can access settings by logging in and navigating to Accounts. Let me know if you need anything else!")]
                )
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                func_call = types.FunctionCall(
                    name="get_knowledge_base",
                    args={"topic": "portal login help"},
                    id="call_kb_query"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                
        elif is_billing:
            has_refund_response = False
            has_billing_status_response = False
            for content in reversed(llm_request.contents):
                if content.parts:
                    for part in content.parts:
                        if part.function_response:
                            if part.function_response.name == "process_refund":
                                has_refund_response = True
                            elif part.function_response.name == "check_billing_status":
                                has_billing_status_response = True
            
            if has_refund_response:
                content_obj = types.Content(
                    role="model",
                    parts=[types.Part.from_text(text="Billing Agent: The refund of $49.99 has been approved and processed. Transaction Reference: REF_TX_98122. The funds should show in your account in 3 business days.")]
                )
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            elif has_billing_status_response:
                func_call = types.FunctionCall(
                    name="process_refund",
                    args={"user_id": "USR_992", "amount": 49.99},
                    id="call_refund_proc"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                func_call = types.FunctionCall(
                    name="check_billing_status",
                    args={"user_id": "USR_992"},
                    id="call_billing_chk"
                )
                part = types.Part(function_call=func_call)
                content_obj = types.Content(role="model", parts=[part])
                yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                
        elif is_technical:
            has_restart_response = False
            has_status_response = False
            for content in reversed(llm_request.contents):
                if content.parts:
                    for part in content.parts:
                        if part.function_response:
                            if part.function_response.name == "restart_service":
                                has_restart_response = True
                            elif part.function_response.name == "check_server_status":
                                has_status_response = True
                                
            if "restart" in user_query:
                if has_restart_response:
                    content_obj = types.Content(
                        role="model",
                        parts=[types.Part.from_text(text="Technical Agent: The service 'web_server' was restarted successfully. Latency spikes have subsided, and health checks are passing.")]
                    )
                    yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                else:
                    func_call = types.FunctionCall(
                        name="restart_service",
                        args={"service_name": "web_server"},
                        id="call_svc_restart"
                    )
                    part = types.Part(function_call=func_call)
                    content_obj = types.Content(role="model", parts=[part])
                    yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
            else:
                if has_status_response:
                    content_obj = types.Content(
                        role="model",
                        parts=[types.Part.from_text(text="Technical Agent: The server 'PROD_SVR_01' is fully operational. System health metrics look normal, and free memory is at 38%.")]
                    )
                    yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
                else:
                    func_call = types.FunctionCall(
                        name="check_server_status",
                        args={"server_name": "PROD_SVR_01"},
                        id="call_srv_status_chk"
                    )
                    part = types.Part(function_call=func_call)
                    content_obj = types.Content(role="model", parts=[part])
                    yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)
        else:
            content_obj = types.Content(
                role="model",
                parts=[types.Part.from_text(text="Fallback Agent: Transferring control to general customer support.")]
            )
            yield LlmResponse(model_version="mock-gemini-2.5", content=content_obj, finish_reason=types.FinishReason.STOP, turn_complete=True)

class MockGeminiLlm(BaseLlm):
    def connect(self, llm_request: LlmRequest) -> MockGeminiLlmConnection:
        return MockGeminiLlmConnection()
        
    @classmethod
    def supported_models(cls) -> list[str]:
        return [r"gemini-.*", r"mock-gemini"]
        
    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        conn = self.connect(llm_request)
        async for response in conn.generate_content_async(llm_request, stream):
            yield response

# Register the Mock LLM in the ADK registry
LLMRegistry.register(MockGeminiLlm)

# 4. Construct the ADK Multi-Agent System
support_agent = Agent(
    name="support_agent",
    model="mock-gemini",
    instruction="You are support_agent. Answer general customer queries. Always use get_knowledge_base tool to verify info.",
    tools=[get_knowledge_base]
)

billing_agent = Agent(
    name="billing_agent",
    model="mock-gemini",
    instruction="You are billing_agent. Handle billing questions. Call check_billing_status and process_refund when appropriate.",
    tools=[check_billing_status, process_refund]
)

technical_agent = Agent(
    name="technical_agent",
    model="mock-gemini",
    instruction="You are technical_agent. Answer technical questions. Call check_server_status or restart_service tools.",
    tools=[check_server_status, restart_service]
)

triage_agent = Agent(
    name="triage_agent",
    model="mock-gemini",
    instruction="You are triage_agent. Analyze the query and transfer to support_agent, billing_agent, or technical_agent.",
    sub_agents=[support_agent, billing_agent, technical_agent]
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
    if scenario == "billing":
        query = "My subscription was charged twice. Can you check my status and process a refund of $49.99?"
    elif scenario == "technical":
        query = "The main server seems sluggish. Can you check server health and restart the web server?"
    elif scenario == "support":
        query = "How do I update my profile details on the user portal?"
    else:
        query = "Hello, what is this platform?"

    async def event_generator():
        # Setup session in ADK
        runner = InMemoryRunner(agent=triage_agent)
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
            
        # Record context size (simulate session characters size)
        simulated_context_size = len(query) * 5 + random.randint(150, 400)
        workflow_memory.record(simulated_context_size, {"session_id": session_id})
        workflow_tokens_active.record(int(simulated_context_size / 4), {"session_id": session_id})
        workflow_turns.add(4 if scenario in ["billing", "technical"] else 2, {"session_id": session_id})
        
        # Record new session and tool metrics
        workflow_handoff_depth.record(3 if scenario in ["billing", "technical"] else 2, {"session_id": session_id})
        workflow_concurrency_limit.record(10.0, {"session_id": session_id})
        tool_timeout_count.add(0, {"gen_ai.agent.name": "triage_agent"})
        
        # System resources resource release
        sys_net_out.add(random.randint(5000, 10000), {"node": "collector-us-central"})
        sys_active_conns.add(-1, {"node": "collector-us-central"})
        
        # Policy & Governance Telemetry Simulation
        cloud_armor_blocked.add(random.choice([0, 0, 0, 1]), {"policy": "default-security-policy"})
        cloud_armor_violations.add(random.choice([0, 0, 0, 0, 1]) if scenario == "technical" else 0, {"policy": "default-security-policy"})
        model_armor_prompt_injection.add(random.choice([0, 0, 0, 1]) if scenario == "technical" else 0, {"model": "gemini-1.5-pro"})
        model_armor_jailbreak.add(0, {"model": "gemini-1.5-pro"})
        model_armor_pii_leak.add(random.choice([0, 0, 1, 0]) if scenario == "billing" else 0, {"model": "gemini-1.5-pro"})
        model_armor_safety.add(0, {"model": "gemini-1.5-pro"})
            
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# 7.1 Production Interactive Chat Endpoint (SSE)
@app.get("/api/chat")
@app.post("/api/chat")
async def chat(request: Request):
    query = "Hello, explain how the agent platform observability system works."
    
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

    # Match scenario keyword if present for policy telemetry simulation
    q_lower = query.lower()
    scenario = "general"
    if any(k in q_lower for k in ["refund", "billing", "charged", "cost", "invoice", "price"]):
        scenario = "billing"
    elif any(k in q_lower for k in ["sluggish", "server", "crash", "bug", "restart", "cpu", "memory"]):
        scenario = "technical"
    elif any(k in q_lower for k in ["help", "guide", "portal", "profile", "update", "support"]):
        scenario = "support"

    async def event_generator():
        runner = InMemoryRunner(agent=triage_agent)
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
