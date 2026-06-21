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
const ORDERS_DICT: &str = "orders_dict";
const ACTIVE_BIDS: &str = "active_bids";
const ACTIVE_ASKS: &str = "active_asks";
const MATCHES_DICT: &str = "matches_dict";
const ORDER_COUNTER: &str = "order_counter";

const SIDE_BID: u8 = 0;
const SIDE_ASK: u8 = 1;

const STATUS_OPEN: u8 = 0;
const STATUS_PARTIAL: u8 = 1;
const STATUS_FILLED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

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

fn next_order_id() -> String {
    let counter_uref = get_dict(ORDER_COUNTER);
    let current: u64 = storage::read(counter_uref).unwrap_or_revert().unwrap_or_default();
    let next = current + 1;
    storage::write(counter_uref, next);
    format!("order:{}", next)
}

fn create_entry_points() -> EntryPoints {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntityEntryPoint::new(
        "place_order",
        vec![
            Parameter::new("order_type", CLType::U64),
            Parameter::new("price", U512::cl_type()),
            Parameter::new("amount", CLType::U64),
            Parameter::new("task_type", CLType::String),
            Parameter::new("deadline", CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "cancel_order",
        vec![Parameter::new("order_id", CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        "fill_order",
        vec![
            Parameter::new("order_id", CLType::String),
            Parameter::new("fill_quantity", U512::cl_type()),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps
}

#[no_mangle]
pub extern "C" fn place_order() {
    let caller = runtime::get_caller();
    let side: u8 = runtime::get_named_arg::<u64>("order_type") as u8;
    let price_per_request: U512 = runtime::get_named_arg("price");
    let quantity: U512 = U512::from(runtime::get_named_arg::<u64>("amount"));
    let deadline: u64 = runtime::get_named_arg("deadline");
    let model_id: String = runtime::get_named_arg("task_type");
    let task_type: u64 = 0; // default task type, frontend sends model_id as task_type String

    if side != SIDE_BID && side != SIDE_ASK {
        runtime::revert(ApiError::User(1));
    }

    let now: u64 = runtime::get_blocktime().into();
    let expiry = now + deadline * 1000; // deadline is in seconds, blocktime is in milliseconds
    if expiry <= now {
        runtime::revert(ApiError::User(2));
    }

    let order_id = next_order_id();
    let orders_dict = get_dict(ORDERS_DICT);

    write_dict(orders_dict, &format!("{}:authority", order_id), caller);
    write_dict(orders_dict, &format!("{}:side", order_id), side);
    write_dict(orders_dict, &format!("{}:price", order_id), price_per_request);
    write_dict(orders_dict, &format!("{}:task_type", order_id), task_type);
    write_dict(orders_dict, &format!("{}:quantity", order_id), quantity.clone());
    write_dict(orders_dict, &format!("{}:filled", order_id), U512::from(0));
    write_dict(orders_dict, &format!("{}:status", order_id), STATUS_OPEN);
    write_dict(orders_dict, &format!("{}:expiry", order_id), expiry);
    write_dict(orders_dict, &format!("{}:model_id", order_id), model_id.clone());
    write_dict(orders_dict, &format!("{}:timestamp", order_id), now);

    let index_key = format!("{}:{}", task_type, model_id);
    if side == SIDE_BID {
        let bids_dict = get_dict(ACTIVE_BIDS);
        let mut bids: Vec<String> = read_dict(bids_dict, &index_key).unwrap_or_default();
        bids.push(order_id.clone());
        write_dict(bids_dict, &index_key, bids);
    } else {
        let asks_dict = get_dict(ACTIVE_ASKS);
        let mut asks: Vec<String> = read_dict(asks_dict, &index_key).unwrap_or_default();
        asks.push(order_id.clone());
        write_dict(asks_dict, &index_key, asks);
    }
}

#[no_mangle]
pub extern "C" fn cancel_order() {
    let caller = runtime::get_caller();
    let order_id: String = runtime::get_named_arg("order_id");
    let orders_dict = get_dict(ORDERS_DICT);

    let authority: AccountHash = read_dict(orders_dict, &format!("{}:authority", order_id))
        .unwrap_or_revert_with(ApiError::User(3));
    if authority != caller {
        runtime::revert(ApiError::User(4));
    }

    let status: u8 = read_dict(orders_dict, &format!("{}:status", order_id))
        .unwrap_or(STATUS_CANCELLED);
    if status != STATUS_OPEN && status != STATUS_PARTIAL {
        runtime::revert(ApiError::User(5));
    }

    write_dict(orders_dict, &format!("{}:status", order_id), STATUS_CANCELLED);
}

#[no_mangle]
pub extern "C" fn fill_order() {
    let order_id: String = runtime::get_named_arg("order_id");
    let fill_quantity: U512 = runtime::get_named_arg("fill_quantity");
    let orders_dict = get_dict(ORDERS_DICT);

    let status: u8 = read_dict(orders_dict, &format!("{}:status", order_id))
        .unwrap_or(STATUS_CANCELLED);
    if status != STATUS_OPEN && status != STATUS_PARTIAL {
        runtime::revert(ApiError::User(5));
    }

    let quantity: U512 = read_dict(orders_dict, &format!("{}:quantity", order_id))
        .unwrap_or_revert_with(ApiError::User(6));
    let filled: U512 = read_dict(orders_dict, &format!("{}:filled", order_id))
        .unwrap_or_default();

    let remaining = quantity - filled;
    if fill_quantity > remaining {
        runtime::revert(ApiError::User(7));
    }

    let new_filled = filled + fill_quantity;
    write_dict(orders_dict, &format!("{}:filled", order_id), new_filled.clone());

    if new_filled == quantity {
        write_dict(orders_dict, &format!("{}:status", order_id), STATUS_FILLED);
    } else {
        write_dict(orders_dict, &format!("{}:status", order_id), STATUS_PARTIAL);
    }
}

#[no_mangle]
pub extern "C" fn call() {
    let owner: AccountHash = runtime::get_named_arg("owner");
    let compute_registry: AccountHash = runtime::get_named_arg("compute_registry");

    let dict_keys = ["orders", "active_bids", "active_asks", "matches"];
    for key in dict_keys.iter() {
        if runtime::has_key(key) {
            runtime::remove_key(key);
        }
    }

    let mut named_keys = NamedKeys::new();
    named_keys.insert(OWNER.to_string(), Key::Account(owner));
    named_keys.insert(COMPUTE_REGISTRY.to_string(), Key::Account(compute_registry));
    named_keys.insert(ORDERS_DICT.to_string(), storage::new_dictionary("orders").unwrap_or_revert().into());
    named_keys.insert(ACTIVE_BIDS.to_string(), storage::new_dictionary("active_bids").unwrap_or_revert().into());
    named_keys.insert(ACTIVE_ASKS.to_string(), storage::new_dictionary("active_asks").unwrap_or_revert().into());
    named_keys.insert(MATCHES_DICT.to_string(), storage::new_dictionary("matches").unwrap_or_revert().into());
    named_keys.insert(ORDER_COUNTER.to_string(), storage::new_uref(0u64).into());

    let (contract_hash, _) = storage::new_contract(
        create_entry_points(),
        Some(named_keys),
        Some("order_book".to_string()),
        Some("order_book_hash".to_string()),
        None,
    );
    runtime::put_key("order_book_hash", contract_hash.into());
}
