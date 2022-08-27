const fs = require("fs");
const {
  deployed,
  getTrieNodesForCall,
  getTrieAtStep,
  respondChallenge,
} = require("../scripts/lib");

async function main(){
  const challengeId = parseInt(process.env.ID);
  const isChallenger = process.env.CHALLENGER == "1";
  const mipsInput = process.env.MIPS_INPUT;
  respondChallenge(challengeId, isChallenger, mipsInput);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
