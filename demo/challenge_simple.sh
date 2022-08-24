#!/usr/bin/env bash

# The following variables can be overridden as environment variables:
# * BLOCK (block whose transition will be challenged)
# * WRONG_BLOCK (block number used by challenger)
# * SKIP_NODE (skip forking a node, useful if you've already forked a node)
#
# Example usage:
# SKIP_NODE=1 BLOCK=13284469 WRONG_BLOCK=13284491 ./demo/challenge_simple.sh

# --- DOC ----------------------------------------------------------------------

# In this example, the challenger will challenge the transition from a block
# (`BLOCK`), but pretends that chain state before another block (`WRONG_BLOCK`)
# is the state before the challenged block. Consequently, the challenger will
# disagree with the defender on every single step of the challenge game, and the
# single step to execute will be the very first MIPS instruction executed. The
# reason is that the initial MIPS state Merkle root is stored on-chain, and
# immediately modified to reflect the fact that the input hash for the block is
# written at address 0x3000000.
#
# (The input hash is automatically validated against the blockhash, so note that
# in this demo the challenger has to provide the correct (`BLOCK`) input hash to
# the `initiateChallenge` function of `Challenge.sol`, but will execute as
# though the input hash was the one derived from `WRONG_BLOCK`.)
#
# Because the challenger uses the wrong inputs, it will assert a post-state
# (Merkle root) for the first MIPS instruction that has the wrong input hash at
# 0x3000000. Hence, the challenge will fail.


# --- SCRIPT SETUP -------------------------------------------------------------

shout() {
    echo ""
    echo "----------------------------------------"
    echo "$1"
    echo "----------------------------------------"
    echo ""
}

# Exit if any command fails.
set -e

exit_trap() {
    # Print an error if the last command failed
    # (in which case the script is exiting because of set -e).
    [[ $? == 0 ]] && return
    echo "----------------------------------------"
    echo "EARLY EXIT: SCRIPT FAILED"
    echo "----------------------------------------"

    # Kill (send SIGTERM) to the whole process group, also killing
    # any background processes.
    # I think the trap command resets SIGTERM before resending it to the whole
    # group. (cf. https://stackoverflow.com/a/2173421)
    trap - SIGTERM && kill -- -$$
}
trap "exit_trap" SIGINT SIGTERM EXIT

# --- CHALLENGE SETUP ----------------------------------------------------------

# # hardhat network to use
# NETWORK=${NETWORK:-l1}
# export NETWORK

# challenge ID, read by respond.js and assert.js
export ID=0

# clear data from previous runs
mkdir -p tmp/cannon && rm -rf tmp/cannon/*
mkdir -p tmp/cannon/fault && rm -rf tmp/cannon/fault/*
mkdir -p tmp/cannon/correct && rm -rf tmp/cannon/correct/*

# stored in tmp/cannon/correct/{golden, final}.json
shout "GENERATING INITIAL AND FINAL MEMORY STATE CHECKPOINT"
BASEDIR=tmp/cannon/correct ./mipsevm/mipsevm 72

# stored in tmp/cannon/fault/{golden, final}.json
shout "GENERATING FAULTY INITIAL AND FINAL MEMORY STATE CHECKPOINT"
BASEDIR=tmp/cannon/fault ./mipsevm/mipsevm 73

shout "DEPLOYING CONTRACTS"
BASEDIR=tmp/cannon npx hardhat run scripts/deploy.js --network localhost

# challenger will use same initial memory checkpoint and deployed contracts
cp tmp/cannon/deployed.json tmp/cannon/correct/deployed.json
cp tmp/cannon/deployed.json tmp/cannon/fault/deployed.json

# # pretend the wrong block's input, checkpoints and preimages are the right block's
# ln -s /tmp/cannon_fault/0_$WRONG_BLOCK /tmp/cannon_fault/0_$BLOCK

# --- PUBLISH COMPUTATION ------------------------------------------------------

shout "PUBLISHING COMPUTATION"
BASEDIR=tmp/cannon/correct npx hardhat run scripts/publish.js --network localhost

# --- BINARY SEARCH ------------------------------------------------------------

shout "STARTING CHALLENGE"
BASEDIR=tmp/cannon/fault npx hardhat run scripts/challenge.js --network localhost

shout "BINARY SEARCH"
for i in {1..23}; do
    echo ""
    echo "--- STEP $i / 23 ---"
    echo ""
    BASEDIR=tmp/cannon/fault CHALLENGER=1 MIPS_INPUT=73 npx hardhat run scripts/respond.js --network localhost
    BASEDIR=tmp/cannon/correct CHALLENGER=0 MIPS_INPUT=72 npx hardhat run scripts/respond.js --network localhost
done

# --- SINGLE STEP EXECUTION ----------------------------------------------------

shout "ASSERTING AS CHALLENGER (should fail)"
set +e # this should fail!
BASEDIR=tmp/cannon/fault CHALLENGER=1 MIPS_INPUT=73 npx hardhat run scripts/assert.js --network localhost
set -e

shout "ASSERTING AS DEFENDER (should pass)"
BASEDIR=tmp/cannon/correct CHALLENGER=0 MIPS_INPUT=72 npx hardhat run scripts/assert.js --network localhost
