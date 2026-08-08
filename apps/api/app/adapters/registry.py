from typing import Dict, List
from pydantic import BaseModel

class CategorySpec(BaseModel):
    category: str
    marketplace_queries: List[str]
    review_seeds: List[str]
    community_keywords: List[str]
    warranty_urls: List[str]

CATEGORIES: Dict[str, CategorySpec] = {
    "laptop": CategorySpec(
        category="laptop",
        marketplace_queries=["macbook air m3 noon uae", "lenovo legion amazon ae"],
        review_seeds=["https://www.rtings.com/laptop", "https://www.tomsguide.com/laptops"],
        community_keywords=["laptop noon refurb r/dubai", "amazon ae laptop fake warranty"],
        warranty_urls=["https://www.noon.com/uae-en/warranty-policy/"]
    ),
    "vacuum": CategorySpec(
        category="vacuum",
        marketplace_queries=["dyson v15 noon uae", "roborock s8 amazon ae"],
        review_seeds=["https://www.wirecutter.com/vacuums"],
        community_keywords=["dyson battery UAE service center r/dubai"],
        warranty_urls=["https://www.dyson.ae/en-AE/support/warranty-terms"]
    ),
    "headphones": CategorySpec(
        category="headphones",
        marketplace_queries=["sony wh1000xm5 noon uae", "airpods max amazon ae"],
        review_seeds=["https://www.rtings.com/headphones"],
        community_keywords=["sony headphone warranty UAE jumbo r/dubai"],
        warranty_urls=["https://www.noon.com/uae-en/electronics-warranty/"]
    ),
    "smartwatch": CategorySpec(
        category="smartwatch",
        marketplace_queries=["apple watch ultra 2 noon uae", "samsung galaxy watch 6 amazon ae"],
        review_seeds=["https://www.rtings.com/smartwatch", "https://www.tomsguide.com/smartwatches"],
        community_keywords=[
            "apple watch ultra 2 esim etisalat du r/dubai",
            "galaxy watch 6 lte activation UAE r/dubai"
        ],
        warranty_urls=["https://www.jumbo.ae/warranty-terms"]
    ),
}

def get_category_spec(category: str) -> CategorySpec:
    return CATEGORIES.get(category, CATEGORIES["laptop"])
