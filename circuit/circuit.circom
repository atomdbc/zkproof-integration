pragma circom 2.0.0;

// Development fixture used to test the complete proving and Starknet calldata flow.
// Replace this with an application circuit before using the SDK in a real product.
template Multiplier() {
    signal input a;
    signal input b;
    signal output product;

    product <== a * b;
}

component main = Multiplier();
