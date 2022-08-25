const fs = require("fs");
const {
  deployed,
  getTrieNodesForCall,
  getTrieAtStep,
} = require("../scripts/lib");

async function main(){
  const challengeId = parseInt(process.env.ID);
  const isChallenger = process.env.CHALLENGER == "1";
  const mipsInput = process.env.MIPS_INPUT;
  respondChallenge(challengeId, isChallenger, mipsInput);
}

async function respondChallenge(challengeId, isChallenger, mipsInput) {
  let [contract, m, mm] = await deployed();

  let step = (await contract.getStepNumber(challengeId)).toNumber();
  console.log("searching step", step);

  if (!(await contract.isSearching(challengeId))) {
    console.log("search is done");
    return;
  }

  // see if it's proposed or not
  const proposed = await contract.getProposedState(challengeId);
  const isProposing =
    proposed ==
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  if (isProposing != isChallenger) {
    console.log("bad challenger state");
    return;
  }
  console.log("isProposing", isProposing);
  let thisTrie = getTrieAtStep(mipsInput, step);
  const root = thisTrie["root"];

  let ret;
  if (isProposing) {
    ret = await contract.proposeState(challengeId, root);
  } else {
    ret = await contract.respondState(challengeId, root);
  }
  let receipt = await ret.wait();
  console.log("done responding", receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
