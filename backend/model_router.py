from typing import Dict, Any

class MultiModelRouter:
    """Multi-Model Routing Manager.
    
    Routing Strategy:
    - Routine / Normal Tasks (Triage, Support): Routed to Gemma 2 9B / Gemini 1.5 Flash (fast, lightweight).
    - Deep Reasoning / Action Tasks (Billing Refund, Tech Restart): Routed to Gemini 2.5 Flash / Pro (high reasoning).
    """
    
    def __init__(self):
        self.models = {
            "routine": {
                "model_id": "gemma-2-9b-it",
                "display_name": "Gemma 2 9B (Lightweight Routine)",
                "temperature": 0.2,
                "top_p": 0.9,
                "top_k": 40
            },
            "reasoning": {
                "model_id": "gemini-2.5-flash",
                "display_name": "Gemini 2.5 Flash (Deep Reasoning)",
                "temperature": 0.1,
                "top_p": 0.95,
                "top_k": 64
            }
        }
        
    def get_route_for_agent(self, agent_name: str) -> Dict[str, Any]:
        """Determines model routing metadata based on agent responsibility."""
        if agent_name in ["triage_agent", "support_agent"]:
            route_type = "routine"
        else:
            route_type = "reasoning"
            
        config = self.models[route_type]
        return {
            "route_type": route_type,
            "model_id": config["model_id"],
            "display_name": config["display_name"],
            "temperature": config["temperature"],
            "top_p": config["top_p"],
            "top_k": config["top_k"]
        }

model_router = MultiModelRouter()
