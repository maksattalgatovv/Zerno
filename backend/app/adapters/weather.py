"""Weather provider. The only implementation is a labelled demo: no weather API is used."""

from abc import ABC, abstractmethod
from datetime import date

CONDITIONS = ("sunny", "partly_cloudy", "cloudy", "light_rain")


class WeatherProvider(ABC):
    is_demo: bool

    @abstractmethod
    def current(self, lat: float, lng: float) -> dict: ...


class DemoWeatherProvider(WeatherProvider):
    """Stable, plausible growing-season values that change daily."""

    is_demo = True

    def current(self, lat: float, lng: float) -> dict:
        day = date.today().toordinal()
        return {
            "is_demo": self.is_demo,
            "temperature_c": 18 + day % 9,
            "condition": CONDITIONS[day % len(CONDITIONS)],
            "humidity_pct": 42 + day % 26,
            "wind_kmh": 8 + day % 13,
            "rain_next_3d_mm": (day % 5) * 2,
        }


def get_weather() -> WeatherProvider:
    return DemoWeatherProvider()
