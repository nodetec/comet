use nostr_sdk::{prelude::Keys, ToBech32};

fn usage() {
    eprintln!("usage: seed-identity <generate|derive <nsec>>");
}

fn print_identity(keys: &Keys) -> Result<(), String> {
    let public_key = keys.public_key().to_hex();
    let npub = keys
        .public_key()
        .to_bech32()
        .map_err(|error| error.to_string())?;
    let nsec = keys
        .secret_key()
        .to_bech32()
        .map_err(|error| error.to_string())?;

    println!("PUBLIC_KEY={public_key}");
    println!("NPUB={npub}");
    println!("NSEC={nsec}");

    Ok(())
}

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(command) = args.next() else {
        usage();
        std::process::exit(1);
    };

    let result = match command.as_str() {
        "generate" => {
            let keys = Keys::generate();
            print_identity(&keys)
        }
        "derive" => {
            let Some(nsec) = args.next() else {
                usage();
                std::process::exit(1);
            };
            let keys = Keys::parse(&nsec).map_err(|error| format!("Invalid nsec: {error}"));
            keys.and_then(|keys| print_identity(&keys))
        }
        _ => {
            usage();
            std::process::exit(1);
        }
    };

    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
