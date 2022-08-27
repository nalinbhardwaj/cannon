const fs = require("fs");
const {
  basedir,
  deployed,
  getBlockRlp,
  getTrieNodesForCall,
  initiateChallenge,
} = require("../scripts/lib");

async function main(){
  const basedir = process.env.BASEDIR;
  initiateChallenge(1, basedir);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
