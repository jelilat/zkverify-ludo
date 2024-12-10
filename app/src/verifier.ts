import { zkVerifySession, ZkVerifyEvents } from "zkverifyjs";
import { PROOF, PUB, VK } from "./risc0_data";
import { ethers } from "ethers";
import { config } from "dotenv";

config({
  path: "../.env",
});

const run = async () => {
  const {
    ZKV_RPC_URL,
    ZKV_SEED_PHRASE,
    ETH_RPC_URL,
    ETH_SECRET_KEY,
    ETH_ZKVERIFY_CONTRACT_ADDRESS,
    ETH_APP_CONTRACT_ADDRESS,
  } = process.env;

  // Establish a session with zkVerify
  const session = await zkVerifySession
    .start()
    .Custom(ZKV_RPC_URL)
    .withAccount(ZKV_SEED_PHRASE);

  // Send the proof to zkVerify chain for verification
  const { events, transactionResult } = await session
    .verify()
    .risc0()
    .waitForPublishedAttestation()
    .execute({
      proofData: {
        vk: VK,
        proof: PROOF,
        publicSignals: PUB,
      },
    });

  // Listen for the 'includedInBlock' event
  events.on(ZkVerifyEvents.IncludedInBlock, ({ txHash }) => {
    console.log(`Transaction accepted in zkVerify, tx-hash: ${txHash}`);
  });

  // Listen for the 'finalized' event
  events.on(ZkVerifyEvents.Finalized, ({ blockHash }) => {
    console.log(`Transaction finalized in zkVerify, block-hash: ${blockHash}`);
  });

  // Handle errors during the transaction process
  events.on("error", (error) => {
    console.error("An error occurred during the transaction:", error);
  });

  // Upon successful publication on zkVerify of the attestation containing the proof, extract:
  // - the attestation id
  // - the leaf digest (i.e. the structured hash of the statement of the proof)
  let attestationId: number | undefined;
  let leafDigest: string | null;
  try {
    ({ attestationId, leafDigest } = await transactionResult);
    console.log("Attestation published on zkVerify");
    console.log(`\tattestationId: ${attestationId}`);
    console.log(`\tleafDigest: ${leafDigest}`);
  } catch (error) {
    console.error("Transaction failed:", error);
  }

  // Retrieve via rpc call:
  // - the merkle proof of inclusion of the proof inside the attestation
  // - the total number of leaves of the attestation merkle tree
  // - the leaf index of our proof
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  let merkleProof: any;
  let numberOfLeaves: number;
  let leafIndex: number;
  try {
    const proofDetails = await session.poe(attestationId, leafDigest);
    console.log(await proofDetails);
    ({ proof: merkleProof, numberOfLeaves, leafIndex } = await proofDetails);
    console.log("Merkle proof details");
    console.log(`\tmerkleProof: ${merkleProof}`);
    console.log(`\tnumberOfLeaves: ${numberOfLeaves}`);
    console.log(`\tleafIndex: ${leafIndex}`);
  } catch (error) {
    console.error("RPC failed:", error);
  }

  const evmAccount = ethers.computeAddress(ETH_SECRET_KEY);
  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL, null, {
    polling: true,
  });
  const wallet = new ethers.Wallet(ETH_SECRET_KEY, provider);

  const abiZkvContract = [
    "event AttestationPosted(uint256 indexed attestationId, bytes32 indexed root)",
  ];

  const abiAppContract = [
    "function proveGameWinner(uint256 attestationId, bytes32[] calldata merklePath, uint256 leafCount, uint256 index)",
    "event SuccessfulProofSubmission(string indexed winner)",
  ];

  //   const zkvContract = new ethers.Contract(
  //     ETH_ZKVERIFY_CONTRACT_ADDRESS,
  //     abiZkvContract,
  //     provider
  //   );
  //   const appContract = new ethers.Contract(
  //     ETH_APP_CONTRACT_ADDRESS,
  //     abiAppContract,
  //     wallet
  //   );

  //   const filterAttestationsById = zkvContract.filters.AttestationPosted(
  //     attestationId,
  //     null
  //   );
  //   zkvContract.once(filterAttestationsById, async (_id, _root) => {
  //     // After the attestation has been posted on the EVM, send a `proveGameWinner` tx
  //     // to the app contract, with all the necessary merkle proof details
  //     const txResponse = await appContract.proveGameWinner(
  //       attestationId,
  //       merkleProof,
  //       numberOfLeaves,
  //       leafIndex
  //     );
  //     const { hash } = await txResponse;
  //     console.log(`Tx sent to EVM, tx-hash ${hash}`);
  //   });

  //   const filterAppEventsByCaller =
  //     appContract.filters.SuccessfulProofSubmission(evmAccount);
  //   appContract.once(filterAppEventsByCaller, async () => {
  //     console.log("App contract has acknowledged that you can factor 42!");
  //   });
};

run();
