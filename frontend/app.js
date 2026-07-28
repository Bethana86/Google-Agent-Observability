// State Variables
let currentScenario = 'billing';
let sseConnection = null;
let charts = {};

// UI Elements
const btnRunSimulation = document.getElementById('btn-run-simulation');
const btnResetAll = document.getElementById('btn-reset-all');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeText = document.getElementById('theme-text');
const scenarioOptions = document.querySelectorAll('.scenario-option');
const logTerminal = document.getElementById('log-terminal');
const sessionBadge = document.getElementById('session-badge');

// Tab switcher elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Theme Switcher Initialization
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon';
    if (themeText) themeText.textContent = 'Dark Mode';
}

if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        
        if (themeIcon) {
            themeIcon.className = isLight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        }
        if (themeText) {
            themeText.textContent = isLight ? 'Dark Mode' : 'Light Mode';
        }
        
        // Redraw active charts with new theme colors
        fetchMetrics();
    });
}

// Nodes for DAG Flow
const nodes = {
    user: document.getElementById('node-user'),
    triage: document.getElementById('node-triage_agent'),
    support: document.getElementById('node-support_agent'),
    billing: document.getElementById('node-billing_agent'),
    technical: document.getElementById('node-technical_agent'),
    
    // Tools
    kb: document.getElementById('tool-get_knowledge_base'),
    billingChk: document.getElementById('tool-check_billing_status'),
    refundProc: document.getElementById('tool-process_refund'),
    srvStatus: document.getElementById('tool-check_server_status'),
    svcRestart: document.getElementById('tool-restart_service')
};

const links = {
    userTriage: document.getElementById('link-user-triage'),
    triageSupport: document.getElementById('link-triage-support'),
    triageBilling: document.getElementById('link-triage-billing'),
    triageTechnical: document.getElementById('link-triage-technical')
};

// 1. Initialize Event Listeners
scenarioOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        scenarioOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        currentScenario = opt.dataset.scenario;
    });
});

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById(tabId).classList.add('active');
    });
});

btnRunSimulation.addEventListener('click', runSimulation);
btnResetAll.addEventListener('click', resetMetrics);

// Load metrics on startup
document.addEventListener('DOMContentLoaded', () => {
    fetchMetrics();
});

// 2. Simulation Logic (SSE Integration)
function runSimulation() {
    if (sseConnection) {
        sseConnection.close();
    }
    
    resetDagHighlights();
    
    btnRunSimulation.disabled = true;
    btnRunSimulation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing...';
    
    logTerminal.innerHTML = '';
    logSystemMessage('CONNECTING', 'Establishing link with Google ADK runner...', 'system-line');
    
    const url = `/api/simulate?scenario=${currentScenario}`;
    sseConnection = new EventSource(url);
    
    sseConnection.onmessage = function(event) {
        const payload = JSON.parse(event.data);
        
        if (payload.type === 'start') {
            sessionBadge.textContent = `SESSION: ${payload.session_id}`;
            logSystemMessage('START', `Session ${payload.session_id} initialized with query: "${payload.query}"`, 'user-line', 'user');
            
            nodes.user.classList.add('active-node');
            links.userTriage.classList.add('active-trail');
        } 
        else if (payload.type === 'event') {
            handleAgentEvent(payload.data);
        } 
        else if (payload.type === 'error') {
            logSystemMessage('ERROR', payload.message, 'system-line', 'trace');
            btnRunSimulation.disabled = false;
            btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Flow';
        } 
        else if (payload.type === 'complete') {
            logSystemMessage('COMPLETE', 'Multi-agent workflow executed successfully. Exporting metrics...', 'system-line');
            
            sseConnection.close();
            sseConnection = null;
            
            btnRunSimulation.disabled = false;
            btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Flow';
            
            resetDagHighlights();
            
            setTimeout(fetchMetrics, 500);
        }
    };
    
    sseConnection.onerror = function() {
        logSystemMessage('ERROR', 'Link to backend interrupted.', 'system-line', 'trace');
        if (sseConnection) {
            sseConnection.close();
            sseConnection = null;
        }
        btnRunSimulation.disabled = false;
        btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Flow';
    };
}

// 3. Handle live event and highlight DAG nodes
function handleAgentEvent(event) {
    const author = event.author;
    const type = event.type;
    
    Object.values(nodes).forEach(n => n.classList.remove('active-node'));
    
    if (author === 'triage_agent') {
        nodes.triage.classList.add('active-node');
        setStatus(nodes.triage, 'Active');
        links.userTriage.classList.add('active-trail');
    } else if (author === 'support_agent') {
        nodes.support.classList.add('active-node');
        setStatus(nodes.support, 'Running');
        links.triageSupport.classList.add('active-trail');
    } else if (author === 'billing_agent') {
        nodes.billing.classList.add('active-node');
        setStatus(nodes.billing, 'Running');
        links.triageBilling.classList.add('active-trail');
    } else if (author === 'technical_agent') {
        nodes.technical.classList.add('active-node');
        setStatus(nodes.technical, 'Running');
        links.triageTechnical.classList.add('active-trail');
    }
    
    if (type === 'tool_call') {
        const toolCall = event.tool_call;
        logToolCall(author, toolCall.name, toolCall.args);
        highlightToolNode(toolCall.name, true);
    } 
    else if (type === 'tool_response') {
        const toolResponse = event.tool_response;
        logToolResponse(author, toolResponse.name, toolResponse.response);
        highlightToolNode(toolResponse.name, false);
    } 
    else {
        logAgentResponse(author, event.text);
    }
}

function highlightToolNode(toolName, active) {
    Object.values(nodes).forEach(n => {
        if (n.id.includes(toolName)) {
            if (active) {
                n.classList.add('active-tool');
            } else {
                n.classList.remove('active-tool');
            }
        }
    });
}

function setStatus(node, statusText) {
    const statusEl = node.querySelector('.node-status');
    if (statusEl) {
        statusEl.textContent = statusText;
    }
}

function resetDagHighlights() {
    Object.values(nodes).forEach(n => {
        n.classList.remove('active-node');
        n.classList.remove('active-tool');
        setStatus(n, 'Idle');
    });
    Object.values(links).forEach(l => l.classList.remove('active-trail'));
}

function getTimestamp() {
    const d = new Date();
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function logSystemMessage(label, text, className = 'system-line', badgeType = 'info') {
    const div = document.createElement('div');
    div.className = `terminal-line ${className}`;
    div.innerHTML = `<span class="timestamp">[${getTimestamp()}]</span><span class="badge-log ${badgeType}">${label}</span> ${text}`;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function logAgentResponse(agentName, text) {
    const div = document.createElement('div');
    div.className = 'terminal-line agent-line';
    div.innerHTML = `
        <span class="timestamp">[${getTimestamp()}]</span>
        <span class="badge-log agent">AGENT</span> 
        <strong>${agentName}</strong>: "${text}"
    `;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function logToolCall(agentName, toolName, args) {
    const div = document.createElement('div');
    div.className = 'terminal-line tool-line';
    div.innerHTML = `
        <span class="timestamp">[${getTimestamp()}]</span>
        <span class="badge-log tool">TOOL CALL</span> 
        <strong>${agentName}</strong> invoking tool <code>${toolName}</code>
        <div class="code-block" style="background:rgba(0,0,0,0.4); padding:0.4rem; border-radius:4px; font-family:monospace; margin-top:0.3rem;">
           ARGS: ${JSON.stringify(args, null, 2)}
        </div>
    `;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

function logToolResponse(agentName, toolName, response) {
    const div = document.createElement('div');
    div.className = 'terminal-line trace-line';
    div.innerHTML = `
        <span class="timestamp">[${getTimestamp()}]</span>
        <span class="badge-log trace">TOOL RESP</span> 
        Tool <code>${toolName}</code> returned results for <strong>${agentName}</strong>
        <div class="code-block" style="background:rgba(0,0,0,0.4); padding:0.4rem; border-radius:4px; font-family:monospace; margin-top:0.3rem;">
           OUTPUT: ${JSON.stringify(response, null, 2)}
        </div>
    `;
    logTerminal.appendChild(div);
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

// 4. OpenTelemetry Metrics Fetching & Chart Rendering
async function fetchMetrics() {
    try {
        const res = await fetch('/api/metrics');
        const data = await res.json();
        
        if (Object.keys(data).length === 0) {
            showChartNoData(true);
            return;
        }
        
        showChartNoData(false);
        renderCharts(data);
    } catch (e) {
        console.error("Failed to fetch metrics", e);
        showChartNoData(true);
    }
}

function showChartNoData(show) {
    const overlays = [
        'no-data-invocation-duration', 'no-data-request-size', 'no-data-response-size', 'no-data-workflow-steps',
        'no-data-agent-calls', 'no-data-agent-errors', 'no-data-token-prompt', 'no-data-token-completion',
        'no-data-token-total', 'no-data-agent-cost', 'no-data-agent-retry', 'no-data-agent-overhead', 'no-data-agent-handoffs',
        'no-data-agent-reasoning-drift', 'no-data-agent-rca-depth', 'no-data-agent-rca-confidence', 'no-data-agent-mem-reads',
        'no-data-agent-mem-writes', 'no-data-agent-feedback', 'no-data-agent-fallback',
        'no-data-tool-duration', 'no-data-tool-calls', 'no-data-tool-errors', 'no-data-tool-cache-hit',
        'no-data-tool-cache-miss', 'no-data-tool-payload', 'no-data-tool-concurrency', 'no-data-tool-timeout',
        'no-data-workflow-duration', 'no-data-workflow-active', 'no-data-workflow-memory', 'no-data-workflow-tokens',
        'no-data-workflow-turns', 'no-data-workflow-run-success', 'no-data-workflow-run-error', 'no-data-workflow-queue-delay',
        'no-data-workflow-handoff-depth', 'no-data-workflow-concurrency-limit',
        'no-data-model-latency', 'no-data-model-chunks', 'no-data-model-chunk-latency', 'no-data-model-temp',
        'no-data-model-top-p', 'no-data-model-top-k',
        'no-data-sys-cpu', 'no-data-sys-ram', 'no-data-sys-disk', 'no-data-sys-net-in',
        'no-data-sys-net-out', 'no-data-sys-active-conns'
    ];
    overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = show ? 'flex' : 'none';
        }
    });
}

function renderCharts(metricsData) {
    // Theme Colors
    const triageColor = '#06b6d4';
    const supportColor = '#10b981';
    const billingColor = '#a855f7';
    const techColor = '#f97316';
    const toolColor = '#3b82f6';
    
    const agentLabels = ['triage_agent', 'support_agent', 'billing_agent', 'technical_agent'];
    const agentDisplayLabels = ['Triage', 'Support', 'Billing', 'Technical'];
    const toolLabels = ['get_knowledge_base', 'check_billing_status', 'process_refund', 'check_server_status', 'restart_service'];
    const toolDisplayLabels = ['KB Search', 'Billing Check', 'Refund Process', 'Server Status', 'Restart Service'];

    // ----------------------------------------------------
    // TAB 1: AGENT PERFORMANCE (13 Charts & Badges)
    // ----------------------------------------------------
    const latencyData = metricsData['gen_ai.agent.invocation.duration'] || [];
    const agentDurations = agentLabels.map(label => {
        const pt = latencyData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-invocation-duration', createBarChartConfig(agentDisplayLabels, agentDurations, 'Avg Duration (ms)', [triageColor, supportColor, billingColor, techColor]));

    const reqSizeData = metricsData['gen_ai.agent.request.size'] || [];
    const reqSizes = agentLabels.map(label => {
        const pt = reqSizeData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-request-size', createBarChartConfig(agentDisplayLabels, reqSizes, 'Request Size (Bytes)', triageColor));

    const respSizeData = metricsData['gen_ai.agent.response.size'] || [];
    const respSizes = agentLabels.map(label => {
        const pt = respSizeData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-response-size', createBarChartConfig(agentDisplayLabels, respSizes, 'Response Size (Bytes)', supportColor));

    const stepsData = metricsData['gen_ai.agent.workflow.steps'] || [];
    const steps = agentLabels.map(label => {
        const pt = stepsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-workflow-steps', createBarChartConfig(agentDisplayLabels, steps, 'Steps Count', billingColor));

    const agentCallsData = metricsData['gen_ai.agent.calls.count'] || [];
    const agentCalls = agentLabels.map(label => {
        const pt = agentCallsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-calls', createBarChartConfig(agentDisplayLabels, agentCalls, 'Calls Count', techColor));

    const agentErrorsData = metricsData['gen_ai.agent.errors.count'] || [];
    const agentErrors = agentLabels.map(label => {
        const pt = agentErrorsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-errors', createBarChartConfig(agentDisplayLabels, agentErrors, 'Error Count', '#ef4444'));

    const promptTokensData = metricsData['gen_ai.agent.token.prompt'] || [];
    const promptTokens = agentLabels.map(label => {
        const pt = promptTokensData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-token-prompt', createBarChartConfig(agentDisplayLabels, promptTokens, 'Prompt Tokens', triageColor));

    const compTokensData = metricsData['gen_ai.agent.token.completion'] || [];
    const compTokens = agentLabels.map(label => {
        const pt = compTokensData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-token-completion', createBarChartConfig(agentDisplayLabels, compTokens, 'Completion Tokens', supportColor));

    const totalTokensData = metricsData['gen_ai.agent.token.total'] || [];
    const totalTokens = agentLabels.map(label => {
        const pt = totalTokensData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-token-total', createBarChartConfig(agentDisplayLabels, totalTokens, 'Total Tokens', billingColor));

    const costData = metricsData['gen_ai.agent.cost'] || [];
    const costs = agentLabels.map(label => {
        const pt = costData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-agent-cost', createBarChartConfig(agentDisplayLabels, costs, 'Estimated Cost ($)', techColor));

    const retryData = metricsData['gen_ai.agent.retry.count'] || [];
    const retries = agentLabels.map(label => {
        const pt = retryData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-retry', createBarChartConfig(agentDisplayLabels, retries, 'Retry Attempts', triageColor));

    const overheadData = metricsData['gen_ai.agent.latency.overhead'] || [];
    const overheads = agentLabels.map(label => {
        const pt = overheadData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-overhead', createBarChartConfig(agentDisplayLabels, overheads, 'Overhead (ms)', techColor));

    const handoffData = metricsData['gen_ai.agent.handoff.count'] || [];
    const handoffs = agentLabels.map(label => {
        const pt = handoffData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-handoffs', createBarChartConfig(agentDisplayLabels, handoffs, 'Handoffs Count', billingColor));

    const reasoningDriftData = metricsData['gen_ai.agent.reasoning.drift'] || [];
    const drifts = agentLabels.map(label => {
        const pt = reasoningDriftData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-reasoning-drift', createBarChartConfig(agentDisplayLabels, drifts, 'Avg Drift Score', triageColor));

    const rcaDepthData = metricsData['gen_ai.agent.root_cause.depth'] || [];
    const rcaDepths = agentLabels.map(label => {
        const pt = rcaDepthData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-rca-depth', createBarChartConfig(agentDisplayLabels, rcaDepths, 'Avg RCA Depth', supportColor));

    const rcaConfidenceData = metricsData['gen_ai.agent.root_cause.confidence'] || [];
    const rcaConfidences = agentLabels.map(label => {
        const pt = rcaConfidenceData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-rca-confidence', createBarChartConfig(agentDisplayLabels, rcaConfidences, 'Avg RCA Conf %', billingColor));

    const memReadsData = metricsData['gen_ai.agent.memory.reads'] || [];
    const memReads = agentLabels.map(label => {
        const pt = memReadsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-mem-reads', createBarChartConfig(agentDisplayLabels, memReads, 'Memory Reads', techColor));

    const memWritesData = metricsData['gen_ai.agent.memory.writes'] || [];
    const memWrites = agentLabels.map(label => {
        const pt = memWritesData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-mem-writes', createBarChartConfig(agentDisplayLabels, memWrites, 'Memory Writes', triageColor));

    const feedbackData = metricsData['gen_ai.agent.feedback.count'] || [];
    const feedbacks = agentLabels.map(label => {
        const pt = feedbackData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-feedback', createBarChartConfig(agentDisplayLabels, feedbacks, 'Feedback Counts', supportColor));

    const fallbackData = metricsData['gen_ai.agent.fallback.triggered'] || [];
    const fallbacks = agentLabels.map(label => {
        const pt = fallbackData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-agent-fallback', createBarChartConfig(agentDisplayLabels, fallbacks, 'Fallback Triggers', billingColor));

    // Update Tab 1 Summary Stats
    const totalCallsCount = agentCalls.reduce((a, b) => a + b, 0);
    const totalTokensCount = totalTokens.reduce((a, b) => a + b, 0);
    const totalEstimatedCost = costs.reduce((a, b) => a + b, 0);
    const avgOverheadLatency = overheads.reduce((a, b) => a + b, 0) / (overheads.filter(v => v > 0).length || 1);

    document.getElementById('stat-agent-calls').textContent = totalCallsCount;
    document.getElementById('stat-agent-tokens').textContent = totalTokensCount.toLocaleString();
    document.getElementById('stat-agent-cost').textContent = '$' + totalEstimatedCost.toFixed(4);
    document.getElementById('stat-agent-overhead').textContent = avgOverheadLatency.toFixed(1) + ' ms';

    // ----------------------------------------------------
    // TAB 2: TOOL DIAGNOSTICS (7 Charts & Badges)
    // ----------------------------------------------------
    const toolDurationsData = metricsData['gen_ai.tool.execution.duration'] || [];
    const toolDurations = toolLabels.map(label => {
        const pt = toolDurationsData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-tool-duration', createBarChartConfig(toolDisplayLabels, toolDurations, 'Avg Duration (ms)', toolColor, true));

    const toolCallsData = metricsData['gen_ai.tool.calls.count'] || [];
    const toolCalls = toolLabels.map(label => {
        const pt = toolCallsData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-calls', createBarChartConfig(toolDisplayLabels, toolCalls, 'Calls Count', toolColor));

    const toolErrorsData = metricsData['gen_ai.tool.errors.count'] || [];
    const toolErrors = toolLabels.map(label => {
        const pt = toolErrorsData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-errors', createBarChartConfig(toolDisplayLabels, toolErrors, 'Failures Count', '#ef4444'));

    const toolCacheData = metricsData['gen_ai.tool.cache.hit'] || [];
    const toolCacheHits = toolLabels.map(label => {
        const pt = toolCacheData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-cache-hit', createBarChartConfig(toolDisplayLabels, toolCacheHits, 'Cache Hits', '#10b981'));

    const toolCacheMissData = metricsData['gen_ai.tool.cache.miss'] || [];
    const toolCacheMisses = toolLabels.map(label => {
        const pt = toolCacheMissData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-cache-miss', createBarChartConfig(toolDisplayLabels, toolCacheMisses, 'Cache Misses', '#f59e0b'));

    const toolPayloadData = metricsData['gen_ai.tool.payload.size'] || [];
    const toolPayloads = toolLabels.map(label => {
        const pt = toolPayloadData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-tool-payload', createBarChartConfig(toolDisplayLabels, toolPayloads, 'Payload (Bytes)', triageColor));

    const toolConcurrencyData = metricsData['gen_ai.tool.concurrency'] || [];
    const toolConcurrencies = toolLabels.map(label => {
        const pt = toolConcurrencyData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? Math.max(pt.value, 0) : 0;
    });
    updateChart('chart-tool-concurrency', createBarChartConfig(toolDisplayLabels, toolConcurrencies, 'Concurrency', techColor));

    const toolTimeoutData = metricsData['gen_ai.tool.timeout.count'] || [];
    const toolTimeouts = toolLabels.map(label => {
        const pt = toolTimeoutData.find(d => d.attributes['gen_ai.agent.name'] === label || d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-timeout', createBarChartConfig(toolDisplayLabels, toolTimeouts, 'Timeouts Count', '#ef4444'));

    // Update Tab 2 Summary Stats
    const totalToolsCount = toolCalls.reduce((a, b) => a + b, 0);
    const totalToolErrorsCount = toolErrors.reduce((a, b) => a + b, 0);
    const totalHits = toolCacheHits.reduce((a, b) => a + b, 0);
    const totalMisses = toolCacheMisses.reduce((a, b) => a + b, 0);
    const cacheHitRate = (totalHits + totalMisses) > 0 ? (totalHits / (totalHits + totalMisses) * 100) : 0;
    const maxToolConcurrency = Math.max(...toolConcurrencies, 0);

    document.getElementById('stat-tool-calls').textContent = totalToolsCount;
    document.getElementById('stat-tool-errors').textContent = totalToolErrorsCount;
    document.getElementById('stat-tool-hitrate').textContent = cacheHitRate.toFixed(1) + '%';
    document.getElementById('stat-tool-concurrency').textContent = maxToolConcurrency;

    // ----------------------------------------------------
    // TAB 3: SESSION & WORKFLOW (8 Charts & Badges)
    // ----------------------------------------------------
    const wfDurationData = metricsData['gen_ai.workflow.duration'] || [];
    const wfSessionLabels = wfDurationData.map((pt, i) => `Session #${i+1}`);
    const wfDurations = wfDurationData.map(pt => pt.sum);
    updateChart('chart-workflow-duration', createLineChartConfig(wfSessionLabels, wfDurations, 'Session Duration (ms)', triageColor));

    const activeData = metricsData['gen_ai.workflow.active_agents'] || metricsData['workflow_active'] || [];
    const activeSessionLabels = activeData.map((pt, i) => `Tick #${i+1}`);
    const activeCounts = activeData.map(pt => pt.value);
    updateChart('chart-workflow-active', createLineChartConfig(activeSessionLabels, activeCounts, 'Active Agents', supportColor));

    const wfMemData = metricsData['gen_ai.workflow.memory.usage'] || [];
    const wfMemSessionLabels = wfMemData.map((pt, i) => `Session #${i+1}`);
    const wfMemSizes = wfMemData.map(pt => pt.sum);
    updateChart('chart-workflow-memory', createLineChartConfig(wfMemSessionLabels, wfMemSizes, 'Memory Size (chars)', billingColor));

    const wfTokenData = metricsData['gen_ai.workflow.tokens.active'] || [];
    const wfTokenSessionLabels = wfTokenData.map((pt, i) => `Session #${i+1}`);
    const wfTokenCounts = wfTokenData.map(pt => pt.sum);
    updateChart('chart-workflow-tokens', createLineChartConfig(wfTokenSessionLabels, wfTokenCounts, 'Context Tokens', techColor));

    const wfTurnsData = metricsData['gen_ai.workflow.turns.count'] || [];
    const wfTurnsSessionLabels = wfTurnsData.map((pt, i) => `Session #${i+1}`);
    const wfTurnsCounts = wfTurnsData.map(pt => pt.value);
    updateChart('chart-workflow-turns', createLineChartConfig(wfTurnsSessionLabels, wfTurnsCounts, 'Turns Count', triageColor));

    const wfSuccessData = metricsData['gen_ai.workflow.success.count'] || [];
    const wfSuccessSessionLabels = wfSuccessData.map((pt, i) => `Session #${i+1}`);
    const wfSuccessCounts = wfSuccessData.map(pt => pt.value);
    updateChart('chart-workflow-run-success', createLineChartConfig(wfSuccessSessionLabels, wfSuccessCounts, 'Successes', '#10b981'));

    const wfErrorData = metricsData['gen_ai.workflow.errors.count'] || [];
    const wfErrorSessionLabels = wfErrorData.map((pt, i) => `Session #${i+1}`);
    const wfErrorCounts = wfErrorData.map(pt => pt.value);
    updateChart('chart-workflow-run-error', createLineChartConfig(wfErrorSessionLabels, wfErrorCounts, 'Failures', '#ef4444'));

    const wfDelayData = metricsData['gen_ai.workflow.queue.delay'] || [];
    const wfDelaySessionLabels = wfDelayData.map((pt, i) => `Session #${i+1}`);
    const wfDelayCounts = wfDelayData.map(pt => pt.sum);
    updateChart('chart-workflow-queue-delay', createLineChartConfig(wfDelaySessionLabels, wfDelayCounts, 'Queue Delay (ms)', billingColor));

    const wfHandoffDepthData = metricsData['gen_ai.workflow.handoff.depth'] || [];
    const wfHandoffSessionLabels = wfHandoffDepthData.map((pt, i) => `Session #${i+1}`);
    const wfHandoffDepths = wfHandoffDepthData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-workflow-handoff-depth', createLineChartConfig(wfHandoffSessionLabels, wfHandoffDepths, 'Handoff Depth', triageColor));

    const wfConcurrencyLimitData = metricsData['gen_ai.workflow.concurrency.limit'] || [];
    const wfConcurrencySessionLabels = wfConcurrencyLimitData.map((pt, i) => `Session #${i+1}`);
    const wfConcurrencyLimits = wfConcurrencyLimitData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-workflow-concurrency-limit', createLineChartConfig(wfConcurrencySessionLabels, wfConcurrencyLimits, 'Concurrency Limit', supportColor));

    // Update Tab 3 Summary Stats
    const totalWfRuns = wfDurations.length;
    const successRuns = wfSuccessCounts.reduce((a, b) => a + b, 0);
    const errorRuns = wfErrorCounts.reduce((a, b) => a + b, 0);
    const successRate = (successRuns + errorRuns) > 0 ? (successRuns / (successRuns + errorRuns) * 100) : 100;
    const avgWfTime = wfDurations.reduce((a, b) => a + b, 0) / (totalWfRuns || 1) / 1000;
    const avgWfTurns = wfTurnsCounts.reduce((a, b) => a + b, 0) / (totalWfRuns || 1);

    document.getElementById('stat-wf-runs').textContent = totalWfRuns;
    document.getElementById('stat-wf-success').textContent = successRate.toFixed(0) + '%';
    document.getElementById('stat-wf-time').textContent = avgWfTime.toFixed(1) + 's';
    document.getElementById('stat-wf-turns').textContent = avgWfTurns.toFixed(1);

    // ----------------------------------------------------
    // TAB 4: MODEL ENGINE (6 Charts & Badges)
    // ----------------------------------------------------
    const modelLatencyData = metricsData['gen_ai.model.response.latency'] || [];
    const modelLatencySessionLabels = modelLatencyData.map((pt, i) => `Model #${i+1}`);
    const modelLatencies = modelLatencyData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-model-latency', createLineChartConfig(modelLatencySessionLabels, modelLatencies, 'Latency (ms)', triageColor));

    const modelChunksData = metricsData['gen_ai.model.stream.chunk.count'] || [];
    const modelChunksSessionLabels = modelChunksData.map((pt, i) => `Model #${i+1}`);
    const modelChunksCount = modelChunksData.map(pt => pt.value);
    updateChart('chart-model-chunks', createLineChartConfig(modelChunksSessionLabels, modelChunksCount, 'Chunks count', supportColor));

    const modelChunkLatencyData = metricsData['gen_ai.model.stream.chunk.latency'] || [];
    const modelChunkLatencySessionLabels = modelChunkLatencyData.map((pt, i) => `Model #${i+1}`);
    const modelChunkLatencies = modelChunkLatencyData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-model-chunk-latency', createLineChartConfig(modelChunkLatencySessionLabels, modelChunkLatencies, 'Chunk Delay (ms)', billingColor));

    const modelTempData = metricsData['gen_ai.model.temperature'] || [];
    const modelTempSessionLabels = modelTempData.map((pt, i) => `Model #${i+1}`);
    const modelTemps = modelTempData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-model-temp', createLineChartConfig(modelTempSessionLabels, modelTemps, 'Temperature', techColor));

    const modelTopPData = metricsData['gen_ai.model.top_p'] || [];
    const modelTopPSessionLabels = modelTopPData.map((pt, i) => `Model #${i+1}`);
    const modelTopPs = modelTopPData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-model-top-p', createLineChartConfig(modelTopPSessionLabels, modelTopPs, 'Top P', triageColor));

    const modelTopKData = metricsData['gen_ai.model.top_k'] || [];
    const modelTopKSessionLabels = modelTopKData.map((pt, i) => `Model #${i+1}`);
    const modelTopKs = modelTopKData.map(pt => pt.sum / (pt.count || 1));
    updateChart('chart-model-top-k', createLineChartConfig(modelTopKSessionLabels, modelTopKs, 'Top K', supportColor));

    // Update Tab 4 Summary Stats
    const avgModelLatency = modelLatencies.reduce((a, b) => a + b, 0) / (modelLatencies.length || 1);
    const avgModelTemp = modelTemps.reduce((a, b) => a + b, 0) / (modelTemps.length || 1);
    const sumModelChunks = modelChunksCount.reduce((a, b) => a + b, 0);

    document.getElementById('stat-model-latency').textContent = avgModelLatency.toFixed(1) + ' ms';
    document.getElementById('stat-model-temp').textContent = avgModelTemp.toFixed(2);
    document.getElementById('stat-model-chunks').textContent = sumModelChunks;

    // ----------------------------------------------------
    // TAB 5: SYSTEM RESOURCES (6 Charts & Badges)
    // ----------------------------------------------------
    const cpuData = metricsData['gen_ai.system.cpu.utilization'] || [];
    const cpuVal = cpuData.length > 0 ? (cpuData[cpuData.length - 1].sum / (cpuData[cpuData.length - 1].count || 1)) : 0;
    updateChart('chart-sys-cpu', createDoughnutConfig(['Utilized CPU', 'Available CPU'], [cpuVal, 100 - cpuVal], ['#06b6d4', 'rgba(255,255,255,0.03)']));

    const ramData = metricsData['gen_ai.system.memory.utilization'] || [];
    const ramVal = ramData.length > 0 ? (ramData[ramData.length - 1].sum / (ramData[ramData.length - 1].count || 1)) : 0;
    updateChart('chart-sys-ram', createDoughnutConfig(['Utilized RAM', 'Available RAM'], [ramVal, 100 - ramVal], ['#10b981', 'rgba(255,255,255,0.03)']));

    const diskData = metricsData['gen_ai.system.disk.utilization'] || [];
    const diskVal = diskData.length > 0 ? (diskData[diskData.length - 1].sum / (diskData[diskData.length - 1].count || 1)) : 0;
    updateChart('chart-sys-disk', createDoughnutConfig(['Used Disk', 'Free Disk'], [diskVal, 100 - diskVal], ['#a855f7', 'rgba(255,255,255,0.03)']));

    const netInData = metricsData['gen_ai.system.network.bytes.in'] || [];
    const netInLabels = netInData.map((pt, i) => `Tick #${i+1}`);
    const netInBytes = netInData.map(pt => pt.value);
    updateChart('chart-sys-net-in', createLineChartConfig(netInLabels, netInBytes, 'Network In (Bytes)', triageColor));

    const netOutData = metricsData['gen_ai.system.network.bytes.out'] || [];
    const netOutLabels = netOutData.map((pt, i) => `Tick #${i+1}`);
    const netOutBytes = netOutData.map(pt => pt.value);
    updateChart('chart-sys-net-out', createLineChartConfig(netOutLabels, netOutBytes, 'Network Out (Bytes)', supportColor));

    const activeConnsData = metricsData['gen_ai.system.active.connections'] || [];
    const connLabels = activeConnsData.map((pt, i) => `Tick #${i+1}`);
    const conns = activeConnsData.map(pt => pt.value);
    updateChart('chart-sys-active-conns', createLineChartConfig(connLabels, conns, 'Active Connections', techColor));

    // Update Tab 5 Summary Stats
    const sumNetIn = netInBytes.reduce((a, b) => a + b, 0);
    const sumNetOut = netOutBytes.reduce((a, b) => a + b, 0);
    const totalNetThroughputKB = (sumNetIn + sumNetOut) / 1024;
    const currentActiveConnections = conns.length > 0 ? conns[conns.length - 1] : 0;

    document.getElementById('stat-sys-cpu').textContent = cpuVal.toFixed(1) + '%';
    document.getElementById('stat-sys-ram').textContent = ramVal.toFixed(1) + '%';
    document.getElementById('stat-sys-active-conns').textContent = currentActiveConnections;
    document.getElementById('stat-sys-net').textContent = totalNetThroughputKB.toFixed(1) + ' KB';
}

// Theme colors helper for Chart.js
function getThemeColors() {
    const isLight = document.body.classList.contains('light-theme');
    return {
        gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)',
        tickColor: isLight ? '#4b5563' : '#9ca3af',
        doughnutBorder: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)',
        chartTextColor: isLight ? '#4b5563' : '#9ca3af'
    };
}

// Chart.js helper configurations
function createBarChartConfig(labels, data, label, color, horizontal = false) {
    const colors = getThemeColors();
    const config = {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: color,
                borderColor: colors.doughnutBorder,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: colors.gridColor }, ticks: { color: colors.tickColor } },
                x: { grid: { display: false }, ticks: { color: colors.tickColor } }
            }
        }
    };
    if (horizontal) {
        config.options.indexAxis = 'y';
        config.options.scales.x = { grid: { color: colors.gridColor }, ticks: { color: colors.tickColor } };
        config.options.scales.y = { grid: { display: false }, ticks: { color: colors.tickColor, font: { size: 9 } } };
    }
    return config;
}

function createLineChartConfig(labels, data, label, color) {
    const colors = getThemeColors();
    return {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: color + '1a', // default transparent fill
                borderWidth: 2,
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointBackgroundColor: color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: colors.gridColor }, ticks: { color: colors.tickColor } },
                x: { grid: { display: false }, ticks: { color: colors.tickColor } }
            }
        }
    };
}

function createDoughnutConfig(labels, data, colorsList) {
    const colors = getThemeColors();
    return {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colorsList,
                borderColor: colors.doughnutBorder,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: colors.tickColor, boxWidth: 10, font: { size: 9 } }
                }
            },
            cutout: '70%'
        }
    };
}

// Chart.js helper to reuse canvases cleanly and apply dynamic gradient fills
function updateChart(canvasId, config) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    const colors = getThemeColors();
    
    // Apply common styling overrides
    Chart.defaults.color = colors.chartTextColor;
    Chart.defaults.font.family = 'Outfit';
    
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Premium visualization: Apply glowing gradients dynamically for line charts
    if (config.type === 'line' && config.data.datasets.length > 0) {
        const dataset = config.data.datasets[0];
        const color = dataset.borderColor || '#3b82f6';
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 180);
        gradient.addColorStop(0, color + '4d'); // 30% opacity
        gradient.addColorStop(1, color + '00'); // 0% opacity
        dataset.backgroundColor = gradient;
        dataset.fill = true;
    }
    
    charts[canvasId] = new Chart(ctx, config);
}

// 5. Reset Metrics Action
async function resetMetrics() {
    if (confirm("Are you sure you want to reset all OpenTelemetry metric accumulators?")) {
        try {
            const res = await fetch('/api/reset', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                logSystemMessage('RESET', 'OpenTelemetry metric registries cleared.', 'system-line');
                
                Object.values(charts).forEach(c => c.destroy());
                charts = {};
                showChartNoData(true);
                
                // Clear summary stat text
                const statVals = document.querySelectorAll('.stat-val');
                statVals.forEach(el => {
                    if (el.id.includes('hitrate') || el.id.includes('success') || el.id.includes('cpu') || el.id.includes('ram')) {
                        el.textContent = '0.0%';
                    } else if (el.id.includes('cost')) {
                        el.textContent = '$0.00';
                    } else if (el.id.includes('time') || el.id.includes('overhead') || el.id.includes('latency')) {
                        el.textContent = '0.0 ms';
                    } else {
                        el.textContent = '0';
                    }
                });
            }
        } catch (e) {
            console.error("Failed to reset metrics", e);
        }
    }
}
