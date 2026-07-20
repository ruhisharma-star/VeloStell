#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env,
    String, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    InvalidSplit = 1,
    NothingToClaim = 2,
    Unauthorized = 3,
    StreamNotFound = 4,
    StreamAlreadyCancelled = 5,
    InvalidAmount = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub id: u32,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub memo: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u32,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub installments: u32,
    pub interval_seconds: u64,
    pub start_time: u64,
    pub claimed_installments: u32,
    pub claimed_amount: i128,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    PaymentCount,
    Payment(u32),
    UserHistory(Address),
    StreamCount,
    Stream(u32),
}

const PERSISTENT_BUMP_AMOUNT: u32 = 518_400; // ~30 days in ledgers
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 120_000;

#[contract]
pub struct VelostellContract;

#[contractimpl]
impl VelostellContract {
    /// Send direct payment with memo, invoking native Stellar Asset Contract transfer
    pub fn send_payment(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        memo: String,
    ) -> Result<u32, ContractError> {
        sender.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // Inter-contract call to SAC transfer
        token::Client::new(&env, &token).transfer(&sender, &recipient, &amount);

        let mut count: u32 = env.storage().persistent().get(&DataKey::PaymentCount).unwrap_or(0);
        count = count.checked_add(1).ok_or(ContractError::InvalidAmount)?;

        let record = PaymentRecord {
            id: count,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            amount,
            memo: memo.clone(),
            timestamp: env.ledger().timestamp(),
        };

        // Save payment record
        env.storage().persistent().set(&DataKey::Payment(count), &record);
        env.storage().persistent().set(&DataKey::PaymentCount, &count);
        env.storage().persistent().extend_ttl(
            &DataKey::Payment(count),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        // Update user histories
        Self::append_user_history(&env, &sender, count);
        Self::append_user_history(&env, &recipient, count);

        // Emit payment_sent event
        env.events().publish(
            (symbol_short!("pay_sent"), sender, recipient),
            (amount, memo),
        );

        Ok(count)
    }

    /// Execute multi-recipient split payment with basis point validation
    pub fn split_payment(
        env: Env,
        sender: Address,
        token: Address,
        total_amount: i128,
        recipients: Vec<Address>,
        percentages: Vec<u32>,
    ) -> Result<(), ContractError> {
        sender.require_auth();

        if total_amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let len = recipients.len();
        if len == 0 || len != percentages.len() {
            return Err(ContractError::InvalidSplit);
        }

        // Validate percentages sum to 10000 basis points (100%)
        let mut total_basis: u32 = 0;
        for i in 0..len {
            let pct = percentages.get(i).unwrap();
            total_basis = total_basis.checked_add(pct).ok_or(ContractError::InvalidSplit)?;
        }

        if total_basis != 10000 {
            return Err(ContractError::InvalidSplit);
        }

        let token_client = token::Client::new(&env, &token);

        for i in 0..len {
            let recipient = recipients.get(i).unwrap();
            let pct = percentages.get(i).unwrap();

            let share = total_amount
                .checked_mul(pct as i128)
                .ok_or(ContractError::InvalidAmount)?
                .checked_div(10000)
                .ok_or(ContractError::InvalidAmount)?;

            if share > 0 {
                token_client.transfer(&sender, &recipient, &share);
            }
        }

        // Emit split_payment_executed event
        env.events().publish(
            (symbol_short!("split_ex"), sender),
            (total_amount, len as u32),
        );

        Ok(())
    }

    /// Create scheduled payment stream and pre-fund escrow
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        installments: u32,
        interval_seconds: u64,
    ) -> Result<u32, ContractError> {
        sender.require_auth();

        if total_amount <= 0 || installments == 0 || interval_seconds == 0 {
            return Err(ContractError::InvalidAmount);
        }

        // Transfer funds into contract escrow
        token::Client::new(&env, &token).transfer(
            &sender,
            &env.current_contract_address(),
            &total_amount,
        );

        let mut count: u32 = env.storage().persistent().get(&DataKey::StreamCount).unwrap_or(0);
        count = count.checked_add(1).ok_or(ContractError::InvalidAmount)?;

        let stream = Stream {
            id: count,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token,
            total_amount,
            installments,
            interval_seconds,
            start_time: env.ledger().timestamp(),
            claimed_installments: 0,
            claimed_amount: 0,
            active: true,
        };

        env.storage().persistent().set(&DataKey::Stream(count), &stream);
        env.storage().persistent().set(&DataKey::StreamCount, &count);
        env.storage().persistent().extend_ttl(
            &DataKey::Stream(count),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        // Emit stream_created event
        env.events().publish(
            (symbol_short!("strm_crt"), count, sender),
            recipient,
        );

        Ok(count)
    }

    /// Claim due installments from active payment stream
    pub fn claim_stream(env: Env, stream_id: u32, recipient: Address) -> Result<i128, ContractError> {
        recipient.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(ContractError::StreamNotFound)?;

        if !stream.active {
            return Err(ContractError::StreamAlreadyCancelled);
        }

        if recipient != stream.recipient {
            return Err(ContractError::Unauthorized);
        }

        let current_time = env.ledger().timestamp();
        let elapsed_time = current_time.saturating_sub(stream.start_time);
        let elapsed_intervals = (elapsed_time / stream.interval_seconds) as u32;
        let total_due_installments = elapsed_intervals.min(stream.installments);

        if total_due_installments <= stream.claimed_installments {
            return Err(ContractError::NothingToClaim);
        }

        let new_installments = total_due_installments
            .checked_sub(stream.claimed_installments)
            .ok_or(ContractError::InvalidAmount)?;

        let claim_amount = if total_due_installments == stream.installments {
            // Remainder handling on final installment
            stream
                .total_amount
                .checked_sub(stream.claimed_amount)
                .ok_or(ContractError::InvalidAmount)?
        } else {
            let installment_amount = stream
                .total_amount
                .checked_div(stream.installments as i128)
                .ok_or(ContractError::InvalidAmount)?;
            installment_amount
                .checked_mul(new_installments as i128)
                .ok_or(ContractError::InvalidAmount)?
        };

        if claim_amount <= 0 {
            return Err(ContractError::NothingToClaim);
        }

        // Inter-contract call to release escrow to recipient
        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &recipient,
            &claim_amount,
        );

        stream.claimed_installments = total_due_installments;
        stream.claimed_amount = stream
            .claimed_amount
            .checked_add(claim_amount)
            .ok_or(ContractError::InvalidAmount)?;

        if stream.claimed_installments == stream.installments {
            stream.active = false;
        }

        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(
            &DataKey::Stream(stream_id),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        // Emit stream_claimed event
        env.events().publish(
            (symbol_short!("strm_clm"), stream_id, recipient),
            claim_amount,
        );

        Ok(claim_amount)
    }

    /// Cancel stream and refund remaining unclaimed escrow back to sender
    pub fn cancel_stream(env: Env, stream_id: u32, sender: Address) -> Result<i128, ContractError> {
        sender.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(ContractError::StreamNotFound)?;

        if !stream.active {
            return Err(ContractError::StreamAlreadyCancelled);
        }

        if sender != stream.sender {
            return Err(ContractError::Unauthorized);
        }

        let remaining_amount = stream
            .total_amount
            .checked_sub(stream.claimed_amount)
            .ok_or(ContractError::InvalidAmount)?;

        stream.active = false;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(
            &DataKey::Stream(stream_id),
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        if remaining_amount > 0 {
            token::Client::new(&env, &stream.token).transfer(
                &env.current_contract_address(),
                &sender,
                &remaining_amount,
            );
        }

        // Emit stream_cancelled event
        env.events().publish(
            (symbol_short!("strm_cnc"), stream_id),
            remaining_amount,
        );

        Ok(remaining_amount)
    }

    /// Read payment history for an address
    pub fn get_payment_history(env: Env, address: Address) -> Vec<PaymentRecord> {
        let history_ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::UserHistory(address))
            .unwrap_or(Vec::new(&env));

        let mut result = Vec::new(&env);
        for id in history_ids.iter() {
            if let Some(record) = env.storage().persistent().get::<DataKey, PaymentRecord>(&DataKey::Payment(id)) {
                result.push_back(record);
            }
        }
        result
    }

    /// Read stream details by id
    pub fn get_stream(env: Env, stream_id: u32) -> Result<Stream, ContractError> {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(ContractError::StreamNotFound)
    }

    fn append_user_history(env: &Env, user: &Address, payment_id: u32) {
        let key = DataKey::UserHistory(user.clone());
        let mut history: Vec<u32> = env.storage().persistent().get(&key).unwrap_or(Vec::new(env));
        history.push_back(payment_id);
        env.storage().persistent().set(&key, &history);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }
}

mod test;
