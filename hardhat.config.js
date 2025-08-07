require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();


module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },


    }
  },

  networks: {

    hardhat: {
      chainId: 31337,
      gas: 12000000,
      gasPrice: 8000000000,
      allowUnlimitedContractSize: true,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 10,
        accountsBalance: "10000000000000000000000"
      }
    },


    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },


    'sepolia-scroll': {
      url: process.env.SCROLL_SEPOLIA_RPC || 'https://sepolia-rpc.scroll.io/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 534351,
      gas: 8000000,
      gasPrice: 25000000000,
      timeout: 60000
    }
  },


  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
    gasPrice: 25,
    showTimeSpent: true
  },


  etherscan: {
    apiKey: {
      'sepolia-scroll': process.env.SCROLLSCAN_API_KEY || 'placeholder'
    },
    customChains: [
 {
        network: "sepolia-scroll",
        chainId: 534351,
        urls: {
          apiURL: "https://api-sepolia.scrollscan.com/api",
          browserURL: "https://sepolia.scrollscan.com/"
        }
      }
    ]
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },

  mocha: {
    timeout: 180000,
    reporter: 'spec'
  }
};
