use core::serde::Serde;
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address};
use starknet::{ContractAddress, get_tx_info};
use crate::mock_verifier::{IMockVerifierDispatcher, IMockVerifierDispatcherTrait};
use crate::proof_action_consumer::{
    IProofActionConsumerDispatcher, IProofActionConsumerDispatcherTrait,
};

fn deploy_contract(name: ByteArray, calldata: Array<felt252>) -> ContractAddress {
    let (address, _) = declare(name).unwrap().contract_class().deploy(@calldata).unwrap();
    address
}

fn setup() -> (IProofActionConsumerDispatcher, ContractAddress, u256) {
    let verifier_address = deploy_contract("MockVerifier", array![]);
    let actor: ContractAddress = 0x1234.try_into().unwrap();
    let protocol_version: felt252 = 1;
    let action_id: felt252 = 99;
    let policy_hash: u256 = 777;
    let issued_root: u256 = 888;
    let affected_root: u256 = 999;
    let nullifier: u256 = 555;

    let mut constructor = array![];
    verifier_address.serialize(ref constructor);
    protocol_version.serialize(ref constructor);
    action_id.serialize(ref constructor);
    1_felt252.serialize(ref constructor);
    policy_hash.serialize(ref constructor);
    issued_root.serialize(ref constructor);
    affected_root.serialize(ref constructor);
    let consumer_address = deploy_contract("ProofActionConsumer", constructor);

    let tx_info = get_tx_info().unbox();
    let actor_felt: felt252 = actor.into();
    let consumer_felt: felt252 = consumer_address.into();
    IMockVerifierDispatcher { contract_address: verifier_address }
        .set_context(
            protocol_version.into(),
            tx_info.chain_id.into(),
            consumer_felt.into(),
            action_id.into(),
            1_u256,
            actor_felt.into(),
            policy_hash,
            0xffffffffffffffff_u64.into(),
            nullifier,
            2,
            issued_root,
            affected_root,
        );
    start_cheat_caller_address(consumer_address, actor);
    (IProofActionConsumerDispatcher { contract_address: consumer_address }, actor, nullifier)
}

#[test]
fn consumes_a_bound_action_and_records_the_claim() {
    let (consumer, actor, nullifier) = setup();
    consumer.consume_proof_action(array![].span());

    assert_eq!(consumer.get_claim(actor), (true, 2));
    assert_eq!(nullifier, 555);
    assert!(consumer.is_nullifier_spent(555_u256));
}

#[test]
#[should_panic]
fn rejects_replayed_nullifiers() {
    let (consumer, _, _) = setup();
    consumer.consume_proof_action(array![].span());
    consumer.consume_proof_action(array![].span());
}
