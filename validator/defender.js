const http = require('http');
const fs = require('fs');
const { ethers } = require("ethers");
const { execSync } = require('child_process');
const { initiateChallenge, respondChallenge, finishChallenge, getComputerAddress} = require("../scripts/lib");

const abi_file = fs.readFileSync('validator/Computer.json');
const COMPUTER_ABI = JSON.parse(abi_file);
const COMPUTER_ADDRESS = getComputerAddress();
const WEB3_PROVIDER = "http://127.0.0.1:8545/"; // "https://ropsten.infura.io/v3/7bb750d93c994f36b98cb3539f63b4c9";


SUPPORTED_PROGRAMS = [
    '0x91aaaa18b2367286fe9f284944b295d385022971a91b6956b518b39324efebd4'
]

async function main(){
  const provider = new ethers.providers.JsonRpcProvider(WEB3_PROVIDER);
  const contract = new ethers.Contract(COMPUTER_ADDRESS, COMPUTER_ABI, provider);

  // console.log("contract", contract);
  contract.on('ChallengeCreated', async (id) => {
      console.log("challenge created for our computation: ", id);

      // fetch the computation from the contract
      const computationId = contract.getComputationIDFromChallengeId(id);
      const [input, publishedOutput] = await contract.getComputationData(computationId);
      base_dir = "defender/" + id;
      process.env.BASE_DIR = base_dir;
      process.env.TARGET_STEP = "-1";
      execSync("mkdir -p " + base_dir);
      execSync("BASEDIR=" + base_dir + " ./mipsevm/mipsevm " + input);

      // do binary search now
      for(let i = 0; i < 23; i++){
        while(true){
            const propsedValue = await contract.getProposedState(id);
            console.log("proposed value", propsedValue);
            if (propsedValue != 0){
                break;
            }
            // TODO: add a timeout for the defender
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        await respondChallenge(id, 0, input, base_dir);
        console.log("RESPONDED!");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      await finishChallenge(id, 1, input, base_dir);
    });
}  

main();