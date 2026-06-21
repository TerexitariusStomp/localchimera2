#![no_std]
#[macro_use]
extern crate alloc;

use casper_contract::contract_api::{account, runtime, system};
use casper_contract::unwrap_or_revert::UnwrapOrRevert;
use casper_types::{ApiError, URef, U512};

#[no_mangle]
pub extern "C" fn call() {
    let target_purse: URef = runtime::get_named_arg("target_purse");
    let amount: U512 = runtime::get_named_arg("amount");
    let source_purse = account::get_main_purse();
    system::transfer_from_purse_to_purse(source_purse, target_purse, amount, None)
        .unwrap_or_revert_with(ApiError::User(1));
}
