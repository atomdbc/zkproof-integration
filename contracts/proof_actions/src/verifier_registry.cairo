use starknet::{ClassHash, ContractAddress};

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct VerifierRecord {
    pub verifier: ContractAddress,
    pub class_hash: ClassHash,
    pub manifest_hash: felt252,
    pub public_signal_count: u32,
    pub active: bool,
}

#[starknet::interface]
pub trait IVerifierRegistry<TContractState> {
    fn register(
        ref self: TContractState,
        policy_key: u256,
        verifier: ContractAddress,
        class_hash: ClassHash,
        manifest_hash: felt252,
        public_signal_count: u32,
    );
    fn set_active(ref self: TContractState, policy_key: u256, active: bool);
    fn resolve(self: @TContractState, policy_key: u256) -> VerifierRecord;
    fn get_owner(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod VerifierRegistry {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ClassHash, ContractAddress, get_caller_address};
    use super::VerifierRecord;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        records: Map<u256, VerifierRecord>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        VerifierRegistered: VerifierRegistered,
        VerifierStatusChanged: VerifierStatusChanged,
    }

    #[derive(Drop, starknet::Event)]
    struct VerifierRegistered {
        #[key]
        policy_key: u256,
        verifier: ContractAddress,
        class_hash: ClassHash,
        manifest_hash: felt252,
        public_signal_count: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct VerifierStatusChanged {
        #[key]
        policy_key: u256,
        active: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        assert(!owner.is_zero(), 'ZERO_OWNER');
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl VerifierRegistryImpl of super::IVerifierRegistry<ContractState> {
        fn register(
            ref self: ContractState,
            policy_key: u256,
            verifier: ContractAddress,
            class_hash: ClassHash,
            manifest_hash: felt252,
            public_signal_count: u32,
        ) {
            self.assert_owner();
            assert(!policy_key.is_zero(), 'ZERO_POLICY_KEY');
            assert(!verifier.is_zero(), 'ZERO_VERIFIER');
            assert(public_signal_count > 0, 'ZERO_SIGNALS');
            let record = VerifierRecord {
                verifier, class_hash, manifest_hash, public_signal_count, active: true,
            };
            self.records.write(policy_key, record);
            self
                .emit(
                    VerifierRegistered {
                        policy_key, verifier, class_hash, manifest_hash, public_signal_count,
                    },
                );
        }

        fn set_active(ref self: ContractState, policy_key: u256, active: bool) {
            self.assert_owner();
            let record = self.records.read(policy_key);
            assert(!record.verifier.is_zero(), 'UNKNOWN_POLICY');
            self
                .records
                .write(
                    policy_key,
                    VerifierRecord {
                        verifier: record.verifier,
                        class_hash: record.class_hash,
                        manifest_hash: record.manifest_hash,
                        public_signal_count: record.public_signal_count,
                        active,
                    },
                );
            self.emit(VerifierStatusChanged { policy_key, active });
        }

        fn resolve(self: @ContractState, policy_key: u256) -> VerifierRecord {
            self.records.read(policy_key)
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), 'ONLY_OWNER');
        }
    }
}
