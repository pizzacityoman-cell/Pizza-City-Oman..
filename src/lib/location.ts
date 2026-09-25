import { Branch, CustomerLocation } from "../types";
import { DEFAULT_DELIVERY_RADIUS_KM } from "../../shared/locationConstants.js";

export { DEFAULT_DELIVERY_RADIUS_KM };
export const CUSTOMER_LOCATION_STORAGE_KEY = "pizza_city_customer_location";

export interface BranchDistanceInfo {
  branch: Branch;
  distanceKm: number | null;
  eligible: boolean;
  reason?: string;
}

/**
 * Pure Haversine formula to compute great-circle distance between two points in kilometres.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return Infinity;
  }

  const R = 6371; // Earth's mean radius in kilometres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Extracts lat/lng from common Google Maps URLs, query parameters, or "lat, lng" strings.
 */
export function parseCoordinatesFromText(
  text: string
): { latitude: number; longitude: number } | null {
  if (!text || typeof text !== "string") return null;
  const clean = text.trim();

  // Pattern 1: Raw comma-separated "23.575302, 58.179791" or "23.575302,58.179791"
  const rawMatch = clean.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lon = parseFloat(rawMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }

  // Pattern 2: Google Maps @lat,lng e.g. /@23.5753021,58.179791,17z
  const atMatch = clean.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
  }

  // Pattern 3: Google Maps pb parameters !3d23.5752972!4d58.1823659
  const pbMatch = clean.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (pbMatch) {
    return { latitude: parseFloat(pbMatch[1]), longitude: parseFloat(pbMatch[2]) };
  }

  // Pattern 4: Query params like ?q=23.5753,58.1824 or &ll=23.5753,58.1824
  const queryMatch = clean.match(/[?&](?:q|ll|center)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (queryMatch) {
    return { latitude: parseFloat(queryMatch[1]), longitude: parseFloat(queryMatch[2]) };
  }

  return null;
}

/**
 * Resolves coordinates for a Branch record (explicit lat/lng, or parsed from map/geo).
 */
export function getBranchCoordinates(
  branch: Branch
): { latitude: number; longitude: number } | null {
  if (
    typeof branch.latitude === "number" &&
    Number.isFinite(branch.latitude) &&
    typeof branch.longitude === "number" &&
    Number.isFinite(branch.longitude)
  ) {
    return { latitude: branch.latitude, longitude: branch.longitude };
  }

  if (branch.map) {
    const parsed = parseCoordinatesFromText(branch.map);
    if (parsed) return parsed;
  }

  if (branch.geo) {
    const parsed = parseCoordinatesFromText(branch.geo);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Calculates distance in km from a customer location to a specific branch.
 */
export function getBranchDistance(
  customerLocation: CustomerLocation | null | undefined,
  branch: Branch
): number | null {
  if (!customerLocation) return null;
  const coords = getBranchCoordinates(branch);
  if (!coords) return null;
  return calculateDistanceKm(
    customerLocation.latitude,
    customerLocation.longitude,
    coords.latitude,
    coords.longitude
  );
}

/**
 * Checks eligibility of a branch for delivery to the customer location.
 */
export function isBranchEligible(
  customerLocation: CustomerLocation | null | undefined,
  branch: Branch
): { eligible: boolean; distanceKm: number | null; reason?: string } {
  if (branch.isActive === false) {
    return { eligible: false, distanceKm: null, reason: "Branch temporarily closed" };
  }

  if (branch.delivery === false) {
    return { eligible: false, distanceKm: null, reason: "Pick-up only (no delivery)" };
  }

  const coords = getBranchCoordinates(branch);
  if (!coords) {
    return { eligible: false, distanceKm: null, reason: "Location coordinates unavailable" };
  }

  if (!customerLocation) {
    return { eligible: false, distanceKm: null, reason: "Customer location required" };
  }

  const distanceKm = calculateDistanceKm(
    customerLocation.latitude,
    customerLocation.longitude,
    coords.latitude,
    coords.longitude
  );

  const maxRadius = branch.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM;

  if (distanceKm > maxRadius) {
    return {
      eligible: false,
      distanceKm,
      reason: `Outside delivery area (${distanceKm.toFixed(1)} km / max ${maxRadius} km)`,
    };
  }

  return { eligible: true, distanceKm };
}

/**
 * Returns distance and eligibility info for all branches against a customer location.
 */
export function getEligibleBranches(
  customerLocation: CustomerLocation | null | undefined,
  branches: Branch[]
): BranchDistanceInfo[] {
  return branches.map((branch) => {
    const { eligible, distanceKm, reason } = isBranchEligible(customerLocation, branch);
    return {
      branch,
      distanceKm,
      eligible,
      reason,
    };
  });
}

/**
 * Sorts branches by eligibility first, then by shortest distance.
 */
export function sortBranchesByDistance(
  customerLocation: CustomerLocation | null | undefined,
  branches: Branch[]
): BranchDistanceInfo[] {
  const evaluated = getEligibleBranches(customerLocation, branches);

  return evaluated.sort((a, b) => {
    // 1. Eligible branches come first
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;

    // 2. Sort by distance ascending
    if (a.distanceKm !== null && b.distanceKm !== null) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;

    return 0;
  });
}

/**
 * Resolves a manual address or Google Maps URL to coordinates.
 * 1. Checks if it's already a link/coordinates string.
 * 2. Queries Nominatim (OpenStreetMap) restricted to Oman (countrycodes=om).
 */
export async function resolveAddressToCoordinates(
  addressInput: string
): Promise<{ latitude: number; longitude: number; address: string }> {
  const input = addressInput.trim();
  if (!input) {
    throw new Error("Please enter an address or area name.");
  }

  // 1. Direct coordinate or maps link parsing
  const direct = parseCoordinatesFromText(input);
  if (direct) {
    return {
      latitude: direct.latitude,
      longitude: direct.longitude,
      address: `Coordinates (${direct.latitude.toFixed(4)}, ${direct.longitude.toFixed(4)})`,
    };
  }

  // 2. Server-side Nominatim Geocoding proxy
  const query = input.toLowerCase().includes("oman") ? input : `${input}, Oman`;
  const url = `/api/location/geocode?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Geocoding service returned status ${res.status}`);
    }

    if (data && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address || input,
      };
    }
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      throw new Error("Address resolution timed out. Please try again or use GPS.");
    }
    throw err;
  }

  throw new Error(
    `Could not locate "${input}" in Oman. Please try specifying the wilayat/area name (e.g. "Al Khoud, Muscat" or "Nizwa Souq") or use "Use My Location".`
  );
}
