import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('build', Path(__file__).parents[1] / 'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def test_staging_excludes_unlisted_state_secrets_and_problems(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as staged:
            root = Path(root)
            (root / 'src').mkdir()
            (root / 'src/server.js').write_text('app')
            for name in ['terraform.tfstate', '.env', 'problem.pdf']:
                (root / name).write_text('private')
            build.stage_sources(root, ['src/server.js'], staged)
            self.assertEqual([str(p.relative_to(staged)) for p in Path(staged).rglob('*') if p.is_file()], ['src/server.js'])

    def test_rejects_paths_and_symlinks_outside_project(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as staged:
            (Path(root) / 'escape').symlink_to('/etc/hosts')
            for path in ['../outside', '/etc/hosts', 'escape']:
                with self.assertRaises(ValueError):
                    build.stage_sources(root, [path], staged)

    def test_build_failure_propagates_and_temporary_sources_are_removed(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'Dockerfile').write_text('FROM node:24')
            environment = dict(APP_ROOT=root, APP_FILES='["Dockerfile"]', PROJECT_ID='test-project',
                               BUILD_REGION='us-central1', BUILD_ACCOUNT='projects/test/serviceAccounts/build',
                               SOURCE_BUCKET='source', IMAGE='registry/app:hash', BUILD_CONFIG='/tmp/config.yaml')
            with patch.dict(os.environ, environment), patch.object(build.subprocess, 'run') as run:
                run.side_effect = subprocess.CalledProcessError(1, 'gcloud')
                with self.assertRaises(subprocess.CalledProcessError):
                    build.main()
                args = run.call_args.args[0]
                self.assertIn('--substitutions=_IMAGE=registry/app:hash', args)
                self.assertIn('--service-account=projects/test/serviceAccounts/build', args)
                self.assertTrue(run.call_args.kwargs['check'])
                self.assertFalse(Path(args[3]).exists())


if __name__ == '__main__':
    unittest.main()
