export const evmNetwork = {
  chainIdHex: process.env.CHAIN_ID_HEX || '0xF22F',
  chainName: process.env.CHAIN_NAME || 'GenLayer StudioNet',
  rpcUrls: (process.env.STUDIONET_API_URL || 'https://studio.genlayer.com/api').split(','),
  nativeCurrency: {
    name: process.env.NATIVE_CURRENCY_NAME || 'ETH',
    symbol: process.env.NATIVE_CURRENCY_SYMBOL || 'ETH',
    decimals: 18,
  },
  blockExplorerUrls: (process.env.BLOCK_EXPLORER_URLS || 'https://etherscan.io').split(','),
};
