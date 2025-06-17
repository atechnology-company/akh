// Qibla calculation module
// Based on calculations from https://www.muslimpro.com/qiblafinder

// Coordinates of Kaaba in Mecca
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

// Convert degrees to radians
const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Convert radians to degrees
const toDegrees = (radians: number): number => {
  return radians * (180 / Math.PI);
};

// Calculate Qibla direction in degrees from North
export const calculateQiblaDirection = (latitude: number, longitude: number): number => {
  // Convert all coordinates to radians
  const lat1 = toRadians(latitude);
  const lng1 = toRadians(longitude);
  const lat2 = toRadians(KAABA_LAT);
  const lng2 = toRadians(KAABA_LNG);
  
  // Calculate the difference in longitude
  const dLng = lng2 - lng1;
  
  // Calculate qibla direction using the correct spherical trigonometry formula
  // This is the forward azimuth from point 1 to point 2
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  // Get angle in radians, then convert to degrees
  let qibla = toDegrees(Math.atan2(y, x));
  
  // Normalize to 0-360 range (bearing from North clockwise)
  qibla = (qibla + 360) % 360;
  
  return qibla;
};

// Calculate distance to Kaaba in kilometers
export const calculateDistanceToKaaba = (latitude: number, longitude: number): number => {
  const R = 6371; // Radius of Earth in km
  
  const lat1 = toRadians(latitude);
  const lng1 = toRadians(longitude);
  const lat2 = toRadians(KAABA_LAT);
  const lng2 = toRadians(KAABA_LNG);
  
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  
  // Haversine formula
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1) * Math.cos(lat2) * 
           Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return Math.round(distance);
}; 