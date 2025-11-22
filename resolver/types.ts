/**
 * Type definitions for Resolver Service
 */

export namespace PoolManager {
  export const abi = [
    // Liquidate function for Long Pool Manager
    {
      inputs: [
        { internalType: 'address', name: 'pool', type: 'address' },
        { internalType: 'address', name: 'receiver', type: 'address' },
        { internalType: 'uint256', name: 'maxFxUSD', type: 'uint256' },
        { internalType: 'uint256', name: 'maxStable', type: 'uint256' },
      ],
      name: 'liquidate',
      outputs: [
        { internalType: 'uint256', name: 'colls', type: 'uint256' },
        { internalType: 'uint256', name: 'fxUSDUsed', type: 'uint256' },
        { internalType: 'uint256', name: 'stableUsed', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    // Get registered pools (if available)
    {
      inputs: [],
      name: 'getRegisteredPools',
      outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];
}

export namespace Pool {
  export const abi = [
    // Get position debt ratio
    {
      inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
      name: 'getPositionDebtRatio',
      outputs: [{ internalType: 'uint256', name: 'debtRatio', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    // Get position details
    {
      inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
      name: 'getPosition',
      outputs: [
        { internalType: 'uint256', name: 'rawColls', type: 'uint256' },
        { internalType: 'uint256', name: 'rawDebts', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    // Check if position is liquidatable
    {
      inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
      name: 'isLiquidatable',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];
}

