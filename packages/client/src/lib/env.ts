type EnvValue = string | undefined

const resolve = (value: EnvValue, fallback: string) =>
  value && value.length > 0 ? value : fallback

const requireEnv = (value: EnvValue, name: string): string => {
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Eagerly import all Ignition deployment address files so we can map by chain id
// Note: this is optional. In Railway subdirectory builds, the `contract/` folder may not exist.
const deploymentFiles = import.meta.glob(
  '../../contract/ignition/deployments/**/deployed_addresses.json',
  { eager: true, import: 'default' }
) as Record<string, Record<string, string>>

const buildAddressBook = (): Record<number, Record<string, string>> => {
  const map: Record<number, Record<string, string>> = {}
  for (const [path, addresses] of Object.entries(deploymentFiles)) {
    const match = path.match(/chain-(\d+)\/deployed_addresses\.json$/)
    if (!match) continue
    const id = Number(match[1])
    map[id] = addresses as Record<string, string>
  }
  return map
}

const ADDRESS_BOOK = buildAddressBook()

const chainId = parseInt(requireEnv(import.meta.env.VITE_CHAIN_ID, 'VITE_CHAIN_ID'), 10)

const resolveContractAddress = (contractName: string): string => {
  const addresses = ADDRESS_BOOK[chainId]
  if (!addresses) {
    throw new Error(
      `No Ignition deployment addresses found for chainId ${chainId}. ` +
        `Set VITE_WORLD_CONTRACT_ADDRESS in your environment, or include contract ignition deployment files in the build context.`
    )
  }

  // Exact match
  if (addresses[contractName]) {
    return addresses[contractName]
  }

  // Suffix match (e.g., "World" matches "World#World")
  const suffixMatch = Object.entries(addresses).find(([key]) => key.endsWith(`#${contractName}`))
  if (suffixMatch) {
    return suffixMatch[1]
  }

  throw new Error(`Missing contract address for ${contractName} on chainId ${chainId}`)
}

export const env = {
  // Required
  httpOrigin: requireEnv(import.meta.env.VITE_HTTP_ORIGIN, 'VITE_HTTP_ORIGIN'),
  chainId,
  // Prefer explicit env (works on Railway with subdir builds); fall back to Ignition address book if present.
  worldContractAddress: (resolve(import.meta.env.VITE_WORLD_CONTRACT_ADDRESS, '') ||
    resolveContractAddress('World')) as `0x${string}`,
  privyAppId: requireEnv(import.meta.env.VITE_PRIVY_APP_ID, 'VITE_PRIVY_APP_ID'),

  // Optional telemetry feeds
  ponderHttpUrl: resolve(import.meta.env.VITE_PONDER_HTTP_URL, ''),
  ponderWsUrl: resolve(import.meta.env.VITE_PONDER_WS_URL, ''),
}

export type EnvConfig = typeof env
