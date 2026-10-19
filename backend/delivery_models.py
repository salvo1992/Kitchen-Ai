"""Validated public inputs for in-person services; money is always integer EUR cents."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


Category = Literal['romantic', 'anniversary', 'party', 'catering', 'weekly', 'showcooking']
CATEGORIES = [
    {'id': 'romantic', 'label': 'Cena romantica', 'icon': 'heart-outline'},
    {'id': 'anniversary', 'label': 'Anniversario', 'icon': 'wine-outline'},
    {'id': 'party', 'label': 'Feste private', 'icon': 'balloon-outline'},
    {'id': 'catering', 'label': 'Catering eventi', 'icon': 'restaurant-outline'},
    {'id': 'weekly', 'label': 'Chef settimanale', 'icon': 'calendar-outline'},
    {'id': 'showcooking', 'label': 'Showcooking', 'icon': 'flame-outline'},
]


class CitySearch(Input):
    query: str = Field(min_length=3, max_length=100)


class ProviderInput(Input):
    display_name: str = Field(min_length=3, max_length=90)
    kind: Literal['chef', 'company'] = 'chef'
    bio: str = Field(min_length=30, max_length=3000)
    city_id: str = Field(min_length=1, max_length=100)
    radius_km: int = Field(ge=1, le=300, strict=True)
    specialties: list[str] = Field(min_length=1, max_length=8)
    photo_url: str | None = Field(default=None, max_length=1500)
    accepts_terms: bool

    @model_validator(mode='after')
    def validate_text(self):
        if not self.accepts_terms:
            raise ValueError('Accetta le condizioni del servizio')
        if any(not x.strip() or len(x) > 140 for x in self.specialties):
            raise ValueError('Indica piatti o specialità da 1 a 140 caratteri')
        return self


class ServiceInput(Input):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=20, max_length=3000)
    category: Category
    price_cents: int = Field(ge=500, le=2000000, strict=True)
    pricing: Literal['person', 'fixed'] = 'person'
    booking_mode: Literal['quote', 'instant', 'both'] = 'both'
    min_guests: int = Field(ge=1, le=1000, strict=True)
    max_guests: int = Field(ge=1, le=1000, strict=True)
    duration_hours: int = Field(ge=1, le=12, strict=True)
    included: str = Field(min_length=10, max_length=1500)
    enabled: bool = True

    @model_validator(mode='after')
    def guest_range(self):
        if self.max_guests < self.min_guests:
            raise ValueError('Il massimo ospiti deve essere maggiore o uguale al minimo')
        return self


class SlotInput(Input):
    date: date
    time: str = Field(pattern=r'^([01]\d|2[0-3]):(00|30)$')
    duration_hours: int = Field(ge=1, le=12, strict=True)


class BookingInput(Input):
    service_id: str = Field(min_length=1, max_length=80)
    mode: Literal['quote', 'instant']
    city_id: str = Field(min_length=1, max_length=100)
    date: date
    time: str = Field(pattern=r'^([01]\d|2[0-3]):(00|30)$')
    slot_id: str | None = Field(default=None, max_length=80)
    guests: int = Field(ge=1, le=1000, strict=True)
    address: str = Field(min_length=8, max_length=300)
    phone: str = Field(min_length=7, max_length=30, pattern=r'^[+0-9() .-]+$')
    notes: str = Field(default='', max_length=2000)
    accepts_terms: bool


class QuoteInput(Input):
    amount_cents: int = Field(ge=500, le=2000000, strict=True)
    slot_id: str = Field(min_length=1, max_length=80)
    included: str = Field(min_length=10, max_length=2000)


class ReasonInput(Input):
    reason: str = Field(min_length=10, max_length=2000)


class ReviewInput(Input):
    rating: int = Field(ge=1, le=5, strict=True)
    text: str = Field(min_length=10, max_length=1500)


class ReplyInput(Input):
    text: str = Field(min_length=5, max_length=1000)


class Moderation(Input):
    status: Literal['approved', 'rejected', 'suspended']
    note: str = Field(default='', max_length=1000)


class Resolution(Input):
    outcome: Literal['refund', 'release']
    note: str = Field(min_length=15, max_length=2000)