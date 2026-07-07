# Tasking Network Payment & Provisioning Review

Review of how each integrated tasking network expects users to pay for and receive resources, and how Localchimera maps to that model.

## Golem

- **Token**: GLM (ERC-20 on Ethereum, preferably Polygon for gas efficiency).
- **How users pay**: Requestors run a Yagna node and pay providers in GLM as they consume compute. Payments are "pay as you go" — either after the agreement terminates or in pre-agreed intervals via debit notes.
- **How users get resources**: Requestors submit tasks through the Yagna SDK (`golem-js` / `yapapi`). Providers execute them and bill in GLM.
- **Localchimera model**: The protocol acts as a requestor. It converts incoming payments to GLM on Polygon, funds a Yagna wallet, and submits compute tasks on behalf of the user.
- **Upstream**: https://docs.golem.network/docs/golem/payments

## BTFS

- **Token**: BTT (gas) and WBTT (payment currency on the BTFS network).
- **How users pay**: Renters deposit BTT to their BTTC address, swap BTT → WBTT, then deposit WBTT into the node vault address. Hosts are paid via cheques when files are uploaded.
- **How users get resources**: Run a BTFS daemon, add files to the network with `btfs storage upload`.
- **Localchimera model**: The protocol runs a BTFS node, maintains a WBTT vault balance, and uploads files on behalf of the user.
- **Upstream**: https://docs.btfs.io/docs/btfs20-storage-rental

## Mysterium

- **Token**: MYST (ERC-20) for node runners. Consumer app supports fiat subscriptions and crypto top-ups.
- **How users pay**: End users typically subscribe through the Mysterium VPN app. MYST is used to reward node runners.
- **How users get resources**: Install the Mysterium app or run a node.
- **Localchimera model**: The protocol can maintain a Mysterium consumer identity/wallet topped up with MYST and route user bandwidth through it. This is the closest fit because Mysterium already has a consumer payment model.
- **Upstream**: https://docs.mysterium.network/myst-token

## Anyone Protocol

- **Token**: ANYONE.
- **How users pay**: The core network is currently free. Premium circuits (paid ANYONE subscriptions for high-throughput relays) are on the roadmap but not live yet.
- **How users get resources**: Install the Anyone client, connect, and route traffic through relays.
- **Localchimera model**: Paid bandwidth is not yet supported by the upstream network. Including it in the resource marketplace is premature. Should be removed until premium circuits launch.
- **Upstream**: https://docs.anyone.io/tokenomics/premium-circuits/premium-circuits.md

## BTT AI (BTTInferGrid)

- **Token**: BTT (BitTorrent Token on BTTC).
- **How users pay**: AI developers pay for inference calls via BTT in a pay-as-you-go model.
- **How users get resources**: Submit inference requests through a unified API or the B.AI platform. Miners execute tasks and earn BTT.
- **Localchimera model**: The protocol converts incoming payments to BTT and calls the BTTInferGrid API on behalf of the user.
- **Upstream**: https://medium.com/@BitTorrent/bttinfergrid-a-decentralized-compute-network-for-ai-inference-5aa944804c23

## Casper

- **Token**: CSPR (native Casper token).
- **How users pay**: CSPR is used for transaction fees and to pay for smart-contract-based services.
- **How users get resources**: Interact with Casper smart contracts via deploys.
- **Localchimera model**: The protocol holds a Casper key pair, converts incoming payments to CSPR, and submits deploys to the Casper marketplace.
- **Upstream**: https://docs.casper.network/

## Recommendations

1. **Remove Anyone Protocol** from the frontend resource marketplace until premium circuits are live.
2. **Golem**: settle on Polygon with GLM; run a Yagna requestor node.
3. **BTFS**: maintain a WBTT vault on a protocol-controlled BTFS node.
4. **Mysterium**: use a protocol-controlled consumer wallet topped up with MYST.
5. **BTT AI**: use BTT on BTTC and call the BTTInferGrid API.
6. **Casper**: maintain a funded Casper account and submit deploys.

For all networks, the protocol should be the party that interacts with the upstream network, not the end-user machine. The end-user only pays the protocol via Request Network.
