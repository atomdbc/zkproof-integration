const { groth16 } = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function generateProof(a, b) {
    const input = { a, b };
    const wasmPath = path.join(__dirname, "../circuit/circuit_js/circuit.wasm"); // Updated path
    const zkeyPath = path.join(__dirname, "../circuit/circuit_final.zkey");

    const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);

    fs.writeFileSync(path.join(__dirname, "../circuit/proof.json"), JSON.stringify(proof));
    fs.writeFileSync(path.join(__dirname, "../circuit/publicSignals.json"), JSON.stringify(publicSignals));

    return { proof, publicSignals };
}

module.exports = { generateProof };
