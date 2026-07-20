#![cfg(test)]

use crate::{ContractError, VelostellContract, VelostellContractClient};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    token, Address, Env, String, Vec,
};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(env, &sac.address()),
        token::StellarAssetClient::new(env, &sac.address()),
    )
}

#[test]
fn test_send_payment_success() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let memo = String::from_str(&env, "Invoice #101");
    let payment_id = client.send_payment(&sender, &recipient, &token_client.address, &300, &memo);

    assert_eq!(payment_id, 1);
    assert_eq!(token_client.balance(&sender), 700);
    assert_eq!(token_client.balance(&recipient), 300);

    let sender_history = client.get_payment_history(&sender);
    assert_eq!(sender_history.len(), 1);
    assert_eq!(sender_history.get(0).unwrap().amount, 300);
    assert_eq!(sender_history.get(0).unwrap().memo, memo);
}

#[test]
fn test_send_payment_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &500);

    client.send_payment(
        &sender,
        &recipient,
        &token_client.address,
        &200,
        &String::from_str(&env, "Event Test"),
    );

    let events = env.events().all();
    assert!(events.len() > 0);
}

#[test]
fn test_split_payment_success_equal_split() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let rec1 = Address::generate(&env);
    let rec2 = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let mut recipients = Vec::new(&env);
    recipients.push_back(rec1.clone());
    recipients.push_back(rec2.clone());

    let mut percentages = Vec::new(&env);
    percentages.push_back(5000); // 50%
    percentages.push_back(5000); // 50%

    let res = client.try_split_payment(&sender, &token_client.address, &1000, &recipients, &percentages);
    assert!(res.is_ok());

    assert_eq!(token_client.balance(&sender), 0);
    assert_eq!(token_client.balance(&rec1), 500);
    assert_eq!(token_client.balance(&rec2), 500);
}

#[test]
fn test_split_payment_fails_invalid_percentages() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let rec1 = Address::generate(&env);
    let rec2 = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let mut recipients = Vec::new(&env);
    recipients.push_back(rec1);
    recipients.push_back(rec2);

    let mut percentages = Vec::new(&env);
    percentages.push_back(4000); // 40%
    percentages.push_back(5000); // 50% -> total 9000 != 10000

    let res = client.try_split_payment(&sender, &token_client.address, &1000, &recipients, &percentages);
    assert_eq!(res, Err(Ok(ContractError::InvalidSplit)));
}

#[test]
fn test_create_stream_escrows_funds() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &4,
        &3600,
    );

    assert_eq!(stream_id, 1);
    assert_eq!(token_client.balance(&sender), 0);
    assert_eq!(token_client.balance(&contract_id), 1000);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.total_amount, 1000);
    assert_eq!(stream.installments, 4);
    assert_eq!(stream.active, true);
}

#[test]
fn test_claim_stream_partial_installments() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &4, // 250 per installment
        &3600, // 1 hour intervals
    );

    // Fast forward 2.5 hours (2 intervals elapsed)
    env.ledger().set_timestamp(env.ledger().timestamp() + 9000);

    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 500); // 2 * 250 = 500
    assert_eq!(token_client.balance(&recipient), 500);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed_installments, 2);
    assert_eq!(stream.claimed_amount, 500);
    assert_eq!(stream.active, true);
}

#[test]
fn test_claim_stream_fails_before_first_interval() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &4,
        &3600,
    );

    // Fast forward only 1000 seconds (less than 3600 interval)
    env.ledger().set_timestamp(env.ledger().timestamp() + 1000);

    let res = client.try_claim_stream(&stream_id, &recipient);
    assert_eq!(res, Err(Ok(ContractError::NothingToClaim)));
}

#[test]
fn test_claim_stream_full_after_all_installments() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &3, // 333, 333, 334
        &3600,
    );

    // Fast forward 5 hours (past all 3 intervals)
    env.ledger().set_timestamp(env.ledger().timestamp() + 18000);

    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 1000); // Full payout including remainder
    assert_eq!(token_client.balance(&recipient), 1000);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.claimed_installments, 3);
    assert_eq!(stream.claimed_amount, 1000);
    assert_eq!(stream.active, false);
}

#[test]
fn test_cancel_stream_refunds_remaining() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &4,
        &3600,
    );

    // Fast forward 1 interval, recipient claims 250
    env.ledger().set_timestamp(env.ledger().timestamp() + 3600);
    client.claim_stream(&stream_id, &recipient);

    // Sender cancels stream
    let refunded = client.cancel_stream(&stream_id, &sender);
    assert_eq!(refunded, 750); // 1000 - 250 = 750
    assert_eq!(token_client.balance(&sender), 750);
    assert_eq!(token_client.balance(&contract_id), 0);

    let stream = client.get_stream(&stream_id);
    assert_eq!(stream.active, false);
}

#[test]
fn test_double_claim_same_installment_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(VelostellContract, ());
    let client = VelostellContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let admin = Address::generate(&env);

    let (token_client, token_admin) = create_token_contract(&env, &admin);
    token_admin.mint(&sender, &1000);

    let stream_id = client.create_stream(
        &sender,
        &recipient,
        &token_client.address,
        &1000,
        &4,
        &3600,
    );

    // Fast forward 1 interval
    env.ledger().set_timestamp(env.ledger().timestamp() + 3600);
    let claimed = client.claim_stream(&stream_id, &recipient);
    assert_eq!(claimed, 250);

    // Immediately try to claim again without time passing
    let res = client.try_claim_stream(&stream_id, &recipient);
    assert_eq!(res, Err(Ok(ContractError::NothingToClaim)));
}
