const {
  deployed,
  getTrieNodesForCall,
  getTrieAtStep,
} = require("../scripts/lib");

async function main() {
  let [c, m, mm] = await deployed();

  const challengeId = parseInt(process.env.ID);
  const isChallenger = process.env.CHALLENGER == "1";
  const mipsInput = process.env.MIPS_INPUT;

  let step = (await c.getStepNumber(challengeId)).toNumber();
  console.log("searching step", step);

  if (await c.isSearching(challengeId)) {
    console.log("search is NOT done");
    return;
  }

  let cdat;
  if (isChallenger) {
    // challenger declare victory
    cdat = c.interface.encodeFunctionData("confirmStateTransition", [
      challengeId,
    ]);
  } else {
    // defender declare victory
    // note: not always possible
    cdat = c.interface.encodeFunctionData("denyStateTransition", [challengeId]);
  }

  let startTrie = getTrieAtStep(mipsInput, step);
  let finalTrie = getTrieAtStep(mipsInput, step + 1);
  let finalPlusTrie = getTrieAtStep(mipsInput, step + 2);
  console.log("startTrie", startTrie["root"]);
  console.log("finalTrie", finalTrie["root"]);
  console.log("finalPlusTrie", finalPlusTrie["root"]);
  console.log("step", step);
  console.log("mipsInput", mipsInput);
  let preimages = Object.assign(
    {},
    startTrie["preimages"],
    finalTrie["preimages"]
  );

  let nodes = await getTrieNodesForCall(c, c.address, cdat, preimages);
  for (n of nodes) {
    await mm.AddTrieNode(n);
  }

  // let ret;
  // if (isChallenger) {
  //   ret = await c.confirmStateTransition(challengeId);
  // } else {
  //   ret = await c.denyStateTransition(challengeId);
  // }

  // let receipt = await ret.wait();
  // console.log(receipt.events.map((x) => x.event));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
