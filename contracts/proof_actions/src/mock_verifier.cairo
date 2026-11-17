#[starknet::interface]
pub trait IMockVerifier<TContractState> {
    fn set_context(
        ref self: TContractState,
        protocol_version: u256,
        chain_id: u256,
        consumer: u256,
        action_id: u256,
        policy_version: u256,
        actor: u256,
        policy_hash: u256,
        expires_at: u256,
        nullifier: u256,
        result: u256,
        issued_root: u256,
        affected_root: u256,
    );
}

#[starknet::contract]
mod MockVerifier {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        protocol_version: u256,
        chain_id: u256,
        consumer: u256,
        action_id: u256,
        policy_version: u256,
        actor: u256,
        policy_hash: u256,
        expires_at: u256,
        nullifier: u256,
        result: u256,
        issued_root: u256,
        affected_root: u256,
    }

    #[abi(embed_v0)]
    impl MockVerifierImpl of super::IMockVerifier<ContractState> {
        fn set_context(
            ref self: ContractState,
            protocol_version: u256,
            chain_id: u256,
            consumer: u256,
            action_id: u256,
            policy_version: u256,
            actor: u256,
            policy_hash: u256,
            expires_at: u256,
            nullifier: u256,
            result: u256,
            issued_root: u256,
            affected_root: u256,
        ) {
            self.protocol_version.write(protocol_version);
            self.chain_id.write(chain_id);
            self.consumer.write(consumer);
            self.action_id.write(action_id);
            self.policy_version.write(policy_version);
            self.actor.write(actor);
            self.policy_hash.write(policy_hash);
            self.expires_at.write(expires_at);
            self.nullifier.write(nullifier);
            self.result.write(result);
            self.issued_root.write(issued_root);
            self.affected_root.write(affected_root);
        }
    }

    #[external(v0)]
    fn verify_groth16_proof_bn254(
        self: @ContractState, _full_proof_with_hints: Span<felt252>,
    ) -> Result<Span<u256>, felt252> {
        let mut values = array![];
        values.append(self.protocol_version.read());
        values.append(self.chain_id.read());
        values.append(self.consumer.read());
        values.append(self.action_id.read());
        values.append(self.policy_version.read());
        values.append(self.actor.read());
        values.append(self.policy_hash.read());
        values.append(self.expires_at.read());
        values.append(self.nullifier.read());
        values.append(self.result.read());
        values.append(self.issued_root.read());
        values.append(self.affected_root.read());
        Result::Ok(values.span())
    }
}
