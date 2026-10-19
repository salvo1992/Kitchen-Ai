"""Iteration 20: unit tests for delivery payment/refund/transfer guards with isolated stubs."""

import os
import sys
import asyncio
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from delivery import split_amount
from delivery_payments import payment_config, transfer_booking


# Pure money split and payment-config invariants
def test_split_amount_100_eur_is_90_10_server_side():
    out = split_amount(10000)
    assert out["amount_cents"] == 10000
    assert out["commission_cents"] == 1000
    assert out["provider_cents"] == 9000


def test_payment_config_unavailable_without_connect(monkeypatch):
    monkeypatch.delenv("STRIPE_CONNECT_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_CONNECT_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("DELIVERY_PUBLIC_APP_URL", "https://app-builder-14436.preview.emergentagent.com")
    cfg = payment_config()
    assert cfg["configured"] is False
    assert cfg["mode"] == "unavailable"


def test_payment_config_rejects_managed_placeholder_suffix(monkeypatch):
    monkeypatch.setenv("STRIPE_CONNECT_SECRET_KEY", "sk_test_placeholder_emergent")
    monkeypatch.setenv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setenv("DELIVERY_PUBLIC_APP_URL", "https://app-builder-14436.preview.emergentagent.com")
    cfg = payment_config()
    assert cfg["configured"] is False
    assert cfg["message"]


class _FakeBookings:
    def __init__(self):
        self.updated = []

    async def update_one(self, query, update):
        self.updated.append((query, update))
        return type("R", (), {"modified_count": 1})()

    async def find_one(self, query, projection=None):
        # return same completed booking snapshot
        return {
            "id": query["id"],
            "status": "completed",
            "dispute_open": True,
            "refund_pending": False,
            "release_after": "2000-01-01T00:00:00+00:00",
            "provider_id": "dc_provider",
            "payment_intent_id": "pi_test",
            "provider_cents": 9000,
            "provider_stripe_account_id": "acct_test",
        }


class _FakeDB:
    def __init__(self):
        self.delivery_bookings = _FakeBookings()
        self.delivery_providers = self

    async def find_one(self, query, projection=None):
        return {"id": "dc_provider", "status": "approved", "connect_ready": True, "stripe_account_id": "acct_test"}


def test_transfer_booking_guard_blocks_when_dispute_open(monkeypatch):
    db = _FakeDB()
    booking = {
        "id": "booking_test_guard",
        "status": "completed",
        "dispute_open": True,
        "refund_pending": False,
        "release_after": "2000-01-01T00:00:00+00:00",
    }

    calls = {"stripe": 0, "unlock": 0}

    async def _claim_money(_db, _bid):
        return booking, "lock_token"

    async def _unlock(_db, _bid, _token):
        calls["unlock"] += 1

    async def _stripe_call(*args, **kwargs):
        calls["stripe"] += 1
        raise AssertionError("stripe_call should not run when dispute_open is true")

    monkeypatch.setattr("delivery_payments.claim_money", _claim_money)
    monkeypatch.setattr("delivery_payments.unlock", _unlock)
    monkeypatch.setattr("delivery_payments.stripe_call", _stripe_call)

    asyncio.run(transfer_booking(db, booking))
    assert calls["stripe"] == 0
    assert calls["unlock"] == 1
