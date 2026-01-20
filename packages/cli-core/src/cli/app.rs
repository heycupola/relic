use anyhow::{Context, Result};
use clap::{Parser, Subcommand};

use crate::{service, util::app_config::AppConfig};

#[derive(Parser)]
#[command(name = "relic")]
#[command(about = "Zero-knowledge secret management", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Login,
    Logout,
}

pub async fn run_cli_from_args(mut args: Vec<String>, app_config: AppConfig) -> Result<()> {
    // NOTE: add program name to the beginning for clap
    args.insert(0, "relic".to_string());

    let cli = Cli::try_parse_from(args).context("Unable to parse args...")?;

    match cli.command {
        Commands::Login => {
            service::auth::login(&app_config).await?;
        }
        Commands::Logout => {
            service::auth::logout()?;
        }
    }

    Ok(())
}
