const { generateProof } = require("../src/generateProof");

test("generateProof should generate proof for given inputs", async () => {
    const { proof, publicSignals } = await generateProof(3, 11);
    expect(proof).toBeDefined();
    expect(publicSignals).toBeDefined();
});
