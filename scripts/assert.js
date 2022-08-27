const {
  deployed,
  getTrieNodesForCall,
  getTrieAtStep,
  finishChallenge,
} = require("../scripts/lib");


async function main(){
  const challengeId = parseInt(process.env.ID);
  const isChallenger = process.env.CHALLENGER == "1";
  const mipsInput = process.env.MIPS_INPUT;
  finishChallenge(challengeId, isChallenger, mipsInput);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
