#![no_std]
#[macro_use]
extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec::Vec;
use casper_contract::contract_api::{account, runtime, storage, system};
use casper_contract::unwrap_or_revert::UnwrapOrRevert;
use casper_types::{
    account::AccountHash,
    addressable_entity::{
        EntityEntryPoint, EntryPointAccess, EntryPointPayment, EntryPointType, EntryPoints,
        Parameter,
    },
    bytesrepr::{FromBytes, ToBytes},
    contracts::{ContractHash, NamedKeys},
    AccessRights, ApiError, CLType, CLTyped, CLValue, Key, RuntimeArgs, URef, U512,
};

const COMPUTE_REGISTRY: &str = "compute_registry";
const REPUTATION: &str = "reputation";
const OWNER: &str = "owner";
const PROTOCOL_FEE_RECIPIENT: &str = "protocol_fee_recipient";
const PROTOCOL_FEES: &str = "protocol_fees";
const JOBS_DICT: &str = "jobs_dict";
const JOB_ID_TO_ADDRESS: &str = "job_id_to_address";
const CONSUMER_JOBS: &str = "consumer_jobs";
const PROVIDER_JOBS: &str = "provider_jobs";
const PENDING_JOBS: &str = "pending_jobs";
const CONTRACT_PURSE: &str = "contract_purse";

const STATE_PENDING: u8 = 0;
const STATE_ASSIGNED: u8 = 1;
const STATE_IN_PROGRESS: u8 = 2;
const STATE_PROVIDER_DONE: u8 = 3;
const STATE_CONSUMER_CONFIRM: u8 = 4;
const STATE_SETTLED: u8 = 5;
const STATE_REFUNDED: u8 = 6;
const STATE_DISPUTED: u8 = 7;
const STATE_DISPUTE_CONSUMER_WON: u8 = 8;
const STATE_DISPUTE_PROVIDER_WON: u8 = 9;

fn get_dict(name: &str) -> URef {
    runtime::get_key(name)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert()
}

fn read_dict<T: CLTyped + FromBytes>(dict: URef, key: &str) -> Option<T> {
    storage::dictionary_get(dict, key).unwrap_or_revert()
}

fn write_dict<T: CLTyped + ToBytes>(dict: URef, key: &str, value: T) {
    storage::dictionary_put(dict, key, value);
}

fn require_owner() {
    let owner: AccountHash = runtime::get_key(OWNER)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    if runtime::get_caller() != owner {
        runtime::revert(ApiError::User(10));
    }
}

fn create_entry_points() -> EntryPoints {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntityEntryPoint::new(
        "create_job",
        vec![
            Parameter::new("consumer", AccountHash::cl_type()),
            Parameter::new("provider", AccountHash::cl_type()),
            Parameter::new("amount", U512::cl_type()),
            Parameter::new("provider_fee_bps", CLType::U64),
            Parameter::new("order_id", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "provider_ack",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "provider_complete",
        vec![
            Parameter::new("job_id", CLType::String),
            Parameter::new("response_hash", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "consumer_confirm",
        vec![
            Parameter::new("job_id", CLType::String),
            Parameter::new("rating", CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "claim_payment",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "claim_resolution",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "withdraw_protocol_fees",
        vec![Parameter::new("amount", U512::cl_type())],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "dispute_job",
        vec![
            Parameter::new("job_id", CLType::String),
            Parameter::new("evidence_hash", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "resolve_dispute",
        vec![
            Parameter::new("job_id", CLType::String),
            Parameter::new("consumer_payout_pct", CLType::U64),
            Parameter::new("provider_payout_pct", CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "refund_job",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "auto_release",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "get_job",
        vec![Parameter::new("job_id", CLType::String)],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));


    eps
}

fn get_contract_purse() -> URef {
    runtime::get_key(CONTRACT_PURSE)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert()
}

#[no_mangle]
pub extern "C" fn create_job() {
    let consumer: AccountHash = runtime::get_named_arg("consumer");
    let provider: AccountHash = runtime::get_named_arg("provider");
    let amount: U512 = runtime::get_named_arg("amount");
    let provider_fee_bps: u64 = runtime::get_named_arg("provider_fee_bps");
    let order_id: String = runtime::get_named_arg("order_id");

    let now: u64 = runtime::get_blocktime().into();
    let valid_until = now + 3_600_000;
    let task_type: u64 = 0;

    // Auto-increment per-consumer nonce
    let jobs_dict = get_dict(JOBS_DICT);
    let nonce_key = format!("nonce:{}", consumer.to_string());
    let nonce: u64 = read_dict(jobs_dict, &nonce_key).unwrap_or(0);
    let next_nonce = nonce + 1;
    write_dict(jobs_dict, &nonce_key, next_nonce);

    let job_id = format!("job:{}:{}", consumer.to_string(), nonce);

    // Clear stale lifecycle fields from any previous use of this job_id
    write_dict(jobs_dict, &format!("{}:acked_at", job_id), 0u64);
    write_dict(jobs_dict, &format!("{}:response_hash", job_id), "".to_string());
    write_dict(jobs_dict, &format!("{}:rating", job_id), 0u64);
    write_dict(jobs_dict, &format!("{}:consumer_confirmed", job_id), false);
    write_dict(jobs_dict, &format!("{}:dispute_initiator", job_id), AccountHash::default());
    write_dict(jobs_dict, &format!("{}:dispute_timestamp", job_id), 0u64);
    write_dict(jobs_dict, &format!("{}:resolution_payout_pct", job_id), 0u64);
    write_dict(jobs_dict, &format!("{}:protocol_fee", job_id), U512::from(0));
    write_dict(jobs_dict, &format!("{}:auto_released_at", job_id), 0u64);

    write_dict(jobs_dict, &format!("{}:consumer", job_id), consumer);
    write_dict(jobs_dict, &format!("{}:provider", job_id), provider);
    write_dict(jobs_dict, &format!("{}:request_hash", job_id), order_id.clone());
    write_dict(jobs_dict, &format!("{}:nonce", job_id), nonce);
    write_dict(jobs_dict, &format!("{}:task_type", job_id), task_type);
    write_dict(jobs_dict, &format!("{}:valid_until", job_id), valid_until);
    write_dict(jobs_dict, &format!("{}:amount", job_id), amount.clone());
    write_dict(jobs_dict, &format!("{}:provider_fee_bps", job_id), provider_fee_bps);
    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_PENDING);
    write_dict(jobs_dict, &format!("{}:created_at", job_id), now);

    let pending_dict = get_dict(PENDING_JOBS);
    let mut pending: Vec<String> = read_dict(pending_dict, "list").unwrap_or_default();
    if !pending.contains(&job_id) {
        pending.push(job_id.clone());
        write_dict(pending_dict, "list", pending);
    }

    let consumer_jobs_dict = get_dict(CONSUMER_JOBS);
    let mut consumer_list: Vec<String> = read_dict(consumer_jobs_dict, &consumer.to_string())
        .unwrap_or_default();
    if !consumer_list.contains(&job_id) {
        consumer_list.push(job_id.clone());
        write_dict(consumer_jobs_dict, &consumer.to_string(), consumer_list);
    }
}

#[no_mangle]
pub extern "C" fn provider_ack() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if provider != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_PENDING {
        runtime::revert(ApiError::User(4));
    }

    let now: u64 = runtime::get_blocktime().into();
    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_ASSIGNED);
    write_dict(jobs_dict, &format!("{}:acked_at", job_id), now);

    let provider_jobs_dict = get_dict(PROVIDER_JOBS);
    let mut provider_list: Vec<String> = read_dict(provider_jobs_dict, &provider.to_string())
        .unwrap_or_default();
    if !provider_list.contains(&job_id) {
        provider_list.push(job_id.clone());
        write_dict(provider_jobs_dict, &provider.to_string(), provider_list);
    }
}

#[no_mangle]
pub extern "C" fn provider_complete() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let response_hash: String = runtime::get_named_arg("response_hash");
    let jobs_dict = get_dict(JOBS_DICT);

    let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if provider != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_ASSIGNED && state != STATE_IN_PROGRESS {
        runtime::revert(ApiError::User(4));
    }

    let now: u64 = runtime::get_blocktime().into();
    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_PROVIDER_DONE);
    write_dict(jobs_dict, &format!("{}:response_hash", job_id), response_hash);
    write_dict(jobs_dict, &format!("{}:completed_at", job_id), now);
}

#[no_mangle]
pub extern "C" fn consumer_confirm() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let _rating: u64 = runtime::get_named_arg("rating");
    let jobs_dict = get_dict(JOBS_DICT);

    let consumer: AccountHash = read_dict(jobs_dict, &format!("{}:consumer", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if consumer != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_PROVIDER_DONE {
        runtime::revert(ApiError::User(4));
    }

    let now: u64 = runtime::get_blocktime().into();
    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_SETTLED);
    write_dict(jobs_dict, &format!("{}:settled_at", job_id), now);
    write_dict(jobs_dict, &format!("{}:rating", job_id), _rating);
    // Provider pulls payment via claim_payment()
}

#[no_mangle]
pub extern "C" fn claim_payment() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if provider != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id)).unwrap_or(STATE_REFUNDED);
    if state != STATE_SETTLED {
        runtime::revert(ApiError::User(4));
    }

    let claimed: bool = read_dict(jobs_dict, &format!("{}:provider_claimed", job_id)).unwrap_or(false);
    if claimed {
        runtime::revert(ApiError::User(5));
    }

    let amount: U512 = read_dict(jobs_dict, &format!("{}:amount", job_id)).unwrap_or_default();
    let provider_fee_bps: u64 = read_dict(jobs_dict, &format!("{}:provider_fee_bps", job_id)).unwrap_or_default();
    let protocol_fee = amount * U512::from(provider_fee_bps) / U512::from(10000);
    let provider_payout = amount - protocol_fee;

    let contract_purse = get_contract_purse();

    // Transfer provider payout from contract purse to provider
    system::transfer_from_purse_to_account(contract_purse, provider, provider_payout, None)
        .unwrap_or_revert();

    // Transfer protocol fee from contract purse to fee recipient
    if protocol_fee > U512::from(0) {
        let fee_recipient: AccountHash = runtime::get_key(PROTOCOL_FEE_RECIPIENT)
            .unwrap_or_revert()
            .into_account()
            .unwrap_or_revert();
        system::transfer_from_purse_to_account(contract_purse, fee_recipient, protocol_fee, None)
            .unwrap_or_revert();
    }

    write_dict(jobs_dict, &format!("{}:provider_claimed", job_id), true);
    write_dict(jobs_dict, &format!("{}:provider_payout", job_id), provider_payout);
}

#[no_mangle]
pub extern "C" fn withdraw_protocol_fees() {
    require_owner();
    let amount: U512 = runtime::get_named_arg("amount");
    let fees_uref: URef = runtime::get_key(PROTOCOL_FEES)
        .unwrap_or_revert()
        .into_uref()
        .unwrap_or_revert();
    let fees: U512 = storage::read(fees_uref).unwrap_or_revert().unwrap_or_default();
    if fees == U512::from(0) || amount > fees {
        runtime::revert(ApiError::User(1));
    }
    let contract_purse = get_contract_purse();
    let owner: AccountHash = runtime::get_key(OWNER)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    system::transfer_from_purse_to_account(contract_purse, owner, amount, None)
        .unwrap_or_revert();
    storage::write(fees_uref, fees - amount);
}

#[no_mangle]
pub extern "C" fn dispute_job() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let evidence_hash: String = runtime::get_named_arg("evidence_hash");
    let jobs_dict = get_dict(JOBS_DICT);

    let consumer: AccountHash = read_dict(jobs_dict, &format!("{}:consumer", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if consumer != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_PROVIDER_DONE && state != STATE_CONSUMER_CONFIRM {
        runtime::revert(ApiError::User(4));
    }

    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_DISPUTED);
    write_dict(jobs_dict, &format!("{}:evidence_hash", job_id), evidence_hash);
}

#[no_mangle]
pub extern "C" fn resolve_dispute() {
    require_owner();
    let job_id: String = runtime::get_named_arg("job_id");
    let consumer_payout_pct: u64 = runtime::get_named_arg("consumer_payout_pct");
    let _provider_payout_pct: u64 = runtime::get_named_arg("provider_payout_pct");
    let consumer_wins = consumer_payout_pct > 50;
    let jobs_dict = get_dict(JOBS_DICT);

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_DISPUTED {
        runtime::revert(ApiError::User(4));
    }

    if consumer_wins {
        write_dict(jobs_dict, &format!("{}:state", job_id), STATE_DISPUTE_CONSUMER_WON);
    } else {
        write_dict(jobs_dict, &format!("{}:state", job_id), STATE_DISPUTE_PROVIDER_WON);
    }
    write_dict(jobs_dict, &format!("{}:consumer_payout_pct", job_id), consumer_payout_pct);
    // Winner pulls funds via claim_resolution()
}

#[no_mangle]
pub extern "C" fn claim_resolution() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id)).unwrap_or(STATE_REFUNDED);

    if state == STATE_DISPUTE_CONSUMER_WON {
        let consumer: AccountHash = read_dict(jobs_dict, &format!("{}:consumer", job_id))
            .unwrap_or_revert_with(ApiError::User(2));
        if consumer != caller {
            runtime::revert(ApiError::User(3));
        }
        let amount: U512 = read_dict(jobs_dict, &format!("{}:amount", job_id)).unwrap_or_default();
        let contract_purse = get_contract_purse();
        system::transfer_from_purse_to_account(contract_purse, consumer, amount, None)
            .unwrap_or_revert();
        write_dict(jobs_dict, &format!("{}:state", job_id), STATE_REFUNDED);
    } else if state == STATE_DISPUTE_PROVIDER_WON {
        let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
            .unwrap_or_revert_with(ApiError::User(2));
        if provider != caller {
            runtime::revert(ApiError::User(3));
        }
        write_dict(jobs_dict, &format!("{}:state", job_id), STATE_SETTLED);
    } else {
        runtime::revert(ApiError::User(4));
    }
}

#[no_mangle]
pub extern "C" fn refund_job() {
    let caller = runtime::get_caller();
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let consumer: AccountHash = read_dict(jobs_dict, &format!("{}:consumer", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    if consumer != caller {
        runtime::revert(ApiError::User(3));
    }

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    if state != STATE_PENDING {
        runtime::revert(ApiError::User(4));
    }

    let amount: U512 = read_dict(jobs_dict, &format!("{}:amount", job_id)).unwrap_or_default();
    let contract_purse = get_contract_purse();
    system::transfer_from_purse_to_account(contract_purse, consumer, amount, None)
        .unwrap_or_revert();
    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_REFUNDED);
}

#[no_mangle]
pub extern "C" fn auto_release() {
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    // Auto-release only allowed after provider has completed the job
    if state != STATE_PROVIDER_DONE {
        runtime::revert(ApiError::User(4));
    }

    let completed_at: u64 = read_dict(jobs_dict, &format!("{}:completed_at", job_id))
        .unwrap_or_default();
    let now: u64 = runtime::get_blocktime().into();
    // Consumer has 1 hour from provider_complete to confirm or dispute
    if now < completed_at + 3_600_000 {
        runtime::revert(ApiError::User(5));
    }

    let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    let amount: U512 = read_dict(jobs_dict, &format!("{}:amount", job_id)).unwrap_or_default();
    let provider_fee_bps: u64 = read_dict(jobs_dict, &format!("{}:provider_fee_bps", job_id)).unwrap_or_default();
    let protocol_fee = amount * U512::from(provider_fee_bps) / U512::from(10000);
    let provider_payout = amount - protocol_fee;

    let contract_purse = get_contract_purse();
    system::transfer_from_purse_to_account(contract_purse, provider, provider_payout, None)
        .unwrap_or_revert();

    if protocol_fee > U512::from(0) {
        let fee_recipient: AccountHash = runtime::get_key(PROTOCOL_FEE_RECIPIENT)
            .unwrap_or_revert()
            .into_account()
            .unwrap_or_revert();
        system::transfer_from_purse_to_account(contract_purse, fee_recipient, protocol_fee, None)
            .unwrap_or_revert();
    }

    write_dict(jobs_dict, &format!("{}:state", job_id), STATE_SETTLED);
    write_dict(jobs_dict, &format!("{}:auto_released_at", job_id), now);
    write_dict(jobs_dict, &format!("{}:provider_claimed", job_id), true);
    write_dict(jobs_dict, &format!("{}:provider_payout", job_id), provider_payout);
}

#[no_mangle]
pub extern "C" fn get_job() {
    let job_id: String = runtime::get_named_arg("job_id");
    let jobs_dict = get_dict(JOBS_DICT);

    let consumer: AccountHash = read_dict(jobs_dict, &format!("{}:consumer", job_id))
        .unwrap_or_revert_with(ApiError::User(2));
    let provider: AccountHash = read_dict(jobs_dict, &format!("{}:provider", job_id))
        .unwrap_or_default();
    let amount: U512 = read_dict(jobs_dict, &format!("{}:amount", job_id))
        .unwrap_or_default();
    let state: u8 = read_dict(jobs_dict, &format!("{}:state", job_id))
        .unwrap_or(STATE_REFUNDED);
    let valid_until: u64 = read_dict(jobs_dict, &format!("{}:valid_until", job_id))
        .unwrap_or_default();
    let created_at: u64 = read_dict(jobs_dict, &format!("{}:created_at", job_id))
        .unwrap_or_default();

    let state_str = match state {
        0 => "pending",
        1 => "assigned",
        2 => "in_progress",
        3 => "provider_done",
        4 => "consumer_confirm",
        5 => "settled",
        6 => "refunded",
        7 => "disputed",
        8 => "consumer_won",
        9 => "provider_won",
        _ => "unknown",
    };

    let result = format!(
        "job_id={}&consumer={}&provider={}&amount={}&state={}&valid_until={}&created_at={}",
        job_id,
        consumer.to_string(),
        provider.to_string(),
        amount.to_string(),
        state_str,
        valid_until,
        created_at,
    );
    runtime::ret(CLValue::from_t(result).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn call() {
    let compute_registry: AccountHash = runtime::get_named_arg("compute_registry");
    let reputation: AccountHash = runtime::get_named_arg("reputation");
    let owner: AccountHash = runtime::get_named_arg("owner");
    let protocol_fee_recipient: AccountHash = runtime::get_named_arg("protocol_fee_recipient");

    let dict_keys = ["ev2_jobs", "ev2_job_id_to_address", "ev2_consumer_jobs", "ev2_provider_jobs", "ev2_pending_jobs"];
    for key in dict_keys.iter() {
        if runtime::has_key(key) {
            runtime::remove_key(key);
        }
    }

    let mut named_keys = NamedKeys::new();
    named_keys.insert(COMPUTE_REGISTRY.to_string(), Key::Account(compute_registry));
    named_keys.insert(REPUTATION.to_string(), Key::Account(reputation));
    named_keys.insert(OWNER.to_string(), Key::Account(owner));
    named_keys.insert(PROTOCOL_FEE_RECIPIENT.to_string(), Key::Account(protocol_fee_recipient));
    named_keys.insert(PROTOCOL_FEES.to_string(), storage::new_uref(U512::from(0)).into());

    let contract_purse = system::create_purse();
    named_keys.insert(CONTRACT_PURSE.to_string(), contract_purse.into());
    let add_only_purse = URef::new(contract_purse.addr(), AccessRights::ADD);
    named_keys.insert("contract_purse_add".to_string(), add_only_purse.into());

    named_keys.insert(JOBS_DICT.to_string(), storage::new_dictionary("ev2_jobs").unwrap_or_revert().into());
    named_keys.insert(JOB_ID_TO_ADDRESS.to_string(), storage::new_dictionary("ev2_job_id_to_address").unwrap_or_revert().into());
    named_keys.insert(CONSUMER_JOBS.to_string(), storage::new_dictionary("ev2_consumer_jobs").unwrap_or_revert().into());
    named_keys.insert(PROVIDER_JOBS.to_string(), storage::new_dictionary("ev2_provider_jobs").unwrap_or_revert().into());
    named_keys.insert(PENDING_JOBS.to_string(), storage::new_dictionary("ev2_pending_jobs").unwrap_or_revert().into());

    let (contract_hash, _) = storage::new_contract(
        create_entry_points(),
        Some(named_keys),
        Some("escrow_vault".to_string()),
        Some("escrow_vault_hash".to_string()),
        None,
    );
    runtime::put_key("escrow_vault_hash", contract_hash.into());
}
