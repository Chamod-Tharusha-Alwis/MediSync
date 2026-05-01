import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

const GeographicMap = ({ hospitals = [], alerts = [] }) => {
  const center = [7.8731, 80.7718]; // Center of Sri Lanka
  const zoom = 7;

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-lg border border-slate-700/50">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0b1120' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        {/* Render Hospitals if location data is available */}
        {hospitals.map((hospital, index) => {
          if (hospital.location && hospital.location.coordinates) {
            return (
              <Marker key={`h-${index}`} position={[hospital.location.coordinates[1], hospital.location.coordinates[0]]}>
                <Popup>
                  <div className="text-slate-800">
                    <strong>{hospital.fullName}</strong><br/>
                    {hospital.district}
                  </div>
                </Popup>
              </Marker>
            );
          }
          return null;
        })}
      </MapContainer>
    </div>
  );
};

export default GeographicMap;
