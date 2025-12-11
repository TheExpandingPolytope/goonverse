import { stringToHex } from 'viem'

/**
 * Convert a string serverId to bytes32 format
 * 
 * If the serverId is already a hex string (starts with 0x), pad it to 32 bytes.
 * Otherwise, encode the string as UTF-8 and pad to 32 bytes.
 */
export function serverIdToBytes32(serverId: string): `0x${string}` {
  if (serverId.startsWith('0x')) {
    // Already hex - ensure it's 32 bytes (64 hex chars + 0x prefix)
    const hex = serverId.slice(2).padEnd(64, '0')
    return `0x${hex}` as `0x${string}`
  }
  // String - convert to hex
  return stringToHex(serverId, { size: 32 })
}
