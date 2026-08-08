from datetime import datetime
from typing import Literal, Optional, List, Union
from pydantic import BaseModel, Field

class ProductQuery(BaseModel):
    session_id: str = "demo-session"
    category: str = Field(default="food", description="Category or dish craving e.g. food, laptop, vacuum, headphones")
    dish: Optional[str] = Field(default="", description="Specific dish or product name")
    budget_aed: float = Field(default=5000.0, description="Target budget in AED")
    must_haves: List[str] = Field(default_factory=list, description="User must-have features")
    deal_breakers: List[str] = Field(default_factory=list, description="User deal breakers")
    usage: str = Field(default="", description="Free text description of usage")

class Offer(BaseModel):
    title: str
    price_aed: float
    retailer: str
    url: str
    seller: Optional[str] = None                                      # e.g. "Viola-UAE", "Amazon.ae"
    seller_type: Literal["official", "marketplace_3p", "unknown"] = "unknown"  # drives the warranty catch
    warranty: Optional[str] = None                                    # raw warranty text from the listing
    in_stock: Optional[bool] = True
    is_fixture: bool = False                                          # True → sample data, not a live fetch
    captured_at: datetime = Field(default_factory=datetime.utcnow)

# ---------------------------------------------------------------------------
# Food domain (the pivot). Additive: the shopping shapes above still drive the
# proven marketplace path. Shapes follow the LIVE capability verification in
# docs/VENDOR-CONTRACTS.md §0 — notably that a delivery app splits its data across
# TWO pages, so a DishOffer is a JOIN of the menu page and the area listing page.
# ---------------------------------------------------------------------------

class CravingQuery(BaseModel):
    """What the voice agent collects before research starts."""
    session_id: str = "demo-session"
    dish: str = "wontons"                                             # "authentic Sichuan wontons"
    mode: Literal["delivery", "dine_in"] = "delivery"
    refiners: List[str] = Field(default_factory=list)                 # spice / authenticity / budget
    # Delivery apps are location-gated, so the area goes into every search. The default
    # must be WIDE: it is what gets used whenever the caller omits an area, which is most
    # of the time (the voice agent rarely collects one). A narrow default silently kills
    # results — "Downtown Dubai" returned zero dosa listings while "Dubai" returned a
    # real one in Karama for the same craving, seconds apart. Prefer a broad search that
    # finds the dish over a precise one that finds nothing.
    area: str = "Dubai"


class DishOffer(BaseModel):
    """One dish, on one app, at one restaurant.

    Fields are grouped by WHICH page they come from, because that governs whether
    they can be absent — a menu-page fetch that succeeds while the listing-page
    fetch fails still yields a usable (price-grounded) offer.
    """
    # --- from the MENU page (required: no price, no offer) ---
    restaurant: str
    address: Optional[str] = None                                     # as printed on the page; often absent
    dish: str
    price_aed: float
    app: Literal["talabat", "deliveroo", "eateasy", "other"]
    deep_link: str                                                    # → open_order_page(url)
    sold_out: bool = False
    rating: Optional[float] = None                                    # aggregate; free with the menu fetch
    review_count: Optional[int] = None

    # --- from the AREA LISTING page (optional: absent when that fetch fails) ---
    # These are the app's PUBLISHED ESTIMATE, not the user's checkout total. The real
    # per-user fee/ETA is computed behind auth and is unobtainable (§0.8).
    delivery_fee_aed: Optional[float] = None
    eta_text: Optional[str] = None                                    # "Within 32 mins" / "25 min", as shown
    minimum_order_aed: Optional[float] = None
    offer_text: Optional[str] = None                                  # "Spend AED 50, get 30% off"

    # --- presentation (context.dev screenshot / brand endpoints) ---
    screenshot_url: Optional[str] = None
    logo_url: Optional[str] = None
    # The dish photo as published on the menu page, or the restaurant's hero/og image as a
    # fallback. Optional because a menu row frequently has no photo — the UI must degrade to
    # its own artwork rather than show a broken frame, and we never invent a URL.
    image_url: Optional[str] = None

    is_fixture: bool = False
    captured_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def estimates_are_published(self) -> bool:
        """True when any app-published estimate is attached and must be labelled as such."""
        return self.delivery_fee_aed is not None or self.eta_text is not None


class RestaurantReview(BaseModel):
    """A real customer review body. Only Zomato/TripAdvisor return these — the
    delivery apps expose an aggregate rating number and no text at all (§0.7)."""
    source: Literal["zomato", "tripadvisor", "other"]
    author: Optional[str] = None
    rating: Optional[float] = None
    text: str
    date: Optional[str] = None
    url: str


class SourceResult(BaseModel):
    source: Literal[
        "marketplace", "reviews", "community", "warranty",            # shopping
        "delivery_app", "discovery", "restaurant_reviews",            # food
    ]
    status: Literal["ok", "partial", "failed"]
    facts: List[str] = Field(default_factory=list)
    offers: List[Offer] = Field(default_factory=list)
    dish_offers: List[DishOffer] = Field(default_factory=list)
    reviews: List[RestaurantReview] = Field(default_factory=list)
    citations: List[str] = Field(default_factory=list)
    is_fixture: bool = False                                          # True when this source used fixture data
    latency_ms: int = 0
    error: Optional[str] = None

class Recommendation(BaseModel):
    name: str
    price_aed: float
    retailer: str
    url: str
    why: List[str] = Field(description="Exactly 3 key selling points", max_length=3)
    watch_outs: List[str] = Field(description="Exactly 2 watch-outs/cons", max_length=2)
    warranty_note: Optional[str] = None

class DishRecommendation(BaseModel):
    """The food-domain pick. Mirrors Recommendation so one Verdict serves both
    domains (no parallel verdict type), but carries what a food decision needs."""
    name: str                                                         # the dish as listed
    restaurant: str
    address: Optional[str] = None                                     # where to actually go / order from
    price_aed: float
    app: str                                                          # talabat / deliveroo / eateasy
    url: str                                                          # deep link to the order page
    why: List[str] = Field(description="Up to 3 grounded reasons", max_length=3)
    watch_outs: List[str] = Field(default_factory=list, max_length=2)
    rating: Optional[float] = None
    review_count: Optional[int] = None
    authenticity_note: Optional[str] = None                           # grounded in Zomato/TripAdvisor review text
    # The single best real review for this restaurant, structured so the UI can render
    # author/stars/source/link rather than parsing the prose in authenticity_note. None
    # when no review body could be attributed to this place — never a synthesised review.
    top_review: Optional["RestaurantReview"] = None
    # App-published estimates, never the user's checkout total (§0.8).
    delivery_estimate: Optional[str] = None                           # "AED 9.00 delivery, within 40 mins (as listed)"
    screenshot_url: Optional[str] = None
    logo_url: Optional[str] = None
    image_url: Optional[str] = None                                   # dish photo from the menu page / order-page og:image


class Verdict(BaseModel):
    pick: Union[DishRecommendation, Recommendation]
    runner_up: Optional[Union[DishRecommendation, Recommendation]] = None
    price_note: str
    confidence: Literal["high", "medium", "low"]
    sources_used: List[str]
    is_fixture: bool = False                                          # True if any contributing source was fixture
    spoken_summary: str  # <= 60 words for the agent to read out loud

class StartResearchResponse(BaseModel):
    job_id: str
    status: str = "running"
    eta_seconds: int = 45

class ResearchStatusResponse(BaseModel):
    status: str
    done: int
    total: int = 4
    teaser: str
