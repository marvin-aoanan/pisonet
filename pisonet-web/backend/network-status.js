const { execFile } = require('child_process');

const PING_TIMEOUT_MS = parseInt(process.env.UNIT_PING_TIMEOUT_MS || '1000', 10);
const PING_CACHE_MS = parseInt(process.env.UNIT_PING_CACHE_MS || '5000', 10);
const pingCache = new Map();

function normalizeIpv4Address(rawIpAddress) {
  const trimmed = String(rawIpAddress || '').trim();
  if (!trimmed) {
    return null;
  }

  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  return ipv4Pattern.test(trimmed) ? trimmed : null;
}

function buildPingArgs(ipAddress) {
  if (process.platform === 'win32') {
    return ['-n', '1', '-w', String(Math.max(1, PING_TIMEOUT_MS)), ipAddress];
  }

  return ['-n', '-c', '1', '-W', String(Math.max(1, Math.ceil(PING_TIMEOUT_MS / 1000))), ipAddress];
}

function pingHost(ipAddress) {
  const checkedAt = new Date().toISOString();

  return new Promise((resolve) => {
    execFile(
      'ping',
      buildPingArgs(ipAddress),
      {
        windowsHide: true,
        timeout: Math.max(1000, PING_TIMEOUT_MS + 500),
      },
      (error, stdout = '', stderr = '') => {
        const output = `${stdout}\n${stderr}`;
        const reachable = !error || /ttl=|bytes from|reply from|1 received|0% packet loss/i.test(output);

        resolve({
          reachable,
          checkedAt,
          error: error ? error.message : null,
        });
      }
    );
  });
}

function pingHostCached(ipAddress) {
  const normalizedIpAddress = normalizeIpv4Address(ipAddress);
  if (!normalizedIpAddress) {
    return Promise.resolve({
      reachable: false,
      checkedAt: null,
      error: 'Missing or invalid IPv4 address',
    });
  }

  const now = Date.now();
  const cached = pingCache.get(normalizedIpAddress);
  if (cached && cached.result && cached.expiresAt > now) {
    return Promise.resolve(cached.result);
  }

  if (cached && cached.inFlight) {
    return cached.inFlight;
  }

  const inFlight = pingHost(normalizedIpAddress)
    .then((result) => {
      pingCache.set(normalizedIpAddress, {
        result,
        expiresAt: Date.now() + Math.max(1000, PING_CACHE_MS),
      });
      return result;
    })
    .catch((error) => {
      const result = {
        reachable: false,
        checkedAt: new Date().toISOString(),
        error: error.message,
      };
      pingCache.set(normalizedIpAddress, {
        result,
        expiresAt: Date.now() + Math.max(1000, PING_CACHE_MS),
      });
      return result;
    });

  pingCache.set(normalizedIpAddress, {
    inFlight,
    expiresAt: now + Math.max(1000, PING_CACHE_MS),
  });

  return inFlight;
}

async function getUnitOnlineState({ unitId, ipAddress, websocketConnected = false }) {
  const normalizedIpAddress = normalizeIpv4Address(ipAddress);

  if (websocketConnected) {
    return {
      unit_id: Number(unitId) || null,
      is_online: true,
      online_source: 'websocket',
      ping_status: normalizedIpAddress ? 'skipped' : 'missing_ip',
      ping_checked_at: null,
      ip_address: normalizedIpAddress,
    };
  }

  if (!normalizedIpAddress) {
    return {
      unit_id: Number(unitId) || null,
      is_online: false,
      online_source: 'offline',
      ping_status: 'missing_ip',
      ping_checked_at: null,
      ip_address: null,
    };
  }

  const pingResult = await pingHostCached(normalizedIpAddress);
  return {
    unit_id: Number(unitId) || null,
    is_online: pingResult.reachable,
    online_source: pingResult.reachable ? 'ping' : 'offline',
    ping_status: pingResult.reachable ? 'reachable' : 'unreachable',
    ping_checked_at: pingResult.checkedAt,
    ping_error: pingResult.error || null,
    ip_address: normalizedIpAddress,
  };
}

module.exports = {
  normalizeIpv4Address,
  pingHostCached,
  getUnitOnlineState,
};