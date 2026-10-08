import pytest

from app.services import maps
from tests.test_admin_apartments import apartment_payload


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.google.com/maps/place/Mamilla/@31.7776,35.2237,17z/data=!3m1", (31.7776, 35.2237)),
        (
            "https://www.google.com/maps/place/X/@31.70,35.10,15z/data=!3d31.7781!4d35.2241",
            (31.7781, 35.2241),
        ),
        ("https://maps.google.com/?q=31.7840,35.2105", (31.784, 35.2105)),
        ("https://www.google.com/maps/search/31.7735,+35.2155", (31.7735, 35.2155)),
        (
            "https://consent.google.com/m?continue=https://www.google.com/maps/place/A/%4031.7810,35.2170,17z",
            (31.781, 35.217),
        ),
        ("https://maps.app.goo.gl/AbCdEf123", None),
        ("", None),
    ],
)
def test_coords_from_url(url, expected):
    assert maps.coords_from_url(url) == expected


def test_resolve_refuses_non_google_hosts():
    assert maps.resolve_coords("https://evil.example.com/redirect") is None


def test_short_link_coordinates_filled_on_save(admin_client, client, monkeypatch):
    from app.api import admin_apartments

    calls = []

    def fake_resolve(url):
        calls.append(url)
        return (31.7767, 35.2345) if "goo.gl" in url else None

    monkeypatch.setattr(admin_apartments, "resolve_coords", fake_resolve)
    apt = admin_client.post(
        "/api/admin/apartments", json=apartment_payload(google_maps_url="https://maps.app.goo.gl/AbCdEf123")
    ).json()
    assert (apt["latitude"], apt["longitude"]) == (31.7767, 35.2345)
    public = client.get(f"/api/apartments/{apt['slug']}").json()
    assert public["latitude"] == 31.7767 and public["google_maps_url"].startswith("https://maps.app.goo.gl")

    # Saving again without changing the link doesn't hit the network.
    calls.clear()
    admin_client.put(f"/api/admin/apartments/{apt['id']}", json={"name": "Renamed"})
    assert calls == []
