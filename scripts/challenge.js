const fs = require("fs");
const {
  basedir,
  deployed,
  getBlockRlp,
  getTrieNodesForCall,
} = require("../scripts/lib");

async function main(){

  initiateChallenge(1);
}

async function initiateChallenge(computationId) {

  const [c, m, mm] = await deployed();

  console.log("contract addresses", c.address, m.address, mm.address);

  const hashes = JSON.parse(fs.readFileSync(basedir + "/hashes.json"));
  const inputHash = hashes["InputHash"];
  const outputHash = hashes["OutputHash"];

  // TODO: move this to lib, it's shared with the test
  const startTrie = JSON.parse(fs.readFileSync(basedir + "/golden.json"));
  const finalTrie = JSON.parse(fs.readFileSync(basedir + "/final.json"));

  const preimages = Object.assign(
    {},
    startTrie["preimages"],
    finalTrie["preimages"]
  );
  const finalSystemState = finalTrie["root"];

  const args = [
    computationId,
    "0x" + outputHash,
    finalSystemState,
    finalTrie["step"],
  ];
  const cdat = c.interface.encodeFunctionData("initiateChallenge", args);
  const nodes = await getTrieNodesForCall(c, c.address, cdat, preimages);

  // run "on chain"
  for (n of nodes) {
    await mm.AddTrieNode(n);
  }
  // TODO: Setting the gas limit explicitly here shouldn't be necessary, for some
  //    weird reason (to be investigated), it is for L2.
  //  let ret = await c.initiateChallenge(...args)
  const ret = await c.initiateChallenge(...args, { gasLimit: 10_000_000 });
  const receipt = await ret.wait();
  // ChallengeCreated event
  const challengeId = receipt.events[0].args["challengeId"].toNumber();
  console.log("new challenge with id:", challengeId);
  return challengeId
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
