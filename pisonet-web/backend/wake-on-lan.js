const dgram = require('dgram');

function normalizeMacAddress(rawMacAddress) {
  const normalized = String(rawMacAddress || '')
    .trim()
    .replace(/[-.]/g, ':')
    .replace(/:{2,}/g, ':')
    .toUpperCase();

  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function createMagicPacket(macAddress) {
  const normalizedMac = normalizeMacAddress(macAddress);
  if (!normalizedMac) {
    throw new Error('Invalid MAC address format');
  }

  const macBytes = normalizedMac.split(':').map((segment) => parseInt(segment, 16));
  const packet = Buffer.alloc(6 + (16 * macBytes.length), 0xff);

  for (let repeat = 0; repeat < 16; repeat += 1) {
    for (let index = 0; index < macBytes.length; index += 1) {
      packet[(repeat * macBytes.length) + index + 6] = macBytes[index];
    }
  }

  return packet;
}

function sendWakeOnLan(macAddress, options = {}) {
  const {
    address = '255.255.255.255',
    port = 9,
  } = options;

  const packet = createMagicPacket(macAddress);

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');

    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, port, address, (error) => {
        socket.close();
        if (error) {
          reject(error);
          return;
        }

        resolve({ address, port, macAddress: normalizeMacAddress(macAddress) });
      });
    });
  });
}

function persistWakeStatus(db, unitId, { status, message, attemptedAt = new Date().toISOString() }) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE units SET last_wake_status = ?, last_wake_message = ?, last_wake_at = ? WHERE id = ?',
      [status || null, message || null, attemptedAt, unitId],
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          unitId: Number(unitId),
          status: status || null,
          message: message || null,
          attemptedAt,
        });
      }
    );
  });
}

module.exports = {
  normalizeMacAddress,
  createMagicPacket,
  sendWakeOnLan,
  persistWakeStatus,
};