/**
 * UCLA Region Evacuation Areas
 * Based on the UCLA Emergency Map (https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf)
 *
 * The campus is divided into numbered regions. Each region has a designated
 * evacuation assembly area for major emergencies or disasters.
 */

export interface EvacArea {
  areaId: string
  name: string
  lat: number
  lng: number
  region: number
  description: string
  capacity: number
  mapUrl: string
}

export const UCLA_EVAC_AREAS: EvacArea[] = [
  {
    areaId: 'region-1',
    name: 'Sculpture Garden / Anderson Complex',
    lat: 34.0751,
    lng: -118.4401,
    region: 1,
    description: 'Franklin D. Murphy Sculpture Garden near Anderson School of Management (North Campus)',
    capacity: 2000,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-2',
    name: 'Perloff / Schoenberg Plaza / Dickson Plaza',
    lat: 34.0728,
    lng: -118.4400,
    region: 2,
    description: 'Dickson Court area between Perloff Hall and Schoenberg Music Building (Central/East Campus)',
    capacity: 2500,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-3',
    name: 'Drake Stadium',
    lat: 34.0731,
    lng: -118.4486,
    region: 3,
    description: 'Drake Track & Field Stadium on the west side of campus near Sunset Blvd',
    capacity: 11700,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-4',
    name: 'Sunset Recreation Center',
    lat: 34.0760,
    lng: -118.4510,
    region: 4,
    description: 'Sunset Canyon Recreation Center on the northwest side of campus off De Neve Drive',
    capacity: 3000,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-5',
    name: 'Court of Sciences (Science Quad)',
    lat: 34.0689,
    lng: -118.4414,
    region: 5,
    description: 'Court of Sciences near Boelter Hall, Young Hall, and Geology Building (South Campus)',
    capacity: 2000,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-6',
    name: 'Mathias Botanical Garden',
    lat: 34.0667,
    lng: -118.4408,
    region: 6,
    description: 'Mildred E. Mathias Botanical Garden on the southeastern corner of campus near Tiverton Dr',
    capacity: 1500,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-7',
    name: 'Parking Lot 36',
    lat: 34.0589,
    lng: -118.4475,
    region: 7,
    description: 'UCLA Parking Lot 36 at Kinross Avenue between Gayley and Veteran Avenues (South/West)',
    capacity: 3000,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
  {
    areaId: 'region-8',
    name: 'Parking Lot 36 (Region 8)',
    lat: 34.0589,
    lng: -118.4475,
    region: 8,
    description: 'UCLA Parking Lot 36 — shared evacuation area for Regions 7 & 8 (Westwood Village area)',
    capacity: 3000,
    mapUrl: 'https://map.ucla.edu/downloads/pdf/UCLA_EmergencyMap.pdf',
  },
]

/**
 * Calculate haversine distance in meters between two points
 */
export function calcDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Returns all evacuation areas sorted by distance from user, with distance included.
 */
export function getEvacAreasByDistance(
  userLat: number,
  userLng: number
): (EvacArea & { distanceMeters: number })[] {
  return UCLA_EVAC_AREAS.map((area) => ({
    ...area,
    distanceMeters: calcDistanceMeters(userLat, userLng, area.lat, area.lng),
  })).sort((a, b) => a.distanceMeters - b.distanceMeters)
}
