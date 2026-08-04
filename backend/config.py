import os
from typing import Optional

class Settings:
    """Centralized production configuration manager."""
    
    APP_ENV: str = os.getenv("APP_ENV", "production")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Gemini & GCP Configuration
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY"))
    GCP_PROJECT_ID: Optional[str] = os.getenv("GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT"))
    GCP_LOCATION: str = os.getenv("GCP_LOCATION", "us-central1")
    
    # OpenTelemetry Production Exporter Configuration
    OTEL_EXPORTER_OTLP_ENDPOINT: Optional[str] = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    OTEL_SERVICE_NAME: str = os.getenv("OTEL_SERVICE_NAME", "agent-platform-observability")
    
    @property
    def is_live_gemini(self) -> bool:
        """Returns True if a real Gemini API key is configured."""
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip() != "" and not self.GEMINI_API_KEY.startswith("YOUR_"))
    
    @property
    def is_otlp_enabled(self) -> bool:
        """Returns True if an external OTLP exporter endpoint is configured."""
        return bool(self.OTEL_EXPORTER_OTLP_ENDPOINT and self.OTEL_EXPORTER_OTLP_ENDPOINT.strip() != "")

settings = Settings()
