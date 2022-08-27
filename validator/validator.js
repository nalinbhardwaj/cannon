const http = require('http');
const fs = require('fs');
const { ethers } = require("ethers");
const { execSync } = require('child_process');
const { initiateChallenge, respondChallenge, finishChallenge, getComputerAddress} = require("../scripts/lib");


const abi_file = fs.readFileSync('validator/Computer.json');
const COMPUTER_ABI = JSON.parse(abi_file);
const COMPUTER_ADDRESS = getComputerAddress();
const WEB3_PROVIDER = "http://127.0.0.1:8545/"; // "https://ropsten.infura.io/v3/7bb750d93c994f36b98cb3539f63b4c9";

// const ethereumEvents = new EthereumEvents(web3, contracts, options);

SUPPORTED_PROGRAMS = [
    '0x91aaaa18b2367286fe9f284944b295d385022971a91b6956b518b39324efebd4'
]

async function main(){
  const provider = new ethers.providers.JsonRpcProvider(WEB3_PROVIDER);
  const contract = new ethers.Contract(COMPUTER_ADDRESS, COMPUTER_ABI, provider);

  // console.log("contract", contract);
  contract.on('ComputationCreated', async (id, programHash) => {
      console.log("received: ", id, programHash);
      if(!SUPPORTED_PROGRAMS.includes(programHash)){
          console.log("program not supported");
          return;
      }

      // fetch the computation from the contract
      const [input, publishedOutput] = await contract.getComputationData(id);
      base_dir = "computations/" + id;
      process.env.BASE_DIR = base_dir;
      process.env.TARGET_STEP = "-1";
      execSync("mkdir -p computations/" + id);
      execSync("BASEDIR=" + base_dir + " ./mipsevm/mipsevm " + input);

      hashes= JSON.parse(fs.readFileSync(base_dir + "/hashes.json"));
      unicornOutput = hashes["OutputHash"]

      if(unicornOutput == publishedOutput){
          console.log("output matches!");
          return;
      }
      console.log("output doesn't match. starting a challenge");
      runChallenge(id, programHash, base_dir, input);

    });


  const runChallenge = async (id, programHash, base_dir, input) => {
      process.env.BASE_DIR = base_dir;
      
      const challengeId = initiateChallenge(id, base_dir);

      // do binary search now
      for(let i = 0; i < 23; i++){
          await respondChallenge(challengeId, 1, input, base_dir);
          console.log("RESPONDED!");
          // wait for some time until the defender responds
          // if its been a while then, timeout the defender
          while(true){
              const propsedValue = await contract.getProposedState(challengeId);
              console.log("proposedValue", propsedValue);
              if (propsedValue == "0x0000000000000000000000000000000000000000000000000000000000000000"){
                  break;
              }

              // TODO: add a timeout for the defender
              await new Promise(resolve => setTimeout(resolve, 5000));
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
      }
      await finishChallenge(challengeId, 1, input);

      console.log("challenge concluded");
  }
}  

main();