const { verifyProof } = require("../src/verifyProof");
const { generateProof } = require("../src/generateProof");

test("verifyProof should verify the generated proof", async () => {
    const { proof, publicSignals } = await generateProof(3, 11);
    const isValid = await verifyProof(proof, publicSignals);
    expect(isValid).toBe(true);
});
