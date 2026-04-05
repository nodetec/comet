use std::path::PathBuf;

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(db_path) = args.next() else {
        eprintln!("usage: seed-snapshots <db-path> <nsec>");
        std::process::exit(1);
    };
    let Some(nsec) = args.next() else {
        eprintln!("usage: seed-snapshots <db-path> <nsec>");
        std::process::exit(1);
    };

    match comet_lib::tools::seed_initial_note_snapshots(&PathBuf::from(db_path), &nsec) {
        Ok(count) => {
            println!("Seeded initial snapshots for {count} notes");
        }
        Err(error) => {
            eprintln!("Failed to seed initial snapshots: {error}");
            std::process::exit(1);
        }
    }
}
