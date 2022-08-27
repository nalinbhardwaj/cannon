const fs = require("fs");
const rlp = require("rlp");
const child_process = require("child_process");
const { ethers } = require("hardhat");

const basedir = process.env.BASEDIR;

async function deploy() {
  const MIPS = await ethers.getContractFactory("MIPS");
  const m = await MIPS.deploy();
  const mm = await ethers.getContractAt("MIPSMemory", await m.m());

  // const Challenge = await ethers.getContractFactory("Challenge")
  // const c = await Challenge.deploy(m.address, goldenRoot)

  const Computer = await ethers.getContractFactory("Computer");
  const comp = await Computer.deploy(m.address);

  return [comp, m, mm];
}

async function deployed() {
  let addresses = JSON.parse(fs.readFileSync("tmp/cannon/deployed.json"));
  const c = await ethers.getContractAt("Computer", addresses["Computer"]);
  const m = await ethers.getContractAt("MIPS", addresses["MIPS"]);
  const mm = await ethers.getContractAt("MIPSMemory", addresses["MIPSMemory"]);
  return [c, m, mm];
}

function getComputerAddress() {
  let addresses = JSON.parse(fs.readFileSync("tmp/cannon/deployed.json"));
  return addresses["Computer"];
}

class MissingHashError extends Error {
  constructor(hash, offset) {
    super("hash is missing");
    this.hash = hash;
    this.offset = offset;
  }
}

async function getTrieNodesForCall(c, caddress, cdat, preimages) {
  let nodes = [];
  while (1) {
    try {
      // TODO: make this eth call?
      // needs something like initiateChallengeWithTrieNodesj
      let calldata = c.interface.encodeFunctionData("callWithTrieNodes", [
        caddress,
        cdat,
        nodes,
      ]);
      ret = await ethers.provider.call({
        to: c.address,
        data: calldata,
      });
      break;
    } catch (e) {
      let missing = e.toString().split("'")[1];
      if (missing == undefined) {
        // other kind of error from HTTPProvider
        missing = e.error.message.toString().split("execution reverted: ")[1];
      }
      if (missing !== undefined && missing.length == 64) {
        console.log("requested node", missing);
        let node = preimages["0x" + missing];
        if (node === undefined) {
          throw "node not found";
        }
        const bin = Uint8Array.from(
          Buffer.from(node, "base64").toString("binary"),
          (c) => c.charCodeAt(0)
        );
        nodes.push(bin);
        continue;
      } else if (missing !== undefined && missing.length == 128) {
        let hash = missing.slice(0, 64);
        let offset = parseInt(missing.slice(64, 128), 16);
        console.log("requested hash oracle", hash, offset);
        throw new MissingHashError(hash, offset);
      } else {
        console.log(e);
        break;
      }
    }
  }
  return nodes;
}

function getTrieAtStep(mipsInput, step, basedir) {
  const fn = basedir + "/checkpoint-" + step.toString() + ".json";

  if (!fs.existsSync(fn)) {
    console.log("running mipsevm for step: ", step);
    const basedir_str = "BASEDIR="+basedir+" ";
    child_process.execSync(
      (!!basedir ? basedir_str : "") + 
      "TARGET_STEP=" +
        step.toString() +
        " ./mipsevm/mipsevm " +
        mipsInput.toString(),
      {
        stdio: "inherit",
      }
    );
  }

  return JSON.parse(fs.readFileSync(fn));
}

async function writeMemory(mm, root, addr, data, bytes32 = false) {
  if (bytes32) {
    ret = await mm.WriteBytes32WithReceipt(root, addr, data);
  } else {
    ret = await mm.WriteMemoryWithReceipt(root, addr, data);
  }
  const receipt = await ret.wait();
  for (l of receipt.logs) {
    if (
      l.topics[0] ==
      "0x86b89b5c9818dbbf520dd979a5f250d357508fe11b9511d4a43fd9bc6aa1be70"
    ) {
      root = l.data;
    }
  }
  console.log("new hash", root);
  return root;
}


async function initiateChallenge(computationId, basedir) {

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
  return challengeId;
}


async function finishChallenge(challengeId, isChallenger, mipsInput, base_dir) {
  let [c, m, mm] = await deployed();

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

  let startTrie = getTrieAtStep(mipsInput, step, base_dir);
  let finalTrie = getTrieAtStep(mipsInput, step + 1, base_dir);
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

  let ret;
  if (isChallenger) {
    ret = await c.confirmStateTransition(challengeId);
  } else {
    ret = await c.denyStateTransition(challengeId);
  }

  let receipt = await ret.wait();
  console.log(receipt.events.map((x) => x.event));
}

async function respondChallenge(challengeId, isChallenger, mipsInput, basedir) {
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
  let thisTrie = getTrieAtStep(mipsInput, step, basedir);
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

async function makeMove(move){  
  let [contract, m, mm] = await deployed();

 

  await contract.addMove(move);
  console.log("Move done");
}

module.exports = {
  basedir,
  deploy,
  deployed,
  getTrieNodesForCall,
  getTrieAtStep,
  writeMemory,
  makeMove,
  initiateChallenge,
  respondChallenge,
  finishChallenge,
  getComputerAddress,
  MissingHashError,
};
