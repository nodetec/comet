use std::path::PathBuf;

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(db_path) = args.next() else {
        eprintln!("usage: seed-revisions <db-path> <nsec>");
        std::process::exit(1);
    };
    let Some(nsec) = args.next() else {
        eprintln!("usage: seed-revisions <db-path> <nsec>");
        std::process::exit(1);
    };

    match comet_lib::tools::seed_initial_note_revisions(&PathBuf::from(db_path), &nsec) {
        Ok(count) => {
            println!("Seeded initial revisions for {count} notes");
        }
        Err(error) => {
            eprintln!("Failed to seed initial revisions: {error}");
            std::process::exit(1);
        }
    }
}
