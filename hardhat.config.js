/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
const fs = require("fs")

// attempt to read private key
let private = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
try {
  private = fs.readFileSync(process.env.HOME+"/.privatekey").toString().strip()
} catch {
}


module.exports = {
  defaultNetwork: "l1",
  networks: {
    l1: {
      url: "http://127.0.0.1:8545/",
      accounts: ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
      timeout: 600_000,
    },
    l2: {
      url: "http://127.0.0.1:9545/",
      accounts: ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
      timeout: 600_000,
    },
    goerli: {
      url: "https://goerli.infura.io/v3/7bb750d93c994f36b98cb3539f63b4c9",
      accounts: ["acdea08fac757bf06d5f635824c6a51ef942008c93077f0e2bfca98919081751"],
      timeout: 600_000,
    }
  },
  solidity: {
    version: "0.7.3",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: "2EB5BP7ES2FZ3AKMEHU8YWWB48GF8Y1AAC"
  }
};
