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
    contracts::NamedKeys,
    ApiError, CLType, CLTyped, CLValue, Key, URef, U512,
};

const OWNER: &str = "owner";
const FEE_RECIPIENT: &str = "fee_recipient";
const MINIMUM_STAKE: &str = "minimum_stake";
const CONTRACT_PURSE: &str = "contract_purse";
const PROVIDERS_STATUS: &str = "providers_status";
const PROVIDERS_PEER_ID: &str = "providers_peer_id";
const PROVIDERS_NAME: &str = "providers_name";
const PROVIDERS_TASK_TYPES: &str = "providers_task_types";
const PROVIDERS_REGISTERED_AT: &str = "providers_registered_at";
const PROVIDERS_UPDATED_AT: &str = "providers_updated_at";
const STAKES: &str = "stakes";
const PEER_ID_TO_PROVIDER: &str = "peer_id_to_provider";
const PROVIDERS_LIST: &str = "providers_list";

const STATUS_UNREGISTERED: u8 = 0;
const STATUS_ACTIVE: u8 = 1;
const STATUS_PAUSED: u8 = 2;
const STATUS_SLASHED: u8 = 3;

fn get_dict(name: &str) -> URef {
    runtime::get_key(name)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert()
}

fn get_or_create_contract_purse() -> URef {
    match runtime::get_key(CONTRACT_PURSE) {
        Some(key) => key.into_uref().unwrap_or_revert(),
        None => {
            let purse = system::create_purse();
            runtime::put_key(CONTRACT_PURSE, purse.into());
            purse
        }
    }
}

fn read_dict<T: CLTyped + FromBytes>(dict: URef, key: &str) -> Option<T> {
    storage::dictionary_get(dict, key).unwrap_or_revert()
}

fn write_dict<T: CLTyped + ToBytes>(dict: URef, key: &str, value: T) {
    storage::dictionary_put(dict, key, value);
}

fn provider_exists(account: &AccountHash) -> bool {
    read_dict::<u8>(get_dict(PROVIDERS_STATUS), &account.to_string()).is_some()
}

fn is_active(account: &AccountHash) -> bool {
    read_dict::<u8>(get_dict(PROVIDERS_STATUS), &account.to_string()) == Some(STATUS_ACTIVE)
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
        "register_provider",
        vec![
            Parameter::new("qvac_peer_id", CLType::String),
            Parameter::new("name", CLType::String),
            Parameter::new("task_types", CLType::U32),
            Parameter::new("stake_amount", U512::cl_type()),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "update_provider",
        vec![
            Parameter::new("name", CLType::String),
            Parameter::new("task_types", CLType::U32),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "pause_provider",
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "resume_provider",
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "slash_provider",
        vec![Parameter::new("provider_address", AccountHash::cl_type())],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "deposit_stake",
        vec![
            Parameter::new("amount", U512::cl_type()),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "withdraw_stake",
        vec![
            Parameter::new("amount", U512::cl_type()),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "get_provider_status",
        vec![Parameter::new("provider_address", AccountHash::cl_type())],
        CLType::U8,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "is_active_provider",
        vec![Parameter::new("provider_address", AccountHash::cl_type())],
        CLType::Bool,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "minimum_stake",
        vec![],
        U512::cl_type(),
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "get_providers",
        vec![],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "get_provider",
        vec![Parameter::new("provider_address", AccountHash::cl_type())],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps
}

#[no_mangle]
pub extern "C" fn register_provider() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();

    let qvac_peer_id: String = runtime::get_named_arg("qvac_peer_id");
    let name: String = runtime::get_named_arg("name");
    let task_types: u32 = runtime::get_named_arg("task_types");
    let stake_amount: U512 = runtime::get_named_arg("stake_amount");

    if provider_exists(&caller) {
        runtime::revert(ApiError::User(1));
    }

    let min_stake: U512 = storage::read(get_dict(MINIMUM_STAKE))
        .unwrap_or_revert()
        .unwrap_or_revert();
    if stake_amount < min_stake {
        runtime::revert(ApiError::User(2));
    }

    let now: u64 = runtime::get_blocktime().into();

    write_dict(get_dict(PROVIDERS_STATUS), &caller_str, STATUS_ACTIVE);
    write_dict(get_dict(PROVIDERS_PEER_ID), &caller_str, qvac_peer_id.clone());
    write_dict(get_dict(PROVIDERS_NAME), &caller_str, name);
    write_dict(get_dict(PROVIDERS_TASK_TYPES), &caller_str, task_types);
    write_dict(get_dict(PROVIDERS_REGISTERED_AT), &caller_str, now);
    write_dict(get_dict(PROVIDERS_UPDATED_AT), &caller_str, now);
    write_dict(get_dict(STAKES), &caller_str, stake_amount.clone());
    write_dict(get_dict(PEER_ID_TO_PROVIDER), &qvac_peer_id, caller);

    let mut providers: Vec<AccountHash> = read_dict(get_dict(PROVIDERS_LIST), "list").unwrap_or_default();
    providers.push(caller);
    write_dict(get_dict(PROVIDERS_LIST), "list", providers);

    let fee_recipient: AccountHash = runtime::get_key(FEE_RECIPIENT)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    system::transfer_to_account(fee_recipient, stake_amount, None)
        .unwrap_or_revert();
}

#[no_mangle]
pub extern "C" fn update_provider() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();
    if !provider_exists(&caller) {
        runtime::revert(ApiError::User(3));
    }
    let name: String = runtime::get_named_arg("name");
    let task_types: u32 = runtime::get_named_arg("task_types");
    let now: u64 = runtime::get_blocktime().into();
    write_dict(get_dict(PROVIDERS_NAME), &caller_str, name);
    write_dict(get_dict(PROVIDERS_TASK_TYPES), &caller_str, task_types);
    write_dict(get_dict(PROVIDERS_UPDATED_AT), &caller_str, now);
}

#[no_mangle]
pub extern "C" fn pause_provider() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();
    if !provider_exists(&caller) {
        runtime::revert(ApiError::User(3));
    }
    write_dict(get_dict(PROVIDERS_STATUS), &caller_str, STATUS_PAUSED);
}

#[no_mangle]
pub extern "C" fn resume_provider() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();
    if !provider_exists(&caller) {
        runtime::revert(ApiError::User(3));
    }
    write_dict(get_dict(PROVIDERS_STATUS), &caller_str, STATUS_ACTIVE);
}

#[no_mangle]
pub extern "C" fn slash_provider() {
    require_owner();
    let provider: AccountHash = runtime::get_named_arg("provider_address");
    write_dict(get_dict(PROVIDERS_STATUS), &provider.to_string(), STATUS_SLASHED);
}

#[no_mangle]
pub extern "C" fn deposit_stake() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();
    if !provider_exists(&caller) {
        runtime::revert(ApiError::User(3));
    }
    let amount: U512 = runtime::get_named_arg("amount");
    let current: U512 = read_dict(get_dict(STAKES), &caller_str).unwrap_or_default();
    write_dict(get_dict(STAKES), &caller_str, current + amount);

    let fee_recipient: AccountHash = runtime::get_key(FEE_RECIPIENT)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    system::transfer_to_account(fee_recipient, amount, None)
        .unwrap_or_revert();
}

#[no_mangle]
pub extern "C" fn withdraw_stake() {
    let caller = runtime::get_caller();
    let caller_str = caller.to_string();
    if !provider_exists(&caller) {
        runtime::revert(ApiError::User(3));
    }
    let amount: U512 = runtime::get_named_arg("amount");
    let current: U512 = read_dict(get_dict(STAKES), &caller_str).unwrap_or_default();
    if amount > current {
        runtime::revert(ApiError::User(4));
    }
    let min_stake: U512 = storage::read(get_dict(MINIMUM_STAKE))
        .unwrap_or_revert()
        .unwrap_or_revert();
    let remaining = current - amount;
    if remaining < min_stake && remaining != U512::from(0) {
        runtime::revert(ApiError::User(5));
    }
    write_dict(get_dict(STAKES), &caller_str, remaining);
}

#[no_mangle]
pub extern "C" fn get_provider_status() {
    let provider: AccountHash = runtime::get_named_arg("provider_address");
    let status = read_dict::<u8>(get_dict(PROVIDERS_STATUS), &provider.to_string())
        .unwrap_or(STATUS_UNREGISTERED);
    runtime::ret(CLValue::from_t(status).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn is_active_provider() {
    let provider: AccountHash = runtime::get_named_arg("provider_address");
    let active = is_active(&provider);
    runtime::ret(CLValue::from_t(active).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn minimum_stake() {
    let value: U512 = storage::read(get_dict(MINIMUM_STAKE))
        .unwrap_or_revert()
        .unwrap_or_revert();
    runtime::ret(CLValue::from_t(value).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn get_providers() {
    let providers: Vec<AccountHash> = read_dict(get_dict(PROVIDERS_LIST), "list")
        .unwrap_or_default();
    let result = providers.iter().map(|p| p.to_string()).collect::<Vec<String>>().join(",");
    runtime::ret(CLValue::from_t(result).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn get_provider() {
    let provider: AccountHash = runtime::get_named_arg("provider_address");
    let provider_str = provider.to_string();
    let jobs_dict = get_dict(PROVIDERS_STATUS);

    if !provider_exists(&provider) {
        runtime::ret(CLValue::from_t("not_found").unwrap_or_revert());
        return;
    }

    let status: u8 = read_dict(jobs_dict, &provider_str).unwrap_or(STATUS_UNREGISTERED);
    let peer_id: String = read_dict(get_dict(PROVIDERS_PEER_ID), &provider_str).unwrap_or_default();
    let name: String = read_dict(get_dict(PROVIDERS_NAME), &provider_str).unwrap_or_default();
    let task_types: u32 = read_dict(get_dict(PROVIDERS_TASK_TYPES), &provider_str).unwrap_or_default();
    let stake: U512 = read_dict(get_dict(STAKES), &provider_str).unwrap_or_default();
    let registered_at: u64 = read_dict(get_dict(PROVIDERS_REGISTERED_AT), &provider_str).unwrap_or_default();

    let status_str = match status {
        0 => "unregistered",
        1 => "active",
        2 => "paused",
        3 => "slashed",
        _ => "unknown",
    };

    let result = format!(
        "address={}&status={}&peer_id={}&name={}&task_types={}&stake={}&registered_at={}",
        provider_str, status_str, peer_id, name, task_types, stake.to_string(), registered_at,
    );
    runtime::ret(CLValue::from_t(result).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn call() {
    let owner: AccountHash = runtime::get_named_arg("owner");
    let fee_recipient: AccountHash = runtime::get_named_arg("fee_recipient");
    let minimum_stake: U512 = runtime::get_named_arg("minimum_stake");

    let mut named_keys = NamedKeys::new();
    named_keys.insert(OWNER.to_string(), Key::Account(owner));
    named_keys.insert(FEE_RECIPIENT.to_string(), Key::Account(fee_recipient));
    named_keys.insert(MINIMUM_STAKE.to_string(), storage::new_uref(minimum_stake).into());

    let dict_keys = [
        "providers_status",
        "providers_peer_id",
        "providers_name",
        "providers_task_types",
        "providers_registered_at",
        "providers_updated_at",
        "stakes",
        "peer_id_to_provider",
    ];
    for key in dict_keys.iter() {
        if runtime::has_key(key) {
            runtime::remove_key(key);
        }
    }

    named_keys.insert(PROVIDERS_STATUS.to_string(), storage::new_dictionary("providers_status").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_PEER_ID.to_string(), storage::new_dictionary("providers_peer_id").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_NAME.to_string(), storage::new_dictionary("providers_name").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_TASK_TYPES.to_string(), storage::new_dictionary("providers_task_types").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_REGISTERED_AT.to_string(), storage::new_dictionary("providers_registered_at").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_UPDATED_AT.to_string(), storage::new_dictionary("providers_updated_at").unwrap_or_revert().into());
    named_keys.insert(STAKES.to_string(), storage::new_dictionary("stakes").unwrap_or_revert().into());
    named_keys.insert(PEER_ID_TO_PROVIDER.to_string(), storage::new_dictionary("peer_id_to_provider").unwrap_or_revert().into());
    named_keys.insert(PROVIDERS_LIST.to_string(), storage::new_dictionary("providers_list").unwrap_or_revert().into());

    let (contract_hash, _) = storage::new_contract(
        create_entry_points(),
        Some(named_keys),
        Some("compute_registry".to_string()),
        Some("compute_registry_hash".to_string()),
        None,
    );
    runtime::put_key("compute_registry_hash", contract_hash.into());
}
