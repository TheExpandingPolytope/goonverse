## Railway deployment (monorepo, one container per package)

This repo is deployed as **three always-on Railway services** (plus Railway-managed Postgres/Redis):

- `packages/client`: Vite static build served by Nginx
- `packages/server`: Colyseus game server (Node)
- `packages/indexer`: Ponder indexer + API (Node)

Contract deployment is done manually on a dev machine. Services read the deployed contract address from Ignition outputs or via env override.

### Contract addresses (Ignition)

Each service expects Ignition deployment outputs to exist **inside the service subdirectory build context** at:

`contract/ignition/deployments/chain-$CHAIN_ID/deployed_addresses.json`

To sync the latest Ignition files after deploying contracts locally, run from repo root:

```bash
npm run sync:ignition
```

You can always override the address with `WORLD_CONTRACT_ADDRESS` if needed.

### Railway services

#### Client (`packages/client`)

- **Root directory**: `packages/client`
- **Dockerfile**: `packages/client/Dockerfile`
- **Port**: listens on `$PORT` (served by Node `serve`)
- **Required build-time env**:
  - `VITE_CHAIN_ID`
  - `VITE_HTTP_ORIGIN`
  - `VITE_PRIVY_APP_ID`
  - `VITE_WORLD_CONTRACT_ADDRESS` (recommended for Railway)
- **Optional build-time env**:
  - `VITE_PONDER_HTTP_URL`
  - `VITE_PONDER_WS_URL`
  - `VITE_GAME_SERVER_URL`
  - `VITE_WS_ENDPOINT`

#### Server (`packages/server`)

- **Root directory**: `packages/server`
- **Dockerfile**: `packages/server/Dockerfile`
- **Port**: binds to `PORT` (Railway sets it)
- **Redis**: standardize on `REDIS_URL` (server also accepts `REDIS_URI` as fallback)
- **Required env**:
  - `PORT`
  - `NODE_ENV=production`
  - `REDIS_URL`
  - `PRIVY_APP_ID`
  - `PRIVY_APP_SECRET`
  - `PONDER_URL` (private URL to indexer service)
  - `SERVER_ID`
  - `CONTROLLER_PRIVATE_KEY`
  - `CHAIN_ID` (e.g. `8453` or `84532`)
  - `EXIT_TICKET_TTL_SECONDS` (optional; defaults to 86400)
  - `REGION` / `MAX_CLIENTS` (optional)
- **Contract address source**:
  - Prefer Ignition file in `contract/ignition/...` based on `CHAIN_ID`
  - Or set `WORLD_CONTRACT_ADDRESS` explicitly

#### Indexer (`packages/indexer`)

- **Root directory**: `packages/indexer`
- **Dockerfile**: `packages/indexer/Dockerfile`
- **Port**: runs `ponder start --port $PORT --hostname 0.0.0.0`
- **Required env**:
  - `PORT`
  - `NODE_ENV=production`
  - `DATABASE_URL` (Railway Postgres)
  - `DATABASE_SCHEMA` (e.g. `ponder` or `public`)
  - `PONDER_CHAIN` (`base` | `baseSepolia` | `anvil`)
  - `PONDER_RPC_URL_8453` and/or `PONDER_RPC_URL_84532` (depending on chain)
- **Optional env**:
  - `PONDER_CHAIN_ID` (if you want to override chain id)
  - `WORLD_START_BLOCK_BASE` / `WORLD_START_BLOCK_SEPOLIA`
  - `WORLD_CONTRACT_ADDRESS` (override)


