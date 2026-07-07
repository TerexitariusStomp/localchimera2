export const ComputeRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_feeRecipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_minimumStake",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "MAX_CONTEXT_TOKENS",
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
    "name": "MAX_FEE_BPS",
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
    "name": "MIN_TPS",
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
    "name": "TASK_TYPE_BANDWIDTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TASK_TYPE_COMPUTE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TASK_TYPE_INFERENCE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TASK_TYPE_STORAGE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "authorityToProvider",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
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
    "name": "challenges",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "challengeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "chunkIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "merkleRoot",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "issuedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "passed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "resolved",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "targetProvider",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "consecutiveFailedChallenges",
    "inputs": [
      {
        "name": "",
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
    "name": "depositStake",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "disputeResolutions",
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
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
    "name": "feeRecipient",
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
    "name": "fileMerkleRoots",
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
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.Provider",
        "components": [
          {
            "name": "authority",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "qvacPeerId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "taskTypes",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "tiers",
            "type": "tuple[]",
            "internalType": "struct IComputeRegistry.PricingTier[]",
            "components": [
              {
                "name": "modelId",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "pricePerRequest",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "minTPS",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "maxContextTokens",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "jobsCompleted",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "totalEarned",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalStaked",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "registeredAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "updatedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "storageCap",
            "type": "tuple",
            "internalType": "struct IComputeRegistry.StorageCapacity",
            "components": [
              {
                "name": "totalCapacityMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "pricePerMbMonth",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "minStorageMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "maxStorageMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "enabled",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          },
          {
            "name": "computeCap",
            "type": "tuple",
            "internalType": "struct IComputeRegistry.ComputeCapacity",
            "components": [
              {
                "name": "cpuCores",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "ramMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "gpu",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "vramMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "runtimeTypes",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "pricePerCpuSec",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "pricePerGpuSec",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "enabled",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          },
          {
            "name": "inferenceCap",
            "type": "tuple",
            "internalType": "struct IComputeRegistry.InferenceCapacity",
            "components": [
              {
                "name": "models",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "gpu",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "vramMb",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "pricePerRequest",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "enabled",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          },
          {
            "name": "bandwidthCap",
            "type": "tuple",
            "internalType": "struct IComputeRegistry.BandwidthCapacity",
            "components": [
              {
                "name": "bandwidthMbps",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "serviceType",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "orPort",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "dirPort",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "pricePerHour",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "pricePerGiB",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "enabled",
                "type": "bool",
                "internalType": "bool"
              }
            ]
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderByAuthority",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderByPeerId",
    "inputs": [
      {
        "name": "qvacPeerId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderStatus",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum IComputeRegistry.ProviderStatus"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProvidersByResource",
    "inputs": [
      {
        "name": "resourceType",
        "type": "uint8",
        "internalType": "enum IComputeRegistry.ResourceType"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getStake",
    "inputs": [
      {
        "name": "providerAddress",
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
    "name": "hasResourceType",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "resourceType",
        "type": "uint8",
        "internalType": "enum IComputeRegistry.ResourceType"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isActiveProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "issueChallenge",
    "inputs": [
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "challengeHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "chunkIndex",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "targetProvider",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "klerosVerdicts",
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minimumStake",
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
    "name": "minimumStakeAmount",
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
    "name": "pauseProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "peerIdToProvider",
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
    "name": "protocolFeeBps",
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
    "name": "providerEvidence",
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
    "name": "providerList",
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
    "name": "providers",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "authority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "qvacPeerId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "taskTypes",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "jobsCompleted",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "totalEarned",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalStaked",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "registeredAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "updatedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "storageCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.StorageCapacity",
        "components": [
          {
            "name": "totalCapacityMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerMbMonth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minStorageMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxStorageMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "computeCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.ComputeCapacity",
        "components": [
          {
            "name": "cpuCores",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "ramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "gpu",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "vramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "runtimeTypes",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "pricePerCpuSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerGpuSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "inferenceCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.InferenceCapacity",
        "components": [
          {
            "name": "models",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "gpu",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "vramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerRequest",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "bandwidthCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.BandwidthCapacity",
        "components": [
          {
            "name": "bandwidthMbps",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "serviceType",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "orPort",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "dirPort",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerHour",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerGiB",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rateConsumer",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rating",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agreementId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sessionId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerFileRoot",
    "inputs": [
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "merkleRoot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registerProvider",
    "inputs": [
      {
        "name": "qvacPeerId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "taskTypes",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "tiers",
        "type": "tuple[]",
        "internalType": "struct IComputeRegistry.PricingTier[]",
        "components": [
          {
            "name": "modelId",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "pricePerRequest",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minTPS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxContextTokens",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "stakeAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      {
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sessionId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agreementId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "consumerPct",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resumeProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rotatePeerId",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "newQvacPeerId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFeeRecipient",
    "inputs": [
      {
        "name": "newFeeRecipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMinimumStake",
    "inputs": [
      {
        "name": "newMinimumStake",
        "type": "uint256",
        "internalType": "uint256"
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
        "name": "feeBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "slashForFailedChallenge",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "challengeId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "slashProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "proof",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stakes",
    "inputs": [
      {
        "name": "",
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
    "name": "submitChallengeResponse",
    "inputs": [
      {
        "name": "challengeId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "chunkHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "merkleProof",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
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
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agreementId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sessionId",
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
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "fileId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agreementId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sessionId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "klerosDisputeId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "ruling",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateProvider",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "taskTypes",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "tiers",
        "type": "tuple[]",
        "internalType": "struct IComputeRegistry.PricingTier[]",
        "components": [
          {
            "name": "modelId",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "pricePerRequest",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minTPS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxContextTokens",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateProviderCapacity",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "resourceType",
        "type": "uint8",
        "internalType": "enum IComputeRegistry.ResourceType"
      },
      {
        "name": "storageCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.StorageCapacity",
        "components": [
          {
            "name": "totalCapacityMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerMbMonth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minStorageMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxStorageMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "computeCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.ComputeCapacity",
        "components": [
          {
            "name": "cpuCores",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "ramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "gpu",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "vramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "runtimeTypes",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "pricePerCpuSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerGpuSec",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "inferenceCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.InferenceCapacity",
        "components": [
          {
            "name": "models",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "gpu",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "vramMb",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerRequest",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      },
      {
        "name": "bandwidthCap",
        "type": "tuple",
        "internalType": "struct IComputeRegistry.BandwidthCapacity",
        "components": [
          {
            "name": "bandwidthMbps",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "serviceType",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "orPort",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "dirPort",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "pricePerHour",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pricePerGiB",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verifyChallenge",
    "inputs": [
      {
        "name": "challengeId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "passed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawStake",
    "inputs": [
      {
        "name": "providerAddress",
        "type": "address",
        "internalType": "address"
      },
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
    "name": "ChallengeIssued",
    "inputs": [
      {
        "name": "fileId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "challengeHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ChallengeVerified",
    "inputs": [
      {
        "name": "challengeId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "passed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConsumerRated",
    "inputs": [
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
        "name": "rating",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "refId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EvidenceSubmitted",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "refId",
        "type": "bytes32",
        "indexed": true,
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
    "name": "PeerIdRotated",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "oldPeerId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "newPeerId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeeBpsSet",
    "inputs": [
      {
        "name": "feeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderCapacityUpdated",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "resourceType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum IComputeRegistry.ResourceType"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderPaused",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderRegistered",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "qvacPeerId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderResumed",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderSlashed",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "proof",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderUpdated",
    "inputs": [
      {
        "name": "authority",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "taskTypes",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "tiers",
        "type": "tuple[]",
        "indexed": false,
        "internalType": "struct IComputeRegistry.PricingTier[]",
        "components": [
          {
            "name": "modelId",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "pricePerRequest",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minTPS",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxContextTokens",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StakeDeposited",
    "inputs": [
      {
        "name": "authority",
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
    "name": "StakeWithdrawn",
    "inputs": [
      {
        "name": "authority",
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
    "type": "error",
    "name": "AlreadySlashed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientStake",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPricingTier",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidStatusTransition",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidTaskTypes",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ProviderAlreadyRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ProviderNotFound",
    "inputs": []
  }
] as const;
