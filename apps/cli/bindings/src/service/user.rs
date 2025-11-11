use convex::ConvexClient;
use serde::{Deserialize, Deserializer, Serialize};

use crate::helper::function::FunctionArg;
use crate::{fn_name, helper::function};

use anyhow::{Context, Result};

// Helper to deserialize f64 as u64 (for Convex timestamps)
fn deserialize_f64_as_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = f64::deserialize(deserializer)?;
    Ok(value as u64)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserKey {
    pub id: String,
    #[serde(rename = "publicKey")]
    pub public_key: String,
    #[serde(rename = "encryptedPrivateKey")]
    pub encrypted_private_key: String,
    pub salt: String,
    #[serde(rename = "createdAt", deserialize_with = "deserialize_f64_as_u64")]
    pub created_at: u64,
    #[serde(rename = "updatedAt", deserialize_with = "deserialize_f64_as_u64")]
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

#[derive(Serialize)]
pub struct UpdateUserKeyArg {
    #[serde(rename = "publicKey")]
    pub public_key: String,
    #[serde(rename = "encryptedPrivateKey")]
    pub encrypted_private_key: String,
    pub salt: String,
}

impl FunctionArg for UpdateUserKeyArg {}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateUserKeyResponse {
    pub success: bool,
    #[serde(rename = "userKeyId")]
    pub user_key_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GetProPlanResponse {
    pub success: bool,
    #[serde(rename = "hasPro")]
    pub has_pro: bool,
    #[serde(rename = "checkoutLink")]
    pub checkout_link: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CheckProPlanResponse {
    pub success: bool,
    #[serde(rename = "hasProPlan")]
    pub has_pro_plan: bool,
}

pub async fn get_user_key(
    client: &mut ConvexClient,
    better_auth_url: &str,
) -> Result<Option<UserKey>> {
    let fn_name = fn_name!();
    tracing::info!("{fn_name} triggered");

    function::protected_query(client, "userKey:getUserKey", (), better_auth_url)
        .await
        .inspect_err(|err| {
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to get user key")
}

pub async fn store_user_key(
    client: &mut ConvexClient,
    arg: StoreUserKeyArg,
    better_auth_url: &str,
) -> Result<StoreUserKeyResponse> {
    let fn_name = fn_name!();
    tracing::info!("{fn_name} triggered");

    function::protected_mutation(client, "userKey:storeUserKey", arg, better_auth_url)
        .await
        .inspect_err(|err| {
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to store user key")
}

pub async fn update_user_key(
    client: &mut ConvexClient,
    arg: UpdateUserKeyArg,
    better_auth_url: &str,
) -> Result<UpdateUserKeyResponse> {
    let fn_name = fn_name!();
    tracing::info!("{fn_name} triggered");

    function::protected_mutation(client, "userKey:updateUserKey", arg, better_auth_url)
        .await
        .inspect_err(|err| {
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to update user key")
}

pub async fn get_pro_plan(
    client: &mut ConvexClient,
    better_auth_url: &str,
) -> Result<GetProPlanResponse> {
    let fn_name = fn_name!();
    tracing::info!("{fn_name} triggered");

    function::protected_action(client, "user:getProPlan", (), better_auth_url)
        .await
        .inspect_err(|err| {
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to get pro plan")
}

pub async fn check_pro_plan(
    client: &mut ConvexClient,
    better_auth_url: &str,
) -> Result<CheckProPlanResponse> {
    let fn_name = fn_name!();
    tracing::info!("{fn_name} triggered");

    function::protected_query(client, "user:checkProPlan", (), better_auth_url)
        .await
        .inspect_err(|err| {
            tracing::error!("{fn_name} failed: {:?}", err);
        })
        .context("Failed to check pro plan")
}
