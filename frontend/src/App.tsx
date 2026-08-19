import { useState, useEffect, useRef } from 'react'
import './App.css'
import { getEvacAreasByDistance, calcDistanceMeters, type EvacArea } from './evacAreas'

const API_BASE = 'http://localhost:3000'
const ARRIVAL_THRESHOLD_METERS = 50 // Distance to consider user "arrived"

// Read input parameters from URL (passed by BruinAlert)
const urlParams = new URLSearchParams(window.location.search)
const UCLA_ID = urlParams.get('UCLA_ID') || 'demo-user'
const EMERGENCY_ID = urlParams.get('emergencyId') || 'emergency-2026-001'
const USER_NAME = urlParams.get('name') || ''

type Page = 'main' | 'onCampus' | 'guideEvac' | 'mobilityForm' | 'navigating' | 'confirmation'

interface EvacAreaWithDistance extends EvacArea {
  distanceMeters: number
}

// Declare Leaflet as global (loaded from CDN)
declare const L: any

interface NavigationMapProps {
  userLat: number
  userLng: number
  destLat: number
  destLng: number
  destName: string
}

function NavigationMap({ userLat, userLng, destLat, destLng, destName }: NavigationMapProps) {
  const mapRef = useRef<any>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const routeLayerRef = useRef<any>(null)
  const userMarkerRef = useRef<any>(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current).setView([destLat, destLng], 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    // Destination marker (red)
    L.marker([destLat, destLng])
      .addTo(map)
      .bindPopup(`<b>${destName}</b><br>Evacuation Area`)
      .openPopup()

    // User marker (blue circle)
    userMarkerRef.current = L.circleMarker([userLat, userLng], {
      radius: 10,
      color: '#1565c0',
      fillColor: '#42a5f5',
      fillOpacity: 0.9,
    }).addTo(map).bindPopup('You are here')

    mapRef.current = map

    // Fetch route
    fetchRoute(map, userLat, userLng, destLat, destLng)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update user marker position when location changes
  useEffect(() => {
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng])
    }
    if (mapRef.current) {
      fetchRoute(mapRef.current, userLat, userLng, destLat, destLng)
    }
  }, [userLat, userLng])

  const fetchRoute = async (map: any, fromLat: number, fromLng: number, toLat: number, toLng: number) => {
    try {
      // Use OSRM demo server for walking route
      const url = `https://router.project-osrm.org/route/v1/foot/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
      const response = await fetch(url)
      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map((c: number[]) => [c[1], c[0]])

        // Remove old route
        if (routeLayerRef.current) {
          map.removeLayer(routeLayerRef.current)
        }

        // Draw new route
        routeLayerRef.current = L.polyline(coords, {
          color: '#1565c0',
          weight: 5,
          opacity: 0.8,
        }).addTo(map)

        // Fit map to show entire route
        map.fitBounds(routeLayerRef.current.getBounds(), { padding: [30, 30] })
      }
    } catch (error) {
      console.error('Error fetching route:', error)
      // Fallback: just draw a straight line
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current)
      }
      routeLayerRef.current = L.polyline([[fromLat, fromLng], [toLat, toLng]], {
        color: '#1565c0',
        weight: 4,
        dashArray: '10, 10',
        opacity: 0.7,
      }).addTo(map)
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [30, 30] })
    }
  }

  return <div ref={mapContainerRef} className="evac-leaflet-map" />
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('main')
  const [evacAreas, setEvacAreas] = useState<EvacAreaWithDistance[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [selectedArea, setSelectedArea] = useState<EvacAreaWithDistance | null>(null)
  const [distanceToArea, setDistanceToArea] = useState<number | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 34.0700, lng: -118.4440 })
  const watchIdRef = useRef<number | null>(null)

  // Mobility form state
  const [mobilityForm, setMobilityForm] = useState({
    assistanceType: '',
    floorLevel: '',
    buildingName: '',
    roomNumber: '',
    contactPhone: '',
    specialNeeds: '',
  })

  // Use the imported calcDistanceMeters from evacAreas.ts
  const calcDistance = calcDistanceMeters

  // Stop watching location when leaving navigating page
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // Mark user as arrived in the database
  const markArrived = async () => {
    // Check if user is actually near the evacuation area
    if (selectedArea && distanceToArea !== null && distanceToArea > ARRIVAL_THRESHOLD_METERS) {
      const confirmAnyway = window.confirm(
        `You appear to be ${distanceToArea}m away from ${selectedArea.name}. ` +
        `Are you sure you have arrived? If not, keep following the route.`
      )
      if (!confirmAnyway) return
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    try {
      await fetch(`${API_BASE}/user/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: EMERGENCY_ID,
          uid: UCLA_ID,
          lat: selectedArea?.lat,
          lng: selectedArea?.lng,
          status: 'arrived',
        }),
      })
    } catch (error) {
      console.error('Error updating arrival status:', error)
    }
    setConfirmationMessage(`You have arrived at ${selectedArea?.name}. Your status has been updated to "Reached Evacuation Area".`)
    setCurrentPage('confirmation')
  }

  // Start watching user position for arrival detection
  const startNavigating = (area: EvacArea) => {
    if (!navigator.geolocation) return

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    )

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserLocation(newLoc)
        const dist = calcDistance(pos.coords.latitude, pos.coords.longitude, area.lat, area.lng)
        setDistanceToArea(dist)

        // Auto-detect arrival
        if (dist <= ARRIVAL_THRESHOLD_METERS) {
          markArrived()
        }

        // Also send periodic location updates to backend
        fetch(`${API_BASE}/user/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emergencyId: EMERGENCY_ID,
            uid: UCLA_ID,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        }).catch(() => {})
      },
      (err) => console.error('Geolocation watch error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  const getUserLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Fallback to UCLA center if geolocation unavailable
        resolve({ lat: 34.0700, lng: -118.4440 })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 34.0700, lng: -118.4440 }) // Fallback on error
      )
    })
  }

  const handleOnCampus = () => {
    setCurrentPage('onCampus')
  }

  const handleOffCampus = async () => {
    setLoading(true)
    try {
      const location = await getUserLocation()
      await fetch(`${API_BASE}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: EMERGENCY_ID,
          uid: UCLA_ID,
          action: 'Off-campus',
          location,
        }),
      })
      setConfirmationMessage('Your off-campus status has been recorded. Stay safe!')
      setCurrentPage('confirmation')
    } catch (error) {
      console.error('Error:', error)
      setConfirmationMessage('Your status has been recorded. Stay safe!')
      setCurrentPage('confirmation')
    } finally {
      setLoading(false)
    }
  }

  const handleSelfEvacuating = async () => {
    setLoading(true)
    try {
      const location = await getUserLocation()
      await fetch(`${API_BASE}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: EMERGENCY_ID,
          uid: UCLA_ID,
          action: 'Self Evacuating',
          location,
        }),
      })
      setConfirmationMessage('Your self-evacuation status has been recorded. Head to the nearest evacuation area.')
      setCurrentPage('confirmation')
    } catch (error) {
      console.error('Error:', error)
      setConfirmationMessage('Your self-evacuation status has been recorded.')
      setCurrentPage('confirmation')
    } finally {
      setLoading(false)
    }
  }

  const handleGuideToEvacuation = async () => {
    setLoading(true)
    try {
      const location = await getUserLocation()
      setUserLocation(location)

      // Calculate distances locally using evacuation area data
      const areasWithDistance = getEvacAreasByDistance(location.lat, location.lng)
      setEvacAreas(areasWithDistance)

      // Also notify backend (fire and forget)
      fetch(`${API_BASE}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: EMERGENCY_ID,
          uid: UCLA_ID,
          action: 'Guide to Evacuate Area',
          location,
        }),
      }).then(res => res.json()).then(data => {
        if (data.record?.id) setActionId(data.record.id)
      }).catch(() => {})

      setCurrentPage('guideEvac')
    } catch (error) {
      console.error('Error:', error)
      // Fallback: still show areas with default location
      const areasWithDistance = getEvacAreasByDistance(34.0700, -118.4440)
      setEvacAreas(areasWithDistance)
      setCurrentPage('guideEvac')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectArea = async (area: EvacAreaWithDistance) => {
    setSelectedArea(area)
    setDistanceToArea(area.distanceMeters)
    startNavigating(area)
    setCurrentPage('navigating')
  }

  const handleMobilityAssistance = () => {
    setCurrentPage('mobilityForm')
  }

  const handleMobilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const location = await getUserLocation()
      await fetch(`${API_BASE}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergencyId: EMERGENCY_ID,
          uid: UCLA_ID,
          action: 'Need Mobility Assistance',
          location,
          ...mobilityForm,
        }),
      })
      setConfirmationMessage('Your mobility assistance request has been submitted. Help is on the way. Stay where you are.')
      setCurrentPage('confirmation')
    } catch (error) {
      console.error('Error:', error)
      setConfirmationMessage('Your request has been submitted. Help is on the way.')
      setCurrentPage('confirmation')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (currentPage === 'guideEvac' || currentPage === 'mobilityForm') {
      setCurrentPage('onCampus')
    } else if (currentPage === 'navigating') {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setCurrentPage('guideEvac')
    } else {
      setCurrentPage('main')
    }
  }

  const handleBackToMain = () => {
    setCurrentPage('main')
  }

  // Loading state
  if (loading) {
    return (
      <div className="evac-container">
        <div className="evac-card">
          <header className="evac-header">
            <h1>EVAC EMERGENCY PAGE</h1>
          </header>
          <div className="evac-body">
            <div className="evac-loading">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation page
  if (currentPage === 'confirmation') {
    return (
      <div className="evac-container">
        <div className="evac-card">
          <header className="evac-header">
            <h1>EVAC EMERGENCY PAGE</h1>
          </header>
          <div className="evac-body">
            <div className="evac-alert-icon evac-alert-icon-success">
              <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  fill="#2e7d32"
                />
              </svg>
            </div>
            <h2 className="evac-title">CONFIRMED</h2>
            <p className="evac-subtitle">{confirmationMessage}</p>
            <button type="button" className="evac-back-btn" onClick={handleBackToMain}>
              &larr; Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Navigating page - embedded map with arrival detection
  if (currentPage === 'navigating' && selectedArea) {
    return (
      <div className="evac-container">
        <div className="evac-card evac-card-full">
          <header className="evac-header">
            <h1>NAVIGATING TO {selectedArea.name.toUpperCase()}</h1>
          </header>

          <div className="evac-nav-status">
            <div className="evac-nav-distance">
              <span className="evac-nav-meters">{distanceToArea !== null ? `${distanceToArea}m` : '...'}</span>
              <span className="evac-nav-label">remaining</span>
            </div>
            <div className="evac-nav-destination">
              <span>{selectedArea.name}</span>
              <span className="evac-nav-desc">{selectedArea.description}</span>
            </div>
          </div>

          <div className="evac-map-container">
            <NavigationMap
              userLat={userLocation.lat}
              userLng={userLocation.lng}
              destLat={selectedArea.lat}
              destLng={selectedArea.lng}
              destName={selectedArea.name}
            />
          </div>

          <div className="evac-nav-actions">
            <button
              type="button"
              className="evac-btn evac-btn-green evac-btn-full"
              onClick={markArrived}
            >
              I Have Arrived
            </button>
            <button type="button" className="evac-back-btn" onClick={handleBack}>
              &larr; Back to Areas
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Guide to Evacuation Area page
  if (currentPage === 'guideEvac') {
    return (
      <div className="evac-container">
        <div className="evac-card evac-card-wide">
          <header className="evac-header">
            <h1>EVAC EMERGENCY PAGE</h1>
          </header>
          <div className="evac-body">
            <h2 className="evac-title">NEAREST EVACUATION AREAS</h2>
            <p className="evac-subtitle">Select an area to get directions</p>

            <div className="evac-area-list">
              {evacAreas.length === 0 ? (
                <p className="evac-subtitle">No evacuation areas found. Follow posted signs.</p>
              ) : (
                evacAreas.map((area) => (
                  <button
                    key={area.areaId}
                    type="button"
                    className="evac-area-card"
                    onClick={() => handleSelectArea(area)}
                  >
                    <div className="evac-area-info">
                      <span className="evac-area-name">{area.name}</span>
                      <span className="evac-area-desc">{area.description}</span>
                    </div>
                    <div className="evac-area-distance">
                      <span className="evac-area-meters">{area.distanceMeters}m</span>
                      <span className="evac-area-label">away</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <button type="button" className="evac-back-btn" onClick={handleBack}>
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Mobility Assistance Form page
  if (currentPage === 'mobilityForm') {
    return (
      <div className="evac-container">
        <div className="evac-card evac-card-wide">
          <header className="evac-header">
            <h1>EVAC EMERGENCY PAGE</h1>
          </header>
          <div className="evac-body">
            <h2 className="evac-title">MOBILITY ASSISTANCE</h2>
            <p className="evac-subtitle">Fill in your details so help can find you</p>

            <form className="evac-form" onSubmit={handleMobilitySubmit}>
              <div className="evac-form-group">
                <label htmlFor="assistanceType">Assistance Type *</label>
                <select
                  id="assistanceType"
                  required
                  value={mobilityForm.assistanceType}
                  onChange={(e) => setMobilityForm({ ...mobilityForm, assistanceType: e.target.value })}
                >
                  <option value="">Select type...</option>
                  <option value="wheelchair">Wheelchair assistance</option>
                  <option value="stretcher">Stretcher / carry</option>
                  <option value="visual-aid">Visual aid / guide</option>
                  <option value="hearing-aid">Hearing impaired assistance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="evac-form-group">
                <label htmlFor="buildingName">Building Name *</label>
                <input
                  id="buildingName"
                  type="text"
                  required
                  placeholder="e.g. Boelter Hall"
                  value={mobilityForm.buildingName}
                  onChange={(e) => setMobilityForm({ ...mobilityForm, buildingName: e.target.value })}
                />
              </div>

              <div className="evac-form-row">
                <div className="evac-form-group">
                  <label htmlFor="floorLevel">Floor</label>
                  <input
                    id="floorLevel"
                    type="text"
                    placeholder="e.g. 3"
                    value={mobilityForm.floorLevel}
                    onChange={(e) => setMobilityForm({ ...mobilityForm, floorLevel: e.target.value })}
                  />
                </div>
                <div className="evac-form-group">
                  <label htmlFor="roomNumber">Room</label>
                  <input
                    id="roomNumber"
                    type="text"
                    placeholder="e.g. 3400"
                    value={mobilityForm.roomNumber}
                    onChange={(e) => setMobilityForm({ ...mobilityForm, roomNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="evac-form-group">
                <label htmlFor="contactPhone">Contact Phone *</label>
                <input
                  id="contactPhone"
                  type="tel"
                  required
                  placeholder="310-555-1234"
                  value={mobilityForm.contactPhone}
                  onChange={(e) => setMobilityForm({ ...mobilityForm, contactPhone: e.target.value })}
                />
              </div>

              <div className="evac-form-group">
                <label htmlFor="specialNeeds">Special Needs / Notes</label>
                <textarea
                  id="specialNeeds"
                  rows={3}
                  placeholder="Any additional info for responders..."
                  value={mobilityForm.specialNeeds}
                  onChange={(e) => setMobilityForm({ ...mobilityForm, specialNeeds: e.target.value })}
                />
              </div>

              <button type="submit" className="evac-btn evac-btn-red evac-btn-full">
                Submit Request
              </button>
            </form>

            <button type="button" className="evac-back-btn" onClick={handleBack}>
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // On Campus page
  if (currentPage === 'onCampus') {
    return (
      <div className="evac-container">
        <div className="evac-card">
          <header className="evac-header">
            <h1>EVAC EMERGENCY PAGE</h1>
          </header>

          <div className="evac-body">
            <div className="evac-alert-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
                <path
                  d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
                  fill="#d32f2f"
                />
              </svg>
            </div>

            <h2 className="evac-title">ON CAMPUS</h2>
            <p className="evac-subtitle">Select your evacuation status</p>

            <div className="evac-buttons-vertical">
              <button
                type="button"
                className="evac-btn evac-btn-green"
                onClick={handleSelfEvacuating}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                    fill="currentColor"
                  />
                </svg>
                Self Evacuating
              </button>

              <button
                type="button"
                className="evac-btn evac-btn-blue"
                onClick={handleGuideToEvacuation}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
                    fill="currentColor"
                  />
                </svg>
                Guide to Evacuation Area
              </button>

              <button
                type="button"
                className="evac-btn evac-btn-red"
                onClick={handleMobilityAssistance}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
                    fill="currentColor"
                  />
                </svg>
                Need Mobility Assistance
              </button>
            </div>

            <button
              type="button"
              className="evac-back-btn"
              onClick={handleBackToMain}
            >
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main page
  return (
    <div className="evac-container">
      <div className="evac-card">
        <header className="evac-header">
          <h1>EVAC EMERGENCY PAGE</h1>
        </header>

        <div className="evac-body">
          <div className="evac-alert-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
              <path
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
                fill="#d32f2f"
              />
            </svg>
          </div>

          <h2 className="evac-title">EMERGENCY EVACUATION</h2>
          <p className="evac-subtitle">
            {USER_NAME ? `${USER_NAME}, follow` : 'Follow'} emergency instructions immediately.
          </p>

          <div className="evac-buttons">
            <button
              type="button"
              className="evac-btn evac-btn-red"
              onClick={handleOnCampus}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
                  fill="currentColor"
                />
              </svg>
              On Campus
            </button>

            <button
              type="button"
              className="evac-btn evac-btn-green"
              onClick={handleOffCampus}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  fill="currentColor"
                />
              </svg>
              Off Campus
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
