const express = require("express");
const { generateProof } = require("./generateProof");
const { verifyProof } = require("./verifyProof");

const app = express();
app.use(express.json());

app.post("/generate-proof", async (req, res) => {
    const { a, b } = req.body;
    try {
        const result = await generateProof(a, b);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/verify-proof", async (req, res) => {
    const { proof, publicSignals } = req.body;
    try {
        const isValid = await verifyProof(proof, publicSignals);
        res.json({ isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
