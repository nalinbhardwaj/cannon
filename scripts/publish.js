const fs = require("fs");
const {
  basedir,
  deployed,
  getBlockRlp,
  getTrieNodesForCall,
} = require("../scripts/lib");

async function main() {
  let [c, m, mm] = await deployed();

  console.log("contract addresses", c.address, m.address, mm.address);
  const hashes = JSON.parse(fs.readFileSync(basedir + "/hashes.json"));
  const inputHash = hashes["InputHash"];
  const outputHash = hashes["OutputHash"];

  let startTrie = JSON.parse(fs.readFileSync(basedir + "/golden.json"));
  let goldenRoot = startTrie["root"];
  console.log("args data", goldenRoot, "0x" + inputHash, "0x" + outputHash);

  // Publish computation
  let pubRet = await c.publishComputation(
    goldenRoot,
    "0x" + inputHash,
    "0x" + outputHash
  );
  let pubReceipt = await pubRet.wait();
  console.log("receipt events", pubReceipt, pubReceipt.events);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
