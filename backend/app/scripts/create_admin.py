"""Create (or reset the password of) an admin user.

Interactive:
    python -m app.scripts.create_admin

Non-interactive (e.g. in a Render Shell):
    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' python -m app.scripts.create_admin
    python -m app.scripts.create_admin --email you@example.com --reset
"""

import argparse
import getpass
import os
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select

from app.auth.security import PasswordPolicyError, check_password_policy, hash_password
from app.db.database import SessionLocal
from app.models import User


def prompt_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        try:
            check_password_policy(password)
        except PasswordPolicyError as exc:
            print(exc)
            continue
        if getpass.getpass("Repeat password: ") != password:
            print("Passwords do not match.")
            continue
        return password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", ""))
    parser.add_argument("--reset", action="store_true", help="Reset the password if the user exists.")
    args = parser.parse_args(argv)

    email = args.email or input("Email: ")
    try:
        email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        print(f"Invalid email: {exc}")
        return 1

    password = os.environ.get("ADMIN_PASSWORD") or prompt_password()
    try:
        check_password_policy(password)
    except PasswordPolicyError as exc:
        print(exc)
        return 1

    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == email))
        if user is not None and not args.reset:
            print(f"User {email} already exists. Use --reset to change the password.")
            return 1
        if user is None:
            user = User(email=email, is_admin=True, is_active=True)
            db.add(user)
        user.password_hash = hash_password(password)
        user.is_active = True
        db.commit()
    print(f"Admin user {email} is ready. Log in at /admin/login.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
