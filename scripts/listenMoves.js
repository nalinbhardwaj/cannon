const http = require("http");
const fs = require("fs");
const { ethers } = require("ethers");
const { getComputerAddress } = require("../scripts/lib");

const abi_file = fs.readFileSync("validator/Computer.json");
const COMPUTER_ABI = JSON.parse(abi_file);
const COMPUTER_ADDRESS = getComputerAddress();
const WEB3_PROVIDER = "http://127.0.0.1:8545/"; // "https://ropsten.infura.io/v3/7bb750d93c994f36b98cb3539f63b4c9";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(WEB3_PROVIDER);
  const contract = new ethers.Contract(
    COMPUTER_ADDRESS,
    COMPUTER_ABI,
    provider
  );

  // console.log("contract", contract);
  contract.on("NewMove", async (index, move) => {
    index = index.toNumber();
    console.log("got new move ", index, move);
    false_input = {
      Pressed: false,
      HandlerOutput: [false, false, false, false, false, false, false, false],
    };
    inputs = [];
    inputs.push({
      Pressed: move.pressed,
      HandlerOutput: [
        move.buttonA,
        move.buttonB,
        move.buttonC,
        move.buttonD,
        move.buttonE,
        move.buttonF,
        move.buttonG,
        move.buttonH,
      ],
    });
    for (let i = 0; i < 59; i++) {
      inputs.push(false_input);
    }

    data = {
      TxNumber: index,
      PressedInputs: inputs,
    };
    const file_name = "moves/PM_CRYSTAL_" + index + ".inp.json";
    fs.writeFileSync(file_name, JSON.stringify(data));
    console.log("Written to file: ", file_name);
  });
}

main();
