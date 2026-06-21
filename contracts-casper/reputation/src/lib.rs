#![no_std]
#[macro_use]
extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec::Vec;
use casper_contract::contract_api::{runtime, storage};
use casper_contract::unwrap_or_revert::UnwrapOrRevert;
use casper_types::{
    account::AccountHash,
    addressable_entity::{
        EntityEntryPoint, EntryPointAccess, EntryPointPayment, EntryPointType, EntryPoints,
        Parameter,
    },
    bytesrepr::{FromBytes, ToBytes},
    contracts::NamedKeys,
    ApiError, CLType, CLTyped, Key, URef, U512,
};

const OWNER: &str = "owner";
const COMPUTE_REGISTRY: &str = "compute_registry";
const ESCROW_VAULT: &str = "escrow_vault";
const PROVIDER_REP: &str = "provider_reputations";
const CONSUMER_REP: &str = "consumer_reputations";
const AUTHORIZED: &str = "authorized_callers";

fn get_dict(name: &str) -> URef {
    runtime::get_key(name)
        .unwrap_or_revert_with(ApiError::MissingKey)
        .into_uref()
        .unwrap_or_revert()
}
fn read<T: CLTyped + FromBytes>(dict: URef, key: &str) -> Option<T> {
    storage::dictionary_get(dict, key).unwrap_or_revert()
}
fn write<T: CLTyped + ToBytes>(dict: URef, key: &str, value: T) {
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
fn require_authorized() {
    let c = runtime::get_caller();
    let reg: AccountHash = runtime::get_key(COMPUTE_REGISTRY)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    let own: AccountHash = runtime::get_key(OWNER)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    let esc: AccountHash = runtime::get_key(ESCROW_VAULT)
        .unwrap_or_revert()
        .into_account()
        .unwrap_or_revert();
    let auth: bool = read(get_dict(AUTHORIZED), &c.to_string()).unwrap_or(false);
    if c != reg && c != own && c != esc && !auth {
        runtime::revert(ApiError::User(11));
    }
}

fn create_eps() -> EntryPoints {
    let mut e = EntryPoints::new();
    e.add_entry_point(EntityEntryPoint::new("record_job_completed",
        vec![Parameter::new("provider_authority", AccountHash::cl_type()), Parameter::new("amount", U512::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("record_job_disputed",
        vec![Parameter::new("provider_authority", AccountHash::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("record_job_slashed",
        vec![Parameter::new("provider_authority", AccountHash::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("anchor_ratings",
        vec![Parameter::new("provider_authority", AccountHash::cl_type()), Parameter::new("ratings_cid", CLType::String)],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("add_authorized_caller",
        vec![Parameter::new("caller", AccountHash::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("remove_authorized_caller",
        vec![Parameter::new("caller", AccountHash::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e.add_entry_point(EntityEntryPoint::new("set_escrow_vault",
        vec![Parameter::new("escrow_vault", AccountHash::cl_type())],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Called, EntryPointPayment::Caller));
    e
}

#[no_mangle]
pub extern "C" fn record_job_completed() {
    require_authorized();
    let provider: AccountHash = runtime::get_named_arg("provider_authority");
    let amount: U512 = runtime::get_named_arg("amount");
    let k = provider.to_string();
    let d = get_dict(PROVIDER_REP);
    let jobs: u64 = read(d, &format!("{}:jobs_completed", k)).unwrap_or(0);
    write(d, &format!("{}:jobs_completed", k), jobs + 1);
    let earned: U512 = read(d, &format!("{}:total_earned", k)).unwrap_or_default();
    write(d, &format!("{}:total_earned", k), earned + amount);
}

#[no_mangle]
pub extern "C" fn record_job_disputed() {
    require_authorized();
    let provider: AccountHash = runtime::get_named_arg("provider_authority");
    let k = provider.to_string();
    let d = get_dict(PROVIDER_REP);
    let jobs: u64 = read(d, &format!("{}:jobs_disputed", k)).unwrap_or(0);
    write(d, &format!("{}:jobs_disputed", k), jobs + 1);
}

#[no_mangle]
pub extern "C" fn record_job_slashed() {
    require_authorized();
    let provider: AccountHash = runtime::get_named_arg("provider_authority");
    let k = provider.to_string();
    let d = get_dict(PROVIDER_REP);
    let jobs: u64 = read(d, &format!("{}:jobs_slashed", k)).unwrap_or(0);
    write(d, &format!("{}:jobs_slashed", k), jobs + 1);
}

#[no_mangle]
pub extern "C" fn anchor_ratings() {
    let caller = runtime::get_caller();
    let provider: AccountHash = runtime::get_named_arg("provider_authority");
    if provider != caller { require_owner(); }
    let cid: String = runtime::get_named_arg("ratings_cid");
    write(get_dict(PROVIDER_REP), &format!("{}:ratings_cid", provider.to_string()), cid);
}

#[no_mangle]
pub extern "C" fn add_authorized_caller() {
    require_owner();
    let caller: AccountHash = runtime::get_named_arg("caller");
    write(get_dict(AUTHORIZED), &caller.to_string(), true);
}

#[no_mangle]
pub extern "C" fn remove_authorized_caller() {
    require_owner();
    let caller: AccountHash = runtime::get_named_arg("caller");
    write(get_dict(AUTHORIZED), &caller.to_string(), false);
}

#[no_mangle]
pub extern "C" fn set_escrow_vault() {
    require_owner();
    let vault: AccountHash = runtime::get_named_arg("escrow_vault");
    runtime::put_key(ESCROW_VAULT, Key::Account(vault));
}

#[no_mangle]
pub extern "C" fn call() {
    let owner: AccountHash = runtime::get_named_arg("owner");
    let reg: AccountHash = runtime::get_named_arg("compute_registry");
    let esc: AccountHash = runtime::get_named_arg("escrow_vault");

    let mut nk = NamedKeys::new();
    nk.insert(OWNER.to_string(), Key::Account(owner));
    nk.insert(COMPUTE_REGISTRY.to_string(), Key::Account(reg));
    nk.insert(ESCROW_VAULT.to_string(), Key::Account(esc));
    nk.insert(PROVIDER_REP.to_string(), storage::new_dictionary("provider_rep").unwrap_or_revert().into());
    nk.insert(CONSUMER_REP.to_string(), storage::new_dictionary("consumer_rep").unwrap_or_revert().into());
    nk.insert(AUTHORIZED.to_string(), storage::new_dictionary("authorized").unwrap_or_revert().into());

    let (hash, _) = storage::new_contract(
        create_eps(),
        Some(nk),
        Some("reputation".to_string()),
        Some("reputation_hash".to_string()),
        None,
    );
    runtime::put_key("reputation_hash", hash.into());
}
