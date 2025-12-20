# goonverse / globs.fun

## Deploying the `World` smart contract

We deploy `World.sol` using **Hardhat Ignition** from `packages/contract`.

### Prerequisites

- Node.js (see root `package.json` engines)
- Installed deps:

```bash
npm run install:all
```

### Configure deployer credentials

Create a local env file (do **not** commit it):

```bash
cd packages/contract
cat > .env <<'EOF'
PRIVATE_KEY=... # 0x-prefixed or raw hex private key (deployer)
BASESCAN_API_KEY=... # optional, only needed for verification
EOF
```

Hardhat network config lives in `packages/contract/hardhat.config.js`.

### Deployment module

Ignition module: `packages/contract/ignition/modules/World.js`

It:
- Deploys `World` (constructor arg is the rake recipient address)
- Calls `addServer(...)` for a default set of server IDs / tiers (edit `serverConfigs` in the module)

### Deploy locally (Hardhat node)

Terminal 1 (local chain):

```bash
cd packages/contract
npx hardhat node
```

Terminal 2 (deploy):

```bash
cd packages/contract
npx hardhat ignition deploy ignition/modules/World.js --network localhost
```

### Deploy to Base Sepolia

```bash
cd packages/contract
npx hardhat ignition deploy ignition/modules/World.js --network baseSepolia
```

### Deploy to Base Mainnet

```bash
cd packages/contract
npx hardhat ignition deploy ignition/modules/World.js --network base
```

### Where to find the deployed address

Ignition writes addresses to:

- `packages/contract/ignition/deployments/chain-<CHAIN_ID>/deployed_addresses.json`

Example:

- Base Sepolia: `chain-84532`
- Base Mainnet: `chain-8453`

The key is typically `World#World`.

### Wiring the deployed address into services

In production (Railway), we recommend setting explicit env vars:

- **Server**: `WORLD_CONTRACT_ADDRESS=<0x...>`
- **Indexer**: `WORLD_CONTRACT_ADDRESS=<0x...>`
- **Client**: `VITE_WORLD_CONTRACT_ADDRESS=<0x...>`

Chain selection:

- **Server**: `CHAIN_ID=8453` (or `84532`)
- **Client**: `VITE_CHAIN_ID=8453` (or `84532`)
- **Indexer**: `PONDER_CHAIN=base` (or `baseSepolia`)

### Optional: sync Ignition outputs into per-service folders (for local/dev)

If you want services to resolve addresses from Ignition JSONs by chain id (instead of env overrides), run from repo root:

```bash
npm run sync:ignition
```

This copies `deployed_addresses.json` into:

- `packages/server/contract/ignition/deployments/...`
- `packages/indexer/contract/ignition/deployments/...`
- `packages/client/contract/ignition/deployments/...`

### Railway deployment

See `RAILWAY_DEPLOY.md`.


