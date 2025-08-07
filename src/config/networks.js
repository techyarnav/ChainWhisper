const { ethers } = require('ethers');

const networks = {
  'sepolia-scroll': {
      name: 'Sepolia Scroll Testnet',
      chainId: 534351,
      rpcUrl: 'https://sepolia-rpc.scroll.io/',
      fallbackRpcs: [
          'https://scroll-sepolia-rpc.publicnode.com/',
          'https://scroll-sepolia.drpc.org/',
          'https://rpc.ankr.com/scroll_sepolia_testnet',
      ],
      currency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18
      },
      blockExplorer: 'https://sepolia.scrollscan.com',
      contracts: {
          chatContract: process.env.MAIN_CONTRACT_ADDRESS || '0x47E0cc6b3Be7459e06f7a175771BfCD227E38A99',
          factoryContract: process.env.FACTORY_CONTRACT_ADDRESS || '0x627C28aD9885951e3B1ffB2701B25f17d39bc33e'
      }
  }
};

const getNetworkConfig = (networkName) => {
  const config = networks[networkName];
  if (!config) {
      throw new Error(`Network ${networkName} not supported`);
  }
  return config;
};

const validateNetworkConfig = (config) => {
  if (!config.rpcUrl) {
      throw new Error('RPC URL is required');
  }
  if (!config.chainId) {
      throw new Error('Chain ID is required');
  }
  if (!config.contracts?.chatContract || !config.contracts?.factoryContract) {
      throw new Error('Contract addresses are required');
  }
};

module.exports = {
  networks,
  getNetworkConfig,
  validateNetworkConfig
};
