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

// All 50 metrics canvas to signal ID mapping
const allMetricSignals = {
    // TAB 1: Agent Performance (20)
    'chart-invocation-duration': 'status-sig-invocation-duration',
    'chart-request-size': 'status-sig-request-size',
    'chart-response-size': 'status-sig-response-size',
    'chart-workflow-steps': 'status-sig-workflow-steps',
    'chart-agent-calls': 'status-sig-agent-calls',
    'chart-agent-errors': 'status-sig-agent-errors',
    'chart-token-prompt': 'status-sig-token-prompt',
    'chart-token-completion': 'status-sig-token-completion',
    'chart-token-total': 'status-sig-token-total',
    'chart-agent-cost': 'status-sig-agent-cost',
    'chart-agent-retry': 'status-sig-agent-retry',
    'chart-agent-overhead': 'status-sig-agent-overhead',
    'chart-agent-handoffs': 'status-sig-agent-handoffs',
    'chart-agent-reasoning-drift': 'status-sig-agent-reasoning-drift',
    'chart-agent-rca-depth': 'status-sig-agent-rca-depth',
    'chart-agent-rca-confidence': 'status-sig-agent-rca-confidence',
    'chart-agent-mem-reads': 'status-sig-agent-mem-reads',
    'chart-agent-mem-writes': 'status-sig-agent-mem-writes',
    'chart-agent-feedback': 'status-sig-agent-feedback',
    'chart-agent-fallback': 'status-sig-agent-fallback',
    // TAB 2: Tool Diagnostics (8)
    'chart-tool-duration': 'status-sig-tool-duration',
    'chart-tool-calls': 'status-sig-tool-calls',
    'chart-tool-errors': 'status-sig-tool-errors',
    'chart-tool-cache-hit': 'status-sig-tool-cache-hit',
    'chart-tool-cache-miss': 'status-sig-tool-cache-miss',
    'chart-tool-payload': 'status-sig-tool-payload',
    'chart-tool-concurrency': 'status-sig-tool-concurrency',
    'chart-tool-timeout': 'status-sig-tool-timeout',
    // TAB 3: Session & Workflow (10)
    'chart-workflow-duration': 'status-sig-workflow-duration',
    'chart-workflow-active': 'status-sig-workflow-active',
    'chart-workflow-memory': 'status-sig-workflow-memory',
    'chart-workflow-tokens': 'status-sig-workflow-tokens',
    'chart-workflow-turns': 'status-sig-workflow-turns',
    'chart-workflow-run-success': 'status-sig-workflow-run-success',
    'chart-workflow-run-error': 'status-sig-workflow-run-error',
    'chart-workflow-queue-delay': 'status-sig-workflow-queue-delay',
    'chart-workflow-handoff-depth': 'status-sig-workflow-handoff-depth',
    'chart-workflow-concurrency-limit': 'status-sig-workflow-concurrency-limit',
    // TAB 4: Model Engine (6)
    'chart-model-latency': 'status-sig-model-latency',
    'chart-model-chunks': 'status-sig-model-chunks',
    'chart-model-chunk-latency': 'status-sig-model-chunk-latency',
    'chart-model-temp': 'status-sig-model-temp',
    'chart-model-top-p': 'status-sig-model-top-p',
    'chart-model-top-k': 'status-sig-model-top-k',
    // TAB 5: System Resources (6)
    'chart-sys-cpu': 'status-sig-sys-cpu',
    'chart-sys-ram': 'status-sig-sys-ram',
    'chart-sys-disk': 'status-sig-sys-disk',
    'chart-sys-net-in': 'status-sig-sys-net-in',
    'chart-sys-net-out': 'status-sig-sys-net-out',
    'chart-sys-active-conns': 'status-sig-sys-active-conns',
    // TAB 6: Policy & Governance (6)
    'chart-policy-ca-blocked': 'status-sig-policy-ca-blocked',
    'chart-policy-ca-violations': 'status-sig-policy-ca-violations',
    'chart-policy-ma-injection': 'status-sig-policy-ma-injection',
    'chart-policy-ma-jailbreak': 'status-sig-policy-ma-jailbreak',
    'chart-policy-ma-pii': 'status-sig-policy-ma-pii',
    'chart-policy-ma-safety': 'status-sig-policy-ma-safety',
    // TAB 7: FinOps & Tokenomics (8)
    'chart-finops-model-cost': 'status-sig-finops-model-cost',
    'chart-finops-cost-turn': 'status-sig-finops-cost-turn',
    'chart-finops-token-prompt': 'status-sig-finops-token-prompt',
    'chart-finops-token-completion': 'status-sig-finops-token-completion',
    'chart-finops-token-total': 'status-sig-finops-token-total',
    'chart-finops-tokens-active': 'status-sig-finops-tokens-active',
    'chart-finops-tool-payload': 'status-sig-finops-tool-payload',
    'chart-finops-cache-savings': 'status-sig-finops-cache-savings'
};

// Realistic Warning Health Threshold evaluation functions
const metricThresholds = {
    // TAB 1: AGENT PERFORMANCE (20)
    'chart-invocation-duration': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 5000,
    'chart-request-size': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 2000,
    'chart-response-size': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 4000,
    'chart-workflow-steps': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 12,
    'chart-agent-calls': (data) => data.reduce((a,b)=>a+b,0) <= 25,
    'chart-agent-errors': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-token-prompt': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 4000,
    'chart-token-completion': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 2000,
    'chart-token-total': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 6000,
    'chart-agent-cost': (data) => data.reduce((a,b)=>a+b,0) < 0.15,
    'chart-agent-retry': (data) => data.reduce((a,b)=>a+b,0) <= 1,
    'chart-agent-overhead': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 15.0,
    'chart-agent-handoffs': (data) => data.reduce((a,b)=>a+b,0) < 6,
    'chart-agent-reasoning-drift': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 0.35,
    'chart-agent-rca-depth': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) <= 6.0,
    'chart-agent-rca-confidence': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) >= 75.0,
    'chart-agent-mem-reads': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) <= 10.0,
    'chart-agent-mem-writes': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) <= 5.0,
    'chart-agent-feedback': (data) => data.reduce((a,b)=>a+b,0) <= 2,
    'chart-agent-fallback': (data) => data.reduce((a,b)=>a+b,0) <= 1,

    // TAB 2: TOOL DIAGNOSTICS (8)
    'chart-tool-duration': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 3000,
    'chart-tool-calls': (data) => data.reduce((a,b)=>a+b,0) <= 25,
    'chart-tool-errors': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-tool-cache-hit': (data) => true,
    'chart-tool-cache-miss': (data) => true,
    'chart-tool-payload': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 3000,
    'chart-tool-concurrency': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) <= 3.0,
    'chart-tool-timeout': (data) => data.reduce((a,b)=>a+b,0) === 0,

    // TAB 3: SESSION & WORKFLOW (10)
    'chart-workflow-duration': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 15000,
    'chart-workflow-active': (data) => true,
    'chart-workflow-memory': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 250000,
    'chart-workflow-tokens': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 10000,
    'chart-workflow-turns': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 15,
    'chart-workflow-run-success': (data) => true,
    'chart-workflow-run-error': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-workflow-queue-delay': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 50.0,
    'chart-workflow-handoff-depth': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) <= 4.0,
    'chart-workflow-concurrency-limit': (data) => true,

    // TAB 4: MODEL ENGINE (6)
    'chart-model-latency': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 3000,
    'chart-model-chunks': (data) => true,
    'chart-model-chunk-latency': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 100,
    'chart-model-temp': (data) => true,
    'chart-model-top-p': (data) => true,
    'chart-model-top-k': (data) => true,

    // TAB 5: SYSTEM RESOURCES (6)
    'chart-sys-cpu': (data) => (data[data.length-1] || 0) < 80.0,
    'chart-sys-ram': (data) => (data[data.length-1] || 0) < 85.0,
    'chart-sys-disk': (data) => (data[data.length-1] || 0) < 90.0,
    'chart-sys-net-in': (data) => true,
    'chart-sys-net-out': (data) => true,
    'chart-sys-active-conns': (data) => (data[data.length-1] || 0) < 200,
    
    // TAB 6: POLICY & GOVERNANCE (6)
    'chart-policy-ca-blocked': (data) => data.reduce((a,b)=>a+b,0) <= 2,
    'chart-policy-ca-violations': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-policy-ma-injection': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-policy-ma-jailbreak': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-policy-ma-pii': (data) => data.reduce((a,b)=>a+b,0) === 0,
    'chart-policy-ma-safety': (data) => data.reduce((a,b)=>a+b,0) === 0,

    // TAB 7: FINOPS & TOKENOMICS (8)
    'chart-finops-model-cost': (data) => data.reduce((a,b)=>a+b,0) < 0.20,
    'chart-finops-cost-turn': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) < 0.05,
    'chart-finops-token-prompt': (data) => true,
    'chart-finops-token-completion': (data) => true,
    'chart-finops-token-total': (data) => true,
    'chart-finops-tokens-active': (data) => true,
    'chart-finops-tool-payload': (data) => true,
    'chart-finops-cache-savings': (data) => (data.reduce((a,b)=>a+b,0)/(data.filter(v=>v>0).length||1)) >= 20.0
};

if (btnRunSimulation) btnRunSimulation.addEventListener('click', () => runSimulation());
if (btnResetAll) btnResetAll.addEventListener('click', resetMetrics);

const btnRunLiveQuery = document.getElementById('btn-run-live-query');
const customQueryInput = document.getElementById('custom-query-input');

if (btnRunLiveQuery) {
    btnRunLiveQuery.addEventListener('click', () => {
        const val = customQueryInput ? customQueryInput.value.trim() : '';
        if (val) {
            runSimulation(val);
        }
    });
}

if (customQueryInput) {
    customQueryInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const val = customQueryInput.value.trim();
            if (val) {
                runSimulation(val);
            }
        }
    });
}

async function fetchAppConfig() {
    try {
        const res = await fetch('/api/config');
        const data = await res.json();
        const engineText = document.getElementById('engine-text');
        const engineDot = document.getElementById('engine-dot');
        if (engineText && engineDot) {
            if (data.is_live_gemini) {
                engineText.textContent = 'Engine: LIVE GEMINI 1.5';
                engineDot.className = 'pulse-dot green';
            } else {
                engineText.textContent = 'Engine: SIMULATION MODE';
                engineDot.className = 'pulse-dot blue';
            }
        }
    } catch (e) {
        console.warn("Could not fetch app config", e);
    }
}

// Load metrics on startup
document.addEventListener('DOMContentLoaded', () => {
    // Dynamically insert signal dots in card headers for ALL tabs
    Object.keys(allMetricSignals).forEach(canvasId => {
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const card = canvas.closest('.card');
            if (card) {
                const header = card.querySelector('.card-header');
                if (header) {
                    const dot = document.createElement('span');
                    dot.className = 'status-signal-dot grey';
                    dot.id = allMetricSignals[canvasId];
                    header.appendChild(dot);
                }
            }
        }
    });
    
    fetchAppConfig();
    fetchMetrics();
});

// 2. Simulation & Live Query Logic (SSE Integration)
function runSimulation(customQuery = null) {
    if (sseConnection) {
        sseConnection.close();
    }
    
    resetDagHighlights();
    
    if (btnRunSimulation) {
        btnRunSimulation.disabled = true;
        btnRunSimulation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executing...';
    }
    if (btnRunLiveQuery) {
        btnRunLiveQuery.disabled = true;
        btnRunLiveQuery.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
    }
    
    logTerminal.innerHTML = '';
    logSystemMessage('CONNECTING', 'Establishing link with Google ADK runner...', 'system-line');
    
    let url = `/api/simulate?scenario=${currentScenario}`;
    if (customQuery && customQuery.trim()) {
        url = `/api/chat?query=${encodeURIComponent(customQuery.trim())}`;
    }
    
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
            if (btnRunSimulation) {
                btnRunSimulation.disabled = false;
                btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Selected Flow';
            }
            if (btnRunLiveQuery) {
                btnRunLiveQuery.disabled = false;
                btnRunLiveQuery.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Run';
            }
        } 
        else if (payload.type === 'complete') {
            logSystemMessage('COMPLETE', 'Multi-agent workflow executed successfully. Exporting metrics...', 'system-line');
            
            sseConnection.close();
            sseConnection = null;
            
            if (btnRunSimulation) {
                btnRunSimulation.disabled = false;
                btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Selected Flow';
            }
            if (btnRunLiveQuery) {
                btnRunLiveQuery.disabled = false;
                btnRunLiveQuery.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Run';
            }
            
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
        if (btnRunSimulation) {
            btnRunSimulation.disabled = false;
            btnRunSimulation.innerHTML = '<i class="fa-solid fa-bolt"></i> Execute Selected Flow';
        }
        if (btnRunLiveQuery) {
            btnRunLiveQuery.disabled = false;
            btnRunLiveQuery.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Run';
        }
    };
}

// 3. Handle live event and highlight DAG nodes
function handleAgentEvent(event) {
    const author = event.author;
    const type = event.type;
    
    Object.values(nodes).forEach(n => { if (n) n.classList.remove('active-node'); });
    
    if (author === 'triage_agent') {
        if (nodes.triage) {
            nodes.triage.classList.add('active-node');
            setStatus(nodes.triage, 'Active');
        }
        if (links.userTriage) links.userTriage.classList.add('active-trail');
    } else if (author === 'support_agent') {
        if (nodes.support) {
            nodes.support.classList.add('active-node');
            setStatus(nodes.support, 'Running');
        }
        if (links.triageSupport) links.triageSupport.classList.add('active-trail');
    } else if (author === 'billing_agent') {
        if (nodes.billing) {
            nodes.billing.classList.add('active-node');
            setStatus(nodes.billing, 'Running');
        }
        if (links.triageBilling) links.triageBilling.classList.add('active-trail');
    } else if (author === 'technical_agent') {
        if (nodes.technical) {
            nodes.technical.classList.add('active-node');
            setStatus(nodes.technical, 'Running');
        }
        if (links.triageTechnical) links.triageTechnical.classList.add('active-trail');
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
        if (!n) return;
        n.classList.remove('active-node');
        n.classList.remove('active-tool');
        setStatus(n, 'Idle');
    });
    Object.values(links).forEach(l => { if (l) l.classList.remove('active-trail'); });
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
        'no-data-sys-net-out', 'no-data-sys-active-conns',
        'no-data-policy-ca-blocked', 'no-data-policy-ca-violations', 'no-data-policy-ma-injection',
        'no-data-policy-ma-jailbreak', 'no-data-policy-ma-pii', 'no-data-policy-ma-safety',
        'no-data-finops-model-cost', 'no-data-finops-cost-turn', 'no-data-finops-token-prompt',
        'no-data-finops-token-completion', 'no-data-finops-token-total', 'no-data-finops-tokens-active',
        'no-data-finops-tool-payload', 'no-data-finops-cache-savings'
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
    const stepsData = metricsData['gen_ai.agent.workflow.steps'] || [];
    const steps = agentLabels.map(label => {
        const pt = stepsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-workflow-steps', createBarChartConfig(agentDisplayLabels, steps, 'Total Steps', techColor));

    const callsData = metricsData['gen_ai.agent.calls.count'] || [];
    const agentCalls = agentLabels.map(label => {
        const pts = callsData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-calls', createBarChartConfig(agentDisplayLabels, agentCalls, 'Invocations', [triageColor, supportColor, billingColor, techColor]));

    const errorsData = metricsData['gen_ai.agent.errors.count'] || [];
    const agentErrors = agentLabels.map(label => {
        const pts = errorsData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-errors', createBarChartConfig(agentDisplayLabels, agentErrors, 'Errors', '#ef4444'));

    const promptTokensData = metricsData['gen_ai.agent.token.prompt'] || [];
    const promptTokens = agentLabels.map(label => {
        const pts = promptTokensData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-token-prompt', createBarChartConfig(agentDisplayLabels, promptTokens, 'Prompt Tokens', triageColor));

    const compTokensData = metricsData['gen_ai.agent.token.completion'] || [];
    const compTokens = agentLabels.map(label => {
        const pts = compTokensData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-token-completion', createBarChartConfig(agentDisplayLabels, compTokens, 'Completion Tokens', supportColor));

    const totalTokensData = metricsData['gen_ai.agent.token.total'] || [];
    const totalTokens = agentLabels.map(label => {
        const pts = totalTokensData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-token-total', createBarChartConfig(agentDisplayLabels, totalTokens, 'Total Tokens', billingColor));

    const costData = metricsData['gen_ai.agent.cost'] || [];
    const agentCosts = agentLabels.map(label => {
        const pt = costData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-agent-cost', createBarChartConfig(agentDisplayLabels, agentCosts, 'Est Cost ($)', techColor));

    const retriesData = metricsData['gen_ai.agent.retry.count'] || [];
    const agentRetries = agentLabels.map(label => {
        const pts = retriesData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-retry', createBarChartConfig(agentDisplayLabels, agentRetries, 'Retries', toolColor));

    const overheadData = metricsData['gen_ai.agent.latency.overhead'] || [];
    const agentOverhead = agentLabels.map(label => {
        const pt = overheadData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-overhead', createBarChartConfig(agentDisplayLabels, agentOverhead, 'Overhead (ms)', triageColor));

    const handoffsData = metricsData['gen_ai.agent.handoff.count'] || [];
    const agentHandoffs = agentLabels.map(label => {
        const pts = handoffsData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-handoffs', createBarChartConfig(agentDisplayLabels, agentHandoffs, 'Handoffs', supportColor));

    const driftData = metricsData['gen_ai.agent.reasoning.drift'] || [];
    const agentDrift = agentLabels.map(label => {
        const pt = driftData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-reasoning-drift', createBarChartConfig(agentDisplayLabels, agentDrift, 'Reasoning Drift', billingColor));

    const rcaDepthData = metricsData['gen_ai.agent.root_cause.depth'] || [];
    const agentRcaDepth = agentLabels.map(label => {
        const pt = rcaDepthData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-rca-depth', createBarChartConfig(agentDisplayLabels, agentRcaDepth, 'RCA Depth', techColor));

    const rcaConfData = metricsData['gen_ai.agent.root_cause.confidence'] || [];
    const agentRcaConf = agentLabels.map(label => {
        const pt = rcaConfData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-agent-rca-confidence', createBarChartConfig(agentDisplayLabels, agentRcaConf, 'RCA Conf (%)', toolColor));

    const memReadsData = metricsData['gen_ai.agent.memory.reads'] || [];
    const agentMemReads = agentLabels.map(label => {
        const pts = memReadsData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-mem-reads', createBarChartConfig(agentDisplayLabels, agentMemReads, 'Mem Reads', triageColor));

    const memWritesData = metricsData['gen_ai.agent.memory.writes'] || [];
    const agentMemWrites = agentLabels.map(label => {
        const pts = memWritesData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-mem-writes', createBarChartConfig(agentDisplayLabels, agentMemWrites, 'Mem Writes', supportColor));

    const feedbackData = metricsData['gen_ai.agent.feedback.count'] || [];
    const agentFeedback = agentLabels.map(label => {
        const pts = feedbackData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-feedback', createBarChartConfig(agentDisplayLabels, agentFeedback, 'Feedback', billingColor));

    const fallbackData = metricsData['gen_ai.agent.fallback.triggered'] || [];
    const agentFallback = agentLabels.map(label => {
        const pts = fallbackData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-agent-fallback', createBarChartConfig(agentDisplayLabels, agentFallback, 'Fallbacks', techColor));

    // Update Tab 1 Summary Stats
    const sumCalls = agentCalls.reduce((a, b) => a + b, 0);
    const sumTokens = totalTokens.reduce((a, b) => a + b, 0);
    const sumCost = agentCosts.reduce((a, b) => a + b, 0);
    const avgOverheadVal = agentOverhead.reduce((a, b) => a + b, 0) / (agentOverhead.filter(v => v > 0).length || 1);

    document.getElementById('stat-agent-calls').textContent = sumCalls;
    document.getElementById('stat-agent-tokens').textContent = sumTokens.toLocaleString();
    document.getElementById('stat-agent-cost').textContent = '$' + sumCost.toFixed(4);
    document.getElementById('stat-agent-overhead').textContent = avgOverheadVal.toFixed(1) + ' ms';

    // ----------------------------------------------------
    // TAB 2: TOOL DIAGNOSTICS (8 Charts & Badges)
    // ----------------------------------------------------
    const toolDurData = metricsData['gen_ai.tool.execution.duration'] || [];
    const toolDurations = toolLabels.map(label => {
        const pt = toolDurData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-tool-duration', createBarChartConfig(toolDisplayLabels, toolDurations, 'Avg Duration (ms)', toolColor));

    const toolCallsData = metricsData['gen_ai.tool.calls.count'] || [];
    const toolCalls = toolLabels.map(label => {
        const pts = toolCallsData.filter(d => d.attributes['gen_ai.tool.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-tool-calls', createBarChartConfig(toolDisplayLabels, toolCalls, 'Calls Count', triageColor));

    const toolErrorsData = metricsData['gen_ai.tool.errors.count'] || [];
    const toolErrors = toolLabels.map(label => {
        const pts = toolErrorsData.filter(d => d.attributes['gen_ai.tool.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-tool-errors', createBarChartConfig(toolDisplayLabels, toolErrors, 'Failures', '#ef4444'));

    const toolHitsData = metricsData['gen_ai.tool.cache.hit'] || [];
    const toolHits = toolLabels.map(label => {
        const pts = toolHitsData.filter(d => d.attributes['gen_ai.tool.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-tool-cache-hit', createBarChartConfig(toolDisplayLabels, toolHits, 'Cache Hits', supportColor));

    const toolMissesData = metricsData['gen_ai.tool.cache.miss'] || [];
    const toolMisses = toolLabels.map(label => {
        const pts = toolMissesData.filter(d => d.attributes['gen_ai.tool.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-tool-cache-miss', createBarChartConfig(toolDisplayLabels, toolMisses, 'Cache Misses', techColor));

    const toolPayloadData = metricsData['gen_ai.tool.payload.size'] || [];
    const toolPayloads = toolLabels.map(label => {
        const pt = toolPayloadData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.sum : 0;
    });
    updateChart('chart-tool-payload', createBarChartConfig(toolDisplayLabels, toolPayloads, 'Payload (Bytes)', billingColor));

    const toolConcData = metricsData['gen_ai.tool.concurrency'] || [];
    const toolConcs = toolLabels.map(label => {
        const pt = toolConcData.find(d => d.attributes['gen_ai.tool.name'] === label);
        return pt ? pt.value : 0;
    });
    updateChart('chart-tool-concurrency', createBarChartConfig(toolDisplayLabels, toolConcs, 'Active Conc', triageColor));

    const toolTimeoutData = metricsData['gen_ai.tool.timeout.count'] || [];
    const toolTimeouts = toolLabels.map(label => {
        const pts = toolTimeoutData.filter(d => d.attributes['gen_ai.tool.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-tool-timeout', createBarChartConfig(toolDisplayLabels, toolTimeouts, 'Timeouts', '#ef4444'));

    // Update Tab 2 Summary Stats
    const sumToolCalls = toolCalls.reduce((a, b) => a + b, 0);
    const sumToolHits = toolHits.reduce((a, b) => a + b, 0);
    const sumToolMisses = toolMisses.reduce((a, b) => a + b, 0);
    const cacheHitRate = (sumToolHits + sumToolMisses) > 0 ? ((sumToolHits / (sumToolHits + sumToolMisses)) * 100) : 0;
    const avgToolDurVal = toolDurations.reduce((a, b) => a + b, 0) / (toolDurations.filter(v => v > 0).length || 1);

    document.getElementById('stat-tool-calls').textContent = sumToolCalls;
    document.getElementById('stat-tool-hitrate').textContent = cacheHitRate.toFixed(1) + '%';
    document.getElementById('stat-tool-errors').textContent = toolErrors.reduce((a, b) => a + b, 0);
    document.getElementById('stat-tool-duration').textContent = avgToolDurVal.toFixed(0) + ' ms';

    // ----------------------------------------------------
    // TAB 3: SESSION & WORKFLOW (10 Charts & Badges)
    // ----------------------------------------------------
    const wfDurationData = metricsData['gen_ai.workflow.duration'] || [];
    const wfDurations = wfDurationData.map(pt => pt.sum);
    const wfLabels = wfDurations.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-duration', createLineChartConfig(wfLabels, wfDurations, 'Duration (ms)', techColor));

    const wfActiveData = metricsData['gen_ai.workflow.active_agents'] || [];
    const wfActive = wfActiveData.map(pt => pt.value);
    const wfActiveLabels = wfActive.map((_, i) => `Tick #${i+1}`);
    updateChart('chart-workflow-active', createLineChartConfig(wfActiveLabels, wfActive, 'Active Agents', triageColor));

    const wfMemoryData = metricsData['gen_ai.workflow.memory.usage'] || [];
    const wfMemories = wfMemoryData.map(pt => pt.sum);
    const wfMemLabels = wfMemories.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-memory', createLineChartConfig(wfMemLabels, wfMemories, 'Context (Chars)', billingColor));

    const wfTokensData = metricsData['gen_ai.workflow.tokens.active'] || [];
    const wfTokens = wfTokensData.map(pt => pt.sum);
    const wfTokenLabels = wfTokens.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-tokens', createLineChartConfig(wfTokenLabels, wfTokens, 'Active Tokens', supportColor));

    const wfTurnsData = metricsData['gen_ai.workflow.turns.count'] || [];
    const wfTurns = wfTurnsData.map(pt => pt.value);
    const wfTurnLabels = wfTurns.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-turns', createLineChartConfig(wfTurnLabels, wfTurns, 'Turns Count', toolColor));

    const wfSuccessData = metricsData['gen_ai.workflow.success.count'] || [];
    const wfSuccesses = wfSuccessData.map(pt => pt.value);
    const wfSuccessLabels = wfSuccesses.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-run-success', createLineChartConfig(wfSuccessLabels, wfSuccesses, 'Successes', supportColor));

    const wfErrorData = metricsData['gen_ai.workflow.errors.count'] || [];
    const wfErrors = wfErrorData.map(pt => pt.value);
    const wfErrorLabels = wfErrors.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-run-error', createLineChartConfig(wfErrorLabels, wfErrors, 'Errors', '#ef4444'));

    const wfQueueDelayData = metricsData['gen_ai.workflow.queue.delay'] || [];
    const wfQueueDelays = wfQueueDelayData.map(pt => pt.sum);
    const wfQueueLabels = wfQueueDelays.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-queue-delay', createLineChartConfig(wfQueueLabels, wfQueueDelays, 'Queue Delay (ms)', triageColor));

    const wfHandoffDepthData = metricsData['gen_ai.workflow.handoff.depth'] || [];
    const wfHandoffDepths = wfHandoffDepthData.map(pt => pt.sum);
    const wfHandoffLabels = wfHandoffDepths.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-handoff-depth', createLineChartConfig(wfHandoffLabels, wfHandoffDepths, 'Handoff Depth', billingColor));

    const wfConcLimitData = metricsData['gen_ai.workflow.concurrency.limit'] || [];
    const wfConcLimits = wfConcLimitData.map(pt => pt.sum);
    const wfConcLabels = wfConcLimits.map((_, i) => `Sess #${i+1}`);
    updateChart('chart-workflow-concurrency-limit', createLineChartConfig(wfConcLabels, wfConcLimits, 'Limit', techColor));

    // Update Tab 3 Summary Stats
    const totalSessions = wfDurations.length;
    const avgWfDurationVal = wfDurations.reduce((a, b) => a + b, 0) / (totalSessions || 1);
    const totalWfSuccesses = wfSuccesses.reduce((a, b) => a + b, 0);
    const totalWfErrors = wfErrors.reduce((a, b) => a + b, 0);
    const wfSuccessRate = (totalWfSuccesses + totalWfErrors) > 0 ? ((totalWfSuccesses / (totalWfSuccesses + totalWfErrors)) * 100) : 100;
    const currentActiveAgents = wfActive.length > 0 ? wfActive[wfActive.length - 1] : 0;

    document.getElementById('stat-workflow-sessions').textContent = totalSessions;
    document.getElementById('stat-workflow-duration').textContent = (avgWfDurationVal / 1000).toFixed(2) + 's';
    document.getElementById('stat-workflow-success').textContent = wfSuccessRate.toFixed(1) + '%';
    document.getElementById('stat-workflow-active').textContent = currentActiveAgents;

    // Update Header SLO / KPI Cards
    const kpiSuccessEl = document.getElementById('kpi-success-rate');
    const kpiSuccessFill = document.getElementById('kpi-success-fill');
    if (kpiSuccessEl && kpiSuccessFill) {
        kpiSuccessEl.textContent = wfSuccessRate.toFixed(1) + '%';
        kpiSuccessFill.style.width = Math.min(100, wfSuccessRate) + '%';
    }

    const kpiLatencyEl = document.getElementById('kpi-latency-val');
    const kpiLatencyFill = document.getElementById('kpi-latency-fill');
    if (kpiLatencyEl && kpiLatencyFill) {
        kpiLatencyEl.textContent = (avgWfDurationVal).toFixed(0) + ' ms';
        const latPercent = Math.max(0, Math.min(100, 100 - (avgWfDurationVal / 5000 * 100)));
        kpiLatencyFill.style.width = latPercent + '%';
    }

    // ----------------------------------------------------
    // TAB 4: MODEL ENGINE (6 Charts & Badges)
    // ----------------------------------------------------
    const modelLatencyData = metricsData['gen_ai.model.response.latency'] || [];
    const modelLatencies = agentLabels.map(label => {
        const pt = modelLatencyData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-model-latency', createBarChartConfig(agentDisplayLabels, modelLatencies, 'Model Latency (ms)', techColor));

    const modelChunksData = metricsData['gen_ai.model.stream.chunk.count'] || [];
    const modelChunks = agentLabels.map(label => {
        const pts = modelChunksData.filter(d => d.attributes['gen_ai.agent.name'] === label);
        return pts.reduce((acc, p) => acc + p.value, 0);
    });
    updateChart('chart-model-chunks', createBarChartConfig(agentDisplayLabels, modelChunks, 'Stream Chunks', triageColor));

    const modelChunkLatData = metricsData['gen_ai.model.stream.chunk.latency'] || [];
    const modelChunkLats = agentLabels.map(label => {
        const pt = modelChunkLatData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-model-chunk-latency', createBarChartConfig(agentDisplayLabels, modelChunkLats, 'Chunk Latency (ms)', supportColor));

    const tempMetricData = metricsData['gen_ai.model.temperature'] || [];
    const tempVals = agentLabels.map(label => {
        const pt = tempMetricData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-model-temp', createBarChartConfig(agentDisplayLabels, tempVals, 'Temperature', billingColor));

    const topPMetricData = metricsData['gen_ai.model.top_p'] || [];
    const topPVals = agentLabels.map(label => {
        const pt = topPMetricData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-model-top-p', createBarChartConfig(agentDisplayLabels, topPVals, 'Top_P', techColor));

    const topKMetricData = metricsData['gen_ai.model.top_k'] || [];
    const topKVals = agentLabels.map(label => {
        const pt = topKMetricData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-model-top-k', createBarChartConfig(agentDisplayLabels, topKVals, 'Top_K', toolColor));

    // Update Tab 4 Summary Stats
    const avgModelLatencyVal = modelLatencies.reduce((a, b) => a + b, 0) / (modelLatencies.filter(v => v > 0).length || 1);
    const sumModelChunks = modelChunks.reduce((a, b) => a + b, 0);
    const avgTemp = tempVals.reduce((a, b) => a + b, 0) / (tempVals.filter(v => v > 0).length || 1);
    const avgTopP = topPVals.reduce((a, b) => a + b, 0) / (topPVals.filter(v => v > 0).length || 1);

    document.getElementById('stat-model-latency').textContent = avgModelLatencyVal.toFixed(0) + ' ms';
    document.getElementById('stat-model-chunks').textContent = sumModelChunks;
    document.getElementById('stat-model-temp').textContent = avgTemp.toFixed(2);
    document.getElementById('stat-model-top-p').textContent = avgTopP.toFixed(2);

    // ----------------------------------------------------
    // TAB 5: SYSTEM RESOURCES (6 Charts & Badges)
    // ----------------------------------------------------
    const cpuData = metricsData['gen_ai.system.cpu.utilization'] || [];
    const cpuVals = cpuData.map(pt => pt.sum);
    const sysLabels = cpuVals.map((_, i) => `Tick #${i+1}`);
    updateChart('chart-sys-cpu', createLineChartConfig(sysLabels, cpuVals, 'CPU Util (%)', triageColor));

    const ramData = metricsData['gen_ai.system.memory.utilization'] || [];
    const ramVals = ramData.map(pt => pt.sum);
    updateChart('chart-sys-ram', createLineChartConfig(sysLabels, ramVals, 'RAM Util (%)', supportColor));

    const diskData = metricsData['gen_ai.system.disk.utilization'] || [];
    const diskVals = diskData.map(pt => pt.sum);
    updateChart('chart-sys-disk', createLineChartConfig(sysLabels, diskVals, 'Disk Util (%)', billingColor));

    const netInData = metricsData['gen_ai.system.network.bytes.in'] || [];
    const netInBytes = netInData.map(pt => pt.value);
    const netInLabels = netInBytes.map((_, i) => `Tick #${i+1}`);
    updateChart('chart-sys-net-in', createLineChartConfig(netInLabels, netInBytes, 'Network In (Bytes)', triageColor));

    const netOutData = metricsData['gen_ai.system.network.bytes.out'] || [];
    const netOutBytes = netOutData.map(pt => pt.value);
    const netOutLabels = netOutBytes.map((_, i) => `Tick #${i+1}`);
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
    const cpuVal = cpuVals.length > 0 ? cpuVals[cpuVals.length - 1] : 0;
    const ramVal = ramVals.length > 0 ? ramVals[ramVals.length - 1] : 0;

    document.getElementById('stat-sys-cpu').textContent = cpuVal.toFixed(1) + '%';
    document.getElementById('stat-sys-ram').textContent = ramVal.toFixed(1) + '%';
    document.getElementById('stat-sys-active-conns').textContent = currentActiveConnections;
    document.getElementById('stat-sys-net').textContent = totalNetThroughputKB.toFixed(1) + ' KB';

    // ----------------------------------------------------
    // TAB 7: FINOPS & TOKENOMICS (8 Charts & Badges)
    // ----------------------------------------------------
    updateChart('chart-finops-model-cost', createBarChartConfig(agentDisplayLabels, agentCosts, 'Model Cost ($)', techColor));

    const costPerTurnData = metricsData['gen_ai.finops.cost_per_turn'] || [];
    const turnCosts = agentLabels.map(label => {
        const pt = costPerTurnData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-finops-cost-turn', createBarChartConfig(agentDisplayLabels, turnCosts, 'Cost / Turn ($)', billingColor));

    updateChart('chart-finops-token-prompt', createBarChartConfig(agentDisplayLabels, promptTokens, 'Prompt Tokens', triageColor));
    updateChart('chart-finops-token-completion', createBarChartConfig(agentDisplayLabels, compTokens, 'Completion Tokens', supportColor));
    updateChart('chart-finops-token-total', createBarChartConfig(agentDisplayLabels, totalTokens, 'Total Tokens', billingColor));
    updateChart('chart-finops-tokens-active', createLineChartConfig(wfTokenLabels, wfTokens, 'Active Session Tokens', supportColor));
    updateChart('chart-finops-tool-payload', createBarChartConfig(toolDisplayLabels, toolPayloads, 'Tool Payload (Bytes)', toolColor));

    const cacheSavingsData = metricsData['gen_ai.finops.cache_savings_ratio'] || [];
    const cacheSavingsVals = agentLabels.map(label => {
        const pt = cacheSavingsData.find(d => d.attributes['gen_ai.agent.name'] === label);
        return pt && pt.count > 0 ? (pt.sum / pt.count) : 0;
    });
    updateChart('chart-finops-cache-savings', createBarChartConfig(agentDisplayLabels, cacheSavingsVals, 'Cache Savings (%)', supportColor));

    // Update Tab 7 Summary Stats
    const sumPromptTokens = promptTokens.reduce((a, b) => a + b, 0);
    const sumCompTokens = compTokens.reduce((a, b) => a + b, 0);
    const compPromptRatio = sumPromptTokens > 0 ? (sumCompTokens / sumPromptTokens) : 0;
    const avgCacheSavings = cacheSavingsVals.reduce((a, b) => a + b, 0) / (cacheSavingsVals.filter(v => v > 0).length || 1);

    document.getElementById('stat-finops-spend').textContent = '$' + sumCost.toFixed(4);
    document.getElementById('stat-finops-ratio').textContent = compPromptRatio.toFixed(2);
    document.getElementById('stat-finops-cache').textContent = avgCacheSavings.toFixed(1) + '%';
    document.getElementById('stat-finops-egress').textContent = (sumNetOut / 1024).toFixed(1) + ' KB';

    // Update metric signals for ALL 58 metrics dynamically
    const metricsMapping = {
        'chart-invocation-duration': agentDurations,
        'chart-request-size': reqSizes,
        'chart-response-size': respSizes,
        'chart-workflow-steps': steps,
        'chart-agent-calls': agentCalls,
        'chart-agent-errors': agentErrors,
        'chart-token-prompt': promptTokens,
        'chart-token-completion': compTokens,
        'chart-token-total': totalTokens,
        'chart-agent-cost': agentCosts,
        'chart-agent-retry': agentRetries,
        'chart-agent-overhead': agentOverhead,
        'chart-agent-handoffs': agentHandoffs,
        'chart-agent-reasoning-drift': agentDrift,
        'chart-agent-rca-depth': agentRcaDepth,
        'chart-agent-rca-confidence': agentRcaConf,
        'chart-agent-mem-reads': agentMemReads,
        'chart-agent-mem-writes': agentMemWrites,
        'chart-agent-feedback': agentFeedback,
        'chart-agent-fallback': agentFallback,

        'chart-tool-duration': toolDurations,
        'chart-tool-calls': toolCalls,
        'chart-tool-errors': toolErrors,
        'chart-tool-cache-hit': toolHits,
        'chart-tool-cache-miss': toolMisses,
        'chart-tool-payload': toolPayloads,
        'chart-tool-concurrency': toolConcs,
        'chart-tool-timeout': toolTimeouts,

        'chart-workflow-duration': wfDurations,
        'chart-workflow-active': wfActive,
        'chart-workflow-memory': wfMemories,
        'chart-workflow-tokens': wfTokens,
        'chart-workflow-turns': wfTurns,
        'chart-workflow-run-success': wfSuccesses,
        'chart-workflow-run-error': wfErrors,
        'chart-workflow-queue-delay': wfQueueDelays,
        'chart-workflow-handoff-depth': wfHandoffDepths,
        'chart-workflow-concurrency-limit': wfConcLimits,

        'chart-model-latency': modelLatencies,
        'chart-model-chunks': modelChunks,
        'chart-model-chunk-latency': modelChunkLats,
        'chart-model-temp': tempVals,
        'chart-model-top-p': topPVals,
        'chart-model-top-k': topKVals,

        'chart-sys-cpu': cpuVals,
        'chart-sys-ram': ramVals,
        'chart-sys-disk': diskVals,
        'chart-sys-net-in': netInBytes,
        'chart-sys-net-out': netOutBytes,
        'chart-sys-active-conns': conns,

        'chart-policy-ca-blocked': caBlocked,
        'chart-policy-ca-violations': caViolations,
        'chart-policy-ma-injection': maInjections,
        'chart-policy-ma-jailbreak': maJailbreaks,
        'chart-policy-ma-pii': maPiiLeaks,
        'chart-policy-ma-safety': maSafeties,

        'chart-finops-model-cost': agentCosts,
        'chart-finops-cost-turn': turnCosts,
        'chart-finops-token-prompt': promptTokens,
        'chart-finops-token-completion': compTokens,
        'chart-finops-token-total': totalTokens,
        'chart-finops-tokens-active': wfTokens,
        'chart-finops-tool-payload': toolPayloads,
        'chart-finops-cache-savings': cacheSavingsVals
    };

    // Evaluate and construct Active Alerts dynamically
    const activeAlerts = [];
    const nowStr = new Date().toTimeString().split(' ')[0];
    
    Object.keys(metricsMapping).forEach(canvasId => {
        const signalId = allMetricSignals[canvasId];
        const thresholdFn = metricThresholds[canvasId];
        const valData = metricsMapping[canvasId];
        
        if (signalId && thresholdFn && valData) {
            const isCompliant = thresholdFn(valData);
            updateMetricSignal(signalId, isCompliant);
            
            // If not compliant, and we have recorded values for this metric, raise alert!
            const hasData = valData.length > 0 && valData.some(v => v !== 0);
            if (!isCompliant && hasData) {
                // Find the friendly name of this card
                const canvas = document.getElementById(canvasId);
                let friendlyName = canvasId;
                if (canvas) {
                    const card = canvas.closest('.card');
                    if (card) {
                        const h3 = card.querySelector('h3');
                        if (h3) friendlyName = h3.textContent;
                    }
                }
                
                // Get the last value
                const lastVal = valData[valData.length - 1];
                activeAlerts.push({
                    name: friendlyName,
                    metricId: canvasId.replace('chart-', 'gen_ai.'),
                    val: lastVal,
                    time: nowStr
                });
            }
        }
    });

    // Update Alerts Panel feed UI
    const alertsContainer = document.getElementById('alerts-feed-container');
    const statusBadge = document.getElementById('global-alert-status');
    
    if (activeAlerts.length === 0) {
        statusBadge.textContent = 'All SLOs Compliant';
        statusBadge.className = 'alert-status-badge green';
        alertsContainer.innerHTML = `
            <div class="alert-item empty-state">
                <i class="fa-solid fa-shield-halved"></i>
                <p>No active incidents or alert notifications generated. All platform thresholds are inside SLA limits.</p>
            </div>
        `;
    } else {
        statusBadge.textContent = `${activeAlerts.length} Active Alert${activeAlerts.length > 1 ? 's' : ''}`;
        statusBadge.className = 'alert-status-badge red';
        alertsContainer.innerHTML = '';
        
        activeAlerts.forEach(alert => {
            const div = document.createElement('div');
            div.className = 'alert-record';
            div.innerHTML = `
                <div class="alert-header">
                    <span>🚨 CRITICAL LIMIT EXCEEDED</span>
                    <span class="alert-time">${alert.time}</span>
                </div>
                <div><strong>Metric:</strong> ${alert.name}</div>
                <div><strong>Current Metric Value:</strong> ${typeof alert.val === 'number' ? alert.val.toFixed(2) : alert.val} (SLA Threshold Breached)</div>
            `;
            alertsContainer.appendChild(div);
        });
    }

    // ----------------------------------------------------
    // Platform Service Level Objectives (SLOs) & Business KPIs Calculations
    // ----------------------------------------------------
    // 1. Success Rate SLO (based on workflow_success vs workflow_errors)
    const sloSuccessCount = wfSuccessCounts.reduce((a, b) => a + b, 0);
    const sloFailureCount = wfErrorCounts.reduce((a, b) => a + b, 0);
    const sloTotalRuns = sloSuccessCount + sloFailureCount;
    let sloSuccessRate = 100.0;
    if (sloTotalRuns > 0) {
        sloSuccessRate = (sloSuccessCount / sloTotalRuns) * 100;
    }
    const successEl = document.getElementById('kpi-success-rate');
    const successFill = document.getElementById('kpi-success-fill');
    if (successEl) successEl.textContent = sloSuccessRate.toFixed(1) + '%';
    
    if (sloSuccessRate >= 99.5) {
        if (successFill) successFill.className = 'progress-bar-fill green';
        if (successEl) successEl.style.color = 'var(--color-support)';
    } else {
        if (successFill) successFill.className = 'progress-bar-fill red';
        if (successEl) successEl.style.color = 'var(--google-red)';
    }
    if (successFill) successFill.style.width = `${sloSuccessRate}%`;

    // 2. Average Latency SLO (based on Agent Performance Invocations)
    const activeDurations = agentDurations.filter(d => d > 0);
    const avgLatency = activeDurations.length > 0 ? (activeDurations.reduce((a,b)=>a+b,0) / activeDurations.length) : 0;
    const latencyEl = document.getElementById('kpi-latency-val');
    const latencyFill = document.getElementById('kpi-latency-fill');
    if (latencyEl) latencyEl.textContent = avgLatency.toFixed(0) + ' ms';
    
    const latencyPct = Math.min((avgLatency / 5000) * 100, 100);
    if (latencyFill) latencyFill.style.width = `${latencyPct}%`;
    if (avgLatency < 5000) {
        if (latencyFill) latencyFill.className = 'progress-bar-fill green';
        if (latencyEl) latencyEl.style.color = 'var(--text-primary)';
    } else {
        if (latencyFill) latencyFill.className = 'progress-bar-fill red';
        if (latencyEl) latencyEl.style.color = 'var(--google-red)';
    }

    // 3. Running API Cost KPI
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const costEl = document.getElementById('kpi-cost-val');
    const costFill = document.getElementById('kpi-cost-fill');
    if (costEl) costEl.textContent = '$' + totalCost.toFixed(4);
    const costPct = Math.min((totalCost / 5.0) * 100, 100);
    if (costFill) costFill.style.width = `${costPct}%`;
    if (totalCost < 5.0) {
        if (costFill) costFill.className = 'progress-bar-fill green';
        if (costEl) costEl.style.color = 'var(--text-primary)';
    } else {
        if (costFill) costFill.className = 'progress-bar-fill red';
        if (costEl) costEl.style.color = 'var(--google-red)';
    }

    // 4. CSAT Score KPI (based on failures and retries impacting satisfaction)
    let csatScore = 5.0;
    if (sloTotalRuns > 0) {
        const totalRetries = retries.reduce((a,b)=>a+b,0);
        csatScore = Math.max(1.0, 5.0 - (sloFailureCount * 0.8) - (totalRetries * 0.2));
    }
    const csatEl = document.getElementById('kpi-csat-val');
    const csatFill = document.getElementById('kpi-csat-fill');
    if (csatEl) csatEl.textContent = csatScore.toFixed(1) + ' / 5.0';
    const csatPct = (csatScore / 5.0) * 100;
    if (csatFill) csatFill.style.width = `${csatPct}%`;
    if (csatScore >= 4.5) {
        if (csatFill) csatFill.className = 'progress-bar-fill green';
        if (csatEl) csatEl.style.color = 'var(--color-support)';
    } else {
        if (csatFill) csatFill.className = 'progress-bar-fill red';
        if (csatEl) csatEl.style.color = 'var(--google-red)';
    }
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
                
                // Reset all status signal dots to grey
                document.querySelectorAll('.status-signal-dot').forEach(el => {
                    el.className = 'status-signal-dot grey';
                });
            }
        } catch (e) {
            console.error("Failed to reset metrics", e);
        }
    }
}

// Update status signal dot helper
function updateMetricSignal(id, isHealthy) {
    const el = document.getElementById(id);
    if (el) {
        el.className = isHealthy ? 'status-signal-dot green' : 'status-signal-dot red';
    }
}
