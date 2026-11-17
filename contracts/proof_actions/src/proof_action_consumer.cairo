use starknet::ContractAddress;

#[starknet::interface]
pub trait IGroth16VerifierBN254<TContractState> {
    fn verify_groth16_proof_bn254(
        self: @TContractState, full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252>;
}

#[starknet::interface]
pub trait IProofActionConsumer<TContractState> {
    fn consume_proof_action(
        ref self: TContractState, full_proof_with_hints: Span<felt252>,
    ) -> felt252;
    fn is_nullifier_spent(self: @TContractState, nullifier: u256) -> bool;
    fn get_claim(self: @TContractState, actor: ContractAddress) -> (bool, felt252);
    fn get_configuration(
        self: @TContractState,
    ) -> (ContractAddress, felt252, felt252, felt252, u256, u256, u256);
}

#[starknet::contract]
pub mod ProofActionConsumer {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address, get_tx_info,
    };
    use super::{IGroth16VerifierBN254Dispatcher, IGroth16VerifierBN254DispatcherTrait};

    const PUBLIC_SIGNAL_COUNT: u32 = 12;

    #[storage]
    struct Storage {
        verifier: ContractAddress,
        protocol_version: felt252,
        action_id: felt252,
        policy_version: felt252,
        policy_hash: u256,
        issued_root: u256,
        affected_root: u256,
        spent_nullifiers: Map<u256, bool>,
        has_claim: Map<ContractAddress, bool>,
        claim_tier: Map<ContractAddress, felt252>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ProofActionConsumed: ProofActionConsumed,
    }

    #[derive(Drop, starknet::Event)]
    struct ProofActionConsumed {
        #[key]
        actor: ContractAddress,
        #[key]
        nullifier: u256,
        result: felt252,
        policy_hash: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        verifier: ContractAddress,
        protocol_version: felt252,
        action_id: felt252,
        policy_version: felt252,
        policy_hash: u256,
        issued_root: u256,
        affected_root: u256,
    ) {
        assert(!verifier.is_zero(), 'ZERO_VERIFIER');
        self.verifier.write(verifier);
        self.protocol_version.write(protocol_version);
        self.action_id.write(action_id);
        self.policy_version.write(policy_version);
        self.policy_hash.write(policy_hash);
        self.issued_root.write(issued_root);
        self.affected_root.write(affected_root);
    }

    #[abi(embed_v0)]
    impl ProofActionConsumerImpl of super::IProofActionConsumer<ContractState> {
        fn consume_proof_action(
            ref self: ContractState, full_proof_with_hints: Span<felt252>,
        ) -> felt252 {
            let verifier = IGroth16VerifierBN254Dispatcher {
                contract_address: self.verifier.read(),
            };
            let public_inputs = match verifier.verify_groth16_proof_bn254(full_proof_with_hints) {
                Result::Ok(inputs) => inputs,
                Result::Err(_) => panic!("INVALID_PROOF"),
            };
            assert(public_inputs.len() == PUBLIC_SIGNAL_COUNT, 'SIGNAL_COUNT');

            let protocol_version = as_felt(*public_inputs.at(0));
            let chain_id = as_felt(*public_inputs.at(1));
            let consumer = as_felt(*public_inputs.at(2));
            let action_id = as_felt(*public_inputs.at(3));
            let policy_version = as_felt(*public_inputs.at(4));
            let actor_felt = as_felt(*public_inputs.at(5));
            let policy_hash = *public_inputs.at(6);
            let expires_at = *public_inputs.at(7);
            let nullifier = *public_inputs.at(8);
            let result = as_felt(*public_inputs.at(9));
            let issued_root = *public_inputs.at(10);
            let affected_root = *public_inputs.at(11);

            assert(protocol_version == self.protocol_version.read(), 'PROTOCOL_VERSION');
            assert(chain_id == get_tx_info().chain_id, 'WRONG_CHAIN');
            let contract_felt: felt252 = get_contract_address().into();
            assert(consumer == contract_felt, 'WRONG_CONSUMER');
            assert(action_id == self.action_id.read(), 'WRONG_ACTION');
            assert(policy_version == self.policy_version.read(), 'WRONG_POLICY_VERSION');
            assert(policy_hash == self.policy_hash.read(), 'WRONG_POLICY');
            assert(issued_root == self.issued_root.read(), 'WRONG_ISSUED_ROOT');
            assert(affected_root == self.affected_root.read(), 'WRONG_AFFECTED_ROOT');
            let expires_at_u64: u64 = expires_at.try_into().expect('INVALID_EXPIRY');
            assert(expires_at_u64 >= get_block_timestamp(), 'PROOF_EXPIRED');
            assert(!nullifier.is_zero(), 'ZERO_NULLIFIER');
            assert(!self.spent_nullifiers.read(nullifier), 'NULLIFIER_SPENT');

            let actor: ContractAddress = actor_felt.try_into().expect('INVALID_ACTOR');
            assert(actor == get_caller_address(), 'WRONG_CALLER');
            let result_u8: u8 = result.try_into().expect('INVALID_RESULT');
            assert(result_u8 < 4, 'INVALID_RESULT');

            self.spent_nullifiers.write(nullifier, true);
            self.has_claim.write(actor, true);
            self.claim_tier.write(actor, result);
            self.emit(ProofActionConsumed { actor, nullifier, result, policy_hash });
            result
        }

        fn is_nullifier_spent(self: @ContractState, nullifier: u256) -> bool {
            self.spent_nullifiers.read(nullifier)
        }

        fn get_claim(self: @ContractState, actor: ContractAddress) -> (bool, felt252) {
            (self.has_claim.read(actor), self.claim_tier.read(actor))
        }

        fn get_configuration(
            self: @ContractState,
        ) -> (ContractAddress, felt252, felt252, felt252, u256, u256, u256) {
            (
                self.verifier.read(),
                self.protocol_version.read(),
                self.action_id.read(),
                self.policy_version.read(),
                self.policy_hash.read(),
                self.issued_root.read(),
                self.affected_root.read(),
            )
        }
    }

    fn as_felt(value: u256) -> felt252 {
        value.try_into().expect('SIGNAL_TOO_LARGE')
    }
}
