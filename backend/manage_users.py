"""Manage the (at most two) allowed users.

    python manage_users.py add <username>      # prompts for a password, stores a bcrypt hash
    python manage_users.py remove <username>
    python manage_users.py list
"""
import getpass
import sys

from auth import MAX_USERS, hash_password, load_users, save_users


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("add", "remove", "list"):
        sys.exit(__doc__)
    cmd = sys.argv[1]
    users = load_users()

    if cmd == "list":
        print("\n".join(users) or "(no users)")
        return

    if len(sys.argv) < 3:
        sys.exit(__doc__)
    name = sys.argv[2].strip().lower()

    if cmd == "remove":
        if users.pop(name, None) is None:
            sys.exit(f"No such user: {name}")
        save_users(users)
        print(f"Removed {name}")
        return

    if name not in users and len(users) >= MAX_USERS:
        sys.exit(f"Only {MAX_USERS} users are allowed. Remove one first.")
    password = getpass.getpass("Password (min 10 chars): ")
    if len(password) < 10:
        sys.exit("Password too short.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("Passwords don't match.")
    users[name] = hash_password(password)
    save_users(users)
    print(f"Saved user {name}")


if __name__ == "__main__":
    main()
