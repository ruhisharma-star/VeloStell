#!/bin/bash
set -e

echo "Building contract..."
cargo build --target wasm32-unknown-unknown --release

echo "Generating deployer keys..."
soroban keys generate deployer --network testnet || echo "Key deployer already exists"

echo "Funding deployer..."
soroban keys fund deployer --network testnet || true

echo "Deploying velostell contract..."
VELOSTELL_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/velostell.wasm \
  --source deployer \
  --network testnet)
echo "Velostell deployed at: $VELOSTELL_ID"

echo "Getting native XLM SAC contract ID..."
XLM_SAC_ID=$(soroban contract id asset --asset native --network testnet)
echo "Native XLM SAC ID: $XLM_SAC_ID"

echo "Writing deployments.json..."
cat << EOF > deployments.json
{
  "network": "testnet",
  "velostell_contract": "$VELOSTELL_ID",
  "native_token": "$XLM_SAC_ID"
}
EOF

echo "Done!"

