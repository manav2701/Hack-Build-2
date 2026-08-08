import time
import logging
from typing import List, Optional
import httpx

from app.adapters.base import SourceAdapter
from app.domain.models import ProductQuery, SourceResult, Offer
from app.adapters.context_client import context_client
from app.config import settings

logger = logging.getLogger(__name__)

FOOD_OUTLET_SCHEMA = {
    "type": "object",
    "properties": {
        "restaurant_name": {"type": "string"},
        "cuisines": {"type": "string"},
        "rating": {"type": "number"},
        "eta": {"type": "string"},
        "delivery_fee_aed": {"type": "number"},
        "offers": {"type": "array", "items": {"type": "string"}},
        "menu_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price_aed": {"type": "number"},
                    "description": {"type": "string"}
                }
            }
        }
    }
}

FOOD_EXTRACT_INSTRUCTIONS = (
    "Extract the food outlet details: restaurant name, cuisines, rating, delivery ETA, "
    "delivery fee in AED, active promo offer discounts, and the bestselling menu items with their prices in AED."
)

class FoodDeliveryAdapter(SourceAdapter):
    name = "food_delivery"

    async def run(self, query: ProductQuery) -> SourceResult:
        start_time = time.perf_counter()
        url = "https://food.noon.com/uae-en/outlet/CGKFTM0QJ1/"

        if context_client.is_live():
            try:
                data = await self._live_extract(url)
                if data:
                    restaurant = data.get("restaurant_name", "Cigkoftem")
                    items = data.get("menu_items", [])
                    offers_list = data.get("offers", [])
                    eta = data.get("eta", "20-30 mins")
                    fee = data.get("delivery_fee_aed", 0)

                    facts = [
                        f"[context.dev LIVE] Outlet: {restaurant} ({data.get('cuisines', 'Turkish')}) — Rating: {data.get('rating', 4.7)}★",
                        f"[context.dev LIVE] Delivery: {eta} (Fee: AED {fee})",
                        f"[context.dev LIVE] Active Deals: {', '.join(offers_list[:2]) if offers_list else 'Standard delivery'}",
                    ]

                    offers = []
                    for item in items[:5]:
                        offers.append(
                            Offer(
                                title=f"{restaurant} - {item.get('name')}",
                                price_aed=float(item.get("price_aed", 0)),
                                retailer="noon",
                                url=url,
                                seller=restaurant,
                                seller_type="official",
                                warranty=item.get("description", ""),
                                is_fixture=False
                            )
                        )

                    return SourceResult(
                        source="marketplace",
                        status="ok",
                        facts=facts,
                        offers=offers,
                        citations=[url],
                        is_fixture=False,
                        latency_ms=int((time.perf_counter() - start_time) * 1000)
                    )
            except Exception as e:
                logger.warning(f"Food extraction error: {e}")

        # Fixture fallback
        return SourceResult(
            source="marketplace",
            status="ok",
            facts=["[SAMPLE DATA] CigkofteM Turkish Vegan Wraps & Tacos — 4.7★ (20-30 mins delivery)"],
            offers=[
                Offer(
                    title="Cigkoftem Small Pack (250g)",
                    price_aed=52.0,
                    retailer="noon",
                    url=url,
                    seller="CigkofteM",
                    seller_type="official",
                    warranty="Hand-rolled cigkofte with lavash bread and fresh garnish",
                    is_fixture=True
                ),
                Offer(
                    title="Cigkoftem Taco 2X",
                    price_aed=48.0,
                    retailer="noon",
                    url=url,
                    seller="CigkofteM",
                    seller_type="official",
                    warranty="Two loaded tacos with vegan cig kofte, veggies, red beans",
                    is_fixture=True
                )
            ],
            citations=[url],
            is_fixture=True,
            latency_ms=int((time.perf_counter() - start_time) * 1000)
        )

    async def _live_extract(self, url: str) -> Optional[dict]:
        headers = {
            "Authorization": f"Bearer {context_client.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
        }
        body = {
            "url": url,
            "schema": FOOD_OUTLET_SCHEMA,
            "instructions": FOOD_EXTRACT_INSTRUCTIONS,
            "waitForMs": 5000,
            "maxPages": 1,
            "stopAfterMs": 25000
        }
        async with httpx.AsyncClient(timeout=35.0) as client:
            res = await client.post(
                f"{context_client.base_url}/web/extract",
                headers=headers,
                json=body
            )
            if res.status_code == 200:
                return res.json().get("data")
        return None
