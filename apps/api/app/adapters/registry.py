from typing import Dict, List
from pydantic import BaseModel, Field

class CategorySpec(BaseModel):
    category: str
    marketplace_queries: List[str]
    review_seeds: List[str]
    community_keywords: List[str]
    warranty_urls: List[str]
    # Pinned, real product URLs to compare live (retailer_key -> product page URL).
    # Extracted live via context.dev /web/extract for a reliable, apples-to-apples demo.
    # Empty → the marketplace adapter falls back to a labelled fixture.
    product_urls: Dict[str, str] = Field(default_factory=dict)

CATEGORIES: Dict[str, CategorySpec] = {
    "laptop": CategorySpec(
        category="laptop",
        marketplace_queries=["macbook air m3 noon uae", "lenovo legion amazon ae"],
        review_seeds=["https://www.rtings.com/laptop", "https://www.tomsguide.com/laptops"],
        community_keywords=["laptop noon refurb r/dubai", "amazon ae laptop fake warranty"],
        warranty_urls=["https://www.noon.com/uae-en/warranty-policy/"],
        # Verified live 2026-08-08 (context.dev spike): Noon listing is a 3rd-party
        # "International Version" seller; Amazon.ae is the official store — the warranty catch.
        product_urls={
            "noon": "https://www.noon.com/uae-en/new-2026-macbook-air-mdhe4-13-inch-display-m5-air-10-core-cpu-8-core-gpu-16gb-ram-512gb-ssd-macos-english-keyboard-international-version-midnight/N70298796V/p/",
            "amazon_ae": "https://www.amazon.ae/Apple-MacBook-15-inch-10%E2%80%91core-Unified/dp/B0CX22HLM9",
        },
    ),
    "vacuum": CategorySpec(
        category="vacuum",
        marketplace_queries=["dyson v15 noon uae", "roborock s8 amazon ae"],
        review_seeds=["https://www.wirecutter.com/vacuums"],
        community_keywords=["dyson battery UAE service center r/dubai"],
        warranty_urls=["https://www.dyson.ae/en-AE/support/warranty-terms"],
        product_urls={},  # TODO: pin real Noon/Amazon product URLs in rehearsal → goes live automatically
    ),
    "headphones": CategorySpec(
        category="headphones",
        marketplace_queries=["sony wh1000xm5 noon uae", "airpods max amazon ae"],
        review_seeds=["https://www.rtings.com/headphones"],
        community_keywords=["sony headphone warranty UAE jumbo r/dubai"],
        warranty_urls=["https://www.noon.com/uae-en/electronics-warranty/"],
        product_urls={},  # TODO: pin real Noon/Amazon product URLs in rehearsal → goes live automatically
    ),
    "smartwatch": CategorySpec(
        category="smartwatch",
        marketplace_queries=["apple watch ultra 2 noon uae", "samsung galaxy watch 6 amazon ae"],
        review_seeds=["https://www.rtings.com/smartwatch", "https://www.tomsguide.com/smartwatches"],
        community_keywords=[
            "apple watch ultra 2 esim etisalat du r/dubai",
            "galaxy watch 6 lte activation UAE r/dubai"
        ],
        warranty_urls=["https://www.jumbo.ae/warranty-terms"],
        product_urls={},  # TODO: pin real Noon/Amazon product URLs in rehearsal → goes live automatically
    ),
    "food": CategorySpec(
        category="food",
        marketplace_queries=["noon food cigkoftem uae", "talabat cigkoftem dubai", "deliveroo cigkoftem uae"],
        review_seeds=["https://www.zomato.com/dubai"],
        community_keywords=["best cigkoftem dubai r/dubai", "talabat delivery fee surge"],
        warranty_urls=["https://food.noon.com/termsofuse/"],
        product_urls={
            "noon_food": "https://food.noon.com/uae-en/outlet/CGKFTM0QJ1/",
            "talabat": "https://www.talabat.com/uae/restaurant/645100/cigkoftem-jumeirah-1",
            "deliveroo": "https://deliveroo.ae/menu/dubai/jumeirah-1/cigkoftem-jumeirah",
        },
    ),
}

def get_category_spec(category: str) -> CategorySpec:
    # Tolerant category routing (from main): a webhook may send a cuisine or dish where a
    # category is expected. Only the LEGACY shopping path reads CategorySpec; the food
    # domain resolves through DomainConfig below and discovers URLs live.
    cat = (category or "").lower()
    if any(k in cat for k in ("food", "wonton", "cigkoftem", "biryani", "burger")):
        return CATEGORIES["food"]
    return CATEGORIES.get(cat, CATEGORIES["laptop"])


# ---------------------------------------------------------------------------
# Domain seam. The orchestrator builds its adapter list from the active
# DomainConfig instead of a hardcoded four, so adding a domain is config, not code.
# ---------------------------------------------------------------------------

class DeliveryApp(BaseModel):
    """One UAE delivery app, described by what the live verification proved about it.

    Every field here is measured — see docs/VENDOR-CONTRACTS.md §0.4/§0.5. The URL
    markers are how we tell a real menu/listing page from a marketing or listing-index
    page in `/web/search` results.
    """
    key: str                                  # DishOffer.app
    domain: str                               # includeDomains filter + brand lookup
    menu_marker: str                          # substring identifying a MENU (dish+price) page
    listing_marker: str                       # substring identifying an AREA LISTING (fee/ETA) page
    required: bool = True                     # False → best-effort; absence is not a failure


# Talabat and Deliveroo are proven-rich. EatEasy genuinely returns priced dishes but has
# thin coverage (it listed neither test restaurant), so it is best-effort: it will often
# return nothing and that must not degrade the verdict.
DELIVERY_APPS: List[DeliveryApp] = [
    DeliveryApp(key="talabat", domain="talabat.com",
                menu_marker="/restaurant/", listing_marker="/restaurants/"),
    DeliveryApp(key="deliveroo", domain="deliveroo.ae",
                menu_marker="/menu/", listing_marker="/restaurants/"),
    DeliveryApp(key="eateasy", domain="eateasy.ae",
                menu_marker="/", listing_marker="/", required=False),
]

# Only these carry review BODIES; the delivery apps expose a rating number only (§0.7).
REVIEW_SOURCES: List[str] = ["zomato.com", "tripadvisor.com"]


class DomainConfig(BaseModel):
    """Which adapters run for a domain, and the clarifying question the agent asks."""
    domain: str
    sources: List[str]
    clarifier: str


DOMAINS: Dict[str, DomainConfig] = {
    "shopping": DomainConfig(
        domain="shopping",
        sources=["marketplace", "reviews", "community", "warranty"],
        clarifier="What's your budget, and is official UAE warranty a must?",
    ),
    "food": DomainConfig(
        domain="food",
        sources=["delivery_app", "restaurant_reviews"],
        clarifier="Delivery or dine-in? And how do you feel about spice?",
    ),
}


def get_domain_config(domain: str) -> DomainConfig:
    return DOMAINS.get(domain, DOMAINS["food"])
