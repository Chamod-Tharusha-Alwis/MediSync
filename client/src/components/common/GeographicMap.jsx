import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

// Approximate center coordinates for Sri Lankan districts
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
  'Nationwide': [7.8731, 80.7718] // Center of SL fallback
};

const getSeverityColor = (severity) => {
  switch (severity) {
    case 'Critical': return { color: '#ef4444', fillColor: '#ef4444' }; // Red
    case 'High': return { color: '#f97316', fillColor: '#f97316' }; // Orange
    case 'Moderate': return { color: '#f59e0b', fillColor: '#f59e0b' }; // Amber
    case 'Low': return { color: '#3b82f6', fillColor: '#3b82f6' }; // Blue
    default: return { color: '#ef4444', fillColor: '#ef4444' };
  }
};

const GeographicMap = ({ hospitals = [], alerts = [] }) => {
  const center = [7.8731, 80.7718]; // Center of Sri Lanka
  const zoom = 7;

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg border border-slate-700/50 relative">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0b1120' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
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
        {alerts.filter(a => a.status === 'Active').map((alert, index) => {
          const districtName = alert.location || alert.district;
          const coords = districtCoordinates[districtName] || districtCoordinates['Nationwide'];
          const colors = getSeverityColor(alert.severity);
          
          // Add some randomness to overlapping nationwide alerts so they don't perfectly stack
          const latOffset = districtName === 'Nationwide' ? (Math.random() - 0.5) * 0.5 : 0;
          const lngOffset = districtName === 'Nationwide' ? (Math.random() - 0.5) * 0.5 : 0;

          return (
            <CircleMarker
              key={`alert-${alert._id || index}`}
              center={[coords[0] + latOffset, coords[1] + lngOffset]}
              radius={alert.severity === 'Critical' ? 25 : alert.severity === 'High' ? 20 : 15}
              pathOptions={{
                color: colors.color,
                fillColor: colors.fillColor,
                fillOpacity: 0.4,
                weight: 2,
                className: alert.severity === 'Critical' || alert.severity === 'High' ? 'animate-pulse' : ''
              }}
            >
              <Popup>
                <div className="text-slate-800 font-sans min-w-[150px]">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.color }}></div>
                    <strong className="text-sm uppercase tracking-wide">{alert.severity} RISK</strong>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{alert.disease}</h3>
                  <p className="text-sm text-slate-600 mb-2 border-b border-slate-200 pb-2">
                    {districtName} District
                  </p>
                  <p className="text-xs font-semibold text-slate-700">
                    Affected: <span className="text-red-600">{alert.affectedCount || 'Multiple'} cases</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1 capitalize">
                    Status: {alert.feedbackStatus?.replace('_', ' ') || 'Unverified'}
                  </p>
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
