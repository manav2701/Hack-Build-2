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

    # --- accounts -----------------------------------------------------------
    # Signs the session JWT. Rotating it logs everyone out, which is the intended
    # emergency lever. It falls back to DALAL_SECRET_KEY only so a fresh checkout
    # boots; main.py logs a warning when the deployment never set its own.
    JWT_SECRET: str = os.getenv("JWT_SECRET", "") or os.getenv("DALAL_SECRET_KEY", "dalal-secret-123")
    # SQLite file holding accounts + craving history. A container filesystem is
    # ephemeral, so on Railway point this at a mounted volume (e.g. /data/dalal.db)
    # or accounts vanish on redeploy — see docs/DEPLOYMENT.md.
    DALAL_DB_PATH: str = os.getenv("DALAL_DB_PATH", "./data/dalal.db")
    # Browser origins allowed to call this API. "*" keeps the hackathon demo open;
    # set a comma-separated list to lock it to the deployed web app + extension.
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")

    @property
    def jwt_secret_is_default(self) -> bool:
        return self.JWT_SECRET in ("", "dalal-secret-123")

    @property
    def cors_origin_list(self) -> list:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
