from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import health, tools
from app.config import settings

app = FastAPI(
    title="Dalal API — Voice-First UAE Shopping Agent",
    description="Asynchronous parallel scraping & research orchestrator for Dubai AI Hub Builder Lab.",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health.router)
app.include_router(tools.router)

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
