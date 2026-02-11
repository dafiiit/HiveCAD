#!/usr/bin/env python3
"""
HiveCAD Release Script

A command-line tool for releasing HiveCAD versions via GitHub Actions.
Handles version bumping, tag creation, and the complete release workflow.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional, Tuple


class Colors:
    """ANSI color codes for terminal output."""

    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_header(text: str) -> None:
    """Print a colored header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}\n")


def print_success(text: str) -> None:
    """Print success message."""
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_info(text: str) -> None:
    """Print info message."""
    print(f"{Colors.CYAN}ℹ {text}{Colors.RESET}")


def print_warning(text: str) -> None:
    """Print warning message."""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.RESET}")


def print_error(text: str) -> None:
    """Print error message."""
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def run_command(cmd: list, description: str = "") -> Tuple[bool, str]:
    """
    Run a shell command and return (success, output).
    
    Args:
        cmd: Command as list of strings
        description: Optional description to print
    
    Returns:
        Tuple of (success, output)
    """
    try:
        if description:
            print_info(description)
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        )
        return True, result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return False, e.stderr.strip()
    except Exception as e:
        return False, str(e)


def get_current_version(package_json_path: Path) -> str:
    """Read current version from package.json."""
    with open(package_json_path) as f:
        data = json.load(f)
    return data.get("version", "0.0.0")


def parse_version(version_str: str) -> Tuple[int, int, int]:
    """Parse version string (e.g., '0.1.5') into tuple of ints."""
    # Remove 'v' prefix if present
    version_str = version_str.lstrip("v")
    parts = version_str.split(".")
    try:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    except (IndexError, ValueError):
        raise ValueError(f"Invalid version format: {version_str}")


def format_version(major: int, minor: int, patch: int) -> str:
    """Format version tuple back to string."""
    return f"{major}.{minor}.{patch}"


def ask_version_increment() -> Optional[str]:
    """
    Ask user what part of version to increment.
    
    Returns:
        'major', 'minor', 'patch', or None (no increment)
    """
    print("\n" + Colors.BOLD + "What would you like to increment?" + Colors.RESET)
    print(f"  {Colors.CYAN}0{Colors.RESET}) None (keep current version)")
    print(f"  {Colors.CYAN}1{Colors.RESET}) Patch version (third number)")
    print(f"  {Colors.CYAN}2{Colors.RESET}) Minor version (second number)")
    print(f"  {Colors.CYAN}3{Colors.RESET}) Major version (first number)")

    while True:
        choice = input(f"\n{Colors.BOLD}Enter your choice (0-3):{Colors.RESET} ").strip()
        if choice == "0":
            return None
        elif choice == "1":
            return "patch"
        elif choice == "2":
            return "minor"
        elif choice == "3":
            return "major"
        else:
            print_error("Invalid choice. Please enter 0-3.")


def confirm_action(prompt: str) -> bool:
    """Ask user for confirmation."""
    response = input(f"\n{Colors.BOLD}{prompt}{Colors.RESET} (y/n): ").strip().lower()
    return response == "y"


def check_git_status() -> bool:
    """Check if git repository is clean."""
    success, output = run_command(["git", "status", "--porcelain"])
    if not success:
        print_error("Failed to check git status")
        return False
    
    if output:
        print_warning("Git working directory is not clean:")
        print(output)
        
        if confirm_action("Would you like to commit these changes?"):
            return commit_pending_changes()
        
        return confirm_action("Continue without committing?")
    
    return True


def commit_pending_changes() -> bool:
    """Commit all pending changes with a custom message."""
    print("\n" + Colors.BOLD + "Enter commit message:" + Colors.RESET)
    commit_message = input(f"{Colors.BOLD}Message:{Colors.RESET} ").strip()
    
    if not commit_message:
        print_warning("Empty commit message, skipping commit")
        return False
    
    # Stage all changes
    success, _ = run_command(["git", "add", "-A"])
    if not success:
        print_error("Failed to stage changes")
        return False
    
    # Commit
    success, _ = run_command(["git", "commit", "-m", commit_message])
    if not success:
        print_error("Failed to commit changes")
        return False
    
    print_success(f"Changes committed with message: {commit_message}")
    return True


def check_git_remote() -> bool:
    """Check if git remote is configured."""
    success, output = run_command(["git", "remote", "-v"])
    if not success or not output:
        print_error("No git remote configured")
        return False
    
    print_success("Git remote is configured")
    return True


def update_json_version(file_path: Path, new_version: str) -> bool:
    """Update version in JSON file."""
    try:
        with open(file_path) as f:
            data = json.load(f)
        
        data["version"] = new_version
        
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")  # Add trailing newline
        
        print_success(f"Updated {file_path.name} to version {new_version}")
        return True
    except Exception as e:
        print_error(f"Failed to update {file_path.name}: {e}")
        return False


def git_add_and_commit(files: list, version: str) -> bool:
    """Stage files and commit."""
    success, _ = run_command(["git", "add"] + files)
    if not success:
        print_error("Failed to stage files")
        return False
    
    success, _ = run_command(
        ["git", "commit", "-m", f"chore: release v{version}"]
    )
    if not success:
        print_error("Failed to commit changes")
        return False
    
    print_success("Files committed")
    return True


def git_create_and_push_tag(version: str) -> bool:
    """Create and push git tag."""
    tag = f"v{version}"
    
    # Check if tag already exists
    success, output = run_command(["git", "tag", "-l", tag])
    if success and output:
        print_warning(f"Tag {tag} already exists")
        if not confirm_action("Do you want to delete and recreate it?"):
            return False
        
        # Delete existing tag
        success, _ = run_command(["git", "tag", "-d", tag])
        if not success:
            print_error(f"Failed to delete tag {tag}")
            return False
        print_success(f"Deleted local tag {tag}")
        
        # Try to delete remote tag
        success, _ = run_command(["git", "push", "origin", f":refs/tags/{tag}"])
        if not success:
            print_warning("Could not delete remote tag (may not exist)")
    
    # Create new tag
    success, _ = run_command(
        ["git", "tag", tag],
        description=f"Creating tag {tag}..."
    )
    if not success:
        print_error(f"Failed to create tag {tag}")
        return False
    
    # Push tag
    success, _ = run_command(
        ["git", "push", "origin", tag],
        description=f"Pushing tag {tag}..."
    )
    if not success:
        print_error(f"Failed to push tag {tag}")
        return False
    
    print_success(f"Tag {tag} created and pushed")
    return True


def show_release_preview(
    current_version: str,
    new_version: str,
    increment_type: Optional[str]
) -> None:
    """Show a preview of the release."""
    print_header("RELEASE PREVIEW")
    
    print(f"{Colors.BOLD}Current Version:{Colors.RESET} {Colors.YELLOW}{current_version}{Colors.RESET}")
    print(f"{Colors.BOLD}New Version:{Colors.RESET} {Colors.GREEN}{new_version}{Colors.RESET}")
    
    if increment_type:
        type_names = {
            "major": "MAJOR",
            "minor": "MINOR",
            "patch": "PATCH"
        }
        print(f"{Colors.BOLD}Increment Type:{Colors.RESET} {Colors.CYAN}{type_names[increment_type]}{Colors.RESET}")
    else:
        print(f"{Colors.BOLD}Increment Type:{Colors.RESET} {Colors.CYAN}NONE{Colors.RESET}")
    
    print(f"\n{Colors.BOLD}Release Process:{Colors.RESET}")
    print("  1. Update version in package.json")
    print("  2. Update version in src-tauri/tauri.conf.json")
    print("  3. Commit changes")
    print(f"  4. Create and push tag (v{new_version})")
    print("  5. GitHub Actions workflow will build and release")


def main() -> int:
    """Main release script."""
    print_header("HiveCAD Release Script")
    
    # Determine workspace root
    script_dir = Path(__file__).parent
    package_json = script_dir / "package.json"
    tauri_conf = script_dir / "src-tauri" / "tauri.conf.json"
    
    # Verify required files exist
    if not package_json.exists():
        print_error(f"package.json not found at {package_json}")
        return 1
    
    if not tauri_conf.exists():
        print_error(f"tauri.conf.json not found at {tauri_conf}")
        return 1
    
    print_success("Found required configuration files")
    
    # Check git status
    if not check_git_status():
        return 1
    
    if not check_git_remote():
        return 1
    
    # Get current version
    try:
        current_version = get_current_version(package_json)
        major, minor, patch = parse_version(current_version)
        print_success(f"Current version: {current_version}")
    except Exception as e:
        print_error(f"Failed to parse version: {e}")
        return 1
    
    # Ask what to increment
    increment_type = ask_version_increment()
    
    # Calculate new version
    if increment_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif increment_type == "minor":
        minor += 1
        patch = 0
    elif increment_type == "patch":
        patch += 1
    # else: no increment, keep current version
    
    new_version = format_version(major, minor, patch)
    
    # Show preview
    show_release_preview(current_version, new_version, increment_type)
    
    # Confirm
    if not confirm_action(f"Proceed with releasing v{new_version}?"):
        print_info("Release cancelled")
        return 0
    
    # Update versions
    print_header("UPDATING VERSIONS")
    
    if not update_json_version(package_json, new_version):
        return 1
    
    if not update_json_version(tauri_conf, new_version):
        return 1
    
    # Commit changes
    print_header("COMMITTING CHANGES")
    
    if not git_add_and_commit([str(package_json), str(tauri_conf)], new_version):
        return 1
    
    # Create and push tag
    print_header("CREATING AND PUSHING TAG")
    
    if not git_create_and_push_tag(new_version):
        return 1
    
    # Success!
    print_header("RELEASE INITIATED SUCCESSFULLY")
    print_success(f"Version v{new_version} has been released!")
    print_info("GitHub Actions will now build and create the release automatically.")
    print_info("Check the Actions tab on GitHub for progress.")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
