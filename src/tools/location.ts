/**
 * Built-in Location Tool
 * Uses browser Geolocation API with fast IP-based geographic lookup fallback.
 */

export interface LocationInfoResult {
  source: 'gps' | 'ip' | 'fallback';
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  accuracyMeters?: number;
  ip?: string;
  org?: string;
}

export async function getLocationInfo(useHighAccuracy = false): Promise<LocationInfoResult> {
  // 1. Try Browser Geolocation first if available in window/navigator
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    try {
      const gpsResult = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: useHighAccuracy,
            timeout: 6000,
            maximumAge: 60000,
          }
        );
      });

      const lat = gpsResult.coords.latitude;
      const lon = gpsResult.coords.longitude;
      const accuracy = gpsResult.coords.accuracy;

      // Try reverse geocoding to city name via BigDataCloud or Open-Meteo
      let resolvedCity = '';
      let resolvedCountry = '';
      try {
        const rev = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        if (rev.ok) {
          const revData = await rev.json();
          resolvedCity = revData.city || revData.locality || '';
          resolvedCountry = revData.countryName || '';
        }
      } catch {}

      return {
        source: 'gps',
        latitude: Math.round(lat * 10000) / 10000,
        longitude: Math.round(lon * 10000) / 10000,
        accuracyMeters: Math.round(accuracy),
        city: resolvedCity || 'Current GPS Location',
        country: resolvedCountry || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } catch {
      // User denied GPS or timed out, gracefully continue to IP lookup
    }
  }

  // 2. IP-based location lookup fallback
  try {
    const ipRes = await fetch('https://ipapi.co/json/');
    if (ipRes.ok) {
      const data = await ipRes.json();
      return {
        source: 'ip',
        city: data.city,
        region: data.region,
        country: data.country_name,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        ip: data.ip,
        org: data.org,
      };
    }
  } catch {
    // Continue to secondary IP service
  }

  try {
    const ipRes = await fetch('https://ip-api.com/json/');
    if (ipRes.ok) {
      const data = await ipRes.json();
      if (data.status === 'success') {
        return {
          source: 'ip',
          city: data.city,
          region: data.regionName,
          country: data.country,
          latitude: data.lat,
          longitude: data.lon,
          timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          ip: data.query,
          org: data.isp,
        };
      }
    }
  } catch {}

  // 3. Fallback based on browser locale and system timezone
  return {
    source: 'fallback',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    country: navigator.language || 'en',
    city: 'Local System',
  };
}
