use convex::ConvexClient;
use serde::{Deserialize, Serialize};

use crate::helper::function::FunctionArg;
use crate::{fn_name, helper::function};

use anyhow::{Context, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserKey {
    pub id: String,
    #[serde(rename = "publicKey")]
    pub public_key: String,
    #[serde(rename = "encryptedPrivateKey")]
    pub encrypted_private_key: String,
    pub salt: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Serialize)]
pub struct StoreUserKeyArg {
    #[serde(rename = "publicKey")]
    pub public_key: String,
    #[serde(rename = "encryptedPrivateKey")]
    pub encrypted_private_key: String,
    pub salt: String,
}

impl FunctionArg for StoreUserKeyArg {}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoreUserKeyResponse {
    pub success: bool,
    #[serde(rename = "userKeyId")]
    pub user_key_id: String,
}

pub async fn get_user_key(
    client: &mut ConvexClient,
    access_token: String,
) -> Result<Option<UserKey>> {
    function::protected_query(client, "userKey:getUserKey", (), access_token)
        .await
        .inspect_err(|err| {
            let fn_name = fn_name!();
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to get user key")
}

pub async fn store_user_key(
    client: &mut ConvexClient,
    arg: StoreUserKeyArg,
    access_token: String,
) -> Result<StoreUserKeyResponse> {
    function::protected_mutation(client, "userKey:storeUserKey", arg, access_token)
        .await
        .inspect_err(|err| {
            let fn_name = fn_name!();
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to store user key")
}
