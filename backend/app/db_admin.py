from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def backup_database(database: Path, output: Path, *, overwrite: bool = False) -> None:
    if not database.exists():
        raise FileNotFoundError(f"Database does not exist: {database}")
    if output.exists() and not overwrite:
        raise FileExistsError(f"Backup already exists: {output}; pass --force to overwrite")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with sqlite3.connect(database) as source, sqlite3.connect(output) as target:
        source.backup(target)
        target.execute("PRAGMA integrity_check").fetchone()


def restore_database(database: Path, source_file: Path, *, confirm: bool = False) -> None:
    if not confirm:
        raise ValueError("Restore replaces the destination database; pass --yes to continue")
    if not source_file.exists():
        raise FileNotFoundError(f"Backup does not exist: {source_file}")
    if database.resolve() == source_file.resolve():
        raise ValueError("Backup source and destination database must be different files")
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source_file) as source, sqlite3.connect(database) as target:
        integrity = source.execute("PRAGMA integrity_check").fetchone()
        if integrity is None or str(integrity[0]).lower() != "ok":
            raise ValueError("Backup database failed integrity_check")
        source.backup(target)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="javdb115 SQLite backup and restore utility")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup = subparsers.add_parser("backup", help="create a consistent SQLite backup")
    backup.add_argument("--database", type=Path, required=True)
    backup.add_argument("--output", type=Path, required=True)
    backup.add_argument("--force", action="store_true")

    restore = subparsers.add_parser("restore", help="restore a SQLite backup")
    restore.add_argument("--database", type=Path, required=True)
    restore.add_argument("--input", type=Path, required=True)
    restore.add_argument("--yes", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "backup":
        backup_database(args.database, args.output, overwrite=args.force)
        print(f"Backup created: {args.output}")
        return
    restore_database(args.database, args.input, confirm=args.yes)
    print(f"Database restored: {args.database}")


if __name__ == "__main__":
    main()
