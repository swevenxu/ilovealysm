#!/usr/bin/env python3
"""
Grab a scoped subset of a workspace for AI review.

Usage examples:
    # Only files under src/ui and src/components
    python grab.py --paths src/ui src/components

    # Search file contents for keywords
    python grab.py --grep Khand Hind --ext .css .tsx

    # Save to a file instead of printing to terminal
    python grab.py --paths src/app --ext .css .tsx --save context.md

    # Auto-find related files from a topic
    python grab.py --auto flashcard flip --save flashcard-context.md

    # Everything in one command (the "I'm stuck" bundle)
    python grab.py --paths src --grep flashcard flip --ext .tsx .css --save bug.md
"""

import argparse
import fnmatch
import re
import sys
from pathlib import Path

EXCLUDE_DIRS = {
    '.git', 'node_modules', '__pycache__', 'venv', '.venv', 'env',
    'dist', 'build', '.idea', '.vscode', '.next', 'out', 'target',
    'bin', 'obj', '.mypy_cache', '.pytest_cache', '.tox', 'coverage',
    'extractor',  # your Python extractor service (not needed for UI work)
}

EXCLUDE_EXTS = {
    '.pyc', '.pyo', '.so', '.dll', '.dylib', '.exe', '.bin', '.o', '.a',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
    '.mp3', '.mp4', '.mov', '.wav', '.flac',
    '.zip', '.tar', '.gz', '.7z', '.rar', '.xz',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.lock', '.log',
}

EXCLUDE_FILES = {'.env', '.env.local', '.env.production', '.env.development'}
EXCLUDE_SUFFIXES = {'.pem', '.key', '.crt', '.cer'}

MAX_FILE_SIZE = 200 * 1024  # 200 KB per file


def excluded_by_default(path: Path) -> bool:
    if any(part in EXCLUDE_DIRS for part in path.parts):
        return True
    if path.suffix.lower() in EXCLUDE_EXTS:
        return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix.lower() in EXCLUDE_SUFFIXES:
        return True
    try:
        if path.stat().st_size > MAX_FILE_SIZE:
            return True
    except OSError:
        return True
    return False


def matches_any(rel: str, patterns) -> bool:
    return any(
        fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(Path(rel).name, pat)
        for pat in patterns
    )


def is_text(path: Path) -> bool:
    try:
        path.read_text(encoding='utf-8', errors='strict')
        return True
    except (UnicodeDecodeError, OSError):
        return False


def contains_any(path: Path, needles) -> bool:
    """Case-insensitive substring search across file contents."""
    try:
        content = path.read_text(encoding='utf-8', errors='ignore')
    except OSError:
        return False
    lowered = content.lower()
    return any(n.lower() in lowered for n in needles)


def find_importers(root: Path, seeds: list, all_files: list) -> list:
    """Find files that import from any of the seed files' basenames."""
    seed_names = {Path(s).stem for s in seeds}
    importers = set()
    for path in all_files:
        if path in seeds:
            continue
        try:
            content = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        # Match import/require statements referencing any seed basename
        for name in seed_names:
            pattern = re.compile(
                rf'(from\s+[\'"][^\'"]*{re.escape(name)}[\'"]|require\([\'"][^\'"]*{re.escape(name)}[\'"])',
                re.IGNORECASE,
            )
            if pattern.search(content):
                importers.add(path)
                break
    return list(importers)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.', help='Workspace root (default: current dir)')
    ap.add_argument('--paths', nargs='*', default=[],
                    help='Only include files under these subpaths')
    ap.add_argument('--ext', nargs='*', default=[],
                    help='Only include these extensions (e.g. .ts .tsx .css)')
    ap.add_argument('--match', nargs='*', default=[],
                    help='Only include files whose path/name matches any glob')
    ap.add_argument('--exclude', nargs='*', default=[],
                    help='Skip files whose path/name matches any glob')
    ap.add_argument('--grep', nargs='*', default=[],
                    help='Only include files whose CONTENTS contain any of these')
    ap.add_argument('--auto', nargs='*', default=[],
                    help='Auto-discover: find files matching these keywords '
                         '(in name or content), then also include files that import them.')
    ap.add_argument('--max-depth', type=int, default=None,
                    help='Max depth relative to each --paths root')
    ap.add_argument('--max-bytes', type=int, default=300_000,
                    help='Stop adding files after this many bytes of output')
    ap.add_argument('--tree-only', action='store_true',
                    help='Only print the directory tree, no file contents')
    ap.add_argument('--save', type=str, default=None,
                    help='Write output to this file instead of stdout')
    args = ap.parse_args()

    root = Path(args.root).resolve()
    exts = {e.lower() if e.startswith('.') else '.' + e.lower() for e in args.ext}

    search_roots = [root / p for p in args.paths] if args.paths else [root]
    search_roots = [p for p in search_roots if p.exists()]
    if not search_roots:
        print(f"No matching paths under {root}", file=sys.stderr)
        sys.exit(1)

    # Stage 1: collect all candidate files (no filters beyond defaults)
    all_files = []
    for sroot in search_roots:
        for path in sroot.rglob('*'):
            if not path.is_file():
                continue
            if excluded_by_default(path):
                continue
            all_files.append(path)

    candidates = set()
    auto_seeds = []

    # --auto mode: find files by keyword (name or content)
    if args.auto:
        for path in all_files:
            rel = path.relative_to(root).as_posix()
            # Name match
            if any(kw.lower() in rel.lower() for kw in args.auto):
                auto_seeds.append(path)
                continue
            # Content match
            if contains_any(path, args.auto):
                auto_seeds.append(path)

        # Also include files that import any of the seeds
        if auto_seeds:
            importers = find_importers(root, auto_seeds, all_files)
            candidates.update(auto_seeds)
            candidates.update(importers)
        else:
            print(f"[auto] No files matched keywords: {args.auto}", file=sys.stderr)

    # If no --auto, use the regular filtering path
    if not args.auto:
        for path in all_files:
            rel_to_root = path.relative_to(root).as_posix()

            # Path depth check
            if args.max_depth is not None:
                try:
                    sroot = next(s for s in search_roots if s in path.parents or s == path.parent)
                except StopIteration:
                    sroot = search_roots[0]
                rel_to_search = path.relative_to(sroot).as_posix()
                if len(Path(rel_to_search).parts) - 1 > args.max_depth:
                    continue

            if exts and path.suffix.lower() not in exts:
                continue
            if args.match and not matches_any(rel_to_root, args.match):
                continue
            if args.exclude and matches_any(rel_to_root, args.exclude):
                continue
            if args.grep and not contains_any(path, args.grep):
                continue

            candidates.add(path)

    # If --auto AND --grep/--ext are combined, apply those as secondary filters
    if args.auto and (exts or args.grep or args.match or args.exclude):
        filtered = set()
        for path in candidates:
            rel_to_root = path.relative_to(root).as_posix()
            if exts and path.suffix.lower() not in exts:
                continue
            if args.match and not matches_any(rel_to_root, args.match):
                continue
            if args.exclude and matches_any(rel_to_root, args.exclude):
                continue
            if args.grep and not contains_any(path, args.grep):
                continue
            filtered.add(path)
        candidates = filtered

    candidates = sorted(candidates)

    # Build tree from included files
    tree_lines = [f"{root.name}/"]
    included_rel = sorted(p.relative_to(root).as_posix() for p in candidates)
    tree = {}
    for rel in included_rel:
        node = tree
        for part in rel.split('/'):
            node = node.setdefault(part, {})

    def render(node, prefix=''):
        items = sorted(node.items())
        for i, (name, child) in enumerate(items):
            last = (i == len(items) - 1)
            tree_lines.append(prefix + ('└── ' if last else '├── ') + name)
            if child:
                render(child, prefix + ('    ' if last else '│   '))

    render(tree)

    # Write output
    out_file = open(args.save, 'w', encoding='utf-8') if args.save else sys.stdout

    try:
        out_file.write(f"# Scoped dump: {root}\n\n")
        if args.auto:
            out_file.write(f"# Auto-discovered from: {', '.join(args.auto)}\n\n")
        out_file.write("## Files included\n\n```\n")
        out_file.write('\n'.join(tree_lines))
        out_file.write("\n```\n\n")

        if args.tree_only:
            return

        out_file.write("## Contents\n")
        total = 0
        for path in candidates:
            if not is_text(path):
                continue
            try:
                content = path.read_text(encoding='utf-8')
            except Exception:
                continue
            rel = path.relative_to(root).as_posix()
            block = f"\n### {rel}\n\n```\n{content}\n```\n"
            if total + len(block) > args.max_bytes:
                out_file.write(
                    f"\n<!-- truncated: reached --max-bytes {args.max_bytes} -->\n"
                )
                break
            out_file.write(block)
            total += len(block)

        if args.save:
            print(f"Saved {len(candidates)} files to {args.save}")
    finally:
        if args.save:
            out_file.close()


if __name__ == '__main__':
    main()