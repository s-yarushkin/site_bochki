"""Interactively create exactly two manager credentials; never print or store passwords.

Run: py -3 ops/provision-manager-accounts.py --directory <new private dir>
Creates manager-accounts.json (only phone + salted scrypt hash) and manager-session-secret.
"""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys


def normalize_phone(raw):
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 10 and digits.startswith('9'):
        digits = '7' + digits
    elif len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    if not re.fullmatch(r'79\d{9}', digits):
        raise ValueError('LOGIN_MUST_BE_RUSSIAN_MOBILE')
    return '+' + digits


def make_hash(password):
    if not 14 <= len(password) <= 512:
        raise ValueError('PASSWORD_LENGTH_REQUIRED_14_TO_512')
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode('utf-8'), salt=salt.encode('ascii'),
                            n=2**14, r=8, p=1, dklen=64)
    return 'scrypt$' + salt + '$' + digest.hex()


def write_secret(path, content):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(content)
    except BaseException:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    args = parser.parse_args()
    target = Path(args.directory)
    if target.exists():
        raise SystemExit('CREDENTIAL_DIRECTORY_ALREADY_EXISTS')
    target.mkdir(mode=0o700, parents=False)
    accounts = []
    all_passwords = set()
    try:
        print('Enter two DISTINCT manager accounts. No passwords will be displayed.')
        for index in (1, 2):
            phone = normalize_phone(input(f'Manager {index} login (Russian mobile): ').strip())
            if any(item['phone'] == phone for item in accounts):
                raise ValueError('MANAGER_PHONES_MUST_BE_DISTINCT')
            password = getpass.getpass(f'Manager {index} password (min 14 characters): ')
            again = getpass.getpass(f'Confirm manager {index} password: ')
            if password != again:
                raise ValueError('PASSWORD_CONFIRMATION_MISMATCH')
            if password in all_passwords:
                raise ValueError('PASSWORDS_MUST_BE_DISTINCT')
            all_passwords.add(password)
            accounts.append({'phone': phone, 'hash': make_hash(password)})
            del password, again
        write_secret(target / 'manager-accounts.json',
                     json.dumps(accounts, ensure_ascii=False, separators=(',', ':')) + '\n')
        write_secret(target / 'manager-session-secret', secrets.token_hex(48) + '\n')
        print('TWO_MANAGERS=PASS')
        print('PASSWORDS_NOT_WRITTEN=PASS')
        print('CREDENTIAL_FILES_READY=PASS')
        print('DIRECTORY=' + str(target))
    except BaseException:
        for item in target.iterdir():
            if item.is_file():
                item.unlink(missing_ok=True)
        try:
            target.rmdir()
        except OSError:
            pass
        raise


if __name__ == '__main__':
    try:
        main()
    except (ValueError, EOFError, KeyboardInterrupt) as error:
        print('CREDENTIAL_SETUP_FAILED: ' + type(error).__name__, file=sys.stderr)
        raise SystemExit(1)
