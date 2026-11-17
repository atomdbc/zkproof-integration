pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

// A small fixed-depth tree keeps the development setup fast. Production policies
// can raise the depth and use a correspondingly larger trusted setup.
template MerkleMembership(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    signal current[depth + 1];
    signal left[depth];
    signal right[depth];
    component hashes[depth];

    current[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        left[i] <== current[i] + pathIndices[i] * (pathElements[i] - current[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (current[i] - pathElements[i]);
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== left[i];
        hashes[i].inputs[1] <== right[i];
        current[i + 1] <== hashes[i].out;
    }
    root <== current[depth];
}

template RecallAction() {
    // Standard proof-bound action envelope. The Cairo consumer checks every one.
    signal input protocolVersion;
    signal input chainId;
    signal input consumer;
    signal input actionId;
    signal input policyVersion;
    signal input actor;
    signal input policyHash;
    signal input expiresAt;
    signal input nullifier;
    signal input claimTier;
    signal input issuedRoot;
    signal input affectedRoot;

    // Private product credential and ownership witness.
    signal input serial;
    signal input ownerSecret;
    signal input batchId;
    signal input warrantyEnd;
    signal input issuedPathElements[4];
    signal input issuedPathIndices[4];
    signal input affectedPathElements[4];
    signal input affectedPathIndices[4];

    component ownerBinding = Poseidon(2);
    ownerBinding.inputs[0] <== ownerSecret;
    ownerBinding.inputs[1] <== actor;

    component productLeaf = Poseidon(5);
    productLeaf.inputs[0] <== serial;
    productLeaf.inputs[1] <== ownerBinding.out;
    productLeaf.inputs[2] <== batchId;
    productLeaf.inputs[3] <== warrantyEnd;
    productLeaf.inputs[4] <== claimTier;

    component issuedMembership = MerkleMembership(4);
    issuedMembership.leaf <== productLeaf.out;
    for (var i = 0; i < 4; i++) {
        issuedMembership.pathElements[i] <== issuedPathElements[i];
        issuedMembership.pathIndices[i] <== issuedPathIndices[i];
    }
    issuedMembership.root === issuedRoot;

    component affectedLeaf = Poseidon(1);
    affectedLeaf.inputs[0] <== batchId;

    component affectedMembership = MerkleMembership(4);
    affectedMembership.leaf <== affectedLeaf.out;
    for (var j = 0; j < 4; j++) {
        affectedMembership.pathElements[j] <== affectedPathElements[j];
        affectedMembership.pathIndices[j] <== affectedPathIndices[j];
    }
    affectedMembership.root === affectedRoot;

    component domain = Poseidon(5);
    domain.inputs[0] <== protocolVersion;
    domain.inputs[1] <== chainId;
    domain.inputs[2] <== consumer;
    domain.inputs[3] <== actionId;
    domain.inputs[4] <== policyVersion;

    component policy = Poseidon(5);
    policy.inputs[0] <== issuedRoot;
    policy.inputs[1] <== affectedRoot;
    policy.inputs[2] <== actionId;
    policy.inputs[3] <== protocolVersion;
    policy.inputs[4] <== policyVersion;
    policy.out === policyHash;

    component claimNullifier = Poseidon(5);
    claimNullifier.inputs[0] <== serial;
    claimNullifier.inputs[1] <== ownerSecret;
    claimNullifier.inputs[2] <== domain.out;
    claimNullifier.inputs[3] <== policyHash;
    claimNullifier.inputs[4] <== actor;
    claimNullifier.out === nullifier;

    component warrantyCoversProof = LessEqThan(64);
    warrantyCoversProof.in[0] <== expiresAt;
    warrantyCoversProof.in[1] <== warrantyEnd;
    warrantyCoversProof.out === 1;

    component validTier = LessThan(3);
    validTier.in[0] <== claimTier;
    validTier.in[1] <== 4;
    validTier.out === 1;

}

component main { public [
    protocolVersion,
    chainId,
    consumer,
    actionId,
    policyVersion,
    actor,
    policyHash,
    expiresAt,
    nullifier,
    claimTier,
    issuedRoot,
    affectedRoot
] } = RecallAction();
