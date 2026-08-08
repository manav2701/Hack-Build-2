import os
from dotenv import load_dotenv, find_dotenv

# Load .env from local directory or parent workspace
load_dotenv(find_dotenv(usecwd=True))

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseModel as BaseSettings

class Settings(BaseSettings):
    CONTEXT_DEV_API_KEY: str = os.getenv("CONTEXT_DEV_API_KEY", "ctxt_demo_key")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://demo.supabase.co")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "demo-key")
    DALAL_SECRET_KEY: str = os.getenv("DALAL_SECRET_KEY", "dalal-secret-123")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "demo-llm-key")
    USE_FIXTURES: bool = os.getenv("USE_FIXTURES", "false").lower() == "true"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
