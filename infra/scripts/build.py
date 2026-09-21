#!/usr/bin/env python3
"""Stage only the Terraform-hashed application files, then build in Cloud Build."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def stage_sources(root, files, destination):
    root = Path(root).resolve()
    destination = Path(destination)
    for relative in files:
        relative_path = Path(relative)
        source = (root / relative_path).resolve()
        if relative_path.is_absolute() or '..' in relative_path.parts or not source.is_relative_to(root):
            raise ValueError(f'Unsafe source path: {relative}')
        target = destination / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def main():
    env = os.environ
    with tempfile.TemporaryDirectory(prefix='code-sprint-build-') as directory:
        stage_sources(env['APP_ROOT'], json.loads(env['APP_FILES']), directory)
        subprocess.run([
            'gcloud', 'builds', 'submit', directory,
            f"--project={env['PROJECT_ID']}",
            f"--region={env['BUILD_REGION']}",
            f"--service-account={env['BUILD_ACCOUNT']}",
            f"--gcs-source-staging-dir=gs://{env['SOURCE_BUCKET']}/source",
            f"--config={env['BUILD_CONFIG']}",
            f"--substitutions=_IMAGE={env['IMAGE']}",
            '--quiet',
        ], check=True)


if __name__ == '__main__':
    main()
