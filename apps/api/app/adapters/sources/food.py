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

from app.adapters.registry import get_category_spec

import asyncio

class FoodDeliveryAdapter(SourceAdapter):
    name = "food_delivery"

    async def run(self, query: ProductQuery) -> SourceResult:
        start_time = time.perf_counter()
        spec = get_category_spec(query.category)
        product_urls = spec.product_urls or {"noon_food": "https://food.noon.com/uae-en/outlet/CGKFTM0QJ1/"}

        if context_client.is_live():
            async def extract_one(app_name: str, url: str):
                try:
                    data = await self._live_extract(url)
                    if not data:
                        return None, None, None
                    restaurant = data.get("restaurant_name", "Cigkoftem")
                    items = data.get("menu_items", [])
                    offers_list = data.get("offers", [])
                    eta = data.get("eta", "20-30 mins")
                    fee = data.get("delivery_fee_aed", 0)

                    fact = f"[context.dev LIVE - {app_name.upper()}] Outlet: {restaurant} ({data.get('cuisines', 'Turkish')}) — {data.get('rating', 4.7)}★ | ETA: {eta} | Fee: AED {fee}"
                    if offers_list:
                        fact += f" | Deals: {', '.join(offers_list[:2])}"

                    app_offers = []
                    for item in items[:4]:
                        app_offers.append(
                            Offer(
                                title=f"{restaurant} ({app_name.upper()}) - {item.get('name')}",
                                price_aed=float(item.get("price_aed", 0)),
                                retailer=app_name,
                                url=url,
                                seller=restaurant,
                                seller_type="official",
                                warranty=item.get("description", ""),
                                is_fixture=False
                            )
                        )
                    return fact, app_offers, url
                except Exception as e:
                    logger.warning(f"Food extraction error for {app_name}: {e}")
                    return None, None, None

            results = await asyncio.gather(*[extract_one(app, u) for app, u in product_urls.items()], return_exceptions=True)

            offers: List[Offer] = []
            facts: List[str] = []
            citations: List[str] = []

            for r in results:
                if isinstance(r, tuple) and r[0]:
                    fact, app_offers, url = r
                    facts.append(fact)
                    if app_offers:
                        offers.extend(app_offers)
                    if url:
                        citations.append(url)

            if offers:
                return SourceResult(
                    source="marketplace",
                    status="ok",
                    facts=facts,
                    offers=offers,
                    citations=citations,
                    is_fixture=False,
                    latency_ms=int((time.perf_counter() - start_time) * 1000)
                )

        # Fixture fallback comparing Noon Food vs Talabat
        url = product_urls.get("noon_food", "https://food.noon.com/uae-en/outlet/CGKFTM0QJ1/")
        return SourceResult(
            source="marketplace",
            status="ok",
            facts=[
                "[SAMPLE DATA - NOON FOOD] CigkofteM — 4.7★ (20-30 mins) | Delivery: FREE | Active Deal: 30% OFF (TASTY30)",
                "[SAMPLE DATA - TALABAT] CigkofteM — 4.6★ (35-45 mins) | Delivery: AED 7.50 | Standard pricing"
            ],
            offers=[
                Offer(
                    title="Cigkoftem Big Wrap (Noon Food Deal)",
                    price_aed=41.50,
                    retailer="noon_food",
                    url=url,
                    seller="CigkofteM",
                    seller_type="official",
                    warranty="30% OFF applied today on Noon Food + Free Delivery",
                    is_fixture=True
                ),
                Offer(
                    title="Cigkoftem Taco 2X (Talabat)",
                    price_aed=48.0,
                    retailer="talabat",
                    url="https://www.talabat.com/uae/restaurant/645100/cigkoftem-jumeirah-1",
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
            "waitForMs": 2500,
            "maxPages": 1,
            "stopAfterMs": 15000
        }
        async with httpx.AsyncClient(timeout=18.0) as client:
            res = await client.post(
                f"{context_client.base_url}/web/extract",
                headers=headers,
                json=body
            )
            if res.status_code == 200:
                return res.json().get("data")
        return None
