import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, health, tools
from app.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Dalal API — Voice-First UAE Food Broker",
    description="Asynchronous parallel scraping & research orchestrator for Dubai AI Hub Builder Lab.",
    version="1.1.0"
)

# CORS. The web app, the Chrome extension popup and the extension's content scripts all
# call this API cross-origin. Credentials stay off because the session is a bearer token,
# not a cookie — which is also what lets the default stay "*" without the browser
# rejecting the wildcard.
_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health.router)
app.include_router(tools.router)
app.include_router(auth.router)


@app.on_event("startup")
async def _warn_on_default_secrets() -> None:
    """Say it out loud when a deployment is running on the shipped defaults."""
    if settings.jwt_secret_is_default:
        logger.warning(
            "JWT_SECRET is unset — session tokens are signed with the public default. "
            "Set JWT_SECRET in the deployment environment before real accounts exist."
        )
    if _origins == ["*"]:
        logger.info("CORS is open to all origins; set CORS_ORIGINS to lock it down.")

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Dalal UAE Voice Broker API",
        "docs_url": "/docs",
        "health_check": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
