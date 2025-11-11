use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Screen {
    Login,
    Home,
    Project(ProjectScreenData),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectScreenData {
    pub project_id: String,
    pub project_name: String,
    pub project_slug: String,
    pub project_description: Option<String>,
    pub owner_type: String,
    pub owner_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectListItem {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(default)]
    pub is_restricted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrganizationItem {
    pub id: String,
    pub name: String,
}
