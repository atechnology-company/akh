interface Location {
    latitude: number;
    longitude: number;
    altitude: number;
    timestamp: number;
}

// Check if we're running in NativeScript WebView
const isNative = typeof window !== 'undefined' && 'nsBridge' in window;

// Fallback implementation for browser testing
async function browserGetLocation(): Promise<Location> {
    return new Promise((resolve, reject) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        altitude: position.coords.altitude || 0,
                        timestamp: position.timestamp
                    });
                },
                (error) => {
                    reject(error.message);
                }
            );
        } else {
            reject('Geolocation not supported');
        }
    });
}

// Main API
export const NativeBridge = {
    getLocation: async (): Promise<Location> => {
        if (isNative) {
            // @ts-ignore - nsBridge is injected by NativeScript
            return window.nsBridge.getLocation();
        } else {
            // Use browser implementation for testing
            return browserGetLocation();
        }
    }
}; 