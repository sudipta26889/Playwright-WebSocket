import os from 'os';

/**
 * Get the LAN IP address for the machine
 */
export function getLANIP(): string {
  const interfaces = os.networkInterfaces();

  // First pass: look for common LAN IP ranges
  for (const name of Object.keys(interfaces)) {
    const netInterfaces = interfaces[name];
    if (!netInterfaces) continue;

    for (const iface of netInterfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (
          iface.address.startsWith('192.168.') ||
          iface.address.startsWith('10.') ||
          iface.address.startsWith('172.')
        ) {
          return iface.address;
        }
      }
    }
  }

  // Second pass: return any non-loopback IPv4
  for (const name of Object.keys(interfaces)) {
    const netInterfaces = interfaces[name];
    if (!netInterfaces) continue;

    for (const iface of netInterfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return '127.0.0.1';
}
