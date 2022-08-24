// SPDX-License-Identifier: MIT
pragma solidity ^0.7.3;
pragma experimental ABIEncoderV2;

import "./lib/Lib_RLPReader.sol";
import "hardhat/console.sol";

/// @notice MIPS virtual machine interface
interface IMIPS {
  /// @notice Given a MIPS state hash (includes code & registers), execute the next instruction and returns
  ///         the update state hash.
  function Step(bytes32 stateHash) external returns (bytes32);

  /// @notice Returns the associated MIPS memory contract.
  function m() external pure returns (IMIPSMemory);
}

/// @notice MIPS memory (really "state", including registers and memory-mapped I/O)
interface IMIPSMemory {
  /// @notice Adds a `(hash(anything) => anything)` entry to the mapping that underpins all the
  ///         Merkle tries that this contract deals with (where "state hash" = Merkle root of such
  ///         a trie).
  /// @param anything node data to add to the trie
  function AddTrieNode(bytes calldata anything) external;

  function ReadMemory(bytes32 stateHash, uint32 addr) external view returns (uint32);
  function ReadBytes32(bytes32 stateHash, uint32 addr) external view returns (bytes32);

  /// @notice Write 32 bits at the given address and returns the updated state hash.
  function WriteMemory(bytes32 stateHash, uint32 addr, uint32 val) external returns (bytes32);

  /// @notice Write 32 bytes at the given address and returns the updated state hash.
  function WriteBytes32(bytes32 stateHash, uint32 addr, bytes32 val) external returns (bytes32);
}

/// @notice Implementation of the challenge game, which allows a challenger to challenge a computation
///         by asserting a different state root for the transition implied by the computation.
///         The challenger plays against a defender (the publisher of the data).
///         The challenger and the defender perform a binary search over the execution trace of the
///         fault proof program, in order to determine a single execution step that they disagree on.
///         At which point that step can be executed on-chain in order to determine if the challenge is valid.
contract Computer {
  IMIPS immutable mips;
  IMIPSMemory immutable mem;

  uint public constant BINARY_SEARCH_TIMEOUT = 60 * 10;

  constructor(IMIPS _mips) {
    mips = _mips;
    mem = _mips.m();
  }

  enum ChallengeState{ NONE, BINARY_SEARCH, CHALLENGER_WINS, DEFENDER_WINS}

  struct ChallengeData {
    // Left bound of the binary search: challenger & defender agree on all steps <= L.
    uint256 L;
    // Right bound of the binary search: challenger & defender disagree on all steps >= R.
    uint256 R;
    // Maps step numbers to asserted state hashes for the challenger.
    mapping(uint256 => bytes32) assertedState;
    // Maps step numbers to asserted state hashes for the defender.
    mapping(uint256 => bytes32) defendedState;
    // Address of the challenger.
    address payable challenger;

    uint256 computationId;
    uint lastRespondedTime;
    address lastResponder;
    ChallengeState challengeState;
  }

  /// @notice ID if the last created challenged, incremented for new challenge IDs.
  uint256 public lastChallengeId = 0;

  /// @notice Maps challenge IDs to challenge data.
  mapping(uint256 => ChallengeData) public challenges;

  mapping(uint256 => uint256[]) public computationToChallenges;

  /// @notice Emitted when a new challenge is created.
  event ChallengeCreated(uint256 challengeId);

  /// @notice Challenges the transition from block `blockNumberN` to the next block (N+1), which is
  ///         the block being challenged.
  ///         Before calling this, it is necessary to have loaded all the trie node necessary to
  ///         write the input hash in the Merkleized initial MIPS state, and to read the output hash
  ///         and machine state from the Merkleized final MIPS state (i.e. `finalSystemState`). Use
  ///         `MIPSMemory.AddTrieNode` for this purpose. Use `callWithTrieNodes` to figure out
  ///         which nodes you need.
  /// @param assertionRoot The state root that the challenger claims is the correct one
  ///        given the transactions included in block N+1.
  /// @param finalSystemState The state hash of the fault proof program's final MIPS state.
  /// @param stepCount The number of steps (MIPS instructions) taken to execute the fault proof
  ///        program.
  /// @return The challenge identifier
  function initiateChallenge(uint256 computationId, bytes32 assertionRoot, bytes32 finalSystemState, uint256 stepCount)
    external
    returns (uint256)
  {    
    // Write input hash at predefined memory address.
    Computation storage comp = computations[computationId];
    require(comp.publisher != address(0), "computation doesn't exist");
    bytes32 startState = mem.WriteBytes32(comp.initialStateHash, 0x30000000, comp.inputHash);

    // Confirm that `finalSystemState` asserts the state you claim and that the machine is stopped.
    require(mem.ReadMemory(finalSystemState, 0xC0000080) == 0x5EAD0000,
        "the final MIPS machine state is not stopped (PC != 0x5EAD0000)");
    require(mem.ReadMemory(finalSystemState, 0x30000800) == 0x1337f00d,
        "the final state root has not been written a the predefined MIPS memory location");
    require(mem.ReadBytes32(finalSystemState, 0x30000804) == assertionRoot,
        "the final MIPS machine state asserts a different state root than your challenge");

    uint256 challengeId = lastChallengeId++;
    ChallengeData storage c = challenges[challengeId];

    // A NEW CHALLENGER APPEARS
    c.challenger = msg.sender;
    c.assertedState[0] = startState;
    c.defendedState[0] = startState;
    c.assertedState[stepCount] = finalSystemState;
    c.L = 0;
    c.R = stepCount;
    c.challengeState = ChallengeState.BINARY_SEARCH;
    c.lastResponder = msg.sender;
    c.lastRespondedTime = block.timestamp;
    c.computationId = computationId;

    computationToChallenges[computationId].push(challengeId);

    emit ChallengeCreated(challengeId);
    return challengeId;
  }

  /// @notice Calling `initiateChallenge`, `confirmStateTransition` or `denyStateTransition requires
  ///         some trie nodes to have been supplied beforehand (see these functions for details).
  ///         This function can be used to figure out which nodes are needed, as memory-accessing
  ///         functions in MIPSMemory.sol will revert with the missing node ID when a node is
  ///         missing. Therefore, you can call this function repeatedly via `eth_call`, and
  ///         iteratively build the list of required node until the call succeeds.
  /// @param target The contract to call to (usually this contract)
  /// @param dat The data to include in the call (usually the calldata for a call to
  ///        one of the aforementionned functions)
  /// @param nodes The nodes to add the MIPS state trie before making the call
  function callWithTrieNodes(address target, bytes calldata dat, bytes[] calldata nodes) public {
    for (uint i = 0; i < nodes.length; i++) {
      mem.AddTrieNode(nodes[i]);
    }
    (bool success, bytes memory revertData) = target.call(dat);
    if (!success) {
      uint256 revertDataLength = revertData.length;
      assembly {
        let revertDataStart := add(revertData, 32)
        revert(revertDataStart, revertDataLength)
      }
    }
  }

  /// @notice Indicates whether the given challenge is still searching (true), or if the single step
  ///         of disagreement has been found (false).
  function isSearching(uint256 challengeId) view public returns (bool) {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    return c.L + 1 != c.R;
  }

  /// @notice Returns the next step number where the challenger and the defender must have compared
  ///         state hash, namely the midpoint between the current left and right bounds of the
  ///         binary search.
  function getStepNumber(uint256 challengeId) view public returns (uint256) {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    return (c.L+c.R)/2;
  }

  /// @notice Returns the last state hash proposed by the challenger during the binary search.
  function getProposedState(uint256 challengeId) view public returns (bytes32) {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    uint256 stepNumber = getStepNumber(challengeId);
    return c.assertedState[stepNumber];
  }

  /// @notice The challenger can call this function to submit the state hash for the next step
  ///         in the binary search (cf. `getStepNumber`).
  function proposeState(uint256 challengeId, bytes32 stateHash) external {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(c.challenger == msg.sender, "must be challenger");
    require(isSearching(challengeId), "must be searching");

    uint256 stepNumber = getStepNumber(challengeId);
    require(c.assertedState[stepNumber] == bytes32(0), "state already proposed");
    c.assertedState[stepNumber] = stateHash;
    c.lastResponder = c.challenger;
    c.lastRespondedTime = block.timestamp;
  }

  /// @notice The defender can call this function to submit the state hash for the next step
  ///         in the binary search (cf. `getStepNumber`). He can only do this after the challenger
  ///         has submitted his own state hash for this step.
  ///         If the defender believes there are less steps in the execution of the fault proof
  ///         program than the current step number, he should submit the final state hash.
  function respondState(uint256 challengeId, bytes32 stateHash) external {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(msg.sender == computations[challenges[challengeId].computationId].publisher, "not a publisher");
    require(isSearching(challengeId), "must be searching");

    uint256 stepNumber = getStepNumber(challengeId);
    require(c.assertedState[stepNumber] != bytes32(0), "challenger state not proposed");
    require(c.defendedState[stepNumber] == bytes32(0), "state already proposed");

    // Technically, we don't have to save these states, but we have to if we want to let the
    // defender terminate the proof early (and not via a timeout) after the binary search completes.
    c.defendedState[stepNumber] = stateHash;
    c.lastResponder = msg.sender;
    c.lastRespondedTime = block.timestamp;

    // update binary search bounds
    if (c.assertedState[stepNumber] == c.defendedState[stepNumber]) {
      c.L = stepNumber; // agree
    } else {
      c.R = stepNumber; // disagree
    }
  }

  /// @notice Emitted when the challenger can provably be shown to be correct about his assertion.
  event ChallengerWins(uint256 challengeId);

  /// @notice Emitted when the challenger can provably be shown to be wrong about his assertion.
  event ChallengerLoses(uint256 challengeId);

  /// @notice Emitted when the challenger should lose if he does not generate a `ChallengerWins`
  ///         event in a timely manner (TBD). This occurs in a specific scenario when we can't
  ///         explicitly verify that the defender is right (cf. `denyStateTransition).
  event ChallengerLosesByDefault(uint256 challengeId);

  /// @notice Anybody can call this function to confirm that the single execution step that the
  ///         challenger and defender disagree on does indeed yield the result asserted by the
  ///         challenger, leading to him winning the challenge.
  ///         Before calling this function, you need to add trie nodes so that the MIPS state can be
  ///         read/written by the single step execution. Use `MIPSMemory.AddTrieNode` for this
  ///         purpose. Use `callWithTrieNodes` to figure out which nodes you need.
  ///         You will also need to supply any preimage that the step tries to access with
  ///         `MIPSMemory.AddPreimage`. See `scripts/assert.js` for details on how this can be
  ///         done.
  function confirmStateTransition(uint256 challengeId) external {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(!isSearching(challengeId), "binary search not finished");

    bytes32 stepState = mips.Step(c.assertedState[c.L]);
    require(stepState == c.assertedState[c.R], "wrong asserted state for challenger");

    // pay out bounty!!
    (bool sent, ) = c.challenger.call{value: address(this).balance}("");
    require(sent, "Failed to send Ether");
    c.challengeState = ChallengeState.DEFENDER_WINS;

    emit ChallengerWins(challengeId);
  }

  /// @notice Anybody can call this function to confirm that the single execution step that the
  ///         challenger and defender disagree on does indeed yield the result asserted by the
  ///         defender, leading to the challenger losing the challenge.
  ///         Before calling this function, you need to add trie nodes so that the MIPS state can be
  ///         read/written by the single step execution. Use `MIPSMemory.AddTrieNode` for this
  ///         purpose. Use `callWithTrieNodes` to figure out which nodes you need.
  ///         You will also need to supply any preimage that the step tries to access with
  ///         `MIPSMemory.AddPreimage`. See `scripts/assert.js` for details on how this can be
  ///         done.
  function denyStateTransition(uint256 challengeId) external {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(!isSearching(challengeId), "binary search not finished");

    // We run this before the next check so that if executing the final step somehow
    // causes a revert, then at least we do not emit `ChallengerLosesByDefault` when we know that
    // the challenger can't win (even if right) because of the revert.
    bytes32 stepState = mips.Step(c.defendedState[c.L]);

    // If the challenger always agrees with the defender during the search, we end up with:
    // c.L + 1 == c.R == stepCount (from `initiateChallenge`)
    // In this case, the defender didn't assert his state hash for c.R, which makes
    // `c.defendedState[c.R]` zero. This means we can't verify that the defender right about the
    // final execution step.
    // The solution is to emit `ChallengerLosesByDefault` to signify the challenger should lose
    // if he can't emit `ChallengerWins` in a timely manner.
    if (c.defendedState[c.R] == bytes32(0)) {
      c.challengeState = ChallengeState.DEFENDER_WINS;
      emit ChallengerLosesByDefault(challengeId);
      return;
    }

    console.log("L");
    console.log(c.L);
    console.log("R");
    console.log(c.R);
    console.log("stepState");
    console.log(uint256(stepState));
    console.log("c.defendedState[c.R]");
    console.log(uint256(c.defendedState[c.R]));
    console.log("c.defendedState[c.L]");
    console.log(uint256(c.defendedState[c.L]));

    require(stepState == c.defendedState[c.R], "wrong asserted state for defender");
    c.challengeState = ChallengeState.DEFENDER_WINS;

    // make challenger pay for his wastage

    // consider the challenger mocked
    emit ChallengerLoses(challengeId);
  }

  /// @notice Allow sending money to the contract (without calldata).
  receive() external payable {}

  // /// @notice Allows the owner to withdraw funds from the contract.
  // function withdraw() external {
  //   require(msg.sender == owner);
  //   owner.transfer(address(this).balance);
  // }

  function timeoutChallenger(uint challengeId) public {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(isSearching(challengeId), "binary search finished");

    require(c.lastResponder != c.challenger, "challenger is waiting for response");
    require((block.timestamp - c.lastRespondedTime) > BINARY_SEARCH_TIMEOUT, "timeout not finished");

    c.challengeState = ChallengeState.DEFENDER_WINS;

    emit ChallengerLosesByDefault(challengeId);
  }

  function timeoutDefender(uint challengeId) public {
    ChallengeData storage c = challenges[challengeId];
    require(c.challenger != address(0), "invalid challenge");
    require(isSearching(challengeId), "binary search finished");

    require(c.lastResponder == computations[c.computationId].publisher , "defender is waiting for response");
    require((block.timestamp - c.lastRespondedTime) > BINARY_SEARCH_TIMEOUT, "timeout not finished");

    c.challengeState = ChallengeState.CHALLENGER_WINS;

    emit ChallengerWins(challengeId);
  }

  uint public constant TIME_FOR_VERIFICATION = 60 * 60;

  struct Computation {
      address publisher;
      uint publishTimestamp;
      bytes32 initialStateHash;
      bytes32 inputHash;
      bytes32 outputHash;
  }

  uint256 public lastComputationId = 1;

  mapping(uint256 => Computation) public computations;

  /// @notice Emitted when a new computation is created.
  event ComputationCreated(uint256 computationId, bytes32 initialStateHash);

  function publishComputation(bytes32 initialStateHash, bytes32 inputHash, bytes32 outputHash) public returns (uint256){    
      uint256 computationId = lastComputationId++;
      Computation storage c = computations[computationId];

      c.publisher = msg.sender;
      c.publishTimestamp = block.timestamp;
      c.initialStateHash = initialStateHash;
      c.inputHash = inputHash;
      c.outputHash = outputHash;

      emit ComputationCreated(computationId, initialStateHash);
      return computationId;
  }

  function getComputationData(uint256 computationId) public view returns (bytes32, bytes32){
      Computation storage c = computations[computationId];
      require(c.publishTimestamp > 0, "Computation ID doesn't not exist");
      return (c.inputHash, c.outputHash);
  }

  function isVerified(uint256 computationId) public view returns (bool) {
      // if its been some time since computation was created and it hasn't been succesfully challenged
      Computation storage c = computations[computationId];
      require(c.publishTimestamp > 0, "Computation ID doesn't not exist");
      
      for (uint256 i = 0; i < computationToChallenges[computationId].length;i++) {
        uint256 challengeId = computationToChallenges[computationId][i];
        if (challenges[challengeId].challengeState == ChallengeState.CHALLENGER_WINS){
          return false;
        }
      }
      uint timeSincePublished = (block.timestamp - c.publishTimestamp); 
      return timeSincePublished >= TIME_FOR_VERIFICATION;
  }
}
