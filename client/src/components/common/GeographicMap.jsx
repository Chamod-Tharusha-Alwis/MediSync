import React, { useState, useEffect } from 'react';
import { MapContainer, GeoJSON, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

// Center coordinates for Sri Lankan districts
const districtCoordinates = {
  'Colombo': [6.9271, 79.8612],
  'Gampaha': [7.0873, 79.9928],
  'Kalutara': [6.5815, 80.0406],
  'Kandy': [7.2906, 80.6337],
  'Matale': [7.4675, 80.6234],
  'Nuwara Eliya': [6.9497, 80.7839],
  'Galle': [6.0535, 80.2210],
  'Matara': [5.9549, 80.5550],
  'Hambantota': [6.1248, 81.1185],
  'Jaffna': [9.6615, 80.0255],
  'Kilinochchi': [9.3803, 80.3770],
  'Mannar': [8.9810, 79.9044],
  'Vavuniya': [8.7542, 80.4982],
  'Mullaitivu': [9.2671, 80.8142],
  'Batticaloa': [7.7102, 81.6924],
  'Ampara': [7.2840, 81.6724],
  'Trincomalee': [8.5874, 81.2152],
  'Kurunegala': [7.4863, 80.3647],
  'Puttalam': [8.0362, 79.8283],
  'Anuradhapura': [8.3114, 80.4037],
  'Polonnaruwa': [7.9403, 81.0188],
  'Badulla': [6.9934, 81.0550],
  'Monaragala': [6.8728, 81.3507],
  'Ratnapura': [6.7056, 80.3847],
  'Kegalle': [7.2513, 80.3466],
  'Nationwide': [7.8731, 80.7718]
};

const getSeverityColor = (severity) => {
  const norm = String(severity || '').toLowerCase();
  switch (norm) {
    case 'critical':
      return { color: '#ef4444', fillColor: '#ef4444' }; // Red
    case 'high':
      return { color: '#f97316', fillColor: '#f97316' }; // Orange
    case 'moderate':
    case 'medium':
      return { color: '#f59e0b', fillColor: '#f59e0b' }; // Amber
    case 'low':
      return { color: '#3b82f6', fillColor: '#3b82f6' }; // Blue
    default:
      return { color: '#ef4444', fillColor: '#ef4444' };
  }
};

const GeographicMap = ({ hospitals = [], alerts = [] }) => {
  const [geography, setGeography] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/lk_districts.json', { signal: controller.signal, credentials: 'omit' })
      .then(response => { if (!response.ok) throw Error('MAP_UNAVAILABLE'); return response.json(); })
      .then(value => { if (!controller.signal.aborted) setGeography(value); })
      .catch(() => { /* Keep markers and neutral background; never use a third-party fallback. */ });
    return () => controller.abort();
  }, []);
  const center = [7.8731, 80.7718]; // Center of Sri Lanka
  const zoom = 7;

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg border border-slate-700/50 relative bg-[#0b1120]">
      {alerts.some(a => a.isSimulation || a.isSyntheticUniversityData || a.scenarioId) && (
        <div className="absolute top-2 left-2 right-2 z-[1000] bg-amber-500/90 backdrop-blur-md text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between shadow-lg border border-amber-400">
          <span>⚠️ SIMULATION MODE: Displaying synthetic outbreak scenarios.</span>
          <span className="text-[10px] uppercase tracking-wider font-extrabold bg-slate-950 text-amber-400 px-2 py-0.5 rounded">NOT OFFICIAL PUBLIC DATA</span>
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', backgroundColor: '#0b1120' }}
        zoomControl={false}
      >
        {geography && <GeoJSON data={geography} style={{ color: '#334155', weight: 1, fillColor: '#1e293b', fillOpacity: 0.5 }} />}

        {/* Render Hospitals as standard markers */}
        {hospitals.map((hospital, index) => {
          if (hospital.location && hospital.location.coordinates) {
            return (
              <Marker key={`h-${index}`} position={[hospital.location.coordinates[1], hospital.location.coordinates[0]]}>
                <Popup>
                  <div className="text-slate-800 font-sans">
                    <strong>{hospital.fullName || hospital.name}</strong><br/>
                    <span className="text-xs text-slate-500">{hospital.district}</span>
                  </div>
                </Popup>
              </Marker>
            );
          }
          return null;
        })}

        {/* Render ML Outbreak Alerts as Heatmap Zones */}
        {alerts.filter(a => a.status === 'Active' || a.status === 'SIMULATION').map((alert, index) => {
          const districtName = alert.location || alert.district || 'Nationwide';
          const coords = districtCoordinates[districtName] || districtCoordinates['Nationwide'];
          const colors = getSeverityColor(alert.severity);
          const isCrit = String(alert.severity).toLowerCase() === 'critical';
          const isHigh = String(alert.severity).toLowerCase() === 'high';

          return (
            <CircleMarker
              key={`alert-${alert._id || alert.scenarioId || index}`}
              center={[coords[0], coords[1]]}
              radius={isCrit ? 26 : isHigh ? 20 : 15}
              pathOptions={{
                color: colors.color,
                fillColor: colors.fillColor,
                fillOpacity: 0.45,
                weight: 2,
                className: (isCrit || isHigh) ? 'animate-pulse' : ''
              }}
            >
              <Popup>
                <div className="text-slate-900 font-sans min-w-[190px] p-1">
                  <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-slate-200 pb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.color }}></div>
                      <strong className="text-xs uppercase tracking-wider text-slate-800">
                        {alert.severity} SEVERITY
                      </strong>
                    </div>
                    {alert.dangerLevel && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        Danger: {alert.dangerLevel}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {alert.disease}
                  </h3>

                  <p className="text-xs text-slate-600 mb-2 border-b border-slate-200 pb-1.5">
                    {districtName} District
                  </p>

                  <div className="space-y-1 text-xs">
                    {alert.dangerLevel && (
                      <p className="text-slate-600">
                        Pathogen Danger: <span className="font-semibold text-slate-800">{alert.dangerLevel}</span>
                      </p>
                    )}
                    <p className="font-medium text-slate-700">
                      Reported Cases: <span className="text-rose-600 font-bold">{alert.affectedCount || alert.currentCases || 'N/A'}</span>
                    </p>
                    {alert.baseline && (
                      <p className="text-slate-500">
                        Expected Baseline: <span className="font-medium">{alert.baseline}</span>
                      </p>
                    )}
                  </div>

                  {(alert.isSimulation || alert.isSyntheticUniversityData || alert.scenarioId) && (
                    <div className="mt-2.5 pt-2 border-t-2 border-dashed border-amber-300 bg-amber-50 -mx-1 -mb-1 p-1.5 rounded-b">
                      <span className="text-[10px] font-black text-amber-900 tracking-wide uppercase block text-center">
                        ⚠️ SIMULATION SCENARIO — DEMO ONLY
                      </span>
                      <span className="text-[9px] text-amber-800 block text-center leading-tight">
                        Synthetic testing data (not official public health data).
                      </span>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default GeographicMap;
