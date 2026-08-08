from abc import ABC, abstractmethod
from app.domain.models import ProductQuery, SourceResult

class SourceAdapter(ABC):
    name: str

    @abstractmethod
    async def run(self, query: ProductQuery) -> SourceResult:
        """Runs the scraping/extraction pipeline for this source."""
        pass
