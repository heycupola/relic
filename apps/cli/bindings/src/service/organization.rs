use convex::ConvexClient;
use serde::{Deserialize, Serialize};

use crate::helper::function;
use crate::helper::function::FunctionArg;
use crate::helper::function::deserialize_optional_number_from_float;

use anyhow::{Context, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum OrgStatus {
    Active,
    Pending,
    PaymentLapsed,
    Suspended,
}

#[derive(Serialize)]
pub struct CreateOrgArg {
    pub name: String,
    pub slug: String,
    #[serde(rename = "wrapperOrgKey")]
    pub wrapper_org_key: String,
}

impl FunctionArg for CreateOrgArg {}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionType {
    Free,
    Paid,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateOrgResponse {
    pub success: bool,
    #[serde(rename = "subscriptionType")]
    pub subscription_type: SubscriptionType,
    pub status: OrgStatus,
    #[serde(rename = "organizationId")]
    pub organization_id: String,
    pub name: String,
    pub slug: String,
    #[serde(rename = "isFreeWithProPlan")]
    pub is_free_with_pro_plan: bool,
    #[serde(rename = "expiresAt")]
    #[serde(deserialize_with = "deserialize_optional_number_from_float", default)]
    pub expires_at: Option<u64>,
    #[serde(rename = "checkoutUrl")]
    pub checkout_url: Option<String>,
    pub message: Option<String>,
}

pub async fn create_organization(
    client: &mut ConvexClient,
    arg: CreateOrgArg,
    better_auth_url: &str,
) -> Result<CreateOrgResponse> {
    function::protected_mutation(
        client,
        "organization:createOrganization",
        arg,
        better_auth_url,
    )
    .await
    .context("Failed to create organization")
}
