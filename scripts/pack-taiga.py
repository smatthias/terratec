#!/usr/bin/env python3
"""Create a source-only Taiga ZIP from this checkout's tracked working files."""
import argparse
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_DIRS = {
    '.git', 'node_modules', 'dist', 'data', 'release', 'test-results',
    '__pycache__', '.cache', '.pytest_cache', '.venv', 'venv', 'vcpkg_installed',
    'CMakeFiles', 'Testing', '.idea', '.vscode',
}
EXCLUDED_SUFFIXES = {
    '.zip', '.gz', '.tar', '.7z', '.log', '.tmp', '.bak', '.swp', '.pyc',
    '.o', '.obj', '.a', '.so', '.dll', '.exe', '.dylib', '.pem', '.key', '.p12', '.pfx',
}

def excluded(path):
    parts = path.parts
    return (
        any(part in EXCLUDED_DIRS or part.lower() == 'build' or part.lower().startswith('build-') for part in parts)
        or (path.name.startswith('.env') and path.name != '.env.example')
        or path.name in {'id_rsa', 'id_ed25519', '.npmrc', '.netrc', 'CMakeCache.txt', 'compile_commands.json'}
        or path.suffix.lower() in EXCLUDED_SUFFIXES
    )

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Destination ZIP (default: timestamped ZIP beside checkout)')
    args = parser.parse_args()
    output = (args.output or ROOT.parent / ('terratec-taiga-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.zip')).resolve()
    if output.exists():
        parser.error('Output already exists; choose a new filename.')
    tracked = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).split(b'\0')
    files = []
    for raw in tracked:
        if not raw:
            continue
        relative = Path(os.fsdecode(raw))
        if excluded(relative):
            continue
        source = ROOT / relative
        if source.is_symlink() or not source.is_file():
            parser.error(f'Tracked file is missing or a symlink: {relative}')
        files.append(relative)
    if Path('.gitignore') not in files:
        parser.error('A tracked .gitignore is required.')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.tmp', delete=False) as handle:
            temporary = Path(handle.name)
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for relative in sorted(files):
                archive.write(ROOT / relative, 'terratec/' + relative.as_posix())
        # Exclusive creation prevents accidentally replacing an existing deliverable.
        with output.open('xb') as destination, temporary.open('rb') as source:
            import shutil
            shutil.copyfileobj(source, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    digest = hashlib.sha256()
    with output.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    print(f'Created {output}\nFiles: {len(files)}\nSHA-256: {digest.hexdigest()}')
    print('Includes tracked working files only. Review the ZIP for credentials or private content before upload; filename exclusions are not a secret scan.')

if __name__ == '__main__':
    main()
