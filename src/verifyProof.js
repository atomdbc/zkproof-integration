const { groth16 } = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function verifyProof(proof, publicSignals) {
    const verificationKey = JSON.parse(fs.readFileSync(path.join(__dirname, "../circuit/verification_key.json")));

    const res = await groth16.verify(verificationKey, publicSignals, proof);

    return res;
}

module.exports = { verifyProof };
