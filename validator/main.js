const Web3 = require('web3');
const EthereumEvents = require('ethereum-events');
const fs = require('fs');
const { ethers } = require("ethers");
const { execSync } = require('child_process');
const {initiateChallenge} = require("../scripts/challenge");
const {respondChallenge} = require("../scripts/respond");
const {finishChallenge} = require("../scripts/assert");


const abi_file = fs.readFileSync('Computer.json');
const COMPUTER_ABI = JSON.parse(abi_file);
const COMPUTER_ADDRESS = "0x432";
const WEB3_PROVIDER = /* Your web3 provider (e.g. geth, Infura) */;

const contracts = [
  {
    name: 'Computer',
    address: '0xefE1e4e13F9ED8399eE8e258b3a1717b7D15f054',
    abi: COMPUTER_ABI,
    events: ['ComputationCreated'] // optional event filter (default: all events)
  } 
];

const options = {
  pollInterval: 13000, // period between polls in milliseconds (default: 13000)
  confirmations: 12,   // n° of confirmation blocks (default: 12)
  chunkSize: 10000,    // n° of blocks to fetch at a time (default: 10000)
  concurrency: 10,     // maximum n° of concurrent web3 requests (default: 10)
  backoff: 1000        // retry backoff in milliseconds (default: 1000)
};

const web3 = new Web3(WEB3_PROVIDER);

const ethereumEvents = new EthereumEvents(web3, contracts, options);

SUPPORTED_PROGRAMS = [
    '0xblahblahblah'
]

const provider = new ethers.providers.JsonRpcProvider();
const contract = new ethers.Contract(COMPUTER_ADDRESS, COMPUTER_ABI, provider);

contract.on('ComputationCreated', (id, programHash) => {
    if(!SUPPORTED_PROGRAMS.includes(programHash)){
        console.log("program not supported");
        return;
    }

    // fetch the computation from the contract
    const [input, publishedOutput] = await contract.getComputationData(id);
    base_dir = "computations/" + id + "/";
    process.env.BASE_DIR = base_dir;
    process.env.TARGET_STEP = "-1";

    execSync(" ./mipsevm/mipsevm " + input);

    hashes= JSON.parse(fs.readFileSync(base_dir + "hashes.json"));
    unicornOutput = hashes["OutputHash"]

    if(unicornOutput == publishedOutput){
        console.log("output matches!");
        return;
    }
    console.log("output doesn't match. starting a challenge");
    runChallenge(id, programHash, base_dir, input);

  });


const runChallenge = (id, programHash, base_dir, input) => {
    process.env.BASE_DIR = base_dir;
    const challengeId = initiateChallenge(id);

    // do binary search now
    for(let i = 0; i < 23; i++){
        respondChallenge(challengeId, 1, input);
        // wait for some time until the defender responds
        // if its been a while then, timeout the defender
        while(true){
            const propsedValue = contract.getProposedState(challengeId);
            if (propsedValue == 0){
                break;
            }

            // TODO: add a timeout for the defender
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    finishChallenge(challengeId, 1, input);

    console.log("challenge concluded");
}
  