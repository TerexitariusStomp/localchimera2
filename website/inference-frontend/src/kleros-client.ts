// @ts-nocheck
import { ethers, Contract, JsonRpcProvider } from 'ethers';

// Kleros Court (Arbitrator) on Ethereum Mainnet
// https://etherscan.io/address/0x988b3a538b618c7a603e1c11ab82cd16dbe28069
const KLEROS_COURT_ADDRESS = '0x988b3a538b618c7a603e1c11ab82cd16dbe28069';

// Kleros Court on Sepolia testnet (for testing)
const KLEROS_COURT_SEPOLIA = '0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002';

// Subcourt IDs (Ethereum Mainnet)
// 0 = General Court, 1 = Blockchain, 4 = Technical
export const SUBCOURT_IDS = {
  GENERAL: 0,
  BLOCKCHAIN: 1,
  NON_TECHNICAL: 2,
  TECHNICAL: 4,
} as const;

// Minimal Kleros Court ABI (only functions we need)
const KLEROS_COURT_ABI = [
  'function createDispute(uint256 _choices, bytes _extraData) external payable returns (uint256)',
  'function disputeStatus(uint256 _disputeID) external view returns (uint8)',
  'function currentRuling(uint256 _disputeID) external view returns (uint256)',
  'function arbitrationCost(bytes _extraData) external view returns (uint256)',
  'function getDispute(uint256 _disputeID) external view returns (uint256, uint256, uint256, uint256, uint256)',
  'event DisputeCreation(uint256 indexed _disputeID, address indexed _arbitrable)',
  'event AppealPossible(uint256 indexed _disputeID, address indexed _arbitrable)',
  'event AppealDecision(uint256 indexed _disputeID, address indexed _arbitrable)',
];

// Dispute status enum from Kleros
export enum DisputeStatus {
  Created = 0,
  Waiting = 1,
  Appealable = 2,
  Solved = 3,
}

// Ruling values
export const RULING = {
  REFUSED: 0,
  CONSUMER_WINS: 1, // "true" - funds return to consumer
  PROVIDER_WINS: 2, // "false" - funds go to provider
} as const;

export interface KlerosDispute {
  disputeId: number;
  status: DisputeStatus;
  ruling: number;
  txHash: string;
}

// Generate arbitrator extra data (subcourtID + numberOfVotes)
export function generateArbitratorExtraData(
  subcourtID: number,
  noOfVotes: number = 3
): string {
  const subcourtHex = subcourtID.toString(16).padStart(64, '0');
  const votesHex = noOfVotes.toString(16).padStart(64, '0');
  return '0x' + subcourtHex + votesHex;
}

// Get arbitration cost estimate
export async function getArbitrationCost(
  subcourtID: number = SUBCOURT_IDS.TECHNICAL,
  noOfVotes: number = 3,
  useTestnet: boolean = false
): Promise<string> {
  const provider = new JsonRpcProvider(
    useTestnet
      ? 'https://ethereum-sepolia-rpc.publicnode.com'
      : 'https://eth.llamarpc.com'
  );
  const court = new Contract(
    useTestnet ? KLEROS_COURT_SEPOLIA : KLEROS_COURT_ADDRESS,
    KLEROS_COURT_ABI,
    provider
  );
  const extraData = generateArbitratorExtraData(subcourtID, noOfVotes);
  const cost = await court.arbitrationCost(extraData);
  return ethers.formatEther(cost);
}

// Create a Kleros dispute using the user's Ethereum wallet (via Web3Auth or window.ethereum)
export async function createKlerosDispute(
  subcourtID: number = SUBCOURT_IDS.TECHNICAL,
  noOfVotes: number = 3,
  useTestnet: boolean = false,
  evmProvider?: any
): Promise<KlerosDispute> {
  let ethProvider: ethers.BrowserProvider;

  if (evmProvider) {
    ethProvider = new ethers.BrowserProvider(evmProvider);
  } else if (typeof (window as any).ethereum !== 'undefined') {
    ethProvider = new ethers.BrowserProvider((window as any).ethereum);
  } else {
    throw new Error('No Ethereum wallet found. Please connect your Web3Auth wallet.');
  }

  const signer = await ethProvider.getSigner();
  const network = await ethProvider.getNetwork();

  const courtAddress = useTestnet || network.chainId === 11155111n
    ? KLEROS_COURT_SEPOLIA
    : KLEROS_COURT_ADDRESS;

  const court = new Contract(courtAddress, KLEROS_COURT_ABI, signer);
  const extraData = generateArbitratorExtraData(subcourtID, noOfVotes);

  // Get arbitration cost
  const cost = await court.arbitrationCost(extraData);

  // Create dispute with 2 choices (consumer wins / provider wins)
  // choices=2 means the arbitrator can rule 0 (refused), 1, or 2
  const tx = await court.createDispute(2, extraData, { value: cost });
  const receipt = await tx.wait();

  // Find DisputeCreation event to get dispute ID
  const iface = new ethers.Interface(KLEROS_COURT_ABI);
  let disputeId = -1;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'DisputeCreation') {
        disputeId = Number(parsed.args._disputeID);
        break;
      }
    } catch {
      // skip unparseable logs
    }
  }

  if (disputeId === -1) {
    throw new Error('Failed to find dispute ID from transaction logs');
  }

  return {
    disputeId,
    status: DisputeStatus.Created,
    ruling: -1,
    txHash: tx.hash,
  };
}

// Fetch dispute status and ruling from Kleros
export async function getKlerosDisputeStatus(
  disputeId: number,
  useTestnet: boolean = false
): Promise<KlerosDispute> {
  const provider = new JsonRpcProvider(
    useTestnet
      ? 'https://ethereum-sepolia-rpc.publicnode.com'
      : 'https://eth.llamarpc.com'
  );
  const court = new Contract(
    useTestnet ? KLEROS_COURT_SEPOLIA : KLEROS_COURT_ADDRESS,
    KLEROS_COURT_ABI,
    provider
  );

  const status: number = await court.disputeStatus(disputeId);
  let ruling = -1;
  if (status === DisputeStatus.Solved) {
    ruling = Number(await court.currentRuling(disputeId));
  }

  return { disputeId, status: status as DisputeStatus, ruling, txHash: '' };
}

// Check if a Kleros dispute has a final ruling
export async function getKlerosRuling(
  disputeId: number,
  useTestnet: boolean = false
): Promise<number | null> {
  const dispute = await getKlerosDisputeStatus(disputeId, useTestnet);
  if (dispute.status === DisputeStatus.Solved) {
    return dispute.ruling;
  }
  return null;
}

// Check if Ethereum wallet is available (via Web3Auth or window.ethereum)
export function hasEthereumWallet(evmProvider?: any): boolean {
  return !!evmProvider || typeof (window as any).ethereum !== 'undefined';
}

// Request Ethereum account access (via Web3Auth or window.ethereum)
export async function connectEthereumWallet(evmProvider?: any): Promise<string> {
  if (evmProvider) {
    const ethProvider = new ethers.BrowserProvider(evmProvider);
    const signer = await ethProvider.getSigner();
    return await signer.getAddress();
  }
  if (!hasEthereumWallet()) {
    throw new Error('No Ethereum wallet found');
  }
  const accounts = await (window as any).ethereum.request({
    method: 'eth_requestAccounts',
  });
  return accounts[0];
}

// Get the arbitration fee in wei for a given subcourt/votes
export async function getArbitrationFeeWei(
  subcourtID: number = SUBCOURT_IDS.TECHNICAL,
  noOfVotes: number = 3,
  useTestnet: boolean = false
): Promise<bigint> {
  const provider = new JsonRpcProvider(
    useTestnet
      ? 'https://ethereum-sepolia-rpc.publicnode.com'
      : 'https://eth.llamarpc.com'
  );
  const court = new Contract(
    useTestnet ? KLEROS_COURT_SEPOLIA : KLEROS_COURT_ADDRESS,
    KLEROS_COURT_ABI,
    provider
  );
  const extraData = generateArbitratorExtraData(subcourtID, noOfVotes);
  const cost = await court.arbitrationCost(extraData);
  return cost;
}

// Poll for Kleros ruling until resolved or timeout
// Calls onStatus callback with each poll result, returns final ruling or null
export async function pollKlerosRuling(
  disputeId: number,
  intervalMs: number = 10000,
  timeoutMs: number = 300000,
  useTestnet: boolean = false,
  onStatus?: (dispute: KlerosDispute) => void
): Promise<KlerosDispute | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dispute = await getKlerosDisputeStatus(disputeId, useTestnet);
    if (onStatus) onStatus(dispute);
    if (dispute.status === DisputeStatus.Solved) {
      return dispute;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
