use anyhow::Result;
use crate::util::app_config::AppConfig;

pub async fn login(_app_config: &AppConfig) -> Result<()> {
    println!("Login functionality not yet implemented");
    Ok(())
}

pub fn logout() -> Result<()> {
    println!("Logout functionality not yet implemented");
    Ok(())
}
