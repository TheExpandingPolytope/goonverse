import { Client } from 'colyseus.js'

let cachedClient: Client | null = null
let cachedEndpoint: string | null = null

/**
 * Get (and cache) a Colyseus client for the given endpoint.
 *
 * The endpoint should be a ws:// or wss:// URL derived from the HTTP origin.
 */
export const getGameClient = (endpoint: string): Client => {
  if (!cachedClient || cachedEndpoint !== endpoint) {
    cachedClient = new Client(endpoint)
    cachedEndpoint = endpoint
  }

  return cachedClient
}

