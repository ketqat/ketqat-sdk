"""Failure/order/promotion tests; these do not call AWS or Docker."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-worker-images.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ACCOUNT = '291877508281'
REGISTRY = f'{ACCOUNT}.dkr.ecr.ap-northeast-1.amazonaws.com'
SHA = 'c' * 40
DIGESTS = {'lambda': 'sha256:' + 'a' * 64, 'batch': 'sha256:' + 'b' * 64}
DEFINITION = f'arn:aws:batch:ap-northeast-1:{ACCOUNT}:job-definition/ketqat-staging-worker:7'


class FakePublisher(module.Publisher):
    def __init__(self, environment='staging', case='success'):
        super().__init__({'AWS_ACCOUNT_ID': ACCOUNT, 'DEPLOYMENT_ENV': environment, 'RELEASE_ID': SHA,
                          'AWS_REGION': 'ap-northeast-1', 'ECR_PREFIX': f'{REGISTRY}/ketqat-{environment}',
                          'STAGING_BATCH_JOB_DEFINITION_ARN': DEFINITION, 'DOCKER_CONFIG': str(Path.cwd() / 'initial-docker')})
        self.case = case
        self.calls = []
        self.pushed = set()
        self.live_reads = 0

    def command(self, args, input_text=None, check=True):
        self.calls.append(args)
        stdout, stderr, code = '', '', 0
        def value(flag):
            return args[args.index(flag) + 1]
        if args[:2] == ['aws', 'get-caller-identity'] or args[:3] == ['aws', 'sts', 'get-caller-identity']:
            stdout = json.dumps({'Account': ACCOUNT, 'Arn': f'arn:aws:sts::{ACCOUNT}:assumed-role/ketqat-{self.environment}-github-sdk/ci'})
            if self.case == 'wrong-role':
                stdout = json.dumps({'Account': ACCOUNT, 'Arn': f'arn:aws:iam::{ACCOUNT}:root'})
        elif args[:3] == ['aws', 'ecr', 'get-login-password']:
            stdout = 'test-only-secret\n'
        elif args[:3] == ['aws', 'ecr', 'describe-images']:
            target = value('--image-ids').rsplit('-', 1)[1]
            if self.case == 'lookup-denied':
                code, stderr = 1, 'AccessDeniedException'
            elif value('--repository-name') == 'ketqat-staging/worker' and self.environment == 'production' or target in self.pushed or self.case in ['reuse', 'production-mismatch']:
                digest = DIGESTS[target]
                if self.case == 'production-mismatch' and value('--repository-name') == 'ketqat-production/worker':
                    digest = 'sha256:' + 'd' * 64
                stdout = json.dumps({'imageDetails': [{'imageDigest': digest}]})
            else:
                code, stderr = 1, 'ImageNotFoundException'
        elif args[:3] == ['aws', 'lambda', 'get-function']:
            self.live_reads += 1
            digest = DIGESTS['lambda']
            if self.case == 'stage-lambda-wrong' or self.case == 'stage-raced' and self.live_reads > 1:
                digest = 'sha256:' + 'e' * 64
            stdout = json.dumps({'Code': {'ResolvedImageUri': f'{REGISTRY}/ketqat-staging/worker@{digest}'},
                                 'Configuration': {'FunctionName': 'ketqat-staging-worker', 'Version': '8', 'State': 'Active', 'LastUpdateStatus': 'Successful', 'Architectures': ['arm64']}})
        elif args[:3] == ['aws', 'lambda', 'get-alias']:
            stdout = json.dumps({'FunctionVersion': '8', 'RevisionId': 'fixture-revision', 'RoutingConfig': {'AdditionalVersionWeights': {'7': 0.1}} if self.case == 'stage-weighted' else {}})
        elif args[:3] == ['aws', 'batch', 'describe-job-definitions']:
            stdout = json.dumps({'jobDefinitions': [{'jobDefinitionArn': DEFINITION, 'status': 'INACTIVE' if self.case == 'stage-batch-inactive' else 'ACTIVE',
                                                      'platformCapabilities': ['FARGATE'], 'containerProperties': {'image': f'{REGISTRY}/ketqat-staging/worker@{DIGESTS["batch"]}', 'runtimePlatform': {'cpuArchitecture': 'ARM64'}}}]})
        elif args[:3] == ['docker', 'image', 'inspect']:
            target = 'batch' if args[-1].endswith('-batch') or args[-1].endswith(DIGESTS['batch']) else 'lambda'
            config = {'User': '10001:10001', 'Labels': {'org.opencontainers.image.revision': SHA},
                      'Entrypoint': ['/lambda-entrypoint.sh'] if target == 'lambda' else ['/var/lang/bin/node', '--disallow-code-generation-from-strings', '/var/task/worker/lambda/batch.mjs'],
                      'Cmd': ['worker/lambda/handler.handler'] if target == 'lambda' else []}
            if self.case == 'wrong-entrypoint':
                config['Entrypoint'] = ['/bin/bash']
            stdout = json.dumps([{'Architecture': 'amd64' if self.case == 'wrong-platform' else 'arm64', 'Os': 'linux', 'Config': config,
                                 'RootFS': {'Layers': [target] if self.case == 'mixed-layers' else ['same-scientific-runtime']}}])
        elif args[:2] == ['docker', 'push']:
            self.pushed.add(args[-1].rsplit('-', 1)[1])
        elif args[:2] == ['docker', 'run'] and self.case == 'trivy-high' and 'aquasec/trivy:0.74.0' in args:
            code = 1
        elif args[:2] == ['docker', 'run'] and self.case == 'probe-failed' and '--entrypoint' in args:
            code = 1
        elif args[:3] == ['aws', 'ecr', 'describe-image-scan-findings']:
            stdout = json.dumps({'imageScanStatus': {'status': 'IN_PROGRESS' if self.case == 'scan-incomplete' else 'COMPLETE'},
                                 'imageScanFindings': {'findingSeverityCounts': {'HIGH': 1} if self.case == 'ecr-high' else {}}})
        if check and code:
            raise module.ReleaseError('Fixture command failed')
        return subprocess.CompletedProcess(args, code, stdout, stderr)


class PublicationTest(unittest.TestCase):
    def run_case(self, environment='staging', case='success'):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path.cwd()
            os.chdir(directory)
            try:
                publisher = FakePublisher(environment, case)
                Path('release').mkdir()
                Path('release/worker-images.json').write_text('stale-manifest')
                error = None
                try:
                    publisher.run()
                except module.ReleaseError as failure:
                    error = failure
                manifest = Path('release/worker-images.json')
                data = json.loads(manifest.read_text()) if manifest.exists() else None
                self.assertEqual(publisher.calls[-1][:2], ['docker', 'logout'])
                self.assertFalse(Path(publisher.env['DOCKER_CONFIG']).exists())
                self.assertNotIn('test-only-secret', json.dumps(publisher.calls))
                return error, publisher.calls, data
            finally:
                os.chdir(previous)

    def test_staging_checks_both_targets_before_first_push(self):
        error, calls, data = self.run_case()
        self.assertIsNone(error)
        self.assertEqual(set(data['images']), {'lambda', 'batch'})
        builds = [c for c in calls if c[:2] == ['docker', 'build']]
        self.assertEqual(len(builds), 2)
        self.assertTrue(all('linux/arm64' in c and '--provenance=false' in c for c in builds))
        first_push = next(i for i, c in enumerate(calls) if c[:2] == ['docker', 'push'])
        scans = [i for i, c in enumerate(calls) if 'aquasec/trivy:0.74.0' in c]
        self.assertEqual(len(scans), 2)
        self.assertLess(max(scans), first_push)
        self.assertFalse(any('--ignore-unfixed' in c for c in calls))

    def test_existing_pair_is_reverified_without_rebuild(self):
        error, calls, data = self.run_case(case='reuse')
        self.assertIsNone(error)
        self.assertIsNotNone(data)
        self.assertFalse(any(c[:2] in [['docker', 'build'], ['docker', 'push']] for c in calls))

    def test_production_promotes_pair_without_rebuild(self):
        for case in ['success', 'reuse']:
            error, calls, data = self.run_case('production', case)
            self.assertIsNone(error)
            self.assertEqual(data['staging']['batchDefinition'], DEFINITION)
            self.assertEqual(data['images']['batch'], f'{REGISTRY}/ketqat-production/worker@{DIGESTS["batch"]}')
            self.assertFalse(any(c[:2] == ['docker', 'build'] for c in calls))
            self.assertEqual(sum(c[:3] == ['aws', 'lambda', 'get-function'] for c in calls), 2)

    def test_invalid_artifacts_never_push(self):
        for case in ['lookup-denied', 'wrong-role', 'wrong-platform', 'wrong-entrypoint', 'mixed-layers', 'probe-failed', 'trivy-high']:
            error, calls, data = self.run_case(case=case)
            self.assertIsNotNone(error, case)
            self.assertIsNone(data, case)
            self.assertFalse(any(c[:2] == ['docker', 'push'] for c in calls), case)

    def test_staging_mismatch_never_promotes(self):
        for case in ['production-mismatch', 'stage-lambda-wrong', 'stage-batch-inactive', 'stage-weighted']:
            error, calls, data = self.run_case('production', case)
            self.assertIsNotNone(error, case)
            self.assertIsNone(data)
            self.assertFalse(any(c[:2] == ['docker', 'push'] for c in calls))

    def test_failed_ecr_scan_or_raced_staging_leaves_no_manifest(self):
        for case in ['ecr-high', 'scan-incomplete', 'stage-raced']:
            error, _, data = self.run_case('production', case)
            self.assertIsNotNone(error, case)
            self.assertIsNone(data)


if __name__ == '__main__':
    unittest.main()
