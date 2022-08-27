const fs = require("fs");
const ethers = require("ethers");

const {
  basedir,
  deployed,
  getBlockRlp,
  getTrieNodesForCall,
} = require("../scripts/lib");
const { sign } = require("crypto");

async function main() {
  let [c, m, mm] = await deployed();
  // console.log("contract", c);

  console.log("contract addresses", c.address, m.address, mm.address);
  const hashes = JSON.parse(fs.readFileSync(basedir + "/hashes.json"));
  const input = hashes["InputData"];
  const inputHash = hashes["InputHash"];
  const outputHash = hashes["OutputHash"];

  let startTrie = JSON.parse(fs.readFileSync(basedir + "/golden.json"));
  let goldenRoot = startTrie["root"];
  console.log("args data", goldenRoot, "0x" + inputHash, "0x" + outputHash);


  // const WEB3_PROVIDER = "https://goerli.infura.io/v3/7bb750d93c994f36b98cb3539f63b4c9";
  const WEB3_PROVIDER = "http://127.0.0.1:8545/";
  var jsonProvider = new ethers.providers.JsonRpcProvider(WEB3_PROVIDER);
  const signer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", jsonProvider);
  const contractWithSigner = c.connect(signer);
  // Publish computation
  let pubRet = await contractWithSigner.publishComputation(
    goldenRoot,
    input.toString(),
    "0x" + inputHash,
    "0x" + outputHash
  );
  pubRet = await pubRet.wait();
  // let pubReceipt = await pubRet.wait();
  console.log("receipt events", pubRet, pubRet.events);
  // contractWithSigner
  const computationId = pubRet.events[0].args[0];
  console.log("computation id", computationId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
