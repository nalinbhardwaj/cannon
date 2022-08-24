const { expect } = require("chai");
const fs = require("fs");
const {
  deploy,
  getTrieNodesForCall,
  getTrieAtStep,
} = require("../scripts/lib");

// This test needs preimages to run correctly.
// It is skipped when running `make test_contracts`, but can be run with `make test_challenge`.
describe("Challenge contract", function () {
  if (!fs.existsSync("tmp/cannon/correct/golden.json")) {
    console.log("golden file doesn't exist, skipping test");
    return;
  }

  beforeEach(async function () {
    [c, m, mm] = await deploy();
  });
  it("challenge contract deploys", async function () {
    console.log("Challenge deployed at", c.address);
  });
  it("initiate challenge", async function () {
    // TODO: is there a better way to get the "HardhatNetworkProvider"?
    const hardhat =
      network.provider._wrapped._wrapped._wrapped._wrapped._wrapped;
    const blockchain = hardhat._node._blockchain;

    // get data
    // const blockNumberN = (await ethers.provider.getBlockNumber()) - 2;
    // const blockNp1 = blockchain._data._blocksByNumber.get(blockNumberN + 1);
    // const blockNp1Rlp = blockNp1.header.serialize();

    const inputHash =
      "0xe6be304fdd9eb726595c0038b7be6da9f77756c0fa8977bcc271bcd2362aee46";
    const outputHash =
      "0x19b88bf2a76caaef5ca15b47376888fb3e5ad6fd29c3d78f5d31ffb3afb28272";
    let startTrie = JSON.parse(
      fs.readFileSync("tmp/cannon/correct/golden.json")
    );
    let goldenRoot = startTrie["root"];
    console.log("goldenRoot", goldenRoot);
    let finalTrie = JSON.parse(
      fs.readFileSync("tmp/cannon/correct/final.json")
    );
    let preimages = Object.assign(
      {},
      startTrie["preimages"],
      finalTrie["preimages"]
    );
    const finalSystemState = finalTrie["root"];

    // Publish computation
    let pubRet = await c.publishComputation(goldenRoot, inputHash, outputHash);
    let pubReceipt = await pubRet.wait();
    console.log("receipt events", pubReceipt.events);

    let args = [1, outputHash, finalSystemState, finalTrie["step"]];
    let cdat = c.interface.encodeFunctionData("initiateChallenge", args);
    let nodes = await getTrieNodesForCall(c, c.address, cdat, preimages);

    // run "on chain"
    for (n of nodes) {
      await mm.AddTrieNode(n);
    }
    let ret = await c.initiateChallenge(...args);
    let receipt = await ret.wait();
    // ChallengeCreated event
    let challengeId = receipt.events[0].args["challengeId"].toNumber();
    console.log("new challenge with id", challengeId);

    // the real issue here is from step 0->1 when we write the input hash
    // TODO: prove the challenger wrong?

    // let step = 0;
    // let mipsInput = 72;

    // let prevTrie = getTrieAtStep(mipsInput, step);
    // let nextTrie = getTrieAtStep(mipsInput, step + 1);
    // let stepPreimages = Object.assign(
    //   {},
    //   prevTrie["preimages"],
    //   nextTrie["preimages"]
    // );
    // console.log("prevTrie[root]", prevTrie["root"]);
    // console.log("nextTrie[root]", nextTrie["root"]);

    // let mdat = m.interface.encodeFunctionData("Step", [prevTrie["root"]]);
    // let stepNodes = await getTrieNodesForCall(
    //   c,
    //   m.address,
    //   mdat,
    //   stepPreimages
    // );
    // for (n of stepNodes) {
    //   await mm.AddTrieNode(n);
    // }
    // let retTrie = await m.Step(prevTrie["root"]);
    // let retReceipt = await retTrie.wait();
    // console.log(
    //   "receipt events new state",
    //   retReceipt.events[retReceipt.events.length - 1].args,
    //   nextTrie["root"]
    // );
  }).timeout(200_000);
});
