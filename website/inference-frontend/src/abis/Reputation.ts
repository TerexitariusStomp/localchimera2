export const ReputationAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_computeRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_escrowVault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "EARNED_WEIGHT",
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
    "name": "JOBS_COMPLETED_WEIGHT",
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
    "name": "JOBS_DISPUTED_PENALTY",
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
    "name": "JOBS_SLASHED_PENALTY",
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
    "name": "RATING_WEIGHT",
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
    "name": "addAuthorizedCaller",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "anchorRatings",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "ratingsCID",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "authorizedCallers",
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
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "calculateReputationScore",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "score",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
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
    "name": "consumerReputations",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "jobsCreated",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "totalSpent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "disputesRaised",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "disputesWon",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "ratingCount",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "ratingTotal",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastRating",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lastRatingJobId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escrowVault",
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
    "name": "getConsumerRating",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastRating",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getConsumerReputation",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IReputation.ConsumerReputation",
        "components": [
          {
            "name": "consumer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "jobsCreated",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "totalSpent",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "disputesRaised",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "disputesWon",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "ratingCount",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "ratingTotal",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastRating",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lastRatingJobId",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderRating",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastRating",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderReputation",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct IReputation.ReputationEntry",
        "components": [
          {
            "name": "providerAuthority",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "jobsCompleted",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "jobsDisputed",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "jobsSlashed",
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
            "name": "ratingsCID",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "lastUpdate",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "ratingCount",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "ratingTotal",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lastRating",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lastRatingJobId",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProviderReputationRank",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "rank",
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
    "name": "providerReputations",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "jobsCompleted",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "jobsDisputed",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "jobsSlashed",
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
        "name": "ratingsCID",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "lastUpdate",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "ratingCount",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "ratingTotal",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lastRating",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lastRatingJobId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rateConsumer",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      },
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
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rateProvider",
    "inputs": [
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
        "name": "rating",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "jobId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordConsumerDisputeRaised",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordConsumerDisputeWon",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordConsumerJobCreated",
    "inputs": [
      {
        "name": "consumer",
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
    "type": "function",
    "name": "recordJobCompleted",
    "inputs": [
      {
        "name": "providerAuthority",
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
    "type": "function",
    "name": "recordJobDisputed",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordJobSlashed",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "removeAuthorizedCaller",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resetProviderReputation",
    "inputs": [
      {
        "name": "providerAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "scoreDistribution",
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setEscrowVault",
    "inputs": [
      {
        "name": "newEscrowVault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setWeights",
    "inputs": [
      {
        "name": "_jobsCompletedWeight",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_jobsDisputedPenalty",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_jobsSlashedPenalty",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_earnedWeight",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "_ratingWeight",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ConsumerDisputeRaised",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConsumerDisputeWon",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConsumerJobCreated",
    "inputs": [
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
        "name": "jobId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobCompleted",
    "inputs": [
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
    "name": "JobDisputed",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobSlashed",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProviderRated",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "consumer",
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
        "name": "jobId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RatingsAnchored",
    "inputs": [
      {
        "name": "provider",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "ratingsCID",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ConsumerNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidRatingsCID",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ProviderNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedCaller",
    "inputs": []
  }
] as const;
