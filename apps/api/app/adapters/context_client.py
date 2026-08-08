import httpx
from app.config import settings

class ContextDevClient:
    """Client wrapper for context.dev web scraping and extraction APIs."""

    def __init__(self, api_key: str = settings.CONTEXT_DEV_API_KEY):
        self.api_key = api_key
        self.base_url = "https://api.context.dev/v1"

    async def scrape_markdown(self, url: str) -> str:
        """Scrapes target URL and returns LLM-ready markdown using context.dev."""
        if settings.USE_FIXTURES or not self.api_key or self.api_key.startswith("ctxt_demo"):
            return f"Simulated markdown content for {url}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{self.base_url}/scrape",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"url": url, "format": "markdown"}
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("markdown", "")
            return f"Failed to scrape {url}: HTTP {response.status_code}"

context_client = ContextDevClient()
