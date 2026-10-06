/**
 * Built-in Weather Tool
 * Fetches real-time weather and forecasts via Open-Meteo (100% free, no API key needed).
 */

export interface WeatherCondition {
  location: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  temperatureF: number;
  feelsLikeC: number;
  feelsLikeF: number;
  condition: string;
  weatherCode: number;
  relativeHumidity: number;
  windSpeedKmh: number;
  precipitationMm: number;
  forecastDaily: Array<{
    date: string;
    maxC: number;
    minC: number;
    condition: string;
  }>;
}

// WMO Weather interpretation codes
function describeWeatherCode(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky ☀️';
    case 1:
      return 'Mainly clear 🌤️';
    case 2:
      return 'Partly cloudy ⛅';
    case 3:
      return 'Overcast ☁️';
    case 45:
    case 48:
      return 'Foggy 🌫️';
    case 51:
    case 53:
    case 55:
      return 'Drizzle 🌦️';
    case 61:
    case 63:
    case 65:
      return 'Rain 🌧️';
    case 71:
    case 73:
    case 75:
      return 'Snow fall ❄️';
    case 77:
      return 'Snow grains 🌨️';
    case 80:
    case 81:
    case 82:
      return 'Rain showers 🌧️';
    case 85:
    case 86:
      return 'Snow showers 🌨️';
    case 95:
      return 'Thunderstorm ⛈️';
    case 96:
    case 99:
      return 'Thunderstorm with hail ⛈️🌨️';
    default:
      return 'Partly cloudy ⛅';
  }
}

export async function getWeatherInfo(params: {
  city?: string;
  latitude?: number;
  longitude?: number;
}): Promise<WeatherCondition> {
  let lat = params.latitude;
  let lon = params.longitude;
  let locationName = params.city || 'Local Location';

  // If city is specified, geocode city to lat/lon using Open-Meteo Geocoding
  if (params.city && (lat === undefined || lon === undefined)) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(params.city.trim())}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (Array.isArray(geoData.results) && geoData.results.length > 0) {
        const top = geoData.results[0];
        lat = top.latitude;
        lon = top.longitude;
        locationName = `${top.name}, ${top.admin1 || top.country || ''}`.replace(/,\s*$/, '');
      } else {
        throw new Error(`Could not find coordinates for city "${params.city}"`);
      }
    }
  }

  // Default to Tokyo if coordinates still missing
  if (lat === undefined || lon === undefined) {
    lat = 35.6762;
    lon = 139.6503;
    locationName = 'Tokyo, Japan';
  }

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(forecastUrl);
  if (!res.ok) {
    throw new Error(`Weather service error: ${res.statusText}`);
  }

  const data = await res.json();
  const current = data.current || {};
  const daily = data.daily || {};

  const tempC = Math.round(Number(current.temperature_2m || 0) * 10) / 10;
  const tempF = Math.round(((tempC * 9) / 5 + 32) * 10) / 10;
  const feelsC = Math.round(Number(current.apparent_temperature || tempC) * 10) / 10;
  const feelsF = Math.round(((feelsC * 9) / 5 + 32) * 10) / 10;
  const code = Number(current.weather_code || 0);

  const forecastDaily: WeatherCondition['forecastDaily'] = [];
  if (Array.isArray(daily.time)) {
    for (let i = 0; i < Math.min(daily.time.length, 3); i++) {
      const dCode = daily.weather_code?.[i] ?? 0;
      forecastDaily.push({
        date: daily.time[i],
        maxC: Math.round(Number(daily.temperature_2m_max?.[i] || 0) * 10) / 10,
        minC: Math.round(Number(daily.temperature_2m_min?.[i] || 0) * 10) / 10,
        condition: describeWeatherCode(dCode),
      });
    }
  }

  return {
    location: locationName,
    latitude: lat,
    longitude: lon,
    temperatureC: tempC,
    temperatureF: tempF,
    feelsLikeC: feelsC,
    feelsLikeF: feelsF,
    condition: describeWeatherCode(code),
    weatherCode: code,
    relativeHumidity: current.relative_humidity_2m || 0,
    windSpeedKmh: current.wind_speed_10m || 0,
    precipitationMm: current.precipitation || 0,
    forecastDaily,
  };
}
