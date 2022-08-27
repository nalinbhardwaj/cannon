const {makeMove} = require("../scripts/lib")

async function main(){
    arg = process.argv[2];
    move = {
        pressed: arg != "none",
        buttonA: arg == "a", 
        buttonB: arg == "b",
        buttonC: arg == "sel",
        buttonD: arg == "start",
        buttonE: arg == "d",
        buttonF: arg == "a", 
        buttonG: arg == "w",
        buttonH: arg == "s",
    }
    await makeMove(move);
}  

main();