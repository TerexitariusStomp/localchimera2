export const EscrowVaultAbi = [
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "_computeRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_reputation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_protocolFeeRecipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "CONFIRM_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "CONFIRM_WINDOW_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_PROTOCOL_FEE_BPS_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "JOB_TIMEOUT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "JOB_TIMEOUT_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_AMOUNT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "MIN_AMOUNT_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROTOCOL_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "anyoneConfirm",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "arbitrationCost",
    "inputs": [
      {
        "name": "extraData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "arbitrator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrator"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "autoRelease",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimResolution",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "computeRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "consumerConfirm",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "consumerJobs",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createJob",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "requestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "nonce",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "taskType",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "validUntil",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "quoteSignature",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "paymentMint",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "bytes16",
        "internalType": "bytes16"
      }
    ],
    "outputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "createKlerosDispute",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "extraData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "emergencyWithdraw",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "evidence",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEvidence",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "refId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJob",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IEscrowVault.Job",
        "components": [
          {
            "name": "jobId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "consumer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "providerAuthority",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "providerPeerId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "requestHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "nonce",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "taskType",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "validUntil",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "quoteSignature",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "paymentMint",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "providerFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "state",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "providerAckedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "providerCompletedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confirmWindowStart",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "settledAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "responseHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "attestationRoot",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "disputeEvidenceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "arbitrator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "consumerPayoutPct",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "providerPayoutPct",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "klerosDisputeId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "klerosRuling",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJobState",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum IEscrowVault.JobState"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJobsByConsumer",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "jobIds",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getJobsByProvider",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "jobIds",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPendingJobs",
    "inputs": [],
    "outputs": [
      {
        "name": "jobIds",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jobIdToAddress",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jobs",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "providerPeerId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "requestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "nonce",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "taskType",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "validUntil",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "quoteSignature",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "paymentMint",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "providerFeeBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "state",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "providerAckedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "providerCompletedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confirmWindowStart",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "settledAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "responseHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "attestationRoot",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "disputeEvidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "arbitrator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "consumerPayoutPct",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "providerPayoutPct",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "klerosDisputeId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "klerosRuling",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "klerosDisputeCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "klerosDisputeToJob",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingJobs",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBps_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeRecipient",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeesCollected",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeesCollected_",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "providerAck",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "requestHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "providerComplete",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "responseHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "teeQuote",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "providerJobs",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "raiseDispute",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refundJob",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reputation",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "consumerPct",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "providerPct",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rule",
    "inputs": [
      {
        "name": "_disputeID",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_ruling",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setArbitrator",
    "inputs": [
      {
        "name": "_arbitrator",
        "type": "address",
        "internalType": "contract IArbitrator"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProtocolFeeBps",
    "inputs": [
      {
        "name": "newFeeBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProtocolFeeRecipient",
    "inputs": [
      {
        "name": "newRecipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitEvidence",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "refId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitKlerosVerdict",
    "inputs": [
      {
        "name": "jobAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "klerosDisputeId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "ruling",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawProtocolFees",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "EvidenceSubmitted",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "refId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobAutoSettled",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobConsumerConfirmed",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobCreated",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobDisputeResolved",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "consumerPct",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "providerPct",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobDisputed",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "disputer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobProviderAcked",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobProviderCompleted",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "responseHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobRefunded",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "KlerosVerdictSubmitted",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "klerosDisputeId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "ruling",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeeCollected",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeesWithdrawn",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Ruling",
    "inputs": [
      {
        "name": "_arbitrator",
        "type": "address",
        "indexed": true,
        "internalType": "contract IArbitrator"
      },
      {
        "name": "_disputeID",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "_ruling",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyDisputed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AmountBelowMinimum",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ConfirmWindowActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ConfirmWindowExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientFunds",
    "inputs": []
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposits",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "InvalidArbitrator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFeeBps",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidJobState",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPaymentMint",
    "inputs": []
  },
  {
    "type": "error",
    "name": "JobExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "JobNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoDisputeToResolve",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedCaller",
    "inputs": []
  }
] as const;
