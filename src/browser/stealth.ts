/**
 * Stealth injection scripts for anti-detection
 * This script is injected into browser pages, not executed in Node.js
 */

/**
 * Get the comprehensive stealth injection script as a string
 * This is injected via addInitScript and runs in the browser context
 */
export function getStealthScript(): string {
  return `
    (function() {
      // Override webdriver property (most basic detection)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Canvas fingerprinting evasion - add noise to canvas rendering
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            if (Math.random() < 0.01) {
              imageData.data[i] += Math.random() < 0.5 ? 1 : -1;
              imageData.data[i + 1] += Math.random() < 0.5 ? 1 : -1;
              imageData.data[i + 2] += Math.random() < 0.5 ? 1 : -1;
            }
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, arguments);
      };

      // WebGL fingerprinting evasion - spoof vendor/renderer
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.apply(this, arguments);
      };

      // Audio fingerprinting evasion
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const originalCreateAnalyser = AudioContextClass.prototype.createAnalyser;
        AudioContextClass.prototype.createAnalyser = function() {
          const analyser = originalCreateAnalyser.apply(this);
          const originalGetFloatTimeDomainData = analyser.getFloatTimeDomainData;
          analyser.getFloatTimeDomainData = function(array) {
            originalGetFloatTimeDomainData.apply(this, [array]);
            for (let i = 0; i < array.length; i++) {
              array[i] += (Math.random() - 0.5) * 0.0001;
            }
          };
          return analyser;
        };
      }

      // Override plugins with realistic plugin data
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 0 },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 }
        ]
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });

      // Chrome runtime object
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      // Override connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          onchange: null
        })
      });

      // Hide automation indicators
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

      // Override getBattery
      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1.0
        });
      }

      // Override hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });

      // Override deviceMemory
      if ('deviceMemory' in navigator) {
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => 8
        });
      }

      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel'
      });

      // Override maxTouchPoints (0 for desktop)
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0
      });

      // Override vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });

      // Override appVersion
      Object.defineProperty(navigator, 'appVersion', {
        get: () => '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Override permissions API
      if (navigator.permissions && navigator.permissions.query) {
        const originalPermissionsQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (parameters) => {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          if (parameters.name === 'geolocation') {
            return Promise.resolve({ state: 'prompt' });
          }
          return originalPermissionsQuery(parameters);
        };
      }

      // Override mediaDevices.enumerateDevices
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        navigator.mediaDevices.enumerateDevices = function() {
          return originalEnumerateDevices().then((devices) =>
            devices.map((device) => ({
              ...device,
              label: device.label || (
                device.kind === 'audioinput' ? 'Default - Built-in Microphone' :
                device.kind === 'videoinput' ? 'FaceTime HD Camera' :
                'Default - Built-in Output'
              )
            }))
          );
        };
      }

      // Populate realistic localStorage
      try {
        const localStorageData = {
          theme: 'light',
          language: 'en-US',
          timezone: 'America/New_York',
          visited_sites: '[]',
          preferences: JSON.stringify({ notifications: false, darkMode: false }),
          analytics_id: Math.random().toString(36).substring(2, 15),
          session_id: Math.random().toString(36).substring(2, 15),
          last_visit: new Date().toISOString(),
          user_prefs: JSON.stringify({ fontSize: 'medium', colorScheme: 'light' })
        };

        for (const [key, value] of Object.entries(localStorageData)) {
          try {
            localStorage.setItem(key, value);
          } catch (e) {}
        }
      } catch (e) {}

      // Populate realistic sessionStorage
      try {
        const sessionStorageData = {
          session_start: new Date().toISOString(),
          page_views: '1',
          referrer: document.referrer || '',
          screen_resolution: screen.width + 'x' + screen.height
        };

        for (const [key, value] of Object.entries(sessionStorageData)) {
          try {
            sessionStorage.setItem(key, value);
          } catch (e) {}
        }
      } catch (e) {}
    })();
  `;
}
