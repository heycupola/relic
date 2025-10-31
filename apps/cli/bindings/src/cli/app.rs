use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "relic")]
#[command(about = "Manage project secrets with Relic", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Login,
}

pub fn run_cli_from_args(mut args: Vec<String>) {
    // Add program name to the beginning for clap
    args.insert(0, "relic".to_string());

    let cli = match Cli::try_parse_from(args) {
        Ok(cli) => cli,
        Err(e) => {
            eprintln!("{}", e);
            return;
        }
    };

    match cli.command {
        Commands::Login => {
            println!("Login command");
        }
    }
}
